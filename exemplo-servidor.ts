import express from 'express';
import cors from 'cors';
import { MongoClient } from 'mongodb';
import { createSyncRouter } from '@mongo-sync/server';
import jwt from 'jsonwebtoken';

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'seu_segredo_jwt';

// Middleware
app.use(cors());
app.use(express.json());

// Conexão MongoDB
async function startServer() {
  try {
    const mongoClient = new MongoClient('mongodb://localhost:27017');
    await mongoClient.connect();
    const db = mongoClient.db('myapp_db');
    
    console.log('Conectado ao MongoDB');
    
    // Configurar router de sincronização
    const syncRouter = createSyncRouter({
      mongodb: db,
      
      // Validação de autenticação
      authValidator: async (req) => {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return false;
        
        try {
          const decoded = jwt.verify(token, JWT_SECRET);
          req.user = decoded; // Adiciona usuário decodificado à requisição
          return true;
        } catch (error) {
          return false;
        }
      },
      
      // Extrair ID do usuário da requisição
      getUserId: (req) => req.user?.id,
      
      // Campo que identifica o dono do documento
      userIdField: 'userId',
      
      // Configurações específicas das coleções
      collections: {
        tasks: {
          // Validador personalizado para tarefas
          validator: (doc, req) => {
            return doc.title && doc.title.length <= 100;
          },
          
          // Transformação antes de enviar ao cliente
          transform: (doc, req) => {
            // Remover campos sensíveis ou fazer outras transformações
            const { _id, ...rest } = doc;
            return rest;
          }
        }
      },
      
      // Configurações de segurança
      security: {
        rateLimit: 60 // 60 requisições por minuto
      },
      
      // Configurações de log
      logging: {
        level: 'info'
      }
    });
    
    // Usar router de sincronização
    app.use('/api', syncRouter);
    
    // Iniciar servidor
    app.listen(PORT, () => {
      console.log(`Servidor rodando na porta ${PORT}`);
    });
    
  } catch (error) {
    console.error('Erro ao iniciar servidor:', error);
    process.exit(1);
  }
}

startServer();