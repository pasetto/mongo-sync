import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class SyncWorkerService {
  private worker: Worker;
  
  constructor() {
    if (typeof Worker !== 'undefined') {
      this.worker = new Worker(new URL('../workers/sync.worker', import.meta.url), { type: 'module' });
    }
  }
  
  /**
   * Processa documentos em segundo plano
   */
  processBatch(docs: any[]): Promise<any[]> {
    return new Promise((resolve, reject) => {
      if (!this.worker) {
        // Fallback para processamento síncrono
        resolve(docs.map(doc => ({ ...doc, processed: true })));
        return;
      }
      
      const onMessage = (event: MessageEvent) => {
        this.worker.removeEventListener('message', onMessage);
        if (event.data.error) {
          reject(new Error(event.data.error));
        } else {
          resolve(event.data.processedDocs);
        }
      };
      
      this.worker.addEventListener('message', onMessage);
      this.worker.postMessage({ action: 'process-batch', payload: docs });
    });
  }
}