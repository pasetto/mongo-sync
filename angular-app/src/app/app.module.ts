import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { ReactiveFormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { TasksComponent } from './components/tasks/tasks.component';
import { NotesComponent } from './components/notes/notes.component';
import { NavigationComponent } from './components/navigation/navigation.component';
import { SyncTesterComponent } from './components/sync-tester/sync-tester.component';
import { SyncIndicatorComponent } from './components/sync-indicator/sync-indicator.component';

@NgModule({
  declarations: [
    AppComponent,
    TasksComponent,
    NotesComponent,
    NavigationComponent,
    SyncTesterComponent,
    SyncIndicatorComponent
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    ReactiveFormsModule,
    HttpClientModule
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }