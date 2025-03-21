import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/enviroment';
import { Todo } from '../models/todo.model';

interface TodoResponse {
  success: boolean;
  todos: Todo[];
}

interface SingleTodoResponse {
  success: boolean;
  todo: Todo;
}

interface MessageResponse {
  success: boolean;
  message: string;
}

@Injectable({
  providedIn: 'root'
})
export class TodoService {
  private apiUrl = `${environment.apiUrl}/todos`;
  
  constructor(private http: HttpClient) {}

  getTodos(): Observable<TodoResponse> {
    return this.http.get<TodoResponse>(this.apiUrl);
  }

  createTodo(text: string): Observable<SingleTodoResponse> {
    return this.http.post<SingleTodoResponse>(this.apiUrl, { text });
  }

  updateTodo(id: string, data: Partial<Todo>): Observable<SingleTodoResponse> {
    return this.http.put<SingleTodoResponse>(`${this.apiUrl}/${id}`, data);
  }

  deleteTodo(id: string): Observable<MessageResponse> {
    return this.http.delete<MessageResponse>(`${this.apiUrl}/${id}`);
  }
}