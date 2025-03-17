import { Router } from 'express';
import { ServerSyncConfig } from './models/sync-config.model';
import { createSyncMiddleware } from './sync-middleware';
import { SecurityMiddleware } from './middleware/security-middleware';
import { createCSPMiddleware } from './middleware/csp-middleware';
import { AuditService } from './services/audit.service';

/**
 * Cria um router Express para endpoints de sincronização
 * com melhorias de performance e segurança
 */
export function createSyncRouter(config: ServerSyncConfig): Router {
  // Verificar se Router está disponível (Express deve estar instalado)
  if (!Router) {
    throw new Error('Express não está instalado. Instale com: npm install express');
  }
  
  const router = Router();
  const middleware = createSyncMiddleware(config);
  const securityMiddleware = new SecurityMiddleware();
  
  // Middleware de segurança para todos os endpoints
  router.use(securityMiddleware.rateLimitMiddleware);
  
  // Adicionar CSP se não estiver desabilitado
  if (!config.security?.disableCSP) {
    router.use(createCSPMiddleware({
      reportUri: config.security?.cspReportUri
    }));
  }
  
  // Inicializar serviço de auditoria, se banco de dados estiver disponível
  let auditService;
  if (typeof config.mongodb !== 'string') {
    auditService = new AuditService(config.mongodb);
  }
  
  // Endpoint principal de sincronização
  router.post('/sync/:collection',
    middleware.auth,
    config.security?.csrfProtection !== false ? securityMiddleware.csrfProtection : (req, res, next) => next(),
    async (req, res) => {
      const startTime = Date.now();
      const userId = config.getUserId ? config.getUserId(req) : undefined;
      const collectionName = req.params.collection;
      const { lastSyncTimestamp, changedDocs } = req.body;
      
      try {
        const result = await middleware.service.processSync(
          collectionName,
          lastSyncTimestamp || 0,
          changedDocs || [],
          req
        );
        
        // Registrar operação no serviço de auditoria
        if (auditService) {
          const duration = Date.now() - startTime;
          auditService.logSync({
            userId: userId || 'anonymous',
            clientInfo: {
              ip: req.ip,
              userAgent: req.headers['user-agent'] || 'unknown'
            },
            operation: changedDocs?.length ? 'push' : 'pull',
            collectionName,
            docsCount: changedDocs?.length || 0,
            syncResults: result.syncResults,
            duration
          }).catch(err => console.error('Erro ao registrar auditoria:', err));
        }
        
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message || 'Erro interno na sincronização' });
      }
    }
  );
  
  // Endpoint para verificar status
  router.get('/sync/status', (req, res) => {
    res.json({
      status: 'online',
      version: require('../../package.json').version,
      timestamp: new Date().toISOString(),
      features: {
        securityEnhanced: true,
        performanceOptimized: true,
        auditEnabled: !!auditService
      }
    });
  });
  
  return router;
}