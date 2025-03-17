import { Injectable } from '@angular/core';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  accessCount: number;
  lastAccessed: number;
}

@Injectable({
  providedIn: 'root'
})
export class QueryCacheService {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private maxEntries = 100;
  private defaultTTL = 5 * 60 * 1000; // 5 minutos

  constructor() {
    // Executar limpeza periódica
    setInterval(() => this.cleanExpiredEntries(), 60000);
  }

  /**
   * Retorna dados do cache se disponível e válido, ou executa e armazena a query
   */
  async getOrQuery<T>(
    key: string,
    queryFn: () => Promise<T>,
    options: {
      ttl?: number; // Tempo de vida em ms
      force?: boolean; // Forçar execução mesmo