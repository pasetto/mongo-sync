export interface SyncConfig {
  /**
   * URL base da API de sincronização
   */
  apiUrl: string;
  
  /**
   * Intervalo de sincronização automática em milissegundos (0 para desativar)
   */
  autoSyncInterval?: number;
  
  /**
   * Estratégia de resolução de conflitos
   */
  conflictResolution?: 'server-wins' | 'client-wins' | 'manual' | 'timestamp-wins';
  
  /**
   * Nome do banco de dados local
   */
  dbName?: string;
  
  /**
   * Opções de armazenamento
   */
  storage?: {
    /**
     * Tipo de armazenamento local
     */
    type?: 'indexeddb' | 'localstorage' | 'memory';
    
    /**
     * Tamanho máximo em MB para armazenamento offline
     */
    maxSize?: number;
  };
  
  /**
   * Opções de segurança
   */
  security?: {
    /**
     * Função para obter o token de autenticação
     */
    getAuthToken?: () => string | null | Promise<string | null>;
    
    /**
     * Campo para identificar o usuário dono dos dados
     */
    userIdField?: string;
  };
  
  /**
   * Opções de log
   */
  logging?: {
    /**
     * Nível de log
     */
    level?: 'none' | 'error' | 'warning' | 'info' | 'debug';
    
    /**
     * Função personalizada de log
     */
    logger?: (level: string, message: string, data?: any) => void;
  };
}