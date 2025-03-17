import { Injectable } from '@angular/core';
import { DatabaseService } from './database.service';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class SyncTesterService {
  constructor(
    private db: DatabaseService,
    private http: HttpClient
  ) {}

  async testTaskSync(): Promise<{success: boolean, message: string, details?: any}> {
    try {
      // 1. Simular desconexão
      console.log('📴 Simulando desconexão...');
      window.dispatchEvent(new Event('offline'));
      
      // 2. Criar tarefa offline
      console.log('✏️ Criando tarefa offline...');
      const timestamp = Date.now();
      const offlineTaskTitle = `Tarefa Offline - ${timestamp}`;
      await this.db.addTask(offlineTaskTitle);
      
      // 3. Restaurar conexão
      console.log('📶 Restaurando conexão...');
      window.dispatchEvent(new Event('online'));
      
      // 4. Aguardar sincronização (5 segundos)
      console.log('⏳ Aguardando sincronização...');
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // 5. Verificar no servidor
      const response = await this.http.get(`${environment.apiUrl}/tasks`).toPromise();
      const tasks = response as any[];
      const syncedTask = tasks.find(t => t.title === offlineTaskTitle);
      
      if (syncedTask) {
        return {
          success: true,
          message: '✅ SUCESSO! Tarefa offline sincronizada com o servidor.',
          details: syncedTask
        };
      } else {
        return {
          success: false,
          message: '❌ FALHA! A tarefa não foi encontrada no servidor.'
        };
      }
    } catch (error) {
      return {
        success: false,
        message: '❌ ERRO ao testar sincronização',
        details: error
      };
    }
  }
}