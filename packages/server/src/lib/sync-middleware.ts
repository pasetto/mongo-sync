import { Request, Response, NextFunction } from 'express';
import { Db } from 'mongodb';
import { securityMiddleware } from './middleware/security-middleware';

/**
 * Middleware para validação de requisições de sincronização
 */
export class SyncMiddleware {
  private db: Db;
  private authValidator: (req: Request) => boolean | Promise<boolean>;
  private getUserId: (req: Request) => string;
  private userIdField: string;

  constructor(
    db: Db, 
    authValidator: (req: Request) => boolean | Promise<boolean> = () => true,
    getUserId: (req: Request) => string = (req) => req.user?.id || 'anonymous',
    userIdField: string = 'userId'
  ) {
    this.db = db;
    this.authValidator = authValidator;
    this.getUserId = getUserId;
    this.userIdField = userIdField;
  }

  /**
   * Middleware para autenticação de requisições
   */
  async authenticate(req: Request, res: Response, next: NextFunction) {
    try {
      const isAuthenticated = await this.authValidator(req);
      
      if (!isAuthenticated) {
        return res.status(401).json({
          error: 'Não autorizado',
          requiresAuth: true
        });
      }
      
      next();
    } catch (error: any) {
      console.error('Erro de autenticação:', error);
      res.status(401).json({
        error: 'Erro na autenticação',
        requiresAuth: true
      });
    }
  }

  /**
   * Middleware para garantir que o usuário só acesse seus próprios dados
   */
  async dataOwnershipValidator(collection: string, validator?: (doc: any, req: Request) => boolean | Promise<boolean>) {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        const userId = this.getUserId(req);
        const docId = req.params.id;
        
        if (!docId) {
          return next();
        }
        
        // Buscar o documento
        const doc = await this.db.collection(collection).findOne({ id: docId });
        
        if (!doc) {
          return res.status(404).json({ error: 'Documento não encontrado' });
        }
        
        // Verificar se o documento pertence ao usuário
        const isOwner = doc[this.userIdField] && doc[this.userIdField].toString() === userId;
        
        // Se houver um validador customizado, usá-lo também
        if (validator && !await validator(doc, req)) {
          return res.status(403).json({ error: 'Acesso negado ao documento' });
        }
        
        if (!isOwner) {
          return res.status(403).json({ error: 'O documento não pertence a este usuário' });
        }
        
        next();
      } catch (error: any) {
        console.error('Erro na validação de propriedade:', error);
        res.status(500).json({ error: error.message || 'Erro interno na sincronização' });
      }
    };
  }

  /**
   * Middleware para validação de documentos antes da inserção/atualização
   */
  documentValidator(validator: (doc: any, req: Request) => boolean | Promise<boolean>) {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        const doc = req.body;
        
        if (!doc) {
          return res.status(400).json({ error: 'Documento não fornecido' });
        }
        
        // Executar validação
        const isValid = await validator(doc, req);
        
        if (!isValid) {
          return res.status(400).json({ error: 'Documento inválido' });
        }
        
        next();
      } catch (error) {
        console.error('Erro na validação de documento:', error);
        res.status(400).json({ error: 'Erro na validação de documento' });
      }
    };
  }

  /**
   * Middleware para rate limiting
   */
  rateLimit(limit: number = 60) {
    return securityMiddleware.rateLimit(limit);
  }

  /**
   * Middleware para proteção contra injeção
   */
  injectionProtection() {
    return securityMiddleware.injectionProtection();
  }

  /**
   * Middleware para inserir userId nos documentos criados
   */
  addUserIdToDocument() {
    return (req: Request, res: Response, next: NextFunction) => {
      if (req.body && req.method === 'POST') {
        const userId = this.getUserId(req);
        req.body[this.userIdField] = userId;
      }
      next();
    };
  }
  
  /**
   * Middleware para adicionar campos de auditoria aos documentos
   */
  addAuditFields() {
    return (req: Request, res: Response, next: NextFunction) => {
      if (req.body) {
        const now = Date.now();
        
        // Para novos documentos
        if (req.method === 'POST') {
          req.body.createdAt = req.body.createdAt || now;
          req.body.updatedAt = now;
        }
        // Para atualizações
        else if (req.method === 'PUT' || req.method === 'PATCH') {
          req.body.updatedAt = now;
        }
      }
      next();
    };
  }
}