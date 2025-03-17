import { Injectable } from '@angular/core';
import { createRxDatabase, addRxPlugin, RxDatabase } from 'rxdb';
import { getRxStorageIndexedDB } from 'rxdb/plugins/storage-indexeddb';
import { SyncConfigService } from './sync-config.service';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class OfflineStoreService {
  private db: RxDatabase | null = null;
  private isInitializedSubject = new BehaviorSubject<boolean>(false);
  public isInitialized$ = this.isInitializedSubject.asObservable();
  
  constructor(private config: SyncConfigService) {}

  /**
   * Inicializa o banco de dados local
   * @param schemas Esquemas das coleções
   */
  async initialize(schemas: any): Promise<RxDatabase> {
    if (this.db) return this.db;

    const { dbName = 'mongosync_db' } = this.config.config;
    
    this.db = await createRxDatabase({
      name: dbName,
      storage: getRxStorageIndexedDB()
    });

    await this.db.addCollections(schemas);
    
    this.isInitializedSubject.next(true);
    return this.db;
  }
  
  /**
   * Obtém o banco de dados
   */
  async getDatabase(): Promise<RxDatabase> {
    if (!this.db) {
      throw new Error('Banco de dados não inicializado. Chame initialize() primeiro.');
    }
    return this.db;
  }
  
  /**
   * Obtém uma coleção
   * @param collectionName Nome da coleção
   */
  async getCollection(collectionName: string): Promise<any> {
    const db = await this.getDatabase();
    return db.collections[collectionName];
  }
  
  /**
   * Remove o banco de dados local
   */
  async removeDatabase(): Promise<void> {
    if (this.db) {
      await this.db.remove();
      this.db = null;
      this.isInitializedSubject.next(false);
    }
  }
}