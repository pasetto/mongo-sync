import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { OfflineStoreService } from './offline-store.service';
import { SyncConfigService } from './sync-config.service';
import { SyncState, ConflictItem } from '../models/sync-state.model';

@Injectable({
  providedIn: 'root'
})
export class OfflineSyncService {
  private syncStateSubject = new BehaviorSubject<SyncState>({
    isSyncing: false,
    lastSyncTime: 0,
    pendingChanges: 0,
    conflicts: []
  });
  
  public syncState$: Observable<SyncState> = this.syncStateSubject.asObservable();
  private isOnlineSubject = new BehaviorSubject<boolean>(navigator.onLine);
  public isOnline$ = this.isOnlineSubject.asObservable();
  private syncIntervalId: any;

  constructor(
    private http: HttpClient,
    private store: OfflineStoreService,
    private config: SyncConfigService
  ) {
    // Monitorar status online/offline
    window.addEventListener('online', () => {
      this.isOnlineSubject.next(true);
      this.checkAndStartSync();
    });
    window.addEventListener('offline', () => {
      this.isOnlineSubject.next(false);
    });
    
    // Iniciar sincronização automática se configurado
    if (this.config.config.autoSyncInterval) {
      this.startAutoSync(this.config.config.autoSyncInterval);
    }
  }

  /**
   * Inicia sincronização automática
   * @param interval Intervalo em milissegundos
   */
  startAutoSync(interval: number): void {
    if (this.syncIntervalId) {
      clearInterval(this.syncIntervalId);
    }
    
    this.syncIntervalId = setInterval(() => {
      if (navigator.onLine) {
        this.syncAll();
      }
    }, interval);
  }
  
  /**
   * Para sincronização automática
   */
  stopAutoSync(): void {
    if (this.syncIntervalId) {
      clearInterval(this.syncIntervalId);
      this.syncIntervalId = null;
    }
  }
  
  /**
   * Sincroniza todas as coleções
   */
  async syncAll(): Promise<any> {
    if (!navigator.onLine || this.syncStateSubject.value.isSyncing) return;
    
    const state = { ...this.syncStateSubject.value, isSyncing: true };
    this.syncStateSubject.next(state);
    
    try {
      const db = await this.store.getDatabase();
      const collections = Object.keys(db.collections);
      
      // Para cada coleção, sincronizar
      for (const collectionName of collections) {
        await this.syncCollection(collectionName);
      }
      
      // Atualizar estado da sincronização
      this.syncStateSubject.next({
        ...this.syncStateSubject.value,
        isSyncing: false,
        lastSyncTime: Date.now(),
        pendingChanges: 0
      });
      
      return true;
    } catch (error) {
      console.error('Erro ao sincronizar:', error);
      
      // Atualizar estado com erro
      this.syncStateSubject.next({
        ...this.syncStateSubject.value,
        isSyncing: false,
        error: error.message || 'Erro desconhecido na sincronização'
      });
      
      return false;
    }
  }
  
  /**
   * Sincroniza uma coleção específica
   * @param collectionName Nome da coleção
   */
  async syncCollection(collectionName: string): Promise<any> {
    try {
      const collection = await this.store.getCollection(collectionName);
      
      // Obter timestamp da última sincronização
      const lastSyncKey = `mongosync_${collectionName}_lastSync`;
      const lastSyncTimestamp = localStorage.getItem(lastSyncKey) || '0';
      
      // Obter documentos alterados desde a última sincronização
      const changedDocs = await collection.find({
        selector: {
          updatedAt: {
            $gt: parseInt(lastSyncTimestamp)
          }
        }
      }).exec();
      
      // Obter token de autenticação, se configurado
      const headers: any = { 'Content-Type': 'application/json' };
      if (this.config.config.security?.getAuthToken) {
        const token = await this.config.config.security.getAuthToken();
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }
      }
      
      // Enviar para o servidor
      const response = await this.http.post<any>(
        `${this.config.config.apiUrl}/sync/${collectionName}`,
        {
          lastSyncTimestamp,
          changedDocs: changedDocs.map(doc => doc.toJSON()),
        },
        { headers }
      ).toPromise();
      
      // Processar documentos do servidor
      if (response.docs && response.docs.length > 0) {
        await this.processServerDocs(collection, response.docs);
      }
      
      // Atualizar timestamp de sincronização
      localStorage.setItem(lastSyncKey, response.timestamp.toString());
      
      return response.syncResults;
    } catch (error) {
      this.logError(`Erro ao sincronizar ${collectionName}:`, error);
      throw error;
    }
  }
  
  private async processServerDocs(collection: any, serverDocs: any[]): Promise<void> {
    const conflicts: ConflictItem[] = [];
    
    for (const doc of serverDocs) {
      try {
        // Verificar se existe localmente
        const localDoc = await collection.findOne(doc.id).exec();
        
        if (!localDoc) {
          // Novo documento do servidor
          await collection.insert(doc);
        } else {
          // Verificar conflitos
          if (this.hasConflict(localDoc.toJSON(), doc)) {
            // Lidar com conflito de acordo com a estratégia configurada
            await this.handleConflict(collection, localDoc, doc, conflicts);
          } else if (doc.updatedAt > localDoc.get('updatedAt')) {
            // Servidor tem versão mais nova
            await localDoc.update({
              $set: doc
            });
          }
        }
      } catch (error) {
        this.logError('Erro ao processar documento:', error);
      }
    }
    
    // Atualizar estado com conflitos
    if (conflicts.length > 0) {
      this.syncStateSubject.next({
        ...this.syncStateSubject.value,
        conflicts: [...this.syncStateSubject.value.conflicts, ...conflicts]
      });
    }
  }
  
  private hasConflict(localDoc: any, serverDoc: any): boolean {
    // Documentos são considerados em conflito se foram modificados em ambos os lados
    return localDoc._modified && serverDoc.updatedAt > localDoc.lastSyncedAt;
  }
  
  private async handleConflict(
    collection: any, 
    localDoc: any, 
    serverDoc: any, 
    conflicts: ConflictItem[]
  ): Promise<void> {
    const strategy = this.config.config.conflictResolution || 'server-wins';
    
    switch (strategy) {
      case 'server-wins':
        await localDoc.update({
          $set: serverDoc
        });
        break;
        
      case 'client-wins':
        // Não fazer nada, manter versão do cliente
        break;
        
      case 'timestamp-wins':
        if (serverDoc.updatedAt > localDoc.get('updatedAt')) {
          await localDoc.update({
            $set: serverDoc
          });
        }
        break;
        
      case 'manual':
        // Adicionar à lista de conflitos para resolução manual
        conflicts.push({
          id: localDoc.get('id'),
          collection: collection.name,
          localVersion: localDoc.toJSON(),
          serverVersion: serverDoc,
          resolved: false
        });
        break;
    }
  }
  
  /**
   * Resolve um conflito manualmente
   * @param conflictId ID do conflito
   * @param resolution Tipo de resolução
   */
  async resolveConflict(
    conflictId: string, 
    resolution: 'local' | 'server' | 'custom', 
    customData?: any
  ): Promise<void> {
    const state = this.syncStateSubject.value;
    const conflict = state.conflicts.find(c => c.id === conflictId);
    
    if (!conflict) {
      throw new Error(`Conflito com ID ${conflictId} não encontrado`);
    }
    
    try {
      const collection = await this.store.getCollection(conflict.collection);
      const doc = await collection.findOne(conflict.id).exec();
      
      if (!doc) {
        throw new Error('Documento não encontrado no banco local');
      }
      
      let finalData;
      
      switch (resolution) {
        case 'local':
          finalData = conflict.localVersion;
          break;
        case 'server':
          finalData = conflict.serverVersion;
          break;
        case 'custom':
          finalData = customData;
          break;
      }
      
      // Atualizar documento local
      await doc.update({
        $set: {
          ...finalData,
          updatedAt: Date.now()
        }
      });
      
      // Remover conflito da lista
      const updatedConflicts = state.conflicts.filter(c => c.id !== conflictId);
      this.syncStateSubject.next({
        ...state,
        conflicts: updatedConflicts
      });
      
      // Sincronizar para enviar a resolução ao servidor
      if (navigator.onLine) {
        await this.syncCollection(conflict.collection);
      }
    } catch (error) {
      this.logError('Erro ao resolver conflito:', error);
      throw error;
    }
  }
  
  /**
   * Verifica e inicia sincronização se houver alterações pendentes
   */
  private checkAndStartSync(): void {
    const state = this.syncStateSubject.value;
    if (state.pendingChanges > 0 && navigator.onLine) {
      this.syncAll();
    }
  }
  
  /**
   * Incrementa contador de alterações pendentes
   */
  incrementPendingChanges(): void {
    const state = this.syncStateSubject.value;
    this.syncStateSubject.next({
      ...state,
      pendingChanges: state.pendingChanges + 1
    });
  }
  
  /**
   * Gera log de erro
   */
  private logError(message: string, error: any): void {
    if (this.config.config.logging?.level !== 'none') {
      if (this.config.config.logging?.logger) {
        this.config.config.logging.logger('error', message, error);
      } else {
        console.error(message, error);
      }
    }
  }
}