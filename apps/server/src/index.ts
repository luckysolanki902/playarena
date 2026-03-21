import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { Server as SocketIOServer } from 'socket.io';
import { sessionRoutes } from './routes/session';
import { roomRoutes } from './routes/rooms';
import { healthRoutes } from './routes/health';
import { setupSocketIO } from './lib/socket';
import { SessionStore } from './lib/sessionStore';
import { RoomStore } from './lib/roomStore';
import './types';

const PORT = Number(process.env.PORT) || 4000;
const CORS_ORIGINS = process.env.CORS_ORIGINS?.split(',') || [
  'http://localhost:3000',
];

const isDev = process.env.NODE_ENV !== 'production';
const app = Fastify({
  logger: isDev
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' },
        },
      }
    : true,
});

// Stores (in-memory)
const sessionStore = new SessionStore();
const roomStore = new RoomStore();

// Plugins
await app.register(cors, {
  origin: CORS_ORIGINS,
  credentials: true,
});

await app.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
});

// Decorate with stores
app.decorate('sessionStore', sessionStore);
app.decorate('roomStore', roomStore);

// REST Routes
await app.register(healthRoutes, { prefix: '/' });
await app.register(sessionRoutes, { prefix: '/' });
await app.register(roomRoutes, { prefix: '/' });

// Start HTTP server
await app.listen({ port: PORT, host: '0.0.0.0' });

// Attach Socket.IO to the underlying HTTP server
const io = new SocketIOServer(app.server, {
  cors: {
    origin: CORS_ORIGINS,
    credentials: true,
  },
  transports: ['websocket', 'polling'],
});

setupSocketIO(io, sessionStore, roomStore);

app.log.info(`PlayArena server running on port ${PORT}`);

// Cleanup: expire sessions every 5 minutes
setInterval(() => {
  sessionStore.cleanup();
}, 5 * 60 * 1000);
