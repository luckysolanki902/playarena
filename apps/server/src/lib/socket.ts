import type { Server as SocketIOServer } from 'socket.io';
import { verifyToken } from './auth';
import type { SessionStore } from './sessionStore';
import type { RoomStore } from './roomStore';
import { sanitizeText, validateChatMessage } from '@playarena/shared';
import type { DrawPoint, Direction } from '@playarena/shared';
import { WordleEngine } from '../engine/wordle';
import { ScribbleEngine } from '../engine/scribble';
import { TypeRushEngine } from '../engine/typerush';
import { PulseGridEngine } from '../engine/pulsegrid';
import { NeonDriftEngine } from '../engine/neondrift';
import { VoidfallEngine } from '../engine/voidfall';
import { SyncShotEngine } from '../engine/syncshot';
import { GlitchArenaEngine } from '../engine/glitcharena';
import { OrbitBrawlEngine } from '../engine/orbitbrawl';

const wordleEngine = new WordleEngine();
const scribbleEngine = new ScribbleEngine();
const typeRushEngine = new TypeRushEngine();
const pulseGridEngine = new PulseGridEngine();
const neonDriftEngine = new NeonDriftEngine();
const voidfallEngine = new VoidfallEngine();
const syncShotEngine = new SyncShotEngine();
const glitchArenaEngine = new GlitchArenaEngine();
const orbitBrawlEngine = new OrbitBrawlEngine();

// Timer references per room (game timers)
const roomTimers = new Map<string, ReturnType<typeof setTimeout>>();
// Auto-start timers for public/quick-match rooms
const autoStartTimers = new Map<string, { timer: ReturnType<typeof setTimeout>; countdown: ReturnType<typeof setInterval> }>();

const AUTO_START_DELAY = 15; // seconds

function clearRoomTimer(roomId: string) {
  const t = roomTimers.get(roomId);
  if (t) { clearTimeout(t); roomTimers.delete(roomId); }
}

function clearAutoStartTimer(roomId: string) {
  const ast = autoStartTimers.get(roomId);
  if (ast) {
    clearTimeout(ast.timer);
    clearInterval(ast.countdown);
    autoStartTimers.delete(roomId);
  }
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

// ─── TypeRush helpers ───

function startTypeRushRound(io: SocketIOServer, roomId: string, roomStore: RoomStore) {
  const room = roomStore.get(roomId);
  if (!room) return;

  const players = room.players.map((p) => ({ sessionId: p.sessionId, username: p.username }));
  const roundData = typeRushEngine.startRound(roomId, players);
  
  if (!roundData) {
    // Game over
    const finalRankings = typeRushEngine.getFinalRankings(roomId);
    io.to(roomId).emit('typerush:game-end', { finalRankings });
    roomStore.setStatus(roomId, 'finished');
    typeRushEngine.removeGame(roomId);
    return;
  }

  io.to(roomId).emit('typerush:round-start', {
    round: roundData.round,
    totalRounds: roundData.totalRounds,
    text: roundData.text,
    words: roundData.words,
  });
}

function handleTypeRushRoundEnd(io: SocketIOServer, roomId: string, roomStore: RoomStore) {
  const result = typeRushEngine.endRound(roomId);
  if (!result) return;

  io.to(roomId).emit('typerush:round-end', {
    rankings: result.rankings,
    nextRoundIn: result.isGameOver ? 0 : 5,
  });

  if (result.isGameOver) {
    const finalRankings = typeRushEngine.getFinalRankings(roomId);
    io.to(roomId).emit('typerush:game-end', { finalRankings });
    roomStore.setStatus(roomId, 'finished');
    typeRushEngine.removeGame(roomId);
  } else {
    setTimeout(() => startTypeRushRound(io, roomId, roomStore), 5000);
  }
}

// ─── PulseGrid helpers ───

function startPulseGridRound(io: SocketIOServer, roomId: string, roomStore: RoomStore) {
  const room = roomStore.get(roomId);
  if (!room) return;

  const players = room.players.map((p) => ({ sessionId: p.sessionId, username: p.username }));
  const roundData = pulseGridEngine.startRound(roomId, players);
  
  if (!roundData) {
    // Game over
    const finalRankings = pulseGridEngine.getFinalRankings(roomId);
    io.to(roomId).emit('pulsegrid:game-end', { finalRankings });
    roomStore.setStatus(roomId, 'finished');
    pulseGridEngine.removeGame(roomId);
    return;
  }

  io.to(roomId).emit('pulsegrid:round-start', {
    round: roundData.round,
    totalRounds: roundData.totalRounds,
    gridSize: roundData.gridSize,
    grid: roundData.grid,
    players: roundData.players,
    duration: roundData.duration,
  });

  // Start round timer
  const timer = setTimeout(() => {
    handlePulseGridRoundEnd(io, roomId, roomStore);
  }, roundData.duration * 1000);
  roomTimers.set(roomId, timer);
}

function handlePulseGridRoundEnd(io: SocketIOServer, roomId: string, roomStore: RoomStore) {
  clearRoomTimer(roomId);
  const result = pulseGridEngine.endRound(roomId);
  if (!result) return;

  io.to(roomId).emit('pulsegrid:round-end', {
    rankings: result.rankings,
    nextRoundIn: result.isGameOver ? 0 : 5,
  });

  if (result.isGameOver) {
    const finalRankings = pulseGridEngine.getFinalRankings(roomId);
    io.to(roomId).emit('pulsegrid:game-end', { finalRankings });
    roomStore.setStatus(roomId, 'finished');
    pulseGridEngine.removeGame(roomId);
  } else {
    setTimeout(() => startPulseGridRound(io, roomId, roomStore), 5000);
  }
}

// ─── NeonDrift helpers ───

function startNeonDriftRound(io: SocketIOServer, roomId: string, roomStore: RoomStore) {
  const room = roomStore.get(roomId);
  if (!room) return;

  const players = room.players.map((p) => ({ sessionId: p.sessionId, username: p.username }));
  const roundData = neonDriftEngine.startRound(roomId, players);
  
  if (!roundData) {
    // Game over
    const finalRankings = neonDriftEngine.getFinalRankings(roomId);
    io.to(roomId).emit('neondrift:game-end', { finalRankings });
    roomStore.setStatus(roomId, 'finished');
    neonDriftEngine.removeGame(roomId);
    return;
  }

  io.to(roomId).emit('neondrift:round-start', {
    round: roundData.round,
    totalRounds: roundData.totalRounds,
    gridWidth: roundData.gridWidth,
    gridHeight: roundData.gridHeight,
    players: roundData.players,
    tickRate: roundData.tickRate,
    countdownSeconds: roundData.countdownSeconds,
  });

  // Round countdown before starting
  let countdown = 3;
  const countdownInterval = setInterval(() => {
    countdown--;
    if (countdown > 0) {
      io.to(roomId).emit('neondrift:countdown', { seconds: countdown });
    } else {
      clearInterval(countdownInterval);
      neonDriftEngine.markRoundActive(roomId);
      io.to(roomId).emit('neondrift:go', {});
      // Start game tick
      neonDriftEngine.startTick(roomId, () => {
        const tickResult = neonDriftEngine.tick(roomId);
        if (!tickResult) return;

        io.to(roomId).emit('neondrift:tick', {
          players: tickResult.players,
          tick: tickResult.tick,
        });

        // Notify crashes
        for (const crash of tickResult.crashed) {
          const game = neonDriftEngine.getGame(roomId);
          const player = game?.currentRound?.players[crash.sessionId];
          io.to(roomId).emit('neondrift:player-crashed', {
            sessionId: crash.sessionId,
            username: player?.username ?? 'Unknown',
            position: crash.position,
          });
        }

        if (tickResult.roundOver) {
          handleNeonDriftRoundEnd(io, roomId, roomStore);
        }
      });
    }
  }, 1000);
}

function handleNeonDriftRoundEnd(io: SocketIOServer, roomId: string, roomStore: RoomStore) {
  neonDriftEngine.stopTick(roomId);
  const result = neonDriftEngine.endRound(roomId);
  if (!result) return;

  io.to(roomId).emit('neondrift:round-end', {
    rankings: result.rankings,
    nextRoundIn: result.isGameOver ? 0 : 5,
  });

  if (result.isGameOver) {
    const finalRankings = neonDriftEngine.getFinalRankings(roomId);
    io.to(roomId).emit('neondrift:game-end', { finalRankings });
    roomStore.setStatus(roomId, 'finished');
    neonDriftEngine.removeGame(roomId);
  } else {
    setTimeout(() => startNeonDriftRound(io, roomId, roomStore), 5000);
  }
}

// ─── Voidfall helpers ───

function startVoidfallRound(io: SocketIOServer, roomId: string, roomStore: RoomStore) {
  const room = roomStore.get(roomId);
  if (!room) return;

  const players = room.players.map((p) => ({ sessionId: p.sessionId, username: p.username }));
  const roundData = voidfallEngine.startRound(roomId, players);
  
  if (!roundData) {
    // Game over
    const finalRankings = voidfallEngine.getFinalRankings(roomId);
    io.to(roomId).emit('voidfall:game-end', { finalRankings });
    roomStore.setStatus(roomId, 'finished');
    voidfallEngine.removeGame(roomId);
    return;
  }

  io.to(roomId).emit('voidfall:round-start', {
    round: roundData.round,
    totalRounds: roundData.totalRounds,
    arenaWidth: roundData.arenaWidth,
    arenaHeight: roundData.arenaHeight,
    players: roundData.players,
    safeZone: roundData.safeZone,
    tickRate: roundData.tickRate,
    countdownSeconds: roundData.countdownSeconds,
  });

  // Round countdown before starting
  let countdown = 3;
  const countdownInterval = setInterval(() => {
    countdown--;
    if (countdown > 0) {
      io.to(roomId).emit('voidfall:countdown', { seconds: countdown });
    } else {
      clearInterval(countdownInterval);
      voidfallEngine.markRoundActive(roomId);
      io.to(roomId).emit('voidfall:go', {});
      // Start game tick
      voidfallEngine.startTick(roomId, () => {
        const tickResult = voidfallEngine.tick(roomId);
        if (!tickResult) return;

        io.to(roomId).emit('voidfall:tick', {
          players: tickResult.players,
          safeZone: tickResult.safeZone,
          tick: tickResult.tick,
        });

        // Notify zone shrinking
        if (tickResult.startShrinking) {
          io.to(roomId).emit('voidfall:zone-shrinking', {
            newTargetRadius: tickResult.safeZone.targetRadius,
            duration: 15,
          });
        }

        // Notify eliminations
        for (const elim of tickResult.eliminated) {
          const game = voidfallEngine.getGame(roomId);
          const player = game?.currentRound?.players[elim.sessionId];
          io.to(roomId).emit('voidfall:player-eliminated', {
            sessionId: elim.sessionId,
            username: player?.username ?? 'Unknown',
            position: elim.position,
          });
        }

        if (tickResult.roundOver) {
          handleVoidfallRoundEnd(io, roomId, roomStore);
        }
      });
    }
  }, 1000);
}

function handleVoidfallRoundEnd(io: SocketIOServer, roomId: string, roomStore: RoomStore) {
  voidfallEngine.stopTick(roomId);
  const result = voidfallEngine.endRound(roomId);
  if (!result) return;

  io.to(roomId).emit('voidfall:round-end', {
    rankings: result.rankings,
    nextRoundIn: result.isGameOver ? 0 : 5,
  });

  if (result.isGameOver) {
    const finalRankings = voidfallEngine.getFinalRankings(roomId);
    io.to(roomId).emit('voidfall:game-end', { finalRankings });
    roomStore.setStatus(roomId, 'finished');
    voidfallEngine.removeGame(roomId);
  } else {
    setTimeout(() => startVoidfallRound(io, roomId, roomStore), 5000);
  }
}

// ─── SyncShot helpers ───

function startSyncShotRound(io: SocketIOServer, roomId: string, roomStore: RoomStore) {
  const room = roomStore.get(roomId);
  if (!room) return;

  const players = room.players.map((p) => ({ oddsId: p.sessionId, oddsName: p.username }));
  const roundData = syncShotEngine.startRound(roomId);
  
  if (!roundData) {
    // Game over
    const finalRankings = syncShotEngine.getFinalRankings(roomId);
    io.to(roomId).emit('syncshot:game-end', { finalRankings });
    roomStore.setStatus(roomId, 'finished');
    syncShotEngine.cleanup(roomId);
    return;
  }

  const game = syncShotEngine.getGameState(roomId);
  if (!game) return;

  io.to(roomId).emit('syncshot:round-start', {
    roundNumber: game.currentRound,
    players: roundData.players,
    settings: game.settings,
  });

  // Countdown before starting
  let countdown = 3;
  const countdownInterval = setInterval(() => {
    countdown--;
    io.to(roomId).emit('game:countdown', { count: countdown });
    if (countdown <= 0) {
      clearInterval(countdownInterval);
      syncShotEngine.markRoundActive(roomId);
      
      // Start tick loop
      syncShotEngine.startTick(roomId, (state) => {
        io.to(roomId).emit('syncshot:tick', {
          players: state.players,
          activeTarget: state.activeTarget,
          targetsHit: state.targetsHit,
          targetsSpawned: state.targetsSpawned,
        });
      });

      // Start spawning targets
      syncShotEngine.startSpawning(
        roomId,
        (target) => {
          io.to(roomId).emit('syncshot:target-spawn', { target });
        },
        () => {
          handleSyncShotRoundEnd(io, roomId, roomStore);
        }
      );
    }
  }, 1000);
}

function handleSyncShotRoundEnd(io: SocketIOServer, roomId: string, roomStore: RoomStore) {
  syncShotEngine.stopTick(roomId);
  syncShotEngine.stopSpawning(roomId);
  const result = syncShotEngine.endRound(roomId);
  if (!result) return;

  const isGameOver = syncShotEngine.isGameOver(roomId);
  const finalResults = isGameOver ? syncShotEngine.getFinalRankings(roomId) : undefined;

  io.to(roomId).emit('syncshot:round-end', {
    roundNumber: syncShotEngine.getGameState(roomId)?.currentRound ?? 0,
    results: result,
    isGameOver,
    finalResults,
  });

  if (isGameOver) {
    roomStore.setStatus(roomId, 'finished');
    syncShotEngine.cleanup(roomId);
  } else {
    setTimeout(() => startSyncShotRound(io, roomId, roomStore), 5000);
  }
}

// ─── GlitchArena helpers ───

function startGlitchArenaRound(io: SocketIOServer, roomId: string, roomStore: RoomStore) {
  const room = roomStore.get(roomId);
  if (!room) return;

  const roundData = glitchArenaEngine.startRound(roomId);
  
  if (!roundData) {
    // Game over
    const finalRankings = glitchArenaEngine.getFinalRankings(roomId);
    io.to(roomId).emit('glitcharena:game-end', { finalRankings });
    roomStore.setStatus(roomId, 'finished');
    glitchArenaEngine.cleanup(roomId);
    return;
  }

  const game = glitchArenaEngine.getGameState(roomId);
  if (!game) return;

  io.to(roomId).emit('glitcharena:round-start', {
    roundNumber: game.currentRound,
    players: roundData.players,
    settings: game.settings,
    roundDuration: game.settings.roundDuration,
  });

  // Countdown before starting
  let countdown = 3;
  const countdownInterval = setInterval(() => {
    countdown--;
    io.to(roomId).emit('game:countdown', { count: countdown });
    if (countdown <= 0) {
      clearInterval(countdownInterval);
      glitchArenaEngine.markRoundActive(roomId);
      
      // Start tick loop
      glitchArenaEngine.startTick(roomId, (result) => {
        if (!result) return;

        io.to(roomId).emit('glitcharena:tick', {
          players: result.state.players,
          buttons: result.state.buttons,
          activeEffects: result.state.activeEffects,
          timeRemaining: result.timeRemaining,
        });

        // Notify expired buttons
        for (const buttonId of result.expiredButtons) {
          io.to(roomId).emit('glitcharena:button-expired', { buttonId });
        }

        // Notify glitch effects
        if (result.randomGlitch) {
          io.to(roomId).emit('glitcharena:glitch', { effect: result.randomGlitch });
        }

        if (result.roundOver) {
          handleGlitchArenaRoundEnd(io, roomId, roomStore);
        }
      });

      // Start spawning buttons
      glitchArenaEngine.startSpawning(roomId, (button) => {
        io.to(roomId).emit('glitcharena:button-spawn', { button });
      });
    }
  }, 1000);
}

function handleGlitchArenaRoundEnd(io: SocketIOServer, roomId: string, roomStore: RoomStore) {
  glitchArenaEngine.stopTick(roomId);
  glitchArenaEngine.stopSpawning(roomId);
  const result = glitchArenaEngine.endRound(roomId);
  if (!result) return;

  const isGameOver = glitchArenaEngine.isGameOver(roomId);
  const finalResults = isGameOver ? glitchArenaEngine.getFinalRankings(roomId) : undefined;

  io.to(roomId).emit('glitcharena:round-end', {
    roundNumber: glitchArenaEngine.getGameState(roomId)?.currentRound ?? 0,
    results: result,
    isGameOver,
    finalResults,
  });

  if (isGameOver) {
    roomStore.setStatus(roomId, 'finished');
    glitchArenaEngine.cleanup(roomId);
  } else {
    setTimeout(() => startGlitchArenaRound(io, roomId, roomStore), 5000);
  }
}

// ─── OrbitBrawl helpers ───

function startOrbitBrawlRound(io: SocketIOServer, roomId: string, roomStore: RoomStore) {
  const room = roomStore.get(roomId);
  if (!room) return;

  const roundData = orbitBrawlEngine.startRound(roomId);
  
  if (!roundData) {
    // Game over
    const finalRankings = orbitBrawlEngine.getFinalRankings(roomId);
    io.to(roomId).emit('orbitbrawl:game-end', { finalRankings });
    roomStore.setStatus(roomId, 'finished');
    orbitBrawlEngine.cleanup(roomId);
    return;
  }

  const game = orbitBrawlEngine.getGameState(roomId);
  if (!game) return;

  io.to(roomId).emit('orbitbrawl:round-start', {
    roundNumber: game.currentRound,
    players: roundData.players,
    settings: game.settings,
  });

  // Countdown before starting
  let countdown = 3;
  const countdownInterval = setInterval(() => {
    countdown--;
    io.to(roomId).emit('game:countdown', { count: countdown });
    if (countdown <= 0) {
      clearInterval(countdownInterval);
      orbitBrawlEngine.markRoundActive(roomId);
      
      // Start tick loop
      orbitBrawlEngine.startTick(roomId, (result) => {
        if (!result) return;

        io.to(roomId).emit('orbitbrawl:tick', {
          players: result.state.players,
        });

        // Notify eliminations
        for (const elim of result.eliminated) {
          io.to(roomId).emit('orbitbrawl:player-eliminated', {
            playerId: elim.playerId,
            eliminatedBy: elim.eliminatedBy,
            position: elim.position,
          });
        }

        if (result.roundOver) {
          handleOrbitBrawlRoundEnd(io, roomId, roomStore);
        }
      });
    }
  }, 1000);
}

function handleOrbitBrawlRoundEnd(io: SocketIOServer, roomId: string, roomStore: RoomStore) {
  orbitBrawlEngine.stopTick(roomId);
  const result = orbitBrawlEngine.endRound(roomId);
  if (!result) return;

  const isGameOver = orbitBrawlEngine.isGameOver(roomId);
  const finalResults = isGameOver ? orbitBrawlEngine.getFinalRankings(roomId) : undefined;

  io.to(roomId).emit('orbitbrawl:round-end', {
    roundNumber: orbitBrawlEngine.getGameState(roomId)?.currentRound ?? 0,
    rankings: result,
    isGameOver,
    finalResults,
  });

  if (isGameOver) {
    roomStore.setStatus(roomId, 'finished');
    orbitBrawlEngine.cleanup(roomId);
  } else {
    setTimeout(() => startOrbitBrawlRound(io, roomId, roomStore), 5000);
  }
}

/** Shared game-start logic used by both manual start and auto-start */
function doStartGame(io: SocketIOServer, roomId: string, roomStore: RoomStore) {
  const room = roomStore.get(roomId);
  if (!room || room.status !== 'waiting') return;
  if (room.players.length < 2) return;

  clearAutoStartTimer(roomId);

  const players = room.players.map((p) => ({ sessionId: p.sessionId, username: p.username }));
  roomStore.setStatus(roomId, 'starting');
  io.to(roomId).emit('lobby:game-starting', { countdown: 3 });

  if (room.game === 'wordle') {
    wordleEngine.createGame(roomId, players);
    setTimeout(() => {
      roomStore.setStatus(roomId, 'in_progress');
      startNextRound(io, roomId, roomStore);
    }, 3000);
  } else if (room.game === 'scribble') {
    scribbleEngine.createGame(roomId, players);
    setTimeout(() => {
      roomStore.setStatus(roomId, 'in_progress');
      startScribbleRound(io, roomId, roomStore);
    }, 3000);
  } else if (room.game === 'typerush') {
    typeRushEngine.createGame(roomId, players);
    setTimeout(() => {
      roomStore.setStatus(roomId, 'in_progress');
      startTypeRushRound(io, roomId, roomStore);
    }, 3000);
  } else if (room.game === 'pulsegrid') {
    pulseGridEngine.createGame(roomId, players);
    setTimeout(() => {
      roomStore.setStatus(roomId, 'in_progress');
      startPulseGridRound(io, roomId, roomStore);
    }, 3000);
  } else if (room.game === 'neondrift') {
    neonDriftEngine.createGame(roomId, players);
    setTimeout(() => {
      roomStore.setStatus(roomId, 'in_progress');
      startNeonDriftRound(io, roomId, roomStore);
    }, 3000);
  } else if (room.game === 'voidfall') {
    voidfallEngine.createGame(roomId, players);
    setTimeout(() => {
      roomStore.setStatus(roomId, 'in_progress');
      startVoidfallRound(io, roomId, roomStore);
    }, 3000);
  } else if (room.game === 'syncshot') {
    syncShotEngine.createGame(roomId, players.map(p => ({ oddsId: p.sessionId, oddsName: p.username })));
    setTimeout(() => {
      roomStore.setStatus(roomId, 'in_progress');
      startSyncShotRound(io, roomId, roomStore);
    }, 3000);
  } else if (room.game === 'glitcharena') {
    glitchArenaEngine.createGame(roomId, players.map(p => ({ oddsId: p.sessionId, oddsName: p.username })));
    setTimeout(() => {
      roomStore.setStatus(roomId, 'in_progress');
      startGlitchArenaRound(io, roomId, roomStore);
    }, 3000);
  } else if (room.game === 'orbitbrawl') {
    orbitBrawlEngine.createGame(roomId, players.map(p => ({ oddsId: p.sessionId, oddsName: p.username })));
    setTimeout(() => {
      roomStore.setStatus(roomId, 'in_progress');
      startOrbitBrawlRound(io, roomId, roomStore);
    }, 3000);
  }
}

/** Start auto-start countdown for public rooms when 2+ players */
function maybeStartAutoStart(io: SocketIOServer, roomId: string, roomStore: RoomStore) {
  const room = roomStore.get(roomId);
  if (!room) return;
  if (room.visibility !== 'public') return; // Only public/quick-match rooms
  if (room.status !== 'waiting') return;
  if (room.players.length < 2) return;
  // Already running?
  if (autoStartTimers.has(roomId)) return;

  let secondsLeft = AUTO_START_DELAY;
  io.to(roomId).emit('lobby:auto-start', { secondsLeft });

  const countdown = setInterval(() => {
    secondsLeft--;
    if (secondsLeft > 0) {
      io.to(roomId).emit('lobby:auto-start', { secondsLeft });
    }
  }, 1000);

  const timer = setTimeout(() => {
    clearAutoStartTimer(roomId);
    doStartGame(io, roomId, roomStore);
  }, AUTO_START_DELAY * 1000);

  autoStartTimers.set(roomId, { timer, countdown });
}

/** Cancel auto-start if players drop below 2 in public room */
function maybeCancelAutoStart(io: SocketIOServer, roomId: string, roomStore: RoomStore) {
  const room = roomStore.get(roomId);
  if (!room) return;
  if (!autoStartTimers.has(roomId)) return;
  if (room.players.length < 2) {
    clearAutoStartTimer(roomId);
    io.to(roomId).emit('lobby:auto-start-cancelled');
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

      // For public rooms, start auto-start countdown when 2+ players
      maybeStartAutoStart(io, room.id, roomStore);
    });

    socket.on('lobby:leave-room', (data: { roomId: string }) => {
      roomStore.removePlayer(data.roomId, sessionId);
      socket.leave(data.roomId);
      socket.data.currentRoomId = undefined;
      socket.to(data.roomId).emit('lobby:player-left', { sessionId, username });
      const updated = roomStore.get(data.roomId);
      if (updated) {
        socket.to(data.roomId).emit('lobby:room-updated', { room: updated });
        // Cancel auto-start if players drop below 2
        maybeCancelAutoStart(io, data.roomId, roomStore);
      }
    });

    socket.on('lobby:start-game', (data: { roomId: string }) => {
      const room = roomStore.get(data.roomId);
      if (!room) return;
      // Only allow manual start for private rooms
      if (room.visibility === 'public') {
        socket.emit('lobby:error', { code: 'AUTO_START', message: 'Public rooms start automatically' });
        return;
      }
      if (room.hostSessionId !== sessionId) {
        socket.emit('lobby:error', { code: 'NOT_HOST', message: 'Only the host can start' });
        return;
      }
      if (room.players.length < 2) {
        socket.emit('lobby:error', { code: 'INVALID_INPUT', message: 'Need at least 2 players to start' });
        return;
      }

      doStartGame(io, data.roomId, roomStore);
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

    // ─── TypeRush Game Events ───

    socket.on('typerush:progress', (data: { roomId: string; charsTyped: number; errors: number; currentWord: number }) => {
      const result = typeRushEngine.updateProgress(data.roomId, sessionId, data.charsTyped, data.errors, data.currentWord);
      if (!result) return;

      // Broadcast progress to all players
      io.to(data.roomId).emit('typerush:player-progress', {
        sessionId,
        progress: result.progress,
        wpm: result.wpm,
        charsTyped: data.charsTyped,
      });

      // Notify about glitch effects
      if (result.speedBoost) {
        io.to(data.roomId).emit('typerush:speed-boost', { sessionId, bonus: result.speedBoost });
      }
      if (result.trapPenalty) {
        io.to(data.roomId).emit('typerush:trap-triggered', { sessionId, penalty: result.trapPenalty });
      }
    });

    socket.on('typerush:finished', (data: { roomId: string; totalTime: number; errors: number }) => {
      const result = typeRushEngine.playerFinished(data.roomId, sessionId, data.totalTime, data.errors);
      if (!result) return;

      io.to(data.roomId).emit('typerush:player-finished', {
        sessionId,
        username,
        position: result.position,
        wpm: result.wpm,
        accuracy: result.accuracy,
        time: result.time,
      });

      // Check if round is complete
      if (typeRushEngine.isRoundComplete(data.roomId)) {
        handleTypeRushRoundEnd(io, data.roomId, roomStore);
      }
    });

    // ─── PulseGrid Game Events ───

    socket.on('pulsegrid:pulse', (data: { roomId: string; x: number; y: number; overcharge?: boolean }) => {
      const result = pulseGridEngine.pulse(data.roomId, sessionId, data.x, data.y, data.overcharge ?? false);
      if (!result) {
        socket.emit('pulsegrid:error', { code: 'INVALID', message: 'Invalid pulse' });
        return;
      }
      
      if (result.cooldownError) {
        socket.emit('pulsegrid:error', { code: 'COOLDOWN', message: 'Pulse on cooldown' });
        return;
      }

      // Broadcast pulse result to all players
      io.to(data.roomId).emit('pulsegrid:pulse-result', {
        sessionId,
        x: data.x,
        y: data.y,
        radius: result.radius,
        capturedCells: result.capturedCells,
        overcharge: data.overcharge ?? false,
      });

      // Send updated scores
      const scores = pulseGridEngine.getScores(data.roomId);
      if (scores) {
        io.to(data.roomId).emit('pulsegrid:score-update', { scores });
      }
    });

    // ─── NeonDrift Game Events ───

    socket.on('neondrift:turn', (data: { roomId: string; direction: Direction }) => {
      neonDriftEngine.turn(data.roomId, sessionId, data.direction);
    });

    // ─── Voidfall Game Events ───

    socket.on('voidfall:move', (data: { roomId: string; direction: { x: number; y: number } }) => {
      voidfallEngine.setPlayerDirection(data.roomId, sessionId, data.direction);
    });

    socket.on('voidfall:stop', (data: { roomId: string }) => {
      voidfallEngine.stopPlayer(data.roomId, sessionId);
    });

    // ─── SyncShot Game Events ───

    socket.on('syncshot:move', (data: { roomId: string; position: { x: number; y: number } }) => {
      syncShotEngine.updateCursorPosition(data.roomId, sessionId, data.position);
    });

    socket.on('syncshot:shoot', (data: { roomId: string; position: { x: number; y: number } }) => {
      const result = syncShotEngine.shoot(data.roomId, sessionId, data.position);
      if (!result) return;

      if (result.hit && result.target) {
        io.to(data.roomId).emit('syncshot:target-hit', {
          targetId: result.target.id,
          hitBy: sessionId,
          hitTime: result.target.hitTime,
          points: result.points ?? 0,
          speedBonus: result.speedBonus ?? 0,
        });
      } else {
        socket.emit('syncshot:miss', { playerId: sessionId, position: data.position });
      }
    });

    // ─── GlitchArena Game Events ───

    socket.on('glitcharena:click', (data: { roomId: string; buttonId: string }) => {
      const result = glitchArenaEngine.clickButton(data.roomId, sessionId, data.buttonId);
      if (!result) return;

      if (result.hit && result.button) {
        io.to(data.roomId).emit('glitcharena:button-hit', {
          buttonId: result.button.id,
          hitBy: sessionId,
          points: result.points ?? 0,
          comboBonus: result.comboBonus ?? 0,
          newCombo: result.newCombo ?? 0,
        });

        // Broadcast glitch effect if triggered
        if (result.glitchEffect) {
          io.to(data.roomId).emit('glitcharena:glitch', { effect: result.glitchEffect });
        }
      }
    });

    socket.on('glitcharena:move', (data: { roomId: string; position: { x: number; y: number } }) => {
      glitchArenaEngine.updateCursorPosition(data.roomId, sessionId, data.position);
    });

    // ─── OrbitBrawl Game Events ───

    socket.on('orbitbrawl:start-charge', (data: { roomId: string; chargeType: 'push' | 'pull' }) => {
      orbitBrawlEngine.startCharge(data.roomId, sessionId, data.chargeType);
    });

    socket.on('orbitbrawl:release-charge', (data: { roomId: string }) => {
      // Get chargeType before it's reset
      const round = orbitBrawlEngine.getRoundState(data.roomId);
      const player = round?.players[sessionId];
      const chargeType = player?.chargeType;
      
      const result = orbitBrawlEngine.releaseCharge(data.roomId, sessionId);
      if (result && player && chargeType) {
        io.to(data.roomId).emit('orbitbrawl:force-used', {
          playerId: sessionId,
          position: player.position,
          chargeType,
          power: result.power,
          radius: result.radius,
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
