import { Component } from '@angular/core';
import { SyncTesterService } from '../../services/sync-tester.service';

@Component({
  selector: 'app-sync-tester',
  template: `
    <div class="sync-tester">
      <h2>Teste de Sincronização</h2>
      <button (click)="runTest()" [disabled]="isRunning">
        Executar Teste de Sincronização
      </button>
      
      <div *ngIf="isRunning" class="status">
        Executando teste...
      </div>
      
      <div *ngIf="result" class="result" [class.success]="result.success" [class.error]="!result.success">
        <h3>Resultado: {{ result.success ? 'Sucesso' : 'Falha' }}</h3>
        <p>{{ result.message }}</p>
        <pre *ngIf="result.details">{{ result.details | json }}</pre>
      </div>
    </div>
  `,
  styles: [`
    .sync-tester {
      margin-top: 20px;
      padding: 15px;
      border: 1px solid #ddd;
      border-radius: 5px;
    }
    .status {
      margin-top: 10px;
      font-style: italic;
    }
    .result {
      margin-top: 10px;
      padding: 10px;
      border-radius: 5px;
    }
    .success {
      background-color: #d4edda;
      border: 1px solid #c3e6cb;
    }
    .error {
      background-color: #f8d7da;
      border: 1px solid #f5c6cb;
    }
  `]
})
export class SyncTesterComponent {
  isRunning = false;
  result: any = null;

  constructor(private syncTester: SyncTesterService) {}

  async runTest() {
    this.isRunning = true;
    this.result = null;
    
    try {
      this.result = await this.syncTester.testTaskSync();
    } catch (error) {
      this.result = {
        success: false,
        message: 'Erro ao executar teste',
        details: error
      };
    } finally {
      this.isRunning = false;
    }
  }
}