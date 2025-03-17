import { Injectable } from '@angular/core';
import * as Ajv from 'ajv';
import DOMPurify from 'dompurify';

@Injectable({
  providedIn: 'root'
})
export class ValidationService {
  private ajv: Ajv.default;
  private schemas: Record<string, any> = {};
  private validators: Record<string, Ajv.ValidateFunction> = {};
  
  constructor() {
    this.ajv = new Ajv.default({ allErrors: true });
  }
  
  /**
   * Registra schema para uma coleção
   */
  registerSchema(collectionName: string, schema: any): void {
    this.schemas[collectionName] = schema;
    this.validators[collectionName] = this.ajv.compile(schema);
  }
  
  /**
   * Valida documento contra schema registrado
   */
  validateDocument(collectionName: string, doc: any): { valid: boolean, errors?: any[] } {
    const validator = this.validators[collectionName];
    if (!validator) {
      return { valid: false, errors: [{ message: 'No validator registered for this collection' }] };
    }
    
    const valid = validator(doc);
    return {
      valid,
      errors: validator.errors
    };
  }
  
  /**
   * Sanitiza dados do documento para prevenir XSS e injeções
   */
  sanitizeDocument(doc: any): any {
    // Função recursiva para sanitizar strings
    const sanitizeValue = (value: any): any => {
      if (typeof value === 'string') {
        return DOMPurify.sanitize(value);
      }
      if (Array.isArray(value)) {
        return value.map(item => sanitizeValue(item));
      }
      if (value !== null && typeof value === 'object') {
        return this.sanitizeObject(value);
      }
      return value;
    };
    
    return this.sanitizeObject(doc);
  }
  
  private sanitizeObject(obj: Record<string, any>): Record<string, any> {
    const result: Record<string, any> = {};
    
    // Para cada propriedade do objeto
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        result[key] = sanitizeValue(obj[key]);
      }
    }
    
    return result;
  }
  
  /**
   * Aplica validação e sanitização a um documento
   */
  processDocument(collectionName: string, doc: any): { 
    valid: boolean; 
    sanitizedDoc?: any; 
    errors?: any[] 
  } {
    // Primeiro sanitizar
    const sanitizedDoc = this.sanitizeDocument(doc);
    
    // Depois validar
    const { valid, errors } = this.validateDocument(collectionName, sanitizedDoc);
    
    return {
      valid,
      sanitizedDoc: valid ? sanitizedDoc : undefined,
      errors
    };
  }
}