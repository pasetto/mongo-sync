import { Component, OnInit } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TodoService } from '../todo.service';
import { Todo } from '../../models/todo.model';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MaterialModule } from '../../shared/material.module';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-todo-list',
  templateUrl: './todo-list.component.html',
  styleUrls: ['./todo-list.component.scss'],
  imports: [CommonModule, RouterModule, FormsModule, MaterialModule],
})
export class TodoListComponent implements OnInit {
  todos: Todo[] = [];
  loading = false;
  newTodoText = '';
  
  constructor(
    private todoService: TodoService,
    private snackBar: MatSnackBar
  ) {}
  
  ngOnInit(): void {
    this.loadTodos();
  }
  
  loadTodos(): void {
    this.loading = true;
    this.todoService.getTodos().subscribe({
      next: (response) => {
        this.todos = response.todos;
        this.loading = false;
      },
      error: (error) => {
        this.loading = false;
        this.snackBar.open('Erro ao carregar tarefas: ' + (error.error?.message || 'Tente novamente'), 'Fechar', {
          duration: 3000
        });
      }
    });
  }
  
  addTodo(): void {
    if (!this.newTodoText.trim()) {
      return;
    }
    
    this.loading = true;
    this.todoService.createTodo(this.newTodoText).subscribe({
      next: (response) => {
        this.todos.push(response.todo);
        this.newTodoText = '';
        this.loading = false;
      },
      error: (error) => {
        this.loading = false;
        this.snackBar.open('Erro ao criar tarefa: ' + (error.error?.message || 'Tente novamente'), 'Fechar', {
          duration: 3000
        });
      }
    });
  }
  
  toggleTodoStatus(todo: Todo): void {
    const updatedTodo = { ...todo, done: !todo.done };
    
    this.todoService.updateTodo(todo._id!, { done: !todo.done }).subscribe({
      next: (response) => {
        const index = this.todos.findIndex(t => t._id === todo._id);
        if (index !== -1) {
          this.todos[index] = response.todo;
        }
      },
      error: (error) => {
        this.snackBar.open('Erro ao atualizar tarefa: ' + (error.error?.message || 'Tente novamente'), 'Fechar', {
          duration: 3000
        });
      }
    });
  }
  
  deleteTodo(todo: Todo): void {
    this.todoService.deleteTodo(todo._id!).subscribe({
      next: () => {
        this.todos = this.todos.filter(t => t._id !== todo._id);
      },
      error: (error) => {
        this.snackBar.open('Erro ao excluir tarefa: ' + (error.error?.message || 'Tente novamente'), 'Fechar', {
          duration: 3000
        });
      }
    });
  }
  
  editTodo(todo: Todo, newText: string): void {
    if (!newText.trim()) {
      return;
    }
    
    this.todoService.updateTodo(todo._id!, { text: newText }).subscribe({
      next: (response) => {
        const index = this.todos.findIndex(t => t._id === todo._id);
        if (index !== -1) {
          this.todos[index] = response.todo;
        }
      },
      error: (error) => {
        this.snackBar.open('Erro ao atualizar tarefa: ' + (error.error?.message || 'Tente novamente'), 'Fechar', {
          duration: 3000
        });
      }
    });
  }
}