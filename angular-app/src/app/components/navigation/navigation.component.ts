import { Component } from '@angular/core';
import { DatabaseService } from '../../services/database.service';

@Component({
  selector: 'app-navigation',
  template: `
    <nav>
      <div class="logo">Offline-First Demo</div>
      <div class="nav-links">
        <a routerLink="/tasks" routerLinkActive="active">Tarefas</a>
        <a routerLink="/notes" routerLinkActive="active">Notas</a>
        <a routerLink="/test-sync" routerLinkActive="active">Teste de Sync</a>
      </div>
      <div class="connection-status" [class.online]="isOnline" [class.offline]="!isOnline">
        {{ isOnline ? 'Online' : 'Offline' }}
      </div>
    </nav>
  `,
  styles: [`
    nav {
      display: flex;
      padding: 15px;
      background-color: #f8f9fa;
      border-bottom: 1px solid #ddd;
      justify-content: space-between;
      align-items: center;
    }
    .nav-links a {
      margin-right: 15px;
      text-decoration: none;
      color: #333;
    }
    .nav-links a.active {
      font-weight: bold;
      color: #007bff;
    }
    .connection-status {
      padding: 5px 10px;
      border-radius: 4px;
      font-size: 14px;
    }
    .online {
      background-color: #28a745;
      color: white;
    }
    .offline {
      background-color: #dc3545;
      color: white;
    }
  `]
})
export class NavigationComponent {
  isOnline = navigator.onLine;

  constructor(private db: DatabaseService) {
    this.db.isOnline$.subscribe(online => {
      this.isOnline = online;
    });
  }
}