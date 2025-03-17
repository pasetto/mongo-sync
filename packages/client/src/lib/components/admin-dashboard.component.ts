import { Component, OnInit, OnDestroy } from '@angular/core';
import { MonitoringService, PerformanceMetrics, ErrorMetric } from '../services/monitoring.service';
import { BackupService } from '../services/backup.service';
import { SchemaMigrationService } from '../services/schema-migration.service';
import { OfflineSyncService } from '../services/offline-sync.service';
import { OfflineStoreService } from '../services/offline-store.service';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'mongo-sync-admin',
  template: `
    <div class="mongo-sync-admin">
      <h2>MongoSync Admin Dashboard</h2>
      
      <div class="status-panel">
        <div class="status-item">
          <div class="status-label">Status:</div>
          <div class="status-value" [class.online]="isOnline" [class.offline]="!isOnline">
            {{ isOnline ? 'Online' : 'Offline' }}
          </div>
        </div>
        
        <div class="status-item">
          <div class="status-label">Última sincronização:</div>
          <div class="status-value">
            {{ metrics.lastSyncTime ? (metrics.lastSyncTime | date:'medium') : 'Nunca' }}
          </div>
        </div>
        
        <div class="status-item">
          <div class="status-label">Armazenamento usado:</div>
          <div class="status-value">
            {{ formatBytes(metrics.storageUsage) }}
          </div>
        </div>
      </div>
      
      <div class="metrics-panel">
        <h3>Métricas de Sincronização</h3>
        <div class="metrics-row">
          <div class="metric">
            <span class="metric-value">{{ metrics.syncOperations }}</span>
            <span class="metric-label">Operações</span>
          </div>
          <div class="metric">
            <span class="metric-value">{{ metrics.syncSuccess }}</span>
            <span class="metric-label">Sucessos</span>
          </div>
          <div class="metric">
            <span class="metric-value">{{ metrics.syncFailures }}</span>
            <span class="metric-label">Falhas</span>
          </div>
          <div class="metric">
            <span class="metric-value">{{ metrics.averageSyncDuration.toFixed(