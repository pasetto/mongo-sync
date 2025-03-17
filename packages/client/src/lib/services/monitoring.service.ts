import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { SyncConfigService } from './sync-config.service';

export interface PerformanceMetrics {
  syncOperations: number;
  syncSuccess: number;
  syncFailures: number;
  averageSyncDuration: number; // em ms
  dataTransferred: number; // em bytes
  storageUsage: number; // em bytes
  lastSyncTime: number | null;
}

export interface ErrorMetric {
  timestamp: number;
  error: string;
  context: string;
  data?: any;
}

@Injectable({
  providedIn: 'root'
})
export class MonitoringService {
  private metricsSubject = new BehaviorSubject<PerformanceMetrics>({
    syncOperations: 0,
    syncSuccess: 0,
    syncFailures: 0,
    averageSyncDuration: 0,
    dataTransferred: 0,
    storageUsage: 0,
    lastSyncTime: null
  });
  
  private errors: ErrorMetric[] = [];
  private durations: number[] = [];
  private maxErrors = 100;
  
  metrics$ = this.metricsSubject.asObservable();
  
  constructor(private config: SyncConfigService) {
    // Carregar métricas do armazenamento local
    this.loadMetrics();
    
    // Verificar uso de armazenamento periodicamente
    setInterval(() => this.updateStorageUsage(), 60000);
  }
  
  /**
   * Registra início de operação de sincronização
   */
  startSync(): number {
    return Date.now();
  }
  
  /**
   * Registra fim de operação de sincronização
   */
  endSync(startTime: number, {
    success = true,
    dataSize = 0,
    collectionName = ''
  }): void {
    const duration = Date.now() - startTime;
    const metrics = this.metricsSubject.value;
    
    // Atualizar métricas
    metrics.syncOperations += 1;
    
    if (success) {
      metrics.syncSuccess += 1;
      metrics.lastSyncTime = Date.now();
    } else {
      metrics.syncFailures += 1;
    }
    
    // Adicionar à lista de durações e manter apenas as últimas 50
    this.durations.push(duration);
    if (this.durations.length > 50) {
      this.durations.shift();
    }
    
    // Recalcular média
    metrics.averageSyncDuration = this.durations.reduce((sum, d) => sum + d, 0) / this.durations.length;
    
    // Adicionar dados transferidos
    metrics.dataTransferred += dataSize;
    
    // Salvar métricas
    this.metricsSubject.next(metrics);
    this.saveMetrics();
    
    // Registrar evento detalhado
    this.logDetailedMetric('sync', {
      collectionName,
      duration,
      success,
      dataSize,
      timestamp: Date.now()
    });
  }
  
  /**
   * Registra um erro
   */
  recordError(error: Error, context: string, data?: any): void {
    const errorMetric: ErrorMetric = {
      timestamp: Date.now(),
      error: error.message,
      context,
      data
    };
    
    // Adicionar ao início da lista (mais recente primeiro)
    this.errors.unshift(errorMetric);
    
    // Limitar tamanho da lista
    if (this.errors.length > this.maxErrors) {
      this.errors.pop();
    }
    
    // Registrar no console se o nível de log permitir
    if (this.config.config.logging?.level !== 'none') {
      console.error(`[MongoSync] Erro em ${context}:`, error, data);
    }
    
    // Registrar evento detalhado
    this.logDetailedMetric('error', errorMetric);
  }
  
  /**
   * Obter lista de erros recentes
   */
  getRecentErrors(): ErrorMetric[] {
    return [...this.errors];
  }
  
  /**
   * Atualiza informação de uso de armazenamento
   */
  private async updateStorageUsage(): Promise<void> {
    try {
      if ('storage' in navigator && 'estimate' in navigator.storage) {
        const estimate = await navigator.storage.estimate();
        if (estimate.usage) {
          const metrics = this.metricsSubject.value;
          metrics.storageUsage = estimate.usage;
          this.metricsSubject.next(metrics);
          this.saveMetrics();
        }
      }
    } catch (error) {
      console.error('Erro ao verificar uso de armazenamento:', error);
    }
  }
  
  /**
   * Salva métricas no armazenamento local
   */
  private saveMetrics(): void {
    try {
      localStorage.setItem('mongosync_metrics', JSON.stringify(this.metricsSubject.value));
    } catch (e) {
      // Ignorar erros de armazenamento
    }
  }
  
  /**
   * Carrega métricas do armazenamento local
   */
  private loadMetrics(): void {
    try {
      const saved = localStorage.getItem('mongosync_metrics');
      if (saved) {
        const metrics = JSON.parse(saved);
        this.metricsSubject.next({
          ...this.metricsSubject.value,
          ...metrics
        });
      }
    } catch (e) {
      // Ignorar erros de armazenamento
    }
  }
  
  /**
   * Registra métrica detalhada (para telemetria)
   */
  private logDetailedMetric(type: string, data: any): void {
    // Implementar integração com sistema de telemetria/analytics se configurado
    if (this.config.config.monitoring?.telemetryHandler) {
      try {
        this.config.config.monitoring.telemetryHandler(type, data);
      } catch (e) {
        console.error('Erro ao enviar telemetria:', e);
      }
    }
  }
  
  /**
   * Limpa todas as métricas
   */
  resetMetrics(): void {
    this.metricsSubject.next({
      syncOperations: 0,
      syncSuccess: 0,
      syncFailures: 0,
      averageSyncDuration: 0,
      dataTransferred: 0,
      storageUsage: 0,
      lastSyncTime: null
    });
    this.errors = [];
    this.durations = [];
    this.saveMetrics();
  }
}