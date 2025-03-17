import { Collection, Db } from 'mongodb';

export interface ServerSyncConfig {
  /**
   * Instância MongoDB ou conexão URI
   */
  mongodb: Db | string;
  
  /**
   * Função para validar autenticação
   */
  authValidator?: (req: any) => Promise<boolean> | boolean;
  
  /**
   * Campo para identificar o dono do documento
   */
  userIdField?: string;
  
  /**
   * Método para extrair o ID do usuário da requisição
   */
  getUserId?: (req: any) => string | undefined;
  
  /**
   * Configurações de coleções específicas
   */
  collections?: {
    [collectionName: string]: {
      /**
       * Validador personalizado por coleção
       */
      validator?: (doc: any, req: any) => Promise<boolean> | boolean;
      
      /**
       * Transformador de documentos antes de enviar
       */
      transform?: (doc: any, req: any) => any;
      
      /**
       * Manipulador de conflitos personalizado
       */
      conflictHandler?: (serverDoc: any, clientDoc: any, req: any) => Promise<any> | any;
    }
  };
  
  /**
   * Configurações de segurança
   */
  security?: {
    /**
     * Habilitar verificação de CSRF
     */
    csrfProtection?: boolean;
    
    /**
     * Limite de taxa de sincronização (requisições por minuto)
     */
    rateLimit?: number;
  };
  
  /**
   * Configurações de logs
   */
  logging?: {
    /**
     * Nível de log
     */
    level?: 'none' | 'error' | 'warning' | 'info' | 'debug';
    
    /**
     * Função de log personalizada
     */
    logger?: (level: string, message: string, data?: any) => void;
  };
}