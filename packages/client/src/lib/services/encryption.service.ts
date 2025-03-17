import { Injectable } from '@angular/core';
import * as CryptoJS from 'crypto-js';

@Injectable({
  providedIn: 'root'
})
export class EncryptionService {
  private encryptionKey: string | null = null;
  
  /**
   * Inicializa serviço de criptografia
   * @param key Chave de criptografia ou callback para obter a chave
   */
  initialize(key: string | (() => string | Promise<string>)): Promise<void> {
    return new Promise(async (resolve, reject) => {
      try {
        if (typeof key === 'function') {
          this.encryptionKey = await key();
        } else {
          this.encryptionKey = key;
        }
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }
  
  /**
   * Criptografa documento antes de armazenar localmente
   */
  encryptDocument(doc: any): any {
    if (!this.encryptionKey) return doc;
    
    // Separar campos que não precisam ser criptografados
    const { id, createdAt, updatedAt, _rev, _deleted, _modified, ...content } = doc;
    
    // Criptografar apenas o conteúdo
    const contentString = JSON.stringify(content);
    const encryptedContent = CryptoJS.AES.encrypt(
      contentString, 
      this.encryptionKey
    ).toString();
    
    // Retornar documento com conteúdo criptografado
    return {
      id,
      createdAt,
      updatedAt,
      _rev,
      _deleted,
      _modified,
      _encrypted: true,
      content: encryptedContent
    };
  }
  
  /**
   * Descriptografa documento armazenado localmente
   */
  decryptDocument(doc: any): any {
    if (!doc._encrypted || !this.encryptionKey) return doc;
    
    try {
      // Descriptografar conteúdo
      const bytes = CryptoJS.AES.decrypt(doc.content, this.encryptionKey);
      const decryptedContent = JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
      
      // Mesclar campos não criptografados com conteúdo descriptografado
      const { 
        id, createdAt, updatedAt, _rev, _deleted, _modified 
      } = doc;
      
      return {
        ...decryptedContent,
        id,
        createdAt,
        updatedAt,
        _rev,
        _deleted,
        _modified
      };
    } catch (error) {
      console.error('Erro ao descriptografar documento:', error);
      return doc;
    }
  }
  
  /**
   * Altera a chave de criptografia e recriptografa todos os documentos
   */
  async rotateEncryptionKey(
    newKey: string,
    db: any,
    collections: string[]
  ): Promise<void> {
    if (!this.encryptionKey) throw new Error('Serviço não inicializado');
    
    const oldKey = this.encryptionKey;
    
    // Para cada coleção
    for (const collectionName of collections) {
      const collection = db.collections[collectionName];
      const docs = await collection.find().exec();
      
      // Para cada documento
      for (const doc of docs) {
        // Descriptografar com chave antiga
        const decryptedDoc = this.decryptDocument(doc.toJSON());
        
        // Atualizar chave
        this.encryptionKey = newKey;
        
        // Criptografar com chave nova
        const reEncryptedDoc = this.encryptDocument(decryptedDoc);
        
        // Atualizar documento
        await doc.update({
          $set: reEncryptedDoc
        });
      }
    }
    
    // Finalizar rotação
    this.encryptionKey = newKey;
  }
}