import type { FastifyInstance } from 'fastify';
import { validateRoomName } from '@playarena/shared';
import { verifyToken } from '../lib/auth';
import type { GameType, RoomVisibility } from '@playarena/shared';

export async function roomRoutes(app: FastifyInstance) {
  // List public rooms
  app.get<{ Querystring: { game?: string } }>('/rooms', async (request) => {
    const rooms = app.roomStore.listPublic(request.query.game);
    return {
      rooms: rooms.map((r) => ({
        id: r.id,
        game: r.game,
        name: r.name,
        hostUsername: r.players.find((p) => p.isHost)?.username,
        status: r.status,
        players: r.players.length,
        maxPlayers: r.maxPlayers,
        createdAt: new Date(r.createdAt).toISOString(),
      })),
      total: rooms.length,
    };
  });

  // Create room
  app.post<{
    Body: {
      game: GameType;
      name: string;
      visibility: RoomVisibility;
      maxPlayers: number;
    };
  }>('/rooms', async (request, reply) => {
    const auth = request.headers.authorization;
    if (!auth?.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'AUTH_REQUIRED' });
    }

    const payload = verifyToken(auth.slice(7));
    if (!payload) {
      return reply.status(401).send({ error: 'AUTH_FAILED' });
    }

    let session = app.sessionStore.get(payload.sub);
    if (!session) {
      // Session lost after server restart — recreate from valid JWT claims
      const now = Date.now();
      app.sessionStore.create({
        sessionId: payload.sub,
        username: payload.username,
        createdAt: now,
        lastSeenAt: now,
      });
      session = app.sessionStore.get(payload.sub)!;
    }

    const { game, name, visibility, maxPlayers } = request.body ?? {};

    const VALID_GAMES = ['wordle', 'scribble', 'typerush', 'pulsegrid', 'neondrift', 'voidfall', 'syncshot', 'glitcharena', 'orbitbrawl'];
    if (!game || !VALID_GAMES.includes(game)) {
      return reply.status(400).send({ error: 'INVALID_INPUT', message: 'Invalid game type' });
    }

    const nameValidation = validateRoomName(name || 'Unnamed Room');
    if (!nameValidation.ok) {
      return reply.status(400).send({ error: 'INVALID_INPUT', message: nameValidation.error });
    }

    const room = app.roomStore.create({
      game: game as GameType,
      name: (name || 'Unnamed Room').trim(),
      visibility: visibility || 'public',
      maxPlayers: Math.min(Math.max(maxPlayers || 4, 2), 8),
      hostSessionId: payload.sub,
      hostUsername: session.username,
    });

    return reply.status(201).send({
      id: room.id,
      code: room.code,
      game: room.game,
      name: room.name,
      visibility: room.visibility,
      maxPlayers: room.maxPlayers,
    });
  });

  // Join room by code
  app.post<{ Body: { code: string } }>('/rooms/join', async (request, reply) => {
    const auth = request.headers.authorization;
    if (!auth?.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'AUTH_REQUIRED' });
    }
    const payload = verifyToken(auth.slice(7));
    if (!payload) {
      return reply.status(401).send({ error: 'AUTH_FAILED' });
    }

    const { code } = request.body ?? {};
    if (!code || typeof code !== 'string' || code.trim().length === 0) {
      return reply.status(400).send({ error: 'INVALID_INPUT', message: 'Room code is required' });
    }

    const room = app.roomStore.getByCode(code.trim().toUpperCase());
    if (!room) {
      return reply.status(404).send({ error: 'ROOM_NOT_FOUND', message: 'No room with that code' });
    }
    if (room.status === 'in_progress') {
      return reply.status(409).send({ error: 'ROOM_IN_PROGRESS', message: 'Game already started' });
    }
    if (room.players.length >= room.maxPlayers) {
      return reply.status(409).send({ error: 'ROOM_FULL', message: 'Room is full' });
    }

    return reply.send({
      room: {
        id: room.id,
        game: room.game,
        code: room.code,
        status: room.status,
        visibility: room.visibility,
        players: room.players.length,
        maxPlayers: room.maxPlayers,
      },
    });
  });

  // Get room by ID
  app.get<{ Params: { id: string } }>('/rooms/:id', async (request, reply) => {
    const room = app.roomStore.get(request.params.id);
    if (!room) {
      return reply.status(404).send({ error: 'ROOM_NOT_FOUND' });
    }
    return {
      id: room.id,
      game: room.game,
      status: room.status,
      players: room.players.map((p) => ({
        sessionId: p.sessionId,
        username: p.username,
        isHost: p.isHost,
      })),
      code: room.code,
      maxPlayers: room.maxPlayers,
    };
  });
}
