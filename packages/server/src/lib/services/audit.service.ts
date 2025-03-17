import { Collection, Db } from 'mongodb';

export class AuditService {
  private auditCollection: Collection;
  
  constructor(db: Db) {
    this.auditCollection = db.collection('sync_audit');
    
    // Criar índices para consultas eficientes
    this.auditCollection.createIndex({ timestamp: 1 });
    this.auditCollection.createIndex({ userId: 1 });
    this.auditCollection.createIndex({ collectionName: 1 });
    this.auditCollection.createIndex({ "anomaly.detected": 1 });
  }
  
  /**
   * Registra uma operação de sincronização
   */
  async logSync(data: {
    userId: string;
    clientInfo: {
      ip: string;
      userAgent: string;
    };
    operation: 'pull' | 'push';
    collectionName: string;
    docsCount: number;
    syncResults: {
      added: number;
      updated: number;
      conflicts: number;
    };
    duration: number;
  }): Promise<void> {
    const timestamp = Date.now();
    
    // Detectar anomalias
    const anomaly = await this.detectAnomalies({
      ...data,
      timestamp
    });
    
    // Salvar registro de auditoria
    await this.auditCollection.insertOne({
      ...data,
      timestamp,
      anomaly
    });
  }
  
  /**
   * Detecta padrões suspeitos na sincronização
   */
  private async detectAnomalies(data: any): Promise<{ 
    detected: boolean;
    reasons: string[];
    severity: 'low' | 'medium' | 'high';
  }> {
    const reasons: string[] = [];
    
    // 1. Volume anormalmente alto
    const hourAgo = Date.now() - 3600000;
    const recentSyncs = await this.auditCollection.countDocuments({
      userId: data.userId,
      timestamp: { $gt: hourAgo }
    });
    
    if (recentSyncs > 120) { // Mais de 2 sincronizações por minuto
      reasons.push('Excesso de sincronizações');
    }
    
    // 2. Tamanho anormal de operações
    if (data.docsCount > 1000) {
      reasons.push('Volume anormalmente alto de documentos');
    }
    
    // 3. Padrão de tempo suspeito (síncronizações muitas em intervalos exatos)
    const lastFiveSyncs = await this.auditCollection
      .find({ userId: data.userId })
      .sort({ timestamp: -1 })
      .limit(5)
      .toArray();
    
    if (lastFiveSyncs.length >= 5) {
      const intervals = [];
      for (let i = 0; i < lastFiveSyncs.length - 1; i++) {
        intervals.push(lastFiveSyncs[i].timestamp - lastFiveSyncs[i+1].timestamp);
      }
      
      // Verificar se os intervalos são consistentes (possível bot)
      const avgInterval = intervals.reduce((sum, val) => sum + val, 0) / intervals.length;
      const allSimilar = intervals.every(interval => 
        Math.abs(interval - avgInterval) < avgInterval * 0.1
      );
      
      if (allSimilar) {
        reasons.push('Padrão de tempo suspeito (possível automação)');
      }
    }
    
    // 4. Acesso de IPs incomuns
    const unusualAccess = await this.detectUnusualAccess(data.userId, data.clientInfo.ip);
    if (unusualAccess) {
      reasons.push('Acesso de localização incomum');
    }
    
    // Determinar severidade
    let severity: 'low' | 'medium' | 'high' = 'low';
    if (reasons.length >= 3) {
      severity = 'high';
    } else if (reasons.length >= 1) {
      severity = 'medium';
    }
    
    return {
      detected: reasons.length > 0,
      reasons,
      severity
    };
  }
  
  /**
   * Detecta acesso de IP incomum para um usuário
   */
  private async detectUnusualAccess(userId: string, currentIp: string): Promise<boolean> {
    // Buscar IPs recentes deste usuário
    const twoWeeksAgo = Date.now() - (14 * 24 * 3600000);
    const recentAccess = await this.auditCollection
      .find({ 
        userId, 
        timestamp: { $gt: twoWeeksAgo },
        "clientInfo.ip": { $exists: true }
      })
      .project({ "clientInfo.ip": 1 })
      .toArray();
    
    // Se houver poucos registros, não há como determinar um padrão
    if (recentAccess.length < 5) return false;
    
    // Contar ocorrências de cada IP
    const ipCounts = {};
    recentAccess.forEach(access => {
      const ip = access.clientInfo.ip;
      ipCounts[ip] = (ipCounts[ip] || 0) + 1;
    });
    
    // Verificar se IP atual é incomum
    const totalAccess = recentAccess.length;
    const currentIpCount = ipCounts[currentIp] || 0;
    
    // Se este IP representa menos de 10% dos acessos recentes
    return (currentIpCount / totalAccess) < 0.1;
  }
  
  /**
   * Lista anomalias recentes
   */
  async getRecentAnomalies(options: {
    since?: number;
    severity?: 'low' | 'medium' | 'high';
    limit?: number;
  } = {}): Promise<any[]> {
    const { since = Date.now() - (24 * 3600000), severity, limit = 100 } = options;
    
    const query: any = {
      timestamp: { $gt: since },
      "anomaly.detected": true
    };
    
    if (severity) {
      query["anomaly.severity"] = severity;
    }
    
    return this.auditCollection
      .find(query)
      .sort({ timestamp: -1 })
      .limit(limit)
      .toArray();
  }
}