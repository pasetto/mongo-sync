import { Injectable } from '@angular/core';
import { StorageMap } from '@ngx-pwa/local-storage';
import { BehaviorSubject } from 'rxjs';

interface SyncAttempt {
  id: string;
  collectionName: string;
  operation: 'push' | 'pull';
  payload: any;
  timestamp: number;
  retries: number;
  lastError?: string;
}

@Injectable({
  providedIn: 'root'
})
export class SyncRetryService {
  private pendingAttempts: SyncAttempt[] = [];
  private pendingSubject = new BehaviorSubject<number>(0);
  public pendingCount$ = this.pendingSubject.asObservable();
  private retryTimerId: any;

  constructor(private storage: StorageMap) {
    this.loadPendingAttempts();
  }

  /**
   * Carrega tentativas pendentes do armazenamento local
   */
  private async loadPendingAttempts(): Promise<void> {
    try {
      const attempts = await this.storage.get<SyncAttempt[]>('mongosync_pending_attempts').toPromise();
      if (attempts) {
        this.pendingAttempts = attempts;
        this.pendingSubject.next(this.pendingAttempts.length);
      }
    } catch (error) {
      console.error('Erro ao carregar tentativas pendentes:', error);
    }
  }

  /**
   * Salva tentativas pendentes no armazenamento local
   */
  private async savePendingAttempts(): Promise<void> {
    await this.storage.set('mongosync_pending_attempts', this.pendingAttempts).toPromise();
    this.pendingSubject.next(this.pendingAttempts.length);
  }

  /**
   * Registra uma falha de sincronização para retry posterior
   */
  registerFailedSync(collectionName: string, operation: 'push' | 'pull', payload: any, error?: any): void {
    const attempt: SyncAttempt = {
      id: crypto.randomUUID(),
      collectionName,
      operation,
      payload,
      timestamp: Date.now(),
      retries: 0,
      lastError: error?.message || String(error)
    };

    this.pendingAttempts.push(attempt);
    this.savePendingAttempts();
    
    // Iniciar scheduler de retry se ainda não estiver rodando
    this.scheduleRetries();
  }

  /**
   * Agenda retentativas com backoff exponencial
   */
  scheduleRetries(): void {
    if (this.retryTimerId) return; // Já existe um scheduler
    
    this.retryTimerId = setInterval(() => {
      this.processRetries();
    }, 30000); // Verifica a cada 30 segundos
  }

  /**
   * Processa tentativas pendentes
   */
  async processRetries(): Promise<void> {
    if (!navigator.onLine || this.pendingAttempts.length === 0) return;
    
    // Ordenar por tempo e número de tentativas
    const sorted = [...this.pendingAttempts].sort((a, b) => {
      // Priorizar tentativas mais antigas com menos retries
      return (a.timestamp - b.timestamp) - (a.retries * 10000 - b.retries * 10000);
    });
    
    // Processar no máximo 5 tentativas por vez
    const batch = sorted.slice(0, 5);
    
    for (const attempt of batch) {
      try {
        // Implementar lógica de retry aqui, integrando com o serviço de sincronização
        await this.retrySyncOperation(attempt);
        
        // Se chegar aqui, foi bem-sucedido
        this.pendingAttempts = this.pendingAttempts.filter(a => a.id !== attempt.id);
      } catch (error) {
        // Incrementar contador de tentativas
        attempt.retries++;
        attempt.lastError = error?.message || String(error);
        
        // Desistir após muitas tentativas
        if (attempt.retries > 10) {
          this.pendingAttempts = this.pendingAttempts.filter(a => a.id !== attempt.id);
        }
      }
    }
    
    // Salvar estado atualizado
    await this.savePendingAttempts();
    
    // Se não houver mais pendências, parar o scheduler
    if (this.pendingAttempts.length === 0) {
      clearInterval(this.retryTimerId);
      this.retryTimerId = null;
    }
  }

  /**
   * Implementa a lógica concreta de retry
   */
  private async retrySyncOperation(attempt: SyncAttempt): Promise<void> {
    // Esta função seria implementada para integrar com o OfflineSyncService
    // ...
  }
}