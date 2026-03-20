import type { Server as SocketIOServer } from 'socket.io';
import { verifyToken } from './auth';
import type { SessionStore } from './sessionStore';
import type { RoomStore } from './roomStore';
import { sanitizeText, validateChatMessage } from '@playarena/shared';

export function setupSocketIO(
  io: SocketIOServer,
  sessionStore: SessionStore,
  roomStore: RoomStore,
): void {
  // Auth middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token || typeof token !== 'string') {
      return next(new Error('AUTH_REQUIRED'));
    }
    const payload = verifyToken(token);
    if (!payload) {
      return next(new Error('AUTH_FAILED'));
    }
    const session = sessionStore.get(payload.sub);
    if (!session) {
      return next(new Error('AUTH_FAILED'));
    }
    // Attach session info to socket
    socket.data.sessionId = payload.sub;
    socket.data.username = payload.username;
    sessionStore.touch(payload.sub);
    next();
  });

  io.on('connection', (socket) => {
    const { sessionId, username } = socket.data;
    socket.emit('connected', { sessionId, username });

    // ─── Lobby Events ───

    socket.on('lobby:join-room', (data: { roomId?: string; code?: string }) => {
      let room;
      if (data.roomId) {
        room = roomStore.get(data.roomId);
      } else if (data.code) {
        room = roomStore.getByCode(data.code);
      }

      if (!room) {
        socket.emit('lobby:error', { code: 'ROOM_NOT_FOUND', message: 'Room not found' });
        return;
      }
      if (room.status !== 'waiting') {
        socket.emit('lobby:error', { code: 'ROOM_IN_PROGRESS', message: 'Game already started' });
        return;
      }
      if (room.players.length >= room.maxPlayers) {
        socket.emit('lobby:error', { code: 'ROOM_FULL', message: 'Room is full' });
        return;
      }

      const added = roomStore.addPlayer(room.id, {
        sessionId,
        username,
        isHost: false,
        joinedAt: Date.now(),
      });

      if (!added) {
        socket.emit('lobby:error', { code: 'ROOM_FULL', message: 'Could not join room' });
        return;
      }

      socket.join(room.id);
      socket.emit('lobby:room-joined', { room });
      socket.to(room.id).emit('lobby:player-joined', { player: { sessionId, username, isHost: false, joinedAt: Date.now() } });
      socket.to(room.id).emit('lobby:room-updated', { room: roomStore.get(room.id) });
    });

    socket.on('lobby:leave-room', (data: { roomId: string }) => {
      roomStore.removePlayer(data.roomId, sessionId);
      socket.leave(data.roomId);
      socket.to(data.roomId).emit('lobby:player-left', { sessionId, username });
      const updated = roomStore.get(data.roomId);
      if (updated) {
        socket.to(data.roomId).emit('lobby:room-updated', { room: updated });
      }
    });

    socket.on('lobby:start-game', (data: { roomId: string }) => {
      const room = roomStore.get(data.roomId);
      if (!room) return;
      if (room.hostSessionId !== sessionId) {
        socket.emit('lobby:error', { code: 'NOT_HOST', message: 'Only the host can start' });
        return;
      }
      if (room.players.length < 1) {
        socket.emit('lobby:error', { code: 'INVALID_INPUT', message: 'Need at least 1 player' });
        return;
      }

      roomStore.setStatus(data.roomId, 'starting');
      io.to(data.roomId).emit('lobby:game-starting', { countdown: 3 });

      setTimeout(() => {
        roomStore.setStatus(data.roomId, 'in_progress');
        // Game-specific start logic dispatched here
        if (room.game === 'wordle') {
          io.to(data.roomId).emit('wordle:round-start', {
            round: 1,
            totalRounds: 3,
            timeLimit: 120,
            wordLength: 5,
          });
        }
      }, 3000);
    });

    // ─── Chat Events ───

    socket.on('chat:message', (data: { roomId: string; text: string }) => {
      const validation = validateChatMessage(data.text);
      if (!validation.ok) return;

      const sanitized = sanitizeText(data.text.trim());
      io.to(data.roomId).emit('chat:message', {
        sessionId,
        username,
        text: sanitized,
        timestamp: Date.now(),
      });
    });

    socket.on('chat:reaction', (data: { roomId: string; emoji: string }) => {
      // Only allow a small set of emojis
      const allowed = ['👏', '🔥', '😂', '💀', '❤️', '😮', '🎉', '👀'];
      if (!allowed.includes(data.emoji)) return;
      io.to(data.roomId).emit('chat:reaction', { sessionId, username, emoji: data.emoji });
    });

    // ─── Disconnect ───

    socket.on('disconnect', () => {
      sessionStore.touch(sessionId);
    });
  });
}
