import { v4 as uuidv4 } from 'uuid';

/**
 * Decorator para transformar uma classe em uma coleção offline
 * @param collectionName Nome da coleção
 */
export function OfflineCollection(collectionName: string) {
  return function<T extends { new (...args: any[]): {} }>(constructor: T) {
    return class extends constructor {
      id: string;
      createdAt: number;
      updatedAt: number;
      _deleted?: boolean;
      _modified?: boolean;
      
      constructor(...args: any[]) {
        super(...args);
        const timestamp = Date.now();
        
        // Adicionar campos necessários
        this.id = this.id || uuidv4();
        this.createdAt = this.createdAt || timestamp;
        this.updatedAt = this.updatedAt || timestamp;
      }
      
      /**
       * Nome da coleção
       */
      static collectionName = collectionName;
      
      /**
       * Schema RxDB para a coleção
       */
      static getSchema() {
        return {
          title: `${collectionName} schema`,
          version: 0,
          primaryKey: 'id',
          type: 'object',
          properties: {
            id: { type: 'string' },
            createdAt: { type: 'number' },
            updatedAt: { type: 'number' },
            _deleted: { type: 'boolean', optional: true },
            _modified: { type: 'boolean', optional: true }
            // Outros campos são adicionados dinamicamente
          },
          required: ['id', 'createdAt', 'updatedAt']
        };
      }
    };
  };
}