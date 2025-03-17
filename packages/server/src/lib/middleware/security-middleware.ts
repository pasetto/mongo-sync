import { Request, Response, NextFunction } from 'express';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import { timingSafeEqual } from 'crypto';

export class SecurityMiddleware {
  private ipRateLimiter: RateLimiterMemory;
  private userRateLimiter: RateLimiterMemory;
  private suspiciousIPs: Set<string> = new Set();
  
  constructor() {
    // Limitador baseado em IP
    this.ipRateLimiter = new RateLimiterMemory({
      points: 120,           // 120 requisições
      duration: 60,          // por 1 minuto
      blockDuration: 300     // bloquear por 5 minutos se exceder
    });
    
    // Limitador baseado em usuário
    this.userRateLimiter = new RateLimiterMemory({
      points: 300,           // 300 requisições
      duration: 60,          // por 1 minuto
      blockDuration: 600     // bloquear por 10 minutos se exceder
    });
  }
  
  /**
   * Middleware de rate limiting adaptativo
   */
  rateLimitMiddleware = async (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip;
    const userId = req.user?.id || 'anonymous';
    
    try {
      // Verificar se IP está na lista de suspeitos
      if (this.suspiciousIPs.has(ip)) {
        // Limites mais rigorosos para IPs suspeitos
        const stricterLimiter = new RateLimiterMemory({
          points: 30,             // 30 requisições
          duration: 60,           // por 1 minuto
          blockDuration: 1800     // bloquear por 30 minutos se exceder
        });
        
        await stricterLimiter.consume(ip);
      } else {
        // Verificar limite baseado em IP
        await this.ipRateLimiter.consume(ip);
      }
      
      // Verificar limite baseado em usuário
      if (userId !== 'anonymous') {
        await this.userRateLimiter.consume(userId);
      }
      
      // Medir tempo de resposta para detectar comportamento suspeito
      const startTime = process.hrtime();
      
      // Substituir método end para medir tempo quando a resposta terminar
      const originalEnd = res.end;
      res.end = (...args) => {
        const diff = process.hrtime(startTime);
        const responseTimeMs = (diff[0] * 1e9 + diff[1]) / 1e6;
        
        // Detectar padrões suspeitos de tempo de resposta
        this.detectTimingAnomaly(ip, responseTimeMs);
        
        return originalEnd.apply(res, args);
      };
      
      next();
    } catch (error) {
      // Adicionar cabeçalho Retry-After
      const retryAfter = error.msBeforeNext ? Math.ceil(error.msBeforeNext / 1000) : 30;
      res.set('Retry-After', String(retryAfter));
      
      // Resposta com tempo constante para evitar timing attacks
      setTimeout(() => {
        res.status(429).json({
          error: 'Too many requests',
          retryAfter
        });
      }, this.getRandomDelay());
    }
  };
  
  /**
   * Proteção contra comparações de tempo
   * Evita timing attacks em comparações de tokens
   */
  safeCompare(provided: string, actual: string): boolean {
    try {
      // Garantir que ambas strings têm o mesmo comprimento para evitar leaks de informação
      const providedBuffer = Buffer.from(String(provided));
      const actualBuffer = Buffer.from(String(actual));
      
      // Se os comprimentos são diferentes, gerar comparação falsa com tempo constante
      if (providedBuffer.length !== actualBuffer.length) {
        // Criar buffer fictício do mesmo tamanho para comparação de tempo constante
        const fakeBuffer = Buffer.alloc(actualBuffer.length);
        return timingSafeEqual(fakeBuffer, actualBuffer) && false; // sempre falso, mas tempo constante
      }
      
      // Comparar com tempo constante para evitar timing attacks
      return timingSafeEqual(providedBuffer, actualBuffer);
    } catch (error) {
      return false;
    }
  }
  
  /**
   * Gera atraso aleatório para evitar timing attacks
   */
  private getRandomDelay(): number {
    // Tempo aleatório entre 200ms e 500ms
    return Math.floor(Math.random() * 300) + 200;
  }
  
  /**
   * Detecta anomalias de tempo para identificar possíveis ataques
   */
  private detectTimingAnomaly(ip: string, responseTimeMs: number): void {
    // Histórico de tempos de resposta (em memória)
    if (!this.responseTimesHistory) {
      this.responseTimesHistory = {};
    }
    
    if (!this.responseTimesHistory[ip]) {
      this.responseTimesHistory[ip] = {
        times: [],
        requestCount: 0,
        lastRequestTime: Date.now()
      };
    }
    
    const history = this.responseTimesHistory[ip];
    const now = Date.now();
    
    // Verificar intervalo entre requisições
    const timeSinceLastRequest = now - history.lastRequestTime;
    history.lastRequestTime = now;
    
    // Adicionar ao histórico
    history.times.push(responseTimeMs);
    if (history.times.length > 100) {
      history.times.shift(); // Manter apenas as 100 requisições mais recentes
    }
    
    history.requestCount++;
    
    // Detectar padrões suspeitos:
    // 1. Muitas requisições com intervalos muito precisos
    if (history.requestCount > 20 && this.detectPreciseIntervals(ip)) {
      this.suspiciousIPs.add(ip);
    }
    
    // 2. Padrão de tempos de resposta muito incomum
    if (history.times.length >= 10 && this.detectStatisticalAnomaly(history.times)) {
      this.suspiciousIPs.add(ip);
    }
  }
  
  /**
   * Detecta se requisições estão chegando em intervalos muito precisos (possível bot)
   */
  private detectPreciseIntervals(ip: string): boolean {
    const history = this.responseTimesHistory[ip];
    if (!history.intervals || history.intervals.length < 5) {
      return false;
    }
    
    // Calcular desvio padrão dos intervalos
    const avg = history.intervals.reduce((sum, i) => sum + i, 0) / history.intervals.length;
    const variance = history.intervals.reduce((sum, i) => sum + Math.pow(i - avg, 2), 0) / history.intervals.length;
    const stdDev = Math.sqrt(variance);
    
    // Se desvio padrão for muito pequeno, os intervalos são muito consistentes
    // Isso é improvável para usuários humanos
    return (stdDev / avg) < 0.1; // Coeficiente de variação < 10%
  }
  
  /**
   * Detecta anomalias estatísticas nos tempos de resposta
   */
  private detectStatisticalAnomaly(responseTimes: number[]): boolean {
    // Implementação simplificada de detecção de outliers usando método IQR
    const sorted = [...responseTimes].sort((a, b) => a - b);
    const q1 = sorted[Math.floor(sorted.length * 0.25)];
    const q3 = sorted[Math.floor(sorted.length * 0.75)];
    const iqr = q3 - q1;
    const lowerBound = q1 - 1.5 * iqr;
    const upperBound = q3 + 1.5 * iqr;
    
    // Contar outliers
    const outliers = responseTimes.filter(t => t < lowerBound || t > upperBound);
    
    // Se mais de 20% são outliers, considerar anômalo
    return outliers.length / responseTimes.length > 0.2;
  }
  
  // Armazena histórico de tempos de resposta por IP
  private responseTimesHistory: {
    [ip: string]: {
      times: number[],
      intervals?: number[],
      requestCount: number,
      lastRequestTime: number
    }
  } = {};
  
  /**
   * Middleware para proteção CSRF
   */
  csrfProtection = (req: Request, res: Response, next: NextFunction) => {
    // Verificar apenas para métodos que modificam dados
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      const token = req.headers['x-csrf-token'] || req.body?.csrfToken;
      const expectedToken = req.session?.csrfToken; // Obtido da sessão
      
      if (!token || !expectedToken || !this.safeCompare(token, expectedToken)) {
        return res.status(403).json({
          error: 'CSRF verification failed'
        });
      }
    }
    
    next();
  };
  
  /**
   * Adiciona IP à lista de suspeitos
   */
  addSuspiciousIP(ip: string): void {
    this.suspiciousIPs.add(ip);
  }
  
  /**
   * Remove IP da lista de suspeitos
   */
  removeSuspiciousIP(ip: string): void {
    this.suspiciousIPs.delete(ip);
  }
  
  /**
   * Middleware de proteção contra ataques de força bruta
   */
  bruteForceProtection = (options: {
    maxAttempts: number,
    blockDuration: number, // em segundos
    keyGenerator?: (req: Request) => string
  }) => {
    const limiter = new RateLimiterMemory({
      points: options.maxAttempts,
      duration: 60 * 60, // 1 hora
      blockDuration: options.blockDuration
    });
    
    return async (req: Request, res: Response, next: NextFunction) => {
      // Gerar chave única baseada no IP e/ou usuário
      const key = options.keyGenerator ? 
        options.keyGenerator(req) : 
        `${req.ip}-${req.body?.username || 'anonymous'}`;
        
      try {
        await limiter.consume(key);
        next();
      } catch (error) {
        // Adicionar à lista de suspeitos para monitoramento adicional
        this.addSuspiciousIP(req.ip);
        
        const retryAfter = error.msBeforeNext ? Math.ceil(error.msBeforeNext / 1000) : options.blockDuration;
        res.set('Retry-After', String(retryAfter));
        
        // Resposta com atraso para evitar timing attacks
        setTimeout(() => {
          res.status(429).json({
            error: 'Too many failed attempts, please try again later',
            retryAfter
          });
        }, this.getRandomDelay());
      }
    };
  };
}