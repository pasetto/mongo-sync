import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface SyncLogEntry {
  timestamp: number;
  type: 'info' | 'warning' | 'error' | 'success';
  message: string;
  details?: any;
}

@Injectable({
  providedIn: 'root'
})
export class SyncLogService {
  private logs: SyncLogEntry[] = [];
  private logsSubject = new BehaviorSubject<SyncLogEntry[]>([]);
  logs$ = this.logsSubject.asObservable();
  
  constructor() {}
  
  log(type: 'info' | 'warning' | 'error' | 'success', message: string, details?: any) {
    const entry: SyncLogEntry = {
      timestamp: Date.now(),
      type,
      message,
      details
    };
    
    this.logs.push(entry);
    
    // Limitar a 100 entradas para não consumir memória
    if (this.logs.length > 100) {
      this.logs.shift();
    }
    
    this.logsSubject.next([...this.logs]);
    console.log(`[Sync ${type}]`, message, details || '');
  }
  
  getRecentLogs(count = 10) {
    return this.logs.slice(-count);
  }
  
  clearLogs() {
    this.logs = [];
    this.logsSubject.next([]);
  }
}