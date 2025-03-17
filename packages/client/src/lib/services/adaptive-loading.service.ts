import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class AdaptiveLoadingService {
  // Rastreia métricas de performance
  private networkMetrics = {
    lastTransferSpeed: 0,   // bytes/s
    averageLatency: 100,    // ms
    failureRate: 0          // %
  };
  
  private deviceMetrics = {
    isLowMemoryDevice: false,
    isLowPowerDevice: false,
    storageUsage: 0         // % of available storage
  };
  
  /**
   * Calcula tamanho ideal do batch baseado em métricas
   */
  calculateOptimalBatchSize(): number {
    let baseSize = 50; // documentos por batch
    
    // Ajustar baseado na velocidade da rede
    if (this.networkMetrics.lastTransferSpeed < 50000) { // < 50KB/s
      baseSize = Math.max(5, baseSize / 3);
    } else if (this.networkMetrics.lastTransferSpeed > 500000) { // > 500KB/s
      baseSize = Math.min(200, baseSize * 2);
    }
    
    // Reduzir se houver falhas de rede recentes
    if (this.networkMetrics.failureRate > 10) {
      baseSize = Math.max(5, baseSize / 2);
    }
    
    // Ajustar para dispositivos com recursos limitados
    if (this.deviceMetrics.isLowMemoryDevice) {
      baseSize = Math.min(baseSize, 20);
    }
    
    // Arredondar para o número inteiro mais próximo
    return Math.round(baseSize);
  }
  
  /**
   * Determina frequência de sincronização baseado nas condições atuais
   */
  calculateSyncFrequency(): number {
    // Base: 30 segundos
    let frequency = 30000;
    
    // Ajustar baseado na latência
    if (this.networkMetrics.averageLatency > 500) {
      frequency = Math.min(frequency * 2, 300000); // máx 5 minutos
    } else if (this.networkMetrics.averageLatency < 100) {
      frequency = Math.max(frequency / 2, 15000); // mín 15 segundos
    }
    
    // Economizar bateria em dispositivos com pouca energia
    if (this.deviceMetrics.isLowPowerDevice) {
      frequency = Math.min(frequency * 3, 600000); // máx 10 minutos
    }
    
    return frequency;
  }
  
  /**
   * Atualiza métricas de rede após tentativa de sincronização
   */
  updateNetworkMetrics(
    transferSize: number,
    durationMs: number,
    success: boolean
  ): void {
    if (success && durationMs > 0) {
      this.networkMetrics.lastTransferSpeed = transferSize / (durationMs / 1000);
      
      // Atualizar latência média (peso de 30% para o novo valor)
      this.networkMetrics.averageLatency = 
        this.networkMetrics.averageLatency * 0.7 + durationMs * 0.3;
    }
    
    // Atualizar taxa de falha com decaimento exponencial
    this.networkMetrics.failureRate *= 0.9; // 90% do valor anterior
    if (!success) {
      this.networkMetrics.failureRate += 10; // +10% para cada falha
    }
  }
  
  /**
   * Detecta capacidade do dispositivo
   */
  async detectDeviceCapabilities(): Promise<void> {
    // Detectar memória disponível
    if ('deviceMemory' in navigator) {
      this.deviceMetrics.isLowMemoryDevice = (navigator as any).deviceMemory < 4;
    }
    
    // Detectar economia de bateria
    if ('getBattery' in navigator) {
      const battery = await (navigator as any).getBattery();
      this.deviceMetrics.isLowPowerDevice = 
        battery.charging === false && battery.level < 0.2;
        
      // Monitorar mudanças na bateria
      battery.addEventListener('levelchange', () => {
        this.deviceMetrics.isLowPowerDevice = 
          battery.charging === false && battery.level < 0.2;
      });
    }
    
    // Verificar uso de armazenamento
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const estimate = await navigator.storage.estimate();
      if (estimate.usage && estimate.quota) {
        this.deviceMetrics.storageUsage = 
          (estimate.usage / estimate.quota) * 100;
      }
    }
  }
}