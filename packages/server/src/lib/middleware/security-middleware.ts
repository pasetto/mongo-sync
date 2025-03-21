import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';
import { RateLimiter } from 'limiter';

// Configuração de rate limiting
const DEFAULT_RATE_LIMIT = 60; // requisições por minuto
const STRICTER_RATE_LIMIT = 10; // para IPs suspeitos

// Interface para opções do middleware de segurança
interface SecurityOptions {
  rateLimit?: number;
  blockDuration?: number;
  requestTimeout?: number;
  maxBodySize?: number;
}

/**
 * Middleware de segurança para proteção contra ataques comuns
 */
export class SecurityMiddleware {
  private ipRateLimiter: Map<string, RateLimiter>;
  private suspiciousIPs: Set<string>;
  private stricterLimiter: RateLimiter;
  private blockList: Set<string>;
  private anomalyThresholds: Map<string, { count: number, lastTime: number }>;

  constructor() {
    this.ipRateLimiter = new Map();
    this.suspiciousIPs = new Set();
    this.stricterLimiter = new RateLimiter({ tokensPerInterval: STRICTER_RATE_LIMIT, interval: "minute" });
    this.blockList = new Set();
    this.anomalyThresholds = new Map();
  }

  /**
   * Rate limiting baseado em IP
   */
  rateLimit(limit: number = DEFAULT_RATE_LIMIT) {
    return async (req: Request, res: Response, next: NextFunction) => {
      const userId = req.user?.id || 'anonymous';
      
      try {
        // Obter IP do cliente, usar fallback se undefined
        const ip = req.ip || 'unknown-ip';

        // Rate limiting mais restrito para IPs suspeitos
        if (this.suspiciousIPs.has(ip)) {
          try {
            await this.stricterLimiter.removeTokens(1);
          } catch (error: any) {
            // Bloqueio temporário para IPs suspeitos
            this.addToBlockList(ip);
            return res.status(429).json({
              error: 'Muitas requisições, tente novamente mais tarde',
              retryAfter: error.msBeforeNext ? Math.ceil(error.msBeforeNext / 1000) : 60
            });
          }
        } else {
          // Rate limiting padrão
          if (!this.ipRateLimiter.has(ip)) {
            this.ipRateLimiter.set(ip, new RateLimiter({ tokensPerInterval: limit, interval: "minute" }));
          }
          
          try {
            await this.ipRateLimiter.get(ip)!.removeTokens(1);
          } catch (error: any) {
            // Resposta com status 429 (Too Many Requests)
            const retryAfter = error.msBeforeNext ? Math.ceil(error.msBeforeNext / 1000) : 30;
            return res.status(429)
              .set('Retry-After', String(retryAfter))
              .json({
                error: 'Limite de requisições excedido',
                retryAfter
              });
          }
        }

        // Monitoramento de tempo de resposta
        req.startTime = Date.now();
        
        // Interceptar res.end para medir tempo de resposta
        const originalEnd = res.end as Function;
        res.end = function(this: Response, ...args: any[]): Response {
          if (req.startTime) {
            const responseTimeMs = Date.now() - req.startTime;
            
            // Detectar anomalias de tempo
            const securityMiddleware = (req as any).securityMiddleware as SecurityMiddleware;
            securityMiddleware.detectTimingAnomaly(ip || 'unknown-ip', responseTimeMs);
          }
          
          return originalEnd.apply(this, args as [any, string | undefined, () => void | null]);
        };
        
        // Armazenar referência ao middleware para uso em res.end
        (req as any).securityMiddleware = this;

        next();
      } catch (error: any) {
        const retryAfter = error.msBeforeNext ? Math.ceil(error.msBeforeNext / 1000) : 30;
        res.status(429).json({
          error: 'Erro no controle de taxa de requisições',
          retryAfter
        });
      }
    };
  }

  /**
   * Proteção contra ataques de força bruta
   */
  bruteForceProtection(endpoint: string, maxAttempts = 5) {
    const attempts = new Map<string, number>();

    return (req: Request, res: Response, next: NextFunction) => {
      // Identificar cliente por IP + alguma outra característica
      const ip = req.ip || 'unknown-ip';
      const identifier = `${ip}:${endpoint}`;

      // Incrementar contagem de tentativas
      const currentAttempts = (attempts.get(identifier) || 0) + 1;
      attempts.set(identifier, currentAttempts);

      // Verificar se excedeu limite de tentativas
      if (currentAttempts > maxAttempts) {
        // Adicionar IP à lista de suspeitos
        this.suspiciousIPs.add(ip);
        
        // Atrasar resposta para dificultar tentativas automatizadas
        setTimeout(() => {
          res.status(403).json({
            error: 'Muitas tentativas, tente novamente mais tarde',
            retryAfter: 300 // 5 minutos
          });
        }, 2000);
        
        return;
      }

      // Reset de tentativas após sucesso (implementar no handler de sucesso)
      res.on('finish', () => {
        if (res.statusCode === 200 || res.statusCode === 201) {
          attempts.delete(identifier);
        }
      });

      next();
    };
  }

  /**
   * Proteção contra ataques de injeção
   */
  injectionProtection() {
    return (req: Request, res: Response, next: NextFunction) => {
      // Lista de padrões suspeitos em SQL, NoSQL e outros vetores de injeção
      const suspiciousPatterns = [
        /(\%27)|(\')|(\-\-)|(\%23)|(#)/i, // SQL
        /((\%3D)|(=))[^\n]*((\%27)|(\')|(\%3B)|(;))/i, // SQL injection com URL encoding
        /exec(\s|\+)+(s|x)p\w+/i, // SQL stored procedures
        /\$where\s*:\s*function/i, // NoSQL (MongoDB) injection
        /\$\$\{.+?\}/i // Template injection
      ];

      const checkForInjection = (obj: any): boolean => {
        if (!obj) return false;

        if (typeof obj === 'string') {
          return suspiciousPatterns.some(pattern => pattern.test(obj));
        }

        if (typeof obj === 'object') {
          return Object.values(obj).some(value => checkForInjection(value));
        }

        return false;
      };

      // Verificar body, query e params
      if (checkForInjection(req.body) || checkForInjection(req.query) || checkForInjection(req.params)) {
        const ip = req.ip || 'unknown-ip';
        this.addSuspiciousIP(ip);
        return res.status(403).json({ error: 'Requisição contém padrões suspeitos' });
      }

      next();
    };
  }

  /**
   * Proteção CSRF
   */
  csrfProtection() {
    return (req: Request, res: Response, next: NextFunction) => {
      // Ignorar para métodos seguros
      if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        return next();
      }

      // Verificar token CSRF
      const csrfToken = req.headers['x-csrf-token'] || req.body?._csrf;
      const expectedToken = req.session?.csrfToken; // Obtido da sessão

      if (!csrfToken || csrfToken !== expectedToken) {
        return res.status(403).json({ error: 'Erro de validação CSRF' });
      }

      next();
    };
  }

  /**
   * Middleware para timeout de requisição
   */
  requestTimeout(timeoutMs: number = 30000) {
    return (req: Request, res: Response, next: NextFunction) => {
      const timeoutId = setTimeout(() => {
        res.status(408).json({ error: 'Request timeout' });
      }, timeoutMs);

      // Limpar timeout quando a resposta for enviada
      res.on('finish', () => {
        clearTimeout(timeoutId);
      });

      next();
    };
  }

  /**
   * Limitador de tamanho do corpo da requisição
   */
  bodySizeLimit(maxSize: number = 100000) { // 100KB padrão
    return (req: Request, res: Response, next: NextFunction) => {
      let data = '';
      
      req.on('data', (chunk) => {
        data += chunk;
        
        // Verificar se excedeu o tamanho máximo
        if (data.length > maxSize) {
          res.status(413).json({ error: 'Payload too large' });
          req.destroy();
        }
      });
      
      next();
    };
  }

  /**
   * Middleware principal que combina várias proteções
   */
  protect(options: SecurityOptions = {}) {
    const rateLimit = options.rateLimit || DEFAULT_RATE_LIMIT;
    
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        // Verificar se o IP está na lista de bloqueados
        const ip = req.ip || 'unknown-ip';
        
        if (this.blockList.has(ip)) {
          const retryAfter = options.blockDuration || 300; // 5 minutos padrão
          return res.status(403)
            .set('Retry-After', String(retryAfter))
            .json({
              error: 'Acesso temporariamente bloqueado',
              retryAfter
            });
        }
        
        // Aplicar rate limiting
        try {
          if (!this.ipRateLimiter.has(ip)) {
            this.ipRateLimiter.set(ip, new RateLimiter({ tokensPerInterval: rateLimit, interval: "minute" }));
          }
          
          await this.ipRateLimiter.get(ip)!.removeTokens(1);
        } catch (error: any) {
          this.addSuspiciousIP(ip);
          
          const retryAfter = error.msBeforeNext ? Math.ceil(error.msBeforeNext / 1000) : options.blockDuration;
          return res.status(429)
            .set('Retry-After', String(retryAfter))
            .json({
              error: 'Limite de requisições excedido',
              retryAfter
            });
        }
        
        next();
      } catch (error) {
        next(error);
      }
    };
  }
  
  /**
   * Adicionar IP à lista de suspeitos
   */
  addSuspiciousIP(ip: string) {
    if (!ip) return;
    
    this.suspiciousIPs.add(ip);
    
    // Remover da lista após 1 hora
    setTimeout(() => {
      this.suspiciousIPs.delete(ip);
    }, 3600000);
  }
  
  /**
   * Adicionar IP à lista de bloqueados
   */
  addToBlockList(ip: string) {
    if (!ip) return;
    
    this.blockList.add(ip);
    
    // Remover da lista após 10 minutos
    setTimeout(() => {
      this.blockList.delete(ip);
    }, 600000);
  }
  
  /**
   * Detectar anomalias de tempo de resposta
   */
  detectTimingAnomaly(ip: string, responseTimeMs: number) {
    if (!ip) return;
    
    if (!this.anomalyThresholds.has(ip)) {
      this.anomalyThresholds.set(ip, { count: 1, lastTime: Date.now() });
      return;
    }
    
    const threshold = this.anomalyThresholds.get(ip)!;
    
    // Resetar contagem após 1 hora
    if (Date.now() - threshold.lastTime > 3600000) {
      threshold.count = 1;
      threshold.lastTime = Date.now();
      return;
    }
    
    // Verificar se o tempo de resposta é anomalamente alto
    if (responseTimeMs > 5000) { // 5 segundos
      threshold.count++;
      
      // Se muitas respostas lentas, adicionar à lista de suspeitos
      if (threshold.count > 5) {
        this.addSuspiciousIP(ip);
      }
    }
    
    threshold.lastTime = Date.now();
  }
}

export const securityMiddleware = new SecurityMiddleware();