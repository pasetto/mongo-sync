import { Injectable } from '@angular/core';
import { OfflineStoreService } from './offline-store.service';
import { EncryptionService } from './encryption.service';

@Injectable({
  providedIn: 'root'
})
export class BackupService {
  constructor(
    private store: OfflineStoreService,
    private encryption: EncryptionService
  ) {}
  
  /**
   * Cria um backup completo do banco local
   */
  async createBackup(options: {
    encrypt?: boolean;
    collections?: string[];
    password?: string;
  } = {}): Promise<string> {
    try {
      const db = await this.store.getDatabase();
      const collections = options.collections || Object.keys(db.collections);
      const backup: Record<string, any[]> = {};
      
      // Para cada coleção
      for (const collectionName of collections) {
        const collection = db.collections[collectionName];
        const docs = await collection.find().exec();
        backup[collectionName] = docs.map(doc => doc.toJSON());
      }
      
      // Adicionar metadados
      const backupData = {
        version: '1.0',
        timestamp: Date.now(),
        data: backup,
        metadata: {
          collectionCount: collections.length,
          documentCount: Object.values(backup).flat().length
        }
      };
      
      // Converter para string
      let backupString = JSON.stringify(backupData);
      
      // Criptografar se necessário
      if (options.encrypt && options.password) {
        backupString = this.encryption.encryptData(backupString, options.password);
      }
      
      return backupString;
    } catch (error) {
      console.error('Erro ao criar backup:', error);
      throw new Error('Falha ao criar backup: ' + error.message);
    }
  }
  
  /**
   * Restaura um backup anterior
   */
  async restoreBackup(backupString: string, options: {
    password?: string;
    mergeStrategy?: 'replace' | 'merge' | 'skip-existing';
  } = {}): Promise<{ success: boolean; restored: number; errors: number; }> {
    try {
      // Desencriptar se necessário
      let parsedBackup: any;
      
      try {
        if (options.password) {
          // Tentar descriptografar
          const decrypted = this.encryption.decryptData(backupString, options.password);
          parsedBackup = JSON.parse(decrypted);
        } else {
          // Tentar como texto simples
          parsedBackup = JSON.parse(backupString);
        }
      } catch (e) {
        throw new Error('Falha ao processar backup. Senha incorreta ou dados corrompidos.');
      }
      
      // Validar formato do backup
      if (!parsedBackup.version || !parsedBackup.data) {
        throw new Error('Formato de backup inválido.');
      }
      
      const db = await this.store.getDatabase();
      let restored = 0;
      let errors = 0;
      
      // Para cada coleção no backup
      for (const [collectionName, documents] of Object.entries<any[]>(parsedBackup.data)) {
        if (!db.collections[collectionName]) {
          console.warn(`Coleção ${collectionName} não existe no banco atual.`);
          continue;
        }
        
        const collection = db.collections[collectionName];
        
        // Para cada documento
        for (const doc of documents) {
          try {
            switch (options.mergeStrategy || 'replace') {
              case 'replace':
                // Remover existente se houver
                const existing = await collection.findOne(doc.id).exec();
                if (existing) {
                  await existing.remove();
                }
                await collection.insert(doc);
                break;
                
              case 'merge':
                // Mesclar com existente
                const existingDoc = await collection.findOne(doc.id).exec();
                if (existingDoc) {
                  await existingDoc.update({ $set: doc });
                } else {
                  await collection.insert(doc);
                }
                break;
                
              case 'skip-existing':
                // Pular se já existir
                const exists = await collection.findOne(doc.id).exec();
                if (!exists) {
                  await collection.insert(doc);
                }
                break;
            }
            
            restored++;
          } catch (e) {
            errors++;
            console.error(`Erro ao restaurar documento ${doc.id}:`, e);
          }
        }
      }
      
      return { success: true, restored, errors };
    } catch (error) {
      console.error('Erro ao restaurar backup:', error);
      throw new Error('Falha ao restaurar backup: ' + error.message);
    }
  }
  
  /**
   * Verifica integridade do banco de dados local
   */
  async checkDatabaseIntegrity(): Promise<{
    status: 'ok' | 'warning' | 'error';
    issues: string[];
  }> {
    try {
      const db = await this.store.getDatabase();
      const collections = Object.keys(db.collections);
      const issues: string[] = [];
      
      // Para cada coleção
      for (const collectionName of collections) {
        try {
          const collection = db.collections[collectionName];
          
          // Verificar se pode consultar a coleção
          await collection.find().limit(1).exec();
          
          // Verificar documentos corrompidos
          const docs = await collection.find().exec();
          
          for (const doc of docs) {
            try {
              // Tenta acessar propriedades para verificar corrupção
              const data = doc.toJSON();
              if (!data.id) {
                issues.push(`Documento sem ID na coleção ${collectionName}`);
              }
            } catch (e) {
              issues.push(`Documento corrompido na coleção ${collectionName}: ${e.message}`);
            }
          }
        } catch (e) {
          issues.push(`Erro ao verificar coleção ${collectionName}: ${e.message}`);
        }
      }
      
      return {
        status: issues.length === 0 ? 'ok' : (issues.length < 5 ? 'warning' : 'error'),
        issues
      };
    } catch (error) {
      return {
        status: 'error',
        issues: [`Falha ao verificar integridade: ${error.message}`]
      };
    }
  }
  
  /**
   * Exporta dados para CSV
   */
  async exportToCSV(collectionName: string): Promise<string> {
    const db = await this.store.getDatabase();
    const collection = db.collections[collectionName];
    
    if (!collection) {
      throw new Error(`Coleção ${collectionName} não encontrada.`);
    }
    
    const docs = await collection.find().exec();
    
    if (docs.length === 0) {
      return 'Sem dados para exportar';
    }
    
    // Obter cabeçalhos (propriedades do primeiro documento)
    const firstDoc = docs[0].toJSON();
    const headers = Object.keys(firstDoc);
    
    // Criar CSV
    let csv = headers.join(',') + '\n';
    
    // Adicionar linhas
    for (const doc of docs) {
      const row = headers.map(header => {
        const value = doc[header];
        
        // Formatar valor
        if (value === null || value === undefined) {
          return '';
        } else if (typeof value === 'string') {
          // Escapar aspas e envolver em aspas
          return `"${value.replace(/"/g, '""')}"`;
        } else if (typeof value === 'object') {
          // Converter objeto para JSON string
          return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
        }
        
        return value;
      }).join(',');
      
      csv += row + '\n';
    }
    
    return csv;
  }
}