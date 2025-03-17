import { Component, Input } from '@angular/core';
import { OfflineSyncService } from '../services/offline-sync.service';

@Component({
  selector: 'mongo-sync-indicator',
  template: `
    <div *ngIf="showIndicator" class="mongo-sync-indicator" [class.syncing]="isSyncing">
      <div class="mongo-sync-icon" [class.offline]="!isOnline">
        <svg *ngIf="!isSyncing && isOnline" width="16" height="16" viewBox="0 0 16 16">
          <path d="M8 0C3.6 0 0 3.6 0 8s3.6 8 8 8 8-3.6 8-8-3.6-8-8-8zm0 14c-3.3 0-6-2.7-6-6s2.7-6 6-6 6 2.7 6 6-2.7 6-6 6zm3-7H9V5c0-.6-.4-1-1-1S7 4.4 7 5v3H5c-.6 0-1 .4-1 1s.4 1 1 1h5c.6 0 1-.4 1-1s-.4-1-1-1z"/>
        </svg>
        <svg *ngIf="isSyncing" width="16" height="16" viewBox="0 0 16 16" class="sync-spinner">
          <path d="M8 0C3.6 0 0 3.6 0 8s3.6 8 8 8 8-3.6 8-8-3.6-8-8-8zm0 14c-3.3 0-6-2.7-6-6s2.7-6 6-6 6 2.7 6 6-2.7 6-6 6z"/>
          <path d="M8 2v2c2.2 0 4 1.8 4 4s-1.8 4-4 4-4-1.8-4-4h2l-3-3-3 3h2c0 3.3 2.7 6 6 6s6-2.7 6-6-2.7-6-6-6z"/>
        </svg>
        <svg *ngIf="!isSyncing && !isOnline" width="16" height="16" viewBox="0 0 16 16">
          <path d="M8 0C3.6 0 0 3.6 0 8s3.6 8 8 8 8-3.6 8-8-3.6-8-8-8zm0 14c-3.3 0-6-2.7-6-6s2.7-6 6-6 6 2.7 6 6-2.7 6-6 6zm3-9l-1-1-2 2-2-2-1 1 2 2-2 2 1 1 2-2 2 2 1-1-2-2 2-2z"/>
        </svg>
      </div>
      <div class="mongo-sync-text" *ngIf="showText">
        <span *ngIf="isSyncing">Sincronizando...</span>
        <span *ngIf="!isSyncing && isOnline">Sincronizado</span>
        <span *ngIf="!isSyncing && !isOnline">Offline</span>
      </div>
      <div class="mongo-sync-badge" *ngIf="pendingChanges > 0">
        {{ pendingChanges > 99 ? '99+' : pendingChanges }}
      </div>
    </div>
  `,
  styles: [`
    .mongo-sync-indicator {
      display: inline-flex;
      align-items: center;
      padding: 4px 8px;
      border-radius: 16px;
      background: #f0f0f0;
      color: #333;
      font-size: 12px;
    }
    .mongo-sync-icon {
      margin-right: 4px;
    }
    .mongo-sync-icon.offline svg {
      fill: #d32f2f;
    }
    .mongo-sync-indicator.syncing .sync-spinner {
      animation: spin 1.5s linear infinite;
      fill: #1976d2;
    }
    .mongo-sync-badge {
      background: #f44336;
      color: white;
      border-radius: 10px;
      padding: 1px 6px;
      font-size: 10px;
      margin-left: 4px;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `]
})
export class SyncIndicatorComponent {
  @Input() showText = true;
  @Input() showIndicator = true;
  
  isSyncing = false;
  isOnline = navigator.onLine;
  pendingChanges = 0;
  
  constructor(private syncService: OfflineSyncService) {
    this.syncService.syncState$.subscribe(state => {
      this.isSyncing = state.isSyncing;
      this.pendingChanges = state.pendingChanges;
    });
    
    this.syncService.isOnline$.subscribe(online => {
      this.isOnline = online;
    });
  }
}