import type { Server as SocketIOServer } from 'socket.io';
import { verifyToken } from './auth';
import type { SessionStore } from './sessionStore';
import type { RoomStore } from './roomStore';
import { sanitizeText, validateChatMessage } from '@playarena/shared';
import type { DrawPoint } from '@playarena/shared';
import { WordleEngine } from '../engine/wordle';
import { ScribbleEngine } from '../engine/scribble';

const wordleEngine = new WordleEngine();
const scribbleEngine = new ScribbleEngine();

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

// ─── Scribble helpers ───

const CHOOSE_TIMEOUT_MS = 12_000; // 12s to pick a word before auto-choosing

function startScribbleRound(io: SocketIOServer, roomId: string, roomStore: RoomStore) {
  const roundMeta = scribbleEngine.startRound(roomId);
  if (!roundMeta) {
    // Game over
    const finalRankings = scribbleEngine.getFinalRankings(roomId);
    io.to(roomId).emit('scribble:game-end', { finalRankings });
    roomStore.setStatus(roomId, 'finished');
    scribbleEngine.removeGame(roomId);
    return;
  }

  // Send round-start to all — non-drawers see word length only
  io.to(roomId).emit('scribble:round-start', {
    round: roundMeta.round,
    totalRounds: roundMeta.totalRounds,
    drawerId: roundMeta.drawerId,
    drawerUsername: roundMeta.drawerUsername,
  });

  // Send word choices only to the drawer socket
  io.to(roomId).emit('scribble:word-choices', {
    drawerId: roundMeta.drawerId,
    words: roundMeta.wordChoices,
  });

  // Auto-choose if drawer doesn't pick within CHOOSE_TIMEOUT_MS
  const game = scribbleEngine.getGame(roomId);
  if (game) {
    game.chooseTimer = setTimeout(() => {
      const result = scribbleEngine.autoChooseWord(
        roomId,
        (pattern) => io.to(roomId).emit('scribble:hint', { pattern }),
        () => handleScribbleRoundEnd(io, roomId, roomStore),
      );
      if (!result) return;
      const word = scribbleEngine.getGame(roomId)?.currentRound?.word ?? '';
      // Tell drawer their word was auto-chosen
      io.to(roomId).emit('scribble:word-chosen', { wordLength: result.wordLength, hintPattern: result.hintPattern, isDrawer: false });
      io.to(roomId).emit('scribble:drawing-started', { timeLimit: result.timeLimit, wordLength: result.wordLength, hintPattern: result.hintPattern });
      // Drawer special emit done via game:word-chosen with word field
      io.to(roomId).emit('scribble:drawer-word', { drawerId: game.drawerOrder[game.drawerIndex], word });
    }, CHOOSE_TIMEOUT_MS);
  }
}

function handleScribbleRoundEnd(io: SocketIOServer, roomId: string, roomStore: RoomStore) {
  const result = scribbleEngine.endRound(roomId);
  if (!result) return;

  io.to(roomId).emit('scribble:round-end', {
    word: result.word,
    rankings: result.rankings,
    nextRoundIn: result.isGameOver ? 0 : 5,
  });

  if (result.isGameOver) {
    const finalRankings = scribbleEngine.getFinalRankings(roomId);
    io.to(roomId).emit('scribble:game-end', { finalRankings });
    roomStore.setStatus(roomId, 'finished');
    scribbleEngine.removeGame(roomId);
  } else {
    setTimeout(() => startScribbleRound(io, roomId, roomStore), 5000);
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
    if (!sessionStore.get(payload.sub)) {
      // Session lost after server restart — recreate from valid JWT claims
      const now = Date.now();
      sessionStore.create({
        sessionId: payload.sub,
        username: payload.username,
        createdAt: now,
        lastSeenAt: now,
      });
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

      // Player might already be in the room (e.g., host who created it via REST)
      const alreadyInRoom = room.players.some((p) => p.sessionId === sessionId);

      if (!alreadyInRoom) {
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

        socket.to(room.id).emit('lobby:player-joined', { player: { sessionId, username, isHost: false, joinedAt: Date.now() } });
        socket.to(room.id).emit('lobby:room-updated', { room: roomStore.get(room.id) });
      }

      socket.join(room.id);
      socket.data.currentRoomId = room.id;
      socket.emit('lobby:room-joined', { room: roomStore.get(room.id) });
    });

    socket.on('lobby:leave-room', (data: { roomId: string }) => {
      roomStore.removePlayer(data.roomId, sessionId);
      socket.leave(data.roomId);
      socket.data.currentRoomId = undefined;
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
      if (room.players.length < 2) {
        socket.emit('lobby:error', { code: 'INVALID_INPUT', message: 'Need at least 2 players to start' });
        return;
      }

      const players = room.players.map((p) => ({ sessionId: p.sessionId, username: p.username }));
      roomStore.setStatus(data.roomId, 'starting');
      io.to(data.roomId).emit('lobby:game-starting', { countdown: 3 });

      if (room.game === 'wordle') {
        wordleEngine.createGame(data.roomId, players);
        setTimeout(() => {
          roomStore.setStatus(data.roomId, 'in_progress');
          startNextRound(io, data.roomId, roomStore);
        }, 3000);
      } else if (room.game === 'scribble') {
        scribbleEngine.createGame(data.roomId, players);
        setTimeout(() => {
          roomStore.setStatus(data.roomId, 'in_progress');
          startScribbleRound(io, data.roomId, roomStore);
        }, 3000);
      }
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

    // ─── Scribble Game Events ───

    socket.on('scribble:choose-word', (data: { roomId: string; word: string }) => {
      const result = scribbleEngine.chooseWord(
        data.roomId,
        sessionId,
        data.word,
        (pattern) => {
          io.to(data.roomId).emit('scribble:hint', { pattern });
        },
        () => {
          handleScribbleRoundEnd(io, data.roomId, roomStore);
        },
      );
      if (!result) return;
      // Tell drawer their own word, tell guessers the pattern only
      socket.emit('scribble:word-chosen', { word: data.word === '__auto__' ? scribbleEngine.getGame(data.roomId)?.currentRound?.word : data.word, isDrawer: true });
      socket.to(data.roomId).emit('scribble:word-chosen', {
        wordLength: result.wordLength,
        hintPattern: result.hintPattern,
        isDrawer: false,
      });
      io.to(data.roomId).emit('scribble:drawing-started', {
        timeLimit: result.timeLimit,
        wordLength: result.wordLength,
        hintPattern: result.hintPattern,
      });
    });

    socket.on('scribble:draw', (data: { roomId: string; points: DrawPoint[] }) => {
      const game = scribbleEngine.getGame(data.roomId);
      if (!game?.currentRound || game.currentRound.drawerId !== sessionId) return;
      for (const pt of data.points) scribbleEngine.recordDrawPoint(data.roomId, sessionId, pt);
      socket.to(data.roomId).emit('scribble:draw', { points: data.points });
    });

    socket.on('scribble:clear-canvas', (data: { roomId: string }) => {
      const cleared = scribbleEngine.clearCanvas(data.roomId, sessionId);
      if (cleared) io.to(data.roomId).emit('scribble:clear-canvas');
    });

    socket.on('scribble:guess', (data: { roomId: string; text: string }) => {
      if (!data.text?.trim()) return;
      const game = scribbleEngine.getGame(data.roomId);
      if (!game) return;

      const result = scribbleEngine.submitGuess(data.roomId, sessionId, data.text);

      if (!result) {
        // Broadcast as chat message if not in drawing phase or player is drawer
        const validation = validateChatMessage(data.text);
        if (!validation.ok) return;
        io.to(data.roomId).emit('scribble:chat', {
          sessionId, username,
          text: sanitizeText(data.text.trim()),
          timestamp: Date.now(),
          type: 'chat',
        });
        return;
      }

      if (result.correct) {
        // Tell guesser their score, tell everyone else who guessed correctly
        socket.emit('scribble:correct-guess', { points: result.points, totalScore: scribbleEngine.getGame(data.roomId)?.players.get(sessionId)?.score ?? 0 });
        io.to(data.roomId).emit('scribble:player-guessed', {
          sessionId, username, points: result.points, guessedCount: result.guessedCount,
        });
        if (result.allGuessed) handleScribbleRoundEnd(io, data.roomId, roomStore);
      } else if (result.close) {
        socket.emit('scribble:close-guess', { text: data.text });
        // Show as garbled in chat for others (don't reveal the attempt)
        io.to(data.roomId).emit('scribble:chat', {
          sessionId, username,
          text: '🤏 ...',
          timestamp: Date.now(),
          type: 'close',
        });
      } else {
        // Broadcast guess as chat
        const validation = validateChatMessage(data.text);
        if (!validation.ok) return;
        io.to(data.roomId).emit('scribble:chat', {
          sessionId, username,
          text: sanitizeText(data.text.trim()),
          timestamp: Date.now(),
          type: 'chat',
        });
      }
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
      // Remove player from their room on disconnect and notify others
      const currentRoomId = socket.data.currentRoomId as string | undefined;
      if (currentRoomId) {
        roomStore.removePlayer(currentRoomId, sessionId);
        socket.to(currentRoomId).emit('lobby:player-left', { sessionId, username });
        const updated = roomStore.get(currentRoomId);
        if (updated) {
          socket.to(currentRoomId).emit('lobby:room-updated', { room: updated });
        }
      }
    });
  });
}
