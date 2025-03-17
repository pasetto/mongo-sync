import { Collection, Db, MongoClient } from 'mongodb';
import { ServerSyncConfig } from './models/sync-config.model';

export class SyncService {
  private db: Db;
  private mongoClient: MongoClient | null = null;
  
  constructor(private config: ServerSyncConfig) {
    if (typeof config.mongodb === 'string') {
      // Será inicializado sob demanda
    } else {
      this.db = config.mongodb;
    }
  }
  
  /**
   * Inicializa a conexão com MongoDB, se necessário
   */
  async initialize(): Promise<void> {
    if (!this.db && typeof this.config.mongodb === 'string') {
      this.mongoClient = new MongoClient(this.config.mongodb);
      await this.mongoClient.connect();
      this.db = this.mongoClient.db();
      this.log('info', 'Conexão MongoDB inicializada');
    }
  }
  
  /**
   * Processa uma solicitação de sincronização
   */
  async processSync(
    collectionName: string, 
    lastSyncTimestamp: number, 
    changedDocs: any[], 
    req: any
  ): Promise<{ timestamp: number, docs: any[], syncResults: any }> {
    await this.initialize();
    
    const collection = this.db.collection(collectionName);
    const syncResults = { added: 0, updated: 0, conflicts: 0 };
    const userId = this.config.getUserId ? this.config.getUserId(req) : undefined;
    
    // 1. Processar documentos do cliente
    if (changedDocs && changedDocs.length > 0) {
      for (const doc of changedDocs) {
        try {
          // Validar documento
          if (!await this.validateDoc(doc, req, collectionName)) {
            this.log('warning', `Documento rejeitado na validação: ${doc.id}`);
            continue;
          }
          
          // Adicionar userId se configurado e não estiver presente
          if (userId && this.config.userIdField && !doc[this.config.userIdField]) {
            doc[this.config.userIdField] = userId;
          }
          
          // Verificar se o documento já existe
          const existingDoc = await collection.findOne({ id: doc.id });
          
          if (!existingDoc) {
            // Documento novo - inserir
            await collection.insertOne({
              ...doc,
              serverUpdatedAt: Date.now()
            });
            syncResults.added++;
          } else if (existingDoc.updatedAt <= doc.updatedAt) {
            // O cliente tem a versão mais recente - atualizar
            await collection.updateOne(
              { id: doc.id },
              { $set: { ...doc, serverUpdatedAt: Date.now() } }
            );
            syncResults.updated++;
          } else {
            // Conflito - o servidor tem uma versão mais recente
            // Usar manipulador de conflitos personalizado ou manter versão do servidor
            const collectionConfig = this.config.collections?.[collectionName];
            
            if (collectionConfig?.conflictHandler) {
              const resolvedDoc = await collectionConfig.conflictHandler(existingDoc, doc, req);
              
              if (resolvedDoc) {
                await collection.updateOne(
                  { id: doc.id },
                  { $set: { ...resolvedDoc, serverUpdatedAt: Date.now() } }
                );
              }
            }
            
            syncResults.conflicts++;
          }
        } catch (error) {
          this.log('error', `Erro ao processar documento: ${error.message}`, error);
        }
      }
    }
    
    // 2. Enviar documentos atualizados desde a última sincronização
    const timestamp = parseInt(String(lastSyncTimestamp)) || 0;
    let query: any = { serverUpdatedAt: { $gt: timestamp } };
    
    // Adicionar filtro de usuário se configurado
    if (userId && this.config.userIdField) {
      query[this.config.userIdField] = userId;
    }
    
    const serverDocs = await collection.find(query).toArray();
    
    // Aplicar transformação se configurada
    const transformedDocs = serverDocs.map(doc => {
      const collectionConfig = this.config.collections?.[collectionName];
      if (collectionConfig?.transform) {
        return collectionConfig.transform(doc, req);
      }
      return doc;
    });
    
    // 3. Retornar resultado
    return {
      timestamp: Date.now(),
      docs: transformedDocs,
      syncResults
    };
  }
  
  /**
   * Valida um documento para sincronização
   */
  private async validateDoc(doc: any, req: any, collectionName: string): Promise<boolean> {
    // Validar presença de campos obrigatórios
    if (!doc.id) {
      return false;
    }
    
    // Verificar permissões de usuário
    const userId = this.config.getUserId ? this.config.getUserId(req) : undefined;
    
    if (userId && this.config.userIdField && 
        doc[this.config.userIdField] && 
        doc[this.config.userIdField] !== userId) {
      return false; // Usuário não pode modificar documentos de outro usuário
    }
    
    // Usar validador personalizado se configurado
    const collectionConfig = this.config.collections?.[collectionName];
    if (collectionConfig?.validator) {
      return await collectionConfig.validator(doc, req);
    }
    
    return true;
  }
  
  /**
   * Encerra conexão com MongoDB, se necessário
   */
  async close(): Promise<void> {
    if (this.mongoClient) {
      await this.mongoClient.close();
      this.mongoClient = null;
      this.log('info', 'Conexão MongoDB encerrada');
    }
  }
  
  /**
   * Gera log baseado na configuração
   */
  private log(level: string, message: string, data?: any): void {
    if (!this.config.logging || this.config.logging.level === 'none') {
      return;
    }
    
    const logLevels = {
      'debug': 0,
      'info': 1,
      'warning': 2,
      'error': 3,
      'none': 4
    };
    
    const configLevel = this.config.logging.level || 'error';
    
    if (logLevels[level] >= logLevels[configLevel]) {
      if (this.config.logging.logger) {
        this.config.logging.logger(level, message, data);
      } else {
        const logMethod = level === 'error' ? console.error :
                         level === 'warning' ? console.warn :
                         level === 'info' ? console.info :
                         console.debug;
        logMethod(`[MongoSync] ${level.toUpperCase()}: ${message}`, data || '');
      }
    }
  }
}