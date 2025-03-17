/// <reference lib="webworker" />

addEventListener('message', ({ data }) => {
  const { action, payload } = data;
  
  switch (action) {
    case 'process-batch':
      processBatch(payload);
      break;
    case 'compare-documents':
      compareDocuments(payload);
      break;
    default:
      postMessage({ error: 'Unknown action' });
  }
});

function processBatch(docs: any[]) {
  // Processamento pesado de lote aqui
  const processedDocs = docs.map(doc => {
    // Processamento...
    return {
      ...doc,
      processed: true,
      _hash: hashDocument(doc)
    };
  });
  
  postMessage({ processedDocs });
}

function compareDocuments({ localDocs, serverDocs }) {
  const changes = [];
  const conflicts = [];
  
  // Algoritmo otimizado de detecção de mudanças
  // ...
  
  postMessage({ changes, conflicts });
}

function hashDocument(doc: any): string {
  // Implementação de hash para verificar mudanças
  const content = JSON.stringify(doc);
  // Versão simplificada de hash
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    hash = ((hash << 5) - hash) + content.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }
  return hash.toString(16);
}