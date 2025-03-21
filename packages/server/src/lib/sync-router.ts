import express, { Router, Request, Response } from 'express';
import { Db } from 'mongodb';
import { cspMiddleware } from './middleware/csp-middleware';
import { SecurityMiddleware } from './middleware/security-middleware';
import { SyncMiddleware } from './sync-middleware';
import { SyncService } from './sync-service';
import { AuditService } from './services/audit.service';
import { SyncConfig } from '../types';

// Estendendo o tipo Request apenas para este arquivo
interface ExtendedRequest extends Request {
  user?: {
    id: string;
    [key: string]: any;
  }
}

/**
 * Cria um router Express para as operações de sincronização
 */
export function createSyncRouter(config: SyncConfig): Router {
  const router = express.Router();
  const db = config.mongodb;
  const syncService = new SyncService(db, config);
  const syncMiddleware = new SyncMiddleware(
    db, 
    config.authValidator, 
    config.getUserId,
    config.userIdField
  );
  
  const securityMiddleware = new SecurityMiddleware();

  // Configurar middleware CSP se não desativado
  const secConfig = config.security as any || {};
  if (!secConfig.disableCSP) {
    router.use(cspMiddleware({
      reportUri: secConfig.cspReportUri
    }));
  }
  
  // Configurar auditoria se estiver habilitada
  let auditService: AuditService | undefined;
  if (config.security && (config.security as any).audit) {
    auditService = new AuditService(db, (config.security as any).audit);
  }

  // Middleware de autenticação para todas as rotas
  router.use(async (req, res, next) => {
    try {
      if (req.path === '/status') {
        return next();
      }
      await syncMiddleware.authenticate(req, res, next);
    } catch (error) {
      console.error('Erro no middleware de autenticação:', error);
      res.status(401).json({ error: 'Erro de autenticação' });
    }
  });

  // Middleware de proteção contra injeção
  router.use(syncMiddleware.injectionProtection());
  
  // Middleware de rate limiting
  router.use(syncMiddleware.rateLimit(config.security?.rateLimit || 60));

  // Rota para status
  router.get('/status', (req, res) => {
    res.json({ 
      status: 'online',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      auditEnabled: !!auditService
    });
  });

  // Rota para sincronizar uma coleção específica
  router.post('/sync/:collection', async (req: ExtendedRequest, res: Response) => {
    try {
      const startTime = Date.now();
      const collection = req.params.collection;
      const changes = req.body;
      const userId = config.getUserId ? config.getUserId(req) : (req.user?.id || 'anonymous');

      // Registrar atividade no serviço de auditoria
      if (auditService) {
        auditService.logEvent({
          action: `sync_${collection}`,
          userId,
          ip: req.ip,
          userAgent: req.headers['user-agent'] as string,
          resourceType: collection,
          details: { changeCount: changes.length }
        }).catch(err => console.error('Erro ao registrar auditoria:', err));
      }

      // Executar sincronização
      const result = await syncService.processChanges(collection, changes, userId);
      
      const responseTime = Date.now() - startTime;
      
      // Registrar conclusão da sincronização
      if (auditService) {
        auditService.logRequest(req, 200, responseTime, true)
          .catch(err => console.error('Erro ao registrar auditoria:', err));
      }
      
      res.json(result);
    } catch (error: any) {
      console.error('Erro na sincronização:', error);
      res.status(500).json({ error: error.message || 'Erro interno na sincronização' });
    }
  });

  // Rota para obter documentos modificados desde determinada data
  router.get('/changes/:collection', async (req: ExtendedRequest, res: Response) => {
    try {
      const collection = req.params.collection;
      const since = req.query.since ? parseInt(req.query.since as string) : 0;
      const userId = config.getUserId ? config.getUserId(req) : (req.user?.id || 'anonymous');
      
      const changes = await syncService.getChanges(collection, since, userId);
      res.json(changes);
    } catch (error: any) {
      console.error('Erro ao buscar mudanças:', error);
      res.status(500).json({ error: error.message || 'Erro interno ao buscar mudanças' });
    }
  });

  return router;
}