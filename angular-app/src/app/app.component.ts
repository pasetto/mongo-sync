import { Component, OnInit } from '@angular/core';
import { DatabaseService } from './services/database.service';

@Component({
  selector: 'app-root',
  template: `
    <div class="app-container">
      <app-navigation></app-navigation>
      <div class="content">
        <router-outlet></router-outlet>
      </div>
      <app-sync-indicator></app-sync-indicator>
      <div *ngIf="!dbInitialized" class="loading-overlay">
        <div class="loading-message">
          <h2>Inicializando banco de dados...</h2>
          <p>Por favor, aguarde...</p>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .app-container {
      min-height: 100vh;
    }
    .content {
      padding: 20px;
    }
    .loading-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(0,0,0,0.7);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 9999;
    }
    .loading-message {
      background-color: white;
      padding: 20px;
      border-radius: 5px;
      text-align: center;
    }
  `]
})
export class AppComponent implements OnInit {
  dbInitialized = false;

  constructor(private db: DatabaseService) { }

  ngOnInit() {
    this.db.initialize().then(() => {
      this.dbInitialized = true;
    });

    this.db.isInitialized$.subscribe(initialized => {
      this.dbInitialized = initialized;
    });
    
    // Expor para testes
    window.angularComponentRef = {
      dbService: this.db
    };
  }
}