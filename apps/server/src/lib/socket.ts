import type { Server as SocketIOServer } from 'socket.io';
import { verifyToken } from './auth';
import type { SessionStore } from './sessionStore';
import type { RoomStore } from './roomStore';
import { sanitizeText, validateChatMessage } from '@playarena/shared';
import { WordleEngine } from '../engine/wordle';

const wordleEngine = new WordleEngine();

// Timer references per room
const roomTimers = new Map<string, ReturnType<typeof setTimeout>>();

function clearRoomTimer(roomId: string) {
  const t = roomTimers.get(roomId);
  if (t) { clearTimeout(t); roomTimers.delete(roomId); }
}

function handleRoundEnd(io: SocketIOServer, roomId: string, roomStore: RoomStore) {
  clearRoomTimer(roomId);
  const result = wordleEngine.endRound(roomId);
  if (!result) return;

  const game = wordleEngine.getGame(roomId);
  if (!game) return;

  if (game.status === 'finished') {
    // All rounds done — send final rankings
    const finalRankings = wordleEngine.getFinalRankings(roomId) ?? [];
    io.to(roomId).emit('wordle:round-end', {
      word: result.word,
      rankings: result.rankings,
      nextRoundIn: 0,
    });
    io.to(roomId).emit('wordle:game-end', { finalRankings });
    roomStore.setStatus(roomId, 'finished');
    wordleEngine.removeGame(roomId);
  } else {
    // Next round in 5 seconds
    io.to(roomId).emit('wordle:round-end', {
      word: result.word,
      rankings: result.rankings,
      nextRoundIn: 5,
    });
    setTimeout(() => {
      startNextRound(io, roomId, roomStore);
    }, 5000);
  }
}

function startNextRound(io: SocketIOServer, roomId: string, roomStore: RoomStore) {
  const room = roomStore.get(roomId);
  if (!room) return;

  const players = room.players.map((p) => ({ sessionId: p.sessionId, username: p.username }));
  const round = wordleEngine.startRound(roomId, players);
  if (!round) return;

  io.to(roomId).emit('wordle:round-start', {
    round: round.round,
    totalRounds: round.totalRounds,
    timeLimit: round.timeLimit,
    wordLength: round.wordLength,
  });

  // Set round timer
  if (round.timeLimit > 0) {
    const timer = setTimeout(() => {
      handleRoundEnd(io, roomId, roomStore);
    }, round.timeLimit * 1000);
    roomTimers.set(roomId, timer);
  }
}

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
      socket.emit('lobby:room-joined', { room: roomStore.get(room.id) });
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

      // Create engine game state
      const players = room.players.map((p) => ({ sessionId: p.sessionId, username: p.username }));
      wordleEngine.createGame(data.roomId, players);

      roomStore.setStatus(data.roomId, 'starting');
      io.to(data.roomId).emit('lobby:game-starting', { countdown: 3 });

      setTimeout(() => {
        roomStore.setStatus(data.roomId, 'in_progress');
        startNextRound(io, data.roomId, roomStore);
      }, 3000);
    });

    // ─── Wordle Game Events ───

    socket.on('wordle:guess', (data: { roomId: string; word: string }) => {
      const result = wordleEngine.submitGuess(data.roomId, sessionId, data.word);

      if (!result.ok) {
        socket.emit('wordle:error', { code: result.error ?? 'UNKNOWN', message: result.error ?? 'Unknown error' });
        return;
      }

      // Send feedback to the guessing player
      socket.emit('wordle:guess-result', {
        word: data.word.toLowerCase(),
        feedback: result.feedback!,
        attempt: result.attempt!,
      });

      // Broadcast opponent progress (feedback only, no letters)
      socket.to(data.roomId).emit('wordle:opponent-guess', {
        sessionId,
        attempt: result.attempt!,
        feedback: result.feedback!,
      });

      // If player solved, notify everyone
      if (result.solved) {
        const game = wordleEngine.getGame(data.roomId);
        const playerState = game?.currentRound?.players[sessionId];
        io.to(data.roomId).emit('wordle:player-solved', {
          sessionId,
          username,
          attempt: result.attempt!,
          timeTaken: playerState?.solvedTime ?? 0,
        });
      }

      // Check if round is complete (all solved or maxed out)
      if (wordleEngine.isRoundComplete(data.roomId)) {
        handleRoundEnd(io, data.roomId, roomStore);
      }
    });

    socket.on('wordle:request-hint', (data: { roomId: string }) => {
      const result = wordleEngine.useHint(data.roomId, sessionId);
      if (!result.ok) {
        socket.emit('wordle:error', { code: result.error ?? 'UNKNOWN', message: result.error ?? '' });
        return;
      }
      socket.emit('wordle:hint', {
        suggestions: result.suggestions ?? [],
        reasoning: result.reasoning ?? '',
        penalty: result.penalty ?? 0,
      });
    });

    socket.on('wordle:typing', (data: { roomId: string; isTyping: boolean }) => {
      socket.to(data.roomId).emit('wordle:typing', { sessionId, isTyping: data.isTyping });
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
