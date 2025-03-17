/**
 * Script de teste para verificar a sincronização
 * 
 * Para usar, abra o console do navegador e cole este script
 */
(function() {
  console.log('=== Teste de Sincronização Offline/Online ===');
  
  // Função para criar uma tarefa simulando online/offline
  async function testTaskSync() {
    // 1. Desativar conexão
    console.log('📴 Simulando desconexão...');
    // Este é um hack para o teste - na prática use as ferramentas do navegador
    const originalOnline = navigator.onLine;
    Object.defineProperty(navigator, 'onLine', { get: () => false });
    window.dispatchEvent(new Event('offline'));
    
    // 2. Criar uma tarefa offline
    console.log('✏️ Criando tarefa offline...');
    const db = await window.angularComponentRef.dbService.initialize();
    const timestamp = Date.now();
    const offlineTaskTitle = `Tarefa Offline - ${timestamp}`;
    await window.angularComponentRef.dbService.addTask(offlineTaskTitle);
    
    // 3. Restaurar conexão
    console.log('📶 Restaurando conexão...');
    Object.defineProperty(navigator, 'onLine', { get: () => originalOnline });
    window.dispatchEvent(new Event('online'));
    
    // 4. Esperar pela sincronização
    console.log('⏳ Aguardando sincronização...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // 5. Verificar se a tarefa foi sincronizada
    console.log('🔍 Verificando sincronização no servidor...');
    try {
      const response = await fetch('http://localhost:3000/api/tasks');
      const tasks = await response.json();
      const syncedTask = tasks.find(t => t.title === offlineTaskTitle);
      
      if (syncedTask) {
        console.log('✅ SUCESSO! Tarefa offline foi sincronizada com o servidor.');
        console.log('Detalhes da tarefa:', syncedTask);
      } else {
        console.log('❌ FALHA! A tarefa não foi encontrada no servidor.');
      }
    } catch (error) {
      console.error('❌ ERRO ao verificar sincronização:', error);
    }
  }
  
  // Exportar função para uso no console
  window.testTaskSync = testTaskSync;
  console.log('Para testar a sincronização, execute: window.testTaskSync()');
})();