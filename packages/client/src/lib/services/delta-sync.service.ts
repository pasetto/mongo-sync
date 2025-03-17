import { Injectable } from '@angular/core';
import * as jsondiffpatch from 'jsondiffpatch';

@Injectable({
  providedIn: 'root'
})
export class DeltaSyncService {
  private diffPatcher = jsondiffpatch.create({});
  private lastSyncedVersions: Record<string, Record<string, any>> = {};
  
  /**
   * Gera delta em vez do documento completo
   */
  generateDelta(collectionName: string, docId: string, currentDoc: any): any {
    const lastVersion = this.getLastSyncedVersion(collectionName, docId);
    if (!lastVersion) return { fullDocument: currentDoc };
    
    const delta = this.diffPatcher.diff(lastVersion, currentDoc);
    
    // Se o delta for maior que 60% do documento, enviar documento completo
    const deltaSize = JSON.stringify(delta).length;
    const docSize = JSON.stringify(currentDoc).length;
    
    if (deltaSize > docSize * 0.6) {
      return { fullDocument: currentDoc };
    }
    
    return { delta, baseVersion: lastVersion._rev || 0 };
  }
  
  /**
   * Aplica delta ao documento
   */
  applyDelta(document: any, delta: any): any {
    return this.diffPatcher.patch(document, delta);
  }
  
  /**
   * Armazena versão após sincronização bem-sucedida
   */
  saveLastSyncedVersion(collectionName: string, docId: string, doc: any): void {
    if (!this.lastSyncedVersions[collectionName]) {
      this.lastSyncedVersions[collectionName] = {};
    }
    this.lastSyncedVersions[collectionName][docId] = { ...doc };
  }
  
  private getLastSyncedVersion(collectionName: string, docId: string): any {
    return this.lastSyncedVersions[collectionName]?.[docId];
  }
}