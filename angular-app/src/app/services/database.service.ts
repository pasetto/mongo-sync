// Adicione dentro da classe DatabaseService
private syncQueue: {collection: string, action: string, id: string}[] = [];
private syncThrottleTimeout: any = null;

// Método para enfileirar sincronizações
private queueSync(collection: string, action: string, id: string) {
  this.syncQueue.push({collection, action, id});
  
  // Aplicar throttling para não sincronizar cada mudança individualmente
  if (!this.syncThrottleTimeout && navigator.onLine) {
    this.syncThrottleTimeout = setTimeout(() => {
      this.processSyncQueue();
      this.syncThrottleTimeout = null;
    }, 2000); // Aguardar 2 segundos de inatividade antes de sincronizar
  }
}

private async processSyncQueue() {
  if (this.syncQueue.length === 0) return;
  
  // Agrupar por coleção para evitar múltiplas sincronizações
  const collections = [...new Set(this.syncQueue.map(item => item.collection))];
  
  // Limpar fila
  this.syncQueue = [];
  
  // Sincronizar coleções afetadas
  for (const collection of collections) {
    await this.syncCollection(collection as 'tasks' | 'notes');
  }
}