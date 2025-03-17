import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface ConflictItem {
  id: string;
  type: 'task' | 'note';
  localVersion: any;
  serverVersion: any;
  resolved: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class ConflictService {
  private conflictsSubject = new BehaviorSubject<ConflictItem[]>([]);
  conflicts$ = this.conflictsSubject.asObservable();
  
  constructor() {}
  
  addConflict(conflict: Omit<ConflictItem, 'resolved'>) {
    const currentConflicts = this.conflictsSubject.value;
    this.conflictsSubject.next([
      ...currentConflicts,
      { ...conflict, resolved: false }
    ]);
  }
  
  resolveConflict(id: string, resolution: 'local' | 'server' | 'merge') {
    const currentConflicts = this.conflictsSubject.value;
    const updatedConflicts = currentConflicts.map(conflict => 
      conflict.id === id ? { ...conflict, resolved: true } : conflict
    );
    this.conflictsSubject.next(updatedConflicts);
    return resolution === 'local' ? conflict.localVersion : conflict.serverVersion;
  }
  
  getUnresolvedConflicts() {
    return this.conflictsSubject.value.filter(conflict => !conflict.resolved);
  }
  
  clearResolvedConflicts() {
    const currentConflicts = this.conflictsSubject.value;
    this.conflictsSubject.next(currentConflicts.filter(conflict => !conflict.resolved));
  }
}