require('dotenv').config()
const Fastify = require('fastify')
const mongoose = require('mongoose')
const bcrypt = require('bcrypt')
const { createSyncRouter } = require('./../../packages/server')
// Inicialização do Fastify
const fastify = Fastify({
  logger: true
})

// Configuração
const config = {
  mongoURI: process.env.MONGO_URI || 'mongodb://localhost:27017/demo-mongo-sync',
  jwtSecret: process.env.JWT_SECRET || '234567892345678987654dfghjk',
  saltRounds: parseInt(process.env.SALT_ROUNDS || 10)
}

// Conexão com o MongoDB
mongoose.connect(config.mongoURI)
  .then(() => fastify.log.info('MongoDB conectado'))
  .catch(err => {
    fastify.log.error(`Erro ao conectar ao MongoDB: ${err.message}`)
    process.exit(1)
  })

// Modelos
const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  name: { type: String }
}, {
  toJSON: {
    transform: (doc, ret) => {
      delete ret.password;
      return ret;
    }
  }
})

const TodoSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  text: { type: String, required: true },
  done: { type: Boolean, default: false },
  // Campos para sincronização
  id: { type: String, unique: true, sparse: true },
  updatedAt: { type: Number },
  createdAt: { type: Number },
  _deleted: { type: Boolean },
  _modified: { type: Boolean }
})

const User = mongoose.model('User', UserSchema)
const Todo = mongoose.model('Todo', TodoSchema)

// Registrar plugin JWT
fastify.register(require('@fastify/jwt'), {
  secret: config.jwtSecret
})

// Middleware de autenticação
fastify.decorate('authenticate', async function(request, reply) {
  try {
    if (request.url === '/api/v1' || 
        request.url === '/api/v1/auth/login' || 
        request.url === '/api/v1/auth/register' ||
        request.url === '/api/sync/status') {  // Adicionar exceção para rota de status do sync
      return
    }
    await request.jwtVerify()
  } catch (err) {
    reply.code(401).send({ success: false, message: 'Não autorizado' })
  }
})

// Função para obter a conexão direta ao MongoDB (para mongo-sync)
const getMongoDB = async () => {
  return mongoose.connection.db;
}

// Configurar o mongo-sync e integrar com Fastify
fastify.register(async function (fastify, opts) {
  const db = await getMongoDB();

  // Configuração do router do mongo-sync
  const syncConfig = {
    mongodb: db,
    
    // Verificação de autenticação
    authValidator: async (req) => {
      try {
        // Verificar token JWT
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) return false;
        
        const decoded = fastify.jwt.verify(token);
        req.user = decoded; // Adiciona usuário decodificado à requisição
        return true;
      } catch (error) {
        fastify.log.error('Erro na validação de autenticação do sync:', error);
        return false;
      }
    },
    
    // Obter ID do usuário da requisição
    getUserId: (req) => {
      return req.user?.id;
    },
    
    // Campo que identifica o dono do documento
    userIdField: 'userId',
    
    // Configurações específicas das coleções
    collections: {
      todos: {
        // Validador personalizado para tarefas
        validator: (doc, req) => {
          return doc.text && doc.userId && doc.userId.toString() === req.user.id;
        },
        
        // Tratamento de conflitos (opcional)
        conflictHandler: async (serverDoc, clientDoc, req) => {
          // Estratégia simples: documento mais recente vence
          if (clientDoc.updatedAt > serverDoc.updatedAt) {
            return clientDoc;
          }
          return serverDoc;
        }
      }
    },
    
    // Configurações de segurança
    security: {
      rateLimit: 100 // 100 requisições por minuto
    },
    
    // Configurações de log
    logging: {
      level: 'info'
    }
  };

  // Criar e registrar as rotas do mongo-sync
  const syncRouter = createSyncRouter(syncConfig);

  // Mapear as rotas do Express para o Fastify
  for (const route of syncRouter.stack) {
    if (route.route) {
      const { path, stack } = route.route;
      const methods = stack.map(s => s.method.toLowerCase());
      
      for (const method of methods) {
        fastify.route({
          method,
          url: path,
          handler: async (request, reply) => {
            // Simular contexto Express para mongo-sync
            const expressReq = {
              ...request,
              params: request.params,
              body: request.body,
              query: request.query,
              headers: request.headers
            };
            
            const expressRes = {
              json: (data) => reply.send(data),
              status: (code) => {
                reply.code(code);
                return expressRes;
              },
              send: (data) => reply.send(data),
              set: (name, value) => reply.header(name, value)
            };
            
            // Encontrar o handler correto no stack da rota
            const handler = stack.find(s => s.method.toLowerCase() === method);
            if (handler) {
              try {
                await handler.handle(expressReq, expressRes);
              } catch (error) {
                fastify.log.error('Erro ao executar handler do sync:', error);
                reply.code(500).send({ error: 'Erro interno do servidor' });
              }
            }
          },
          onRequest: fastify.authenticate  // Aplicar autenticação
        });
      }
    }
  }
  
  // Adicionar rota de status do mongo-sync
  fastify.get('/sync/status', (request, reply) => {
    reply.send({
      status: 'online',
      version: '1.0.0',
      timestamp: new Date().toISOString()
    });
  });
  
}, { prefix: '/api' });

// Rotas da API v1 (manter as mesmas que você já tinha)
fastify.register(async function(fastify, opts) {
  // ... seu código existente para rotas ...
  
  // Rota raiz da API v1
  fastify.get('/', async (request, reply) => {
    return { api: 'v1', message: 'Bem-vindo à API v1' }
  })

  // AUTH ROUTES (públicas)
  
  // Login
  fastify.post('/auth/login', async (request, reply) => {
    try {
      const { email, password } = request.body
      const user = await User.findOne({ email })
      
      if (!user || !(await bcrypt.compare(password, user.password))) {
        return reply.code(401).send({
          success: false,
          message: 'Credenciais inválidas'
        })
      }
      
      const token = fastify.jwt.sign({ id: user._id, email: user.email })
      
      return {
        success: true,
        user,
        token
      }
    } catch (err) {
      fastify.log.error(err)
      return reply.code(500).send({
        success: false,
        message: 'Erro ao efetuar login'
      })
    }
  })
  
  // Registro
  fastify.post('/auth/register', async (request, reply) => {
    try {
      const { email, password, name } = request.body
      
      const existingUser = await User.findOne({ email })
      if (existingUser) {
        return reply.code(409).send({
          success: false,
          message: 'Email já está em uso'
        })
      }
      
      const hashedPassword = await bcrypt.hash(password, config.saltRounds)
      const newUser = new User({ email, password: hashedPassword, name })
      await newUser.save()
      
      const token = fastify.jwt.sign({ id: newUser._id, email: newUser.email })
      
      return {
        success: true,
        user: newUser,
        token
      }
    } catch (err) {
      fastify.log.error(err)
      return reply.code(500).send({
        success: false,
        message: 'Erro ao registrar usuário'
      })
    }
  })
  
  // ROTAS PROTEGIDAS
  // ... resto do seu código existente ...
  
}, { prefix: '/api/v1' })

// Rota raiz
fastify.get('/', async (request, reply) => {
  return { status: 'online', version: '1.0.0' }
})

// Configuração CORS
fastify.register(require('@fastify/cors'), {
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
})

// Parser de conteúdo
fastify.addContentTypeParser('application/json', { parseAs: 'string' }, function (req, body, done) {
  try {
    const json = JSON.parse(body)
    done(null, json)
  } catch (err) {
    err.statusCode = 400
    done(err, undefined)
  }
})

// Iniciar o servidor
const start = async () => {
  try {
    await fastify.listen({ port: process.env.PORT || 3000, host: '0.0.0.0' })
    fastify.log.info(`Servidor rodando em ${fastify.server.address().port}`)
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}

start()