import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { OfflineSyncService } from '../lib/services/offline-sync.service';
import { OfflineStoreService } from '../lib/services/offline-store.service';
import { SyncConfigService } from '../lib/services/sync-config.service';

describe('OfflineSyncService', () => {
  let syncService: OfflineSyncService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        OfflineSyncService,
        OfflineStoreService,
        {
          provide: SyncConfigService,
          useValue: {
            config: {
              apiUrl: 'http://localhost:3000/api',
              autoSyncInterval: 30000
            }
          }
        }
      ]
    });

    syncService = TestBed.inject(OfflineSyncService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('deve incrementar contador de alterações pendentes', () => {
    // Salvar estado inicial
    const initialState = syncService['syncStateSubject'].value;
    
    // Executar método
    syncService.incrementPendingChanges();
    
    // Verificar se o contador aumentou
    expect(syncService['syncStateSubject'].value.pendingChanges)
      .toBe(initialState.pendingChanges + 1);
  });

  it('deve sincronizar com o servidor corretamente', async () => {
    // Mock do banco de dados
    spyOn(syncService['store'], 'getCollection').and.returnValue(Promise.resolve({
      find: () => ({
        exec: () => Promise.resolve([
          { toJSON: () => ({ id: '1', title: 'Teste', updatedAt: Date.now() }) }
        ])
      })
    }));
    
    // Mock do localStorage
    spyOn(localStorage, 'getItem').and.returnValue('0');
    spyOn(localStorage, 'setItem');
    
    // Executar sincronização
    const syncPromise = syncService.syncCollection('tasks');
    
    // Verificar requisição HTTP
    const req = httpMock.expectOne('http://localhost:3000/api/sync/tasks');
    expect(req.request.method).toBe('POST');
    
    // Simular resposta do servidor
    req.flush({
      timestamp: Date.now(),
      docs: [{
        id: '2',
        title: 'Tarefa do Servidor',
        updatedAt: Date.now()
      }],
      syncResults: { added: 1, updated: 0, conflicts: 0 }
    });
    
    // Aguardar fim da sincronização
    await syncPromise;
    
    // Verificar se timestamp foi atualizado
    expect(localStorage.setItem).toHaveBeenCalled();
  });
  
  // Test de segurança - verificar se dados são validados
  it('deve validar dados antes de sincronizar', async () => {
    // Configurar validação
    TestBed.inject(ValidationService).registerSchema('tasks', {
      type: 'object',
      properties: {
        title: { type: 'string', maxLength: 100 }
      },
      required: ['title']
    });
    
    // Mock de dados inválidos
    const invalidDoc = { id: '3', description: 'Sem título' }; // título obrigatório
    
    // Mock do banco de dados
    spyOn(syncService['store'], 'getCollection').and.returnValue(Promise.resolve({
      find: () => ({
        exec: () => Promise.resolve([
          { toJSON: () => invalidDoc }
        ])
      })
    }));
    
    // Executar sincronização (deve filtrar documento inválido)
    await syncService.syncCollection('tasks');
    
    // Verificar requisição HTTP
    const req = httpMock.expectOne('http://localhost:3000/api/sync/tasks');
    
    // Verificar se documento inválido foi filtrado
    expect(req.request.body.changedDocs.length).toBe(0);
  });
  
  // Test de performance - verificar se compressão funciona
  it('deve comprimir dados quando configurado', async () => {
    // Ativar compressão
    syncService['compression'].enabled = true;
    
    // Spy na função de compressão
    const compressSpy = spyOn(syncService['compression'], 'compress').and.callThrough();
    
    // Mock do banco de dados com documento grande
    const largeDoc = {
      id: '4',
      title: 'Documento Grande',
      content: 'x'.repeat(10000), // 10KB de dados
      updatedAt: Date.now()
    };
    
    spyOn(syncService['store'], 'getCollection').and.returnValue(Promise.resolve({
      find: () => ({
        exec: () => Promise.resolve([
          { toJSON: () => largeDoc }
        ])
      })
    }));
    
    // Executar sincronização
    await syncService.syncCollection('tasks');
    
    // Verificar se compressão foi chamada
    expect(compressSpy).toHaveBeenCalled();
  });
});