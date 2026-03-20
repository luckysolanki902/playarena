import type { SessionStore } from './lib/sessionStore';
import type { RoomStore } from './lib/roomStore';

declare module 'fastify' {
  interface FastifyInstance {
    sessionStore: SessionStore;
    roomStore: RoomStore;
  }
}
