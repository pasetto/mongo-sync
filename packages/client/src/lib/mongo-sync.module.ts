import { NgModule, ModuleWithProviders } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClientModule } from '@angular/common/http';

import { OfflineStoreService } from './services/offline-store.service';
import { OfflineSyncService } from './services/offline-sync.service';
import { SyncIndicatorComponent } from './components/sync-indicator.component';
import { ConflictResolverComponent } from './components/conflict-resolver.component';
import { SyncConfigService } from './services/sync-config.service';
import { SyncConfig } from './models/config.model';

@NgModule({
  imports: [
    CommonModule,
    HttpClientModule
  ],
  declarations: [
    SyncIndicatorComponent,
    ConflictResolverComponent
  ],
  exports: [
    SyncIndicatorComponent,
    ConflictResolverComponent
  ]
})
export class MongoSyncModule {
  static forRoot(config: SyncConfig): ModuleWithProviders<MongoSyncModule> {
    return {
      ngModule: MongoSyncModule,
      providers: [
        { provide: SyncConfigService, useValue: { config } },
        OfflineStoreService,
        OfflineSyncService
      ]
    };
  }
}