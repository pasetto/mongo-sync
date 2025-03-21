import { Db } from 'mongodb';
import { v4 as uuidv4 } from 'uuid';
import { SyncConfig } from '../types';

export class SyncService {
  private db!: Db; // Com o operador ! para indicar inicialização posterior
  private collections: Record<string, any>;
  private logLevel: string;
  private userIdField: string;

  constructor(db: Db, config: SyncConfig) {
    this.db = db;
    this.collections = config.collections || {};
    this.logLevel = config.logging?.level || 'info';
    this.userIdField = config.userIdField || 'userId';
    
    // this.setupCollections().catch(err => {
    //   this.log('error', `Erro ao configurar coleções: ${err.message}`, err);
    // });
  }

  /**
   * Configura índices e validações para as coleções
   */
  private async setupCollections() {
    // Garantir que todas as coleções tenham o índice no campo ID
    for (const collectionName of Object.keys(this.collections)) {
      try {
        const collection = this.db.collection(collectionName);
        
        // Criar índice para campo id
        await collection.createIndex({ id: 1 }, { unique: true });
        
        // Criar índice para campo updatedAt para facilitar consultas de sincronização
        await collection.createIndex({ updatedAt: 1 });
        
        // Criar índice para campo userId para restrição de acesso
        await collection.createIndex({ [this.userIdField]: 1 });
        
        this.log('debug', `Índices configurados para coleção ${collectionName}`);
      } catch (error: any) {
        this.log('error', `Erro ao configurar índices para ${collectionName}: ${error.message}`, error);
      }
    }
  }

  /**
   * Processa mudanças de sincronização
   */
  async processChanges(collectionName: string, changes: any[], userId: string) {
    this.log('debug', `Processando ${changes.length} mudanças para coleção ${collectionName}`);
    
    // Verificar se a coleção está configurada
    if (!this.collections[collectionName]) {
      throw new Error(`Coleção ${collectionName} não configurada para sincronização`);
    }
    
    const collection = this.db.collection(collectionName);
    const collectionConfig = this.collections[collectionName];
    const validator = collectionConfig.validator;
    
    const results = {
      processed: 0,
      conflicts: 0,
      errors: 0,
      details: [] as any[],
      serverChanges: [] as any[]
    };
    
    // Processar cada documento de mudança
    for (const change of changes) {
      try {
        // Validação de documento
        if (validator && !await validator(change, { user: { id: userId } })) {
          results.errors++;
          results.details.push({
            id: change.id,
            error: 'Validação falhou'
          });
          continue;
        }
        
        // Verificar se o documento pertence ao usuário
        if (change[this.userIdField] && change[this.userIdField] !== userId) {
          results.errors++;
          results.details.push({
            id: change.id,
            error: 'Documento não pertence ao usuário'
          });
          continue;
        }
        
        // Sempre definir o userId no documento
        change[this.userIdField] = userId;
        
        // Buscar documento existente
        const existingDoc = await collection.findOne({ id: change.id });
        
        // Se o documento não existe, basta inserir
        if (!existingDoc) {
          // Se está marcado como excluído, ignoramos
          if (change._deleted) {
            results.processed++;
            continue;
          }
          
          // Garantir que tenha ID
          if (!change.id) {
            change.id = uuidv4();
          }
          
          // Inserir novo documento
          await collection.insertOne(change);
          results.processed++;
        }
        // Se o documento existe, precisamos resolver conflitos
        else {
          // Verificar conflitos
          if (existingDoc.updatedAt > change.updatedAt) {
            // Conflito: documento do servidor é mais recente
            results.conflicts++;
            
            // Se tiver um handler de conflitos, usá-lo
            if (collectionConfig.conflictHandler) {
              const resolved = await collectionConfig.conflictHandler(
                existingDoc, 
                change,
                { user: { id: userId } }
              );
              
              if (resolved) {
                await collection.replaceOne({ id: change.id }, resolved);
                results.processed++;
                results.serverChanges.push(resolved);
              } else {
                results.serverChanges.push(existingDoc);
              }
            } else {
              // Estratégia padrão: o servidor vence
              results.serverChanges.push(existingDoc);
            }
          } else {
            // Documento do cliente é mais recente ou igual
            if (change._deleted) {
              // Excluir documento
              await collection.deleteOne({ id: change.id });
            } else {
              // Atualizar documento
              await collection.replaceOne({ id: change.id }, change);
            }
            results.processed++;
          }
        }
      } catch (error: any) {
        this.log('error', `Erro ao processar documento: ${error.message}`, error);
        results.errors++;
        results.details.push({
          id: change.id,
          error: error.message
        });
      }
    }
    
    this.log('info', `Sincronização concluída para ${collectionName}: ${results.processed} processados, ${results.conflicts} conflitos, ${results.errors} erros`);
    return results;
  }

  /**
   * Obtém alterações desde determinada data
   */
  async getChanges(collectionName: string, since: number, userId: string) {
    this.log('debug', `Buscando alterações para ${collectionName} desde ${since}`);
    
    // Verificar se a coleção está configurada
    if (!this.collections[collectionName]) {
      throw new Error(`Coleção ${collectionName} não configurada para sincronização`);
    }
    
    const collection = this.db.collection(collectionName);
    
    // Buscar documentos alterados desde a data especificada
    const query: any = {
      updatedAt: { $gt: since },
      [this.userIdField]: userId
    };
    
    const changes = await collection.find(query).toArray();
    
    this.log('info', `Encontradas ${changes.length} alterações para ${collectionName}`);
    return changes;
  }

  /**
   * Registrar documentos excluídos (soft delete)
   */
  async markDocumentsAsDeleted(collectionName: string, documentIds: string[], userId: string) {
    const collection = this.db.collection(collectionName);
    const now = Date.now();
    
    const updates = documentIds.map(id => ({
      updateOne: {
        filter: { id, [this.userIdField]: userId },
        update: { $set: { _deleted: true, updatedAt: now } }
      }
    }));
    
    if (updates.length > 0) {
      const result = await collection.bulkWrite(updates);
      this.log('debug', `Marcados ${result.modifiedCount} documentos como excluídos`);
      return result.modifiedCount;
    }
    
    return 0;
  }

  /**
   * Logging com níveis
   */
  private log(level: string, message: string, error?: Error) {
    const logLevels: Record<string, number> = {
      debug: 0,
      info: 1,
      warning: 2,
      error: 3,
      none: 4
    };
    
    const configLevel = this.logLevel || 'info';
    
    if (logLevels[level] >= logLevels[configLevel]) {
      const timestamp = new Date().toISOString();
      const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
      
      switch (level) {
        case 'error':
          console.error(`${prefix} ${message}`, error || '');
          break;
        case 'warning':
          console.warn(`${prefix} ${message}`);
          break;
        case 'info':
          console.info(`${prefix} ${message}`);
          break;
        case 'debug':
          console.debug(`${prefix} ${message}`);
          break;
      }
    }
  }
}