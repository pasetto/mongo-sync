import { Db } from 'mongodb';
import { Request } from 'express';

interface AuditOptions {
  enabled?: boolean;
  retention?: number; // dias
  detailedLogging?: boolean;
  maskSensitiveData?: boolean;
  sampleRate?: number; // 0-1, porcentagem de requisições para auditar
}

interface AuditEvent {
  timestamp: Date;
  action: string;
  userId?: string;
  ip?: string;
  userAgent?: string;
  resourceId?: string;
  resourceType?: string;
  requestMethod?: string;
  requestPath?: string;
  statusCode?: number;
  responseTime?: number;
  success: boolean;
  details?: any;
  tags?: string[];
}

/**
 * Serviço para auditoria de ações e detecção de anomalias
 */
export class AuditService {
  private db: Db;
  private options: AuditOptions;
  private collection: string = 'audit_logs';
  private anomalyDetectionEnabled: boolean = true;
  private baselineMetrics: Map<string, any> = new Map();
  private lastAnalysisTime: number = 0;

  constructor(db: Db, options: AuditOptions = {}) {
    this.db = db;
    this.options = {
      enabled: true,
      retention: 90, // 90 dias padrão
      detailedLogging: false,
      maskSensitiveData: true,
      sampleRate: 1.0, // 100% por padrão
      ...options
    };
    
    // Inicializar processamento em background
    this.initBackgroundTasks();
  }

  /**
   * Registrar evento de auditoria
   */
  async logEvent(event: Partial<AuditEvent>): Promise<void> {
    if (!this.options.enabled) return;
    
    // Aplicar amostragem (sample rate)
    if (Math.random() > (this.options.sampleRate || 1.0)) return;
    
    try {
      const auditEvent: AuditEvent = {
        timestamp: new Date(),
        action: event.action || 'unknown',
        success: event.success !== undefined ? event.success : true,
        ...event
      };
      
      // Mascarar dados sensíveis se configurado
      if (this.options.maskSensitiveData && auditEvent.details) {
        auditEvent.details = this.maskSensitiveData(auditEvent.details);
      }
      
      // Inserir no banco de dados
      await this.db.collection(this.collection).insertOne(auditEvent);
      
      // Atualizar métricas para detecção de anomalias
      this.updateAnomalyMetrics(auditEvent);
    } catch (error) {
      console.error('Erro ao registrar evento de auditoria:', error);
    }
  }

  /**
   * Registrar evento a partir de uma requisição HTTP
   */
  async logRequest(req: Request, statusCode: number, responseTime: number, success: boolean): Promise<void> {
    const userId = req.user?.id;
    const path = req.path;
    const method = req.method;
    
    await this.logEvent({
      action: `${method} ${path}`,
      userId,
      ip: req.ip,
      userAgent: req.headers['user-agent'] as string,
      requestMethod: method,
      requestPath: path,
      statusCode,
      responseTime,
      success,
      details: this.options.detailedLogging ? {
        query: req.query,
        params: req.params
        // Não logar body por segurança
      } : undefined
    });
  }

  /**
   * Detectar padrões suspeitos em atividades
   */
  async detectAnomalies(): Promise<any[]> {
    if (!this.anomalyDetectionEnabled) return [];
    
    try {
      const anomalies = [];
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      
      // Analisar tentativas de login com falha por IP
      const failedLogins = await this.db.collection(this.collection).aggregate([
        {
          $match: {
            action: 'login',
            success: false,
            timestamp: { $gte: oneHourAgo }
          }
        },
        {
          $group: {
            _id: '$ip',
            count: { $sum: 1 }
          }
        },
        {
          $match: {
            count: { $gt: 5 } // Mais de 5 falhas em 1 hora
          }
        }
      ]).toArray();
      
      // Identificar IPs com muitas requisições
      const ipCounts: Record<string, number> = {};
      const highTraffic = await this.db.collection(this.collection).find({
        timestamp: { $gte: oneHourAgo }
      }).toArray();
      
      highTraffic.forEach(log => {
        const ip = log.ip;
        if (ip) {
          ipCounts[ip] = (ipCounts[ip] || 0) + 1;
        }
      });
      
      // Verificar IPs com tráfego anormalmente alto
      const avgRequestCount = Object.values(ipCounts).reduce((sum, count) => sum + count, 0) / 
                             (Object.keys(ipCounts).length || 1);
      
      for (const [ip, count] of Object.entries(ipCounts)) {
        // IP com mais de 3x a média de requisições
        if (count > avgRequestCount * 3 && count > 100) {
          anomalies.push({
            type: 'high_traffic',
            ip,
            count,
            avgCount: avgRequestCount,
            timestamp: now
          });
        }
      }
      
      // Adicionar anomalias de login
      failedLogins.forEach(item => {
        anomalies.push({
          type: 'failed_login',
          ip: item._id,
          count: item.count,
          timestamp: now
        });
      });
      
      return anomalies;
    } catch (error) {
      console.error('Erro ao detectar anomalias:', error);
      return [];
    }
  }

  /**
   * Mascarar dados sensíveis em objetos
   */
  private maskSensitiveData(data: any): any {
    if (!data) return data;
    
    // Lista de campos sensíveis para mascarar
    const sensitiveFields = [
      'password', 'senha', 'token', 'apiKey', 'secret', 'credit_card',
      'ssn', 'social', 'card', 'cartao', 'cvv', 'cvc'
    ];
    
    // Função recursiva para mascarar campos sensíveis
    const mask = (obj: any): any => {
      if (typeof obj !== 'object' || obj === null) {
        return obj;
      }
      
      if (Array.isArray(obj)) {
        return obj.map(item => mask(item));
      }
      
      const result: any = {};
      
      for (const [key, value] of Object.entries(obj)) {
        if (sensitiveFields.some(field => key.toLowerCase().includes(field))) {
          result[key] = '******';
        } else if (typeof value === 'object' && value !== null) {
          result[key] = mask(value);
        } else {
          result[key] = value;
        }
      }
      
      return result;
    };
    
    return mask(data);
  }

  /**
   * Atualizar métricas para detecção de anomalias
   */
  private updateAnomalyMetrics(event: AuditEvent): void {
    if (!event.ip || !event.action) return;
    
    const key = `${event.ip}:${event.action}`;
    let metric = this.baselineMetrics.get(key);
    
    if (!metric) {
      metric = {
        count: 1,
        firstSeen: Date.now(),
        lastSeen: Date.now(),
        responseTimes: [event.responseTime],
        successCount: event.success ? 1 : 0,
        failureCount: event.success ? 0 : 1
      };
    } else {
      metric.count++;
      metric.lastSeen = Date.now();
      if (event.responseTime) metric.responseTimes.push(event.responseTime);
      if (event.success) metric.successCount++;
      else metric.failureCount++;
      
      // Limitar o tamanho do array de tempos de resposta
      if (metric.responseTimes.length > 100) {
        metric.responseTimes.shift();
      }
    }
    
    this.baselineMetrics.set(key, metric);
  }

  /**
   * Inicializar tarefas em background
   */
  private initBackgroundTasks(): void {
    // Executar limpeza de logs antigos diariamente
    setInterval(async () => {
      try {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - (this.options.retention || 90));
        
        await this.db.collection(this.collection).deleteMany({
          timestamp: { $lt: cutoffDate }
        });
      } catch (error) {
        console.error('Erro ao limpar logs antigos:', error);
      }
    }, 24 * 60 * 60 * 1000); // 24 horas
    
    // Executar detecção de anomalias a cada hora
    setInterval(async () => {
      try {
        const anomalies = await this.detectAnomalies();
        
        if (anomalies.length > 0) {
          console.warn(`Detected ${anomalies.length} security anomalies`);
          
          // Registrar anomalias detectadas
          await this.db.collection('security_anomalies').insertMany(anomalies);
        }
      } catch (error) {
        console.error('Erro na detecção de anomalias:', error);
      }
    }, 60 * 60 * 1000); // 1 hora
  }
}