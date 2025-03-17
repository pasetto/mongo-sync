import { ServerSyncConfig } from './models/sync-config.model';
import { SyncService } from './sync-service';

// Interface para Express.Request
interface Request {
  body: any;
  params: any;
  query: any;
  headers: any;
  [key: string]: any;
}

// Interface para Express.Response
interface Response {
  json: (body: any) => void;
  status: (code: number) => Response;
  send: (body: any) => void;
  [key: string]: any;
}

// Interface para Express.NextFunction
type NextFunction = (error?: any) => void;

/**
 * Cria middleware de sincronização para Express
 */
export function createSyncMiddleware(config: ServerSyncConfig) {
  const syncService = new SyncService(config);
  let rateLimits: {[key: string]: {count: number, resetTime: number}} = {};
  
  // Inicializar serviço
  syncService.initialize().catch(err => {
    console.error('Erro ao inicializar serviço de sincronização:', err);
  });
  
  // Middleware de autenticação
  const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
    if (!config.authValidator) {
      return next();
    }
    
    try {
      const isAuthenticated = await config.authValidator(req);
      if (isAuthenticated) {
        next();
      } else {
        res.status(401).json({ error: 'Não autorizado' });
      }
    } catch (error) {
      res.status(500).json({ error: 'Erro na autenticação' });
    }
  };
  
  // Middleware de limite de taxa
  const rateLimitMiddleware = (req: Request, res: Response, next: NextFunction) => {
    if (!config.security?.rateLimit) {
      return next();
    }
    
    const clientId = req.ip || 'unknown';
    const now = Date.now();
    
    if (!rateLimits[clientId]) {
      rateLimits[clientId] = {
        count: 1,
        resetTime: now + 60000 // 1 minuto
      };
      return next();
    }
    
    const limit = rateLimits[clientId];
    
    // Resetar contador se o tempo expirou
    if (now > limit.resetTime) {
      limit.count = 1;
      limit.resetTime = now + 60000;
      return next();
    }
    
    // Verificar limite
    if (limit.count >= config.security.rateLimit) {
      return res.status(429).json({ error: 'Limite de requisições excedido' });
    }
    
    // Incrementar contador
    limit.count++;
    next();
  };
  
  // Middleware principal de sincronização
  const syncMiddleware = async (req: Request, res: Response) => {
    try {
      const collectionName = req.params.collection;
      const { lastSyncTimestamp, changedDocs } = req.body;
      
      if (!collectionName) {
        return res.status(400).json({ error: 'Nome da coleção não especificado' });
      }
      
      const result = await syncService.processSync(
        collectionName,
        lastSyncTimestamp || 0,
        changedDocs || [],
        req
      );
      
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message || 'Erro interno na sincronização' });
    }
  };
  
  // Retornar objeto com os middlewares
  return {
    auth: authMiddleware,
    rateLimit: rateLimitMiddleware,
    sync: syncMiddleware,
    service: syncService
  };
}