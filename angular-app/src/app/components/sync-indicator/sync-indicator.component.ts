import { Component } from '@angular/core';
import { DatabaseService } from '../../services/database.service';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-sync-indicator',
  template: `
    <div class="sync-indicator" *ngIf="(isSyncing$ | async)">
      <div class="sync-spinner"></div>
      <span>Sincronizando...</span>
    </div>
  `,
  styles: [`
    .sync-indicator {
      position: fixed;
      bottom: 20px;
      right: 20px;
      background-color: rgba(0,0,0,0.7);
      color: white;
      padding: 8px 15px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      z-index: 1000;
    }
    .sync-spinner {
      width: 16px;
      height: 16px;
      border: 2px solid rgba(255,255,255,0.3);
      border-radius: 50%;
      border-top-color: white;
      animation: spin 1s ease-in-out infinite;
      margin-right: 10px;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `]
})
export class SyncIndicatorComponent {
  isSyncing$: Observable<boolean>;
  
  constructor(private db: DatabaseService) {
    this.isSyncing$ = this.db.isSyncing$;
  }
}