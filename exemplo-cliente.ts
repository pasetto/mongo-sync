// app.module.ts
import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { MongoSyncModule } from '@mongo-sync/client';
import { AppComponent } from './app.component';

@NgModule({
  declarations: [AppComponent],
  imports: [
    BrowserModule,
    MongoSyncModule.forRoot({
      apiUrl: 'http://localhost:3000/api',
      autoSyncInterval: 30000,
      conflictResolution: 'manual',
      dbName: 'myapp_db',
      security: {
        getAuthToken: () => localStorage.getItem('authToken')
      },
      logging: {
        level: 'info'
      }
    })
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }

// modelo-tarefa.ts
import { OfflineCollection } from '@mongo-sync/client';

@OfflineCollection('tasks')
export class Task {
  id?: string;
  title: string;
  completed: boolean = false;
  createdAt?: number;
  updatedAt?: number;
  
  constructor(data: Partial<Task>) {
    Object.assign(this, data);
  }
}

// servico-tarefa.ts
import { Injectable } from '@angular/core';
import { OfflineStoreService, OfflineSyncService } from '@mongo-sync/client';
import { Task } from './modelo-tarefa';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class TaskService {
  constructor(
    private store: OfflineStoreService,
    private sync: OfflineSyncService
  ) {
    // Inicializar banco de dados
    this.initializeDb();
  }
  
  private async initializeDb() {
    await this.store.initialize({
      tasks: Task.getSchema()
    });
  }
  
  async getTasks(): Promise<Task[]> {
    const collection = await this.store.getCollection('tasks');
    const docs = await collection.find().exec();
    return docs.map(doc => new Task(doc.toJSON()));
  }
  
  async addTask(title: string): Promise<Task> {
    const collection = await this.store.getCollection('tasks');
    const task = new Task({ title });
    
    await collection.insert(task);
    this.sync.incrementPendingChanges();
    
    return task;
  }
  
  async updateTask(id: string, updates: Partial<Task>): Promise<Task> {
    const collection = await this.store.getCollection('tasks');
    const doc = await collection.findOne(id).exec();
    
    if (!doc) {
      throw new Error('Tarefa não encontrada');
    }
    
    await doc.update({
      $set: {
        ...updates,
        updatedAt: Date.now(),
        _modified: true
      }
    });
    
    this.sync.incrementPendingChanges();
    return new Task(doc.toJSON());
  }
  
  async deleteTask(id: string): Promise<void> {
    const collection = await this.store.getCollection('tasks');
    const doc = await collection.findOne(id).exec();
    
    if (doc) {
      await doc.remove();
      this.sync.incrementPendingChanges();
    }
  }
  
  // Forçar sincronização manual
  async syncTasks(): Promise<void> {
    await this.sync.syncCollection('tasks');
  }
  
  // Obter estado da sincronização como Observable
  getSyncState(): Observable<any> {
    return this.sync.syncState$;
  }
}

// componente.ts
import { Component, OnInit } from '@angular/core';
import { TaskService } from './servico-tarefa';
import { Task } from './modelo-tarefa';
import { OfflineSyncService } from '@mongo-sync/client';

@Component({
  selector: 'app-tasks',
  template: `
    <div>
      <h2>Minhas Tarefas</h2>
      <mongo-sync-indicator></mongo-sync-indicator>
      
      <div class="form">
        <input [(ngModel)]="newTaskTitle" placeholder="Nova tarefa...">
        <button (click)="addTask()">Adicionar</button>
      </div>
      
      <ul>
        <li *ngFor="let task of tasks">
          <input type="checkbox" [checked]="task.completed" (change)="toggleTask(task)">
          <span [class.completed]="task.completed">{{ task.title }}</span>
          <button (click)="deleteTask(task)">Excluir</button>
        </li>
      </ul>
      
      <div *ngIf="!isOnline" class="offline-warning">
        Você está offline. As alterações serão sincronizadas quando voltar online.
      </div>
    </div>
  `
})
export class TasksComponent implements OnInit {
  tasks: Task[] = [];
  newTaskTitle = '';
  isOnline = navigator.onLine;
  
  constructor(
    private taskService: TaskService,
    private syncService: OfflineSyncService
  ) {
    this.syncService.isOnline$.subscribe(online => {
      this.isOnline = online;
    });
  }
  
  async ngOnInit() {
    await this.loadTasks();
    
    // Recarregar tarefas quando sincronização for concluída
    this.syncService.syncState$.subscribe(state => {
      if (!state.isSyncing && state.lastSyncTime > 0) {
        this.loadTasks();
      }
    });
  }
  
  async loadTasks() {
    this.tasks = await this.taskService.getTasks();
  }
  
  async addTask() {
    if (!this.newTaskTitle.trim()) return;
    
    await this.taskService.addTask(this.newTaskTitle);
    this.newTaskTitle = '';
    await this.loadTasks();
  }
  
  async toggleTask(task: Task) {
    await this.taskService.updateTask(task.id!, { completed: !task.completed });
    await this.loadTasks();
  }
  
  async deleteTask(task: Task) {
    await this.taskService.deleteTask(task.id!);
    await this.loadTasks();
  }
}