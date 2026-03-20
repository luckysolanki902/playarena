import type { FastifyInstance } from 'fastify';

export async function healthRoutes(app: FastifyInstance) {
  app.get('/health', async () => {
    return {
      status: 'ok',
      uptime: process.uptime(),
      activePlayers: app.sessionStore.activeCount,
      activeRooms: app.roomStore.activeCount,
    };
  });

  app.get('/meta', async () => {
    return {
      games: [
        { id: 'wordle', name: 'Wordle', minPlayers: 1, maxPlayers: 8 },
        { id: 'scribble', name: 'Scribble', minPlayers: 3, maxPlayers: 8 },
      ],
      totalPlayers: app.sessionStore.activeCount,
    };
  });
}
