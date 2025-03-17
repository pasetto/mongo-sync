import { Injectable } from '@angular/core';
import { OfflineStoreService } from './offline-store.service';
import { BehaviorSubject } from 'rxjs';

export interface MigrationPlan {
  /**
   * Versão alvo da migração
   */
  targetVersion: number;
  
  /**
   * Função para migrar um documento
   */
  migrationFn: (oldDoc: any) => any;
  
  /**
   * Condição para aplicar migração
   */
  condition?: (oldDoc: any) => boolean;
}

@Injectable({
  providedIn: 'root'
})
export class SchemaMigrationService {
  private migrations: Record<string, MigrationPlan[]> = {};
  private migrationStatus = new BehaviorSubject<{
    inProgress: boolean;
    collection?: string;
    progress?: number;
  }>({ inProgress: false });
  
  migrationStatus$ = this.migrationStatus.asObservable();
  
  constructor(private store: OfflineStoreService) {}
  
  /**
   * Registra um plano de migração para uma coleção
   */
  registerMigration(collectionName: string, plan: MigrationPlan): void {
    if (!this.migrations[collectionName]) {
      this.migrations[collectionName] = [];
    }
    
    this.migrations[collectionName].push(plan);
    
    // Ordenar migrações por versão (crescente)
    this.migrations[collectionName].sort((a, b) => a.targetVersion - b.targetVersion);
  }
  
  /**
   * Executa migrações pendentes para todas as coleções
   */
  async migrateAllCollections(): Promise<Record<string, { migrated: number, skipped: number }>> {
    const results: Record<string, { migrated: number, skipped: number }> = {};
    const db = await this.store.getDatabase();
    
    for (const collectionName of Object.keys(this.migrations)) {
      if (db.collections[collectionName]) {
        results[collectionName] = await this.migrateCollection(collectionName);
      }
    }
    
    return results;
  }
  
  /**
   * Executa migrações para uma coleção específica
   */
  async migrateCollection(collectionName: string): Promise<{ migrated: number, skipped: number }> {
    const migrationPlans = this.migrations[collectionName];
    if (!migrationPlans || migrationPlans.length === 0) {
      return { migrated: 0, skipped: 0 };
    }
    
    const collection = await this.store.getCollection(collectionName);
    const docs = await collection.find().exec();
    let migrated = 0;
    let skipped = 0;
    
    // Iniciar status
    this.migrationStatus.next({
      inProgress: true,
      collection: collectionName,
      progress: 0
    });
    
    // Para cada documento
    for (let i = 0; i < docs.length; i++) {
      const doc = docs[i];
      let modified = false;
      
      // Verificar versão atual do documento
      const currentVersion = doc.schemaVersion || 0;
      
      // Aplicar migrações necessárias
      for (const plan of migrationPlans) {
        // Pular se documento já está na versão alvo ou superior
        if (currentVersion >= plan.targetVersion) {
          continue;
        }
        
        // Verificar condição (se existir)
        if (plan.condition && !plan.condition(doc.toJSON())) {
          continue;
        }
        
        // Aplicar migração
        const updatedDoc = plan.migrationFn(doc.toJSON());
        
        // Adicionar versão do schema
        updatedDoc.schemaVersion = plan.targetVersion;
        
        // Atualizar documento
        await doc.update({
          $set: updatedDoc
        });
        
        modified = true;
      }
      
      // Contabilizar
      if (modified) {
        migrated++;
      } else {
        skipped++;
      }
      
      // Atualizar progresso
      this.migrationStatus.next({
        inProgress: true,
        collection: collectionName,
        progress: Math.round((i + 1) / docs.length * 100)
      });
    }
    
    // Finalizar status
    this.migrationStatus.next({
      inProgress: false
    });
    
    return { migrated, skipped };
  }
  
  /**
   * Verificar documentos que precisam de migração
   */
  async checkMigrationNeeded(): Promise<Record<string, number>> {
    const result: Record<string, number> = {};
    const db = await this.store.getDatabase();
    
    for (const collectionName of Object.keys(this.migrations)) {
      if (!db.collections[collectionName]) continue;
      
      const collection = db.collections[collectionName];
      const latestVersion = this.getLatestVersion(collectionName);
      
      // Contar documentos desatualizados
      const count = await collection.count({
        selector: {
          $or: [
            { schemaVersion: { $lt: latestVersion } },
            { schemaVersion: { $exists: false } }
          ]
        }
      }).exec();
      
      if (count > 0) {
        result[collectionName] = count;
      }
    }
    
    return result;
  }
  
  /**
   * Obter a versão mais recente para uma coleção
   */
  getLatestVersion(collectionName: string): number {
    const plans = this.migrations[collectionName];
    if (!plans || plans.length === 0) return 0;
    
    return plans[plans.length - 1].targetVersion;
  }
}