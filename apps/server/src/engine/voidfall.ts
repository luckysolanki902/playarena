import type {
  VoidfallPosition,
  VoidfallPlayer,
  VoidfallGameState,
  VoidfallRoundState,
  VoidfallSettings,
  SafeZone,
} from '@playarena/shared';

const COLORS = [
  '#818cf8', // indigo
  '#f472b6', // pink
  '#4ade80', // green
  '#facc15', // yellow
  '#22d3ee', // cyan
  '#fb923c', // orange
];

const DEFAULT_SETTINGS: VoidfallSettings = {
  arenaWidth: 600,
  arenaHeight: 400,
  playerSpeed: 4,
  tickRate: 50, // 50ms per tick = 20 fps
  initialZoneRadius: 280,
  finalZoneRadius: 30,
  shrinkDelay: 60,      // 3 seconds before shrinking
  shrinkDuration: 300,  // 15 seconds to shrink
  roundCount: 3,
};

// Check if a point is inside a circle
function isInsideZone(x: number, y: number, zone: SafeZone): boolean {
  const dx = x - zone.centerX;
  const dy = y - zone.centerY;
  return Math.sqrt(dx * dx + dy * dy) <= zone.radius;
}

// Clamp position to arena bounds
function clampPosition(pos: VoidfallPosition, width: number, height: number): VoidfallPosition {
  return {
    x: Math.max(15, Math.min(width - 15, pos.x)),
    y: Math.max(15, Math.min(height - 15, pos.y)),
  };
}

export class VoidfallEngine {
  private games = new Map<string, VoidfallGameState>();
  private tickIntervals = new Map<string, ReturnType<typeof setInterval>>();
  private playerDirections = new Map<string, Map<string, VoidfallPosition>>(); // roomId -> sessionId -> direction

  createGame(
    roomId: string,
    players: Array<{ sessionId: string; username: string }>,
    settings?: Partial<VoidfallSettings>
  ): VoidfallGameState {
    const merged: VoidfallSettings = { ...DEFAULT_SETTINGS, ...settings };
    const state: VoidfallGameState = {
      status: 'active',
      currentRound: null,
      roundHistory: [],
      settings: merged,
    };
    this.games.set(roomId, state);
    this.playerDirections.set(roomId, new Map());
    return state;
  }

  getGame(roomId: string): VoidfallGameState | undefined {
    return this.games.get(roomId);
  }

  removeGame(roomId: string): void {
    this.stopTick(roomId);
    this.games.delete(roomId);
    this.playerDirections.delete(roomId);
  }

  startRound(
    roomId: string,
    players: Array<{ sessionId: string; username: string }>,
  ): {
    round: number;
    totalRounds: number;
    arenaWidth: number;
    arenaHeight: number;
    players: Record<string, { sessionId: string; username: string; color: string; position: VoidfallPosition }>;
    safeZone: SafeZone;
    tickRate: number;
    countdownSeconds: number;
  } | null {
    const game = this.games.get(roomId);
    if (!game) return null;

    const roundNum = game.roundHistory.length + 1;
    if (roundNum > game.settings.roundCount) return null;

    const { arenaWidth, arenaHeight, initialZoneRadius, finalZoneRadius, shrinkDuration } = game.settings;
    
    // Spawn players randomly within the initial safe zone
    const spawnPositions = this.getSpawnPositions(players.length, arenaWidth, arenaHeight, initialZoneRadius * 0.6);
    
    const playerStates: Record<string, VoidfallPlayer> = {};
    const playerInfo: Record<string, { sessionId: string; username: string; color: string; position: VoidfallPosition }> = {};
    
    // Clear directions
    this.playerDirections.set(roomId, new Map());

    players.forEach((p, i) => {
      const pos = spawnPositions[i];
      const color = COLORS[i % COLORS.length];
      
      playerStates[p.sessionId] = {
        sessionId: p.sessionId,
        username: p.username,
        color,
        position: { ...pos },
        velocity: { x: 0, y: 0 },
        alive: true,
        score: 0,
      };
      
      playerInfo[p.sessionId] = {
        sessionId: p.sessionId,
        username: p.username,
        color,
        position: pos,
      };
      
      this.playerDirections.get(roomId)!.set(p.sessionId, { x: 0, y: 0 });
    });

    const safeZone: SafeZone = {
      centerX: arenaWidth / 2,
      centerY: arenaHeight / 2,
      radius: initialZoneRadius,
      targetRadius: initialZoneRadius,
      shrinkRate: (initialZoneRadius - finalZoneRadius) / shrinkDuration,
    };

    game.currentRound = {
      round: roundNum,
      totalRounds: game.settings.roundCount,
      arenaWidth,
      arenaHeight,
      players: playerStates,
      safeZone,
      status: 'countdown',
      startedAt: Date.now(),
      tickCount: 0,
      tickRate: game.settings.tickRate,
    };

    return {
      round: roundNum,
      totalRounds: game.settings.roundCount,
      arenaWidth,
      arenaHeight,
      players: playerInfo,
      safeZone,
      tickRate: game.settings.tickRate,
      countdownSeconds: 3,
    };
  }

  private getSpawnPositions(playerCount: number, width: number, height: number, radius: number): VoidfallPosition[] {
    const centerX = width / 2;
    const centerY = height / 2;
    const positions: VoidfallPosition[] = [];
    
    for (let i = 0; i < playerCount; i++) {
      const angle = (i / playerCount) * Math.PI * 2;
      positions.push({
        x: centerX + Math.cos(angle) * radius * 0.7,
        y: centerY + Math.sin(angle) * radius * 0.7,
      });
    }
    
    return positions;
  }

  markRoundActive(roomId: string): void {
    const game = this.games.get(roomId);
    if (game?.currentRound) {
      game.currentRound.status = 'active';
    }
  }

  setPlayerDirection(roomId: string, sessionId: string, direction: VoidfallPosition): void {
    const directions = this.playerDirections.get(roomId);
    if (directions) {
      // Normalize direction
      const len = Math.sqrt(direction.x * direction.x + direction.y * direction.y);
      if (len > 0) {
        directions.set(sessionId, { x: direction.x / len, y: direction.y / len });
      } else {
        directions.set(sessionId, { x: 0, y: 0 });
      }
    }
  }

  stopPlayer(roomId: string, sessionId: string): void {
    const directions = this.playerDirections.get(roomId);
    if (directions) {
      directions.set(sessionId, { x: 0, y: 0 });
    }
  }

  /**
   * Process one game tick. Returns state updates and elimination info.
   */
  tick(roomId: string): {
    players: Record<string, { position: VoidfallPosition; alive: boolean }>;
    safeZone: SafeZone;
    eliminated: Array<{ sessionId: string; position: number }>;
    roundOver: boolean;
    startShrinking: boolean;
    tick: number;
  } | null {
    const game = this.games.get(roomId);
    if (!game?.currentRound || game.currentRound.status === 'finished') return null;

    const round = game.currentRound;
    const settings = game.settings;
    round.tickCount++;

    // Start shrinking after delay
    let startShrinking = false;
    if (round.status === 'active' && round.tickCount >= settings.shrinkDelay) {
      round.status = 'shrinking';
      round.safeZone.targetRadius = settings.finalZoneRadius;
      startShrinking = true;
    }

    // Shrink the zone
    if (round.status === 'shrinking' && round.safeZone.radius > round.safeZone.targetRadius) {
      round.safeZone.radius = Math.max(
        round.safeZone.targetRadius,
        round.safeZone.radius - round.safeZone.shrinkRate
      );
    }

    const directions = this.playerDirections.get(roomId)!;
    const eliminated: Array<{ sessionId: string; position: number }> = [];

    // Move players
    for (const player of Object.values(round.players) as VoidfallPlayer[]) {
      if (!player.alive) continue;

      const dir = directions.get(player.sessionId) || { x: 0, y: 0 };
      
      // Update position
      player.position.x += dir.x * settings.playerSpeed;
      player.position.y += dir.y * settings.playerSpeed;
      
      // Clamp to arena bounds
      player.position = clampPosition(player.position, round.arenaWidth, round.arenaHeight);

      // Check if outside safe zone
      if (!isInsideZone(player.position.x, player.position.y, round.safeZone)) {
        player.alive = false;
        const aliveCount = Object.values(round.players).filter(p => p.alive).length;
        eliminated.push({ sessionId: player.sessionId, position: aliveCount + 1 });
      }
    }

    // Check if round is over (0 or 1 player remaining)
    const aliveCount = Object.values(round.players).filter(p => p.alive).length;
    const roundOver = aliveCount <= 1;

    // Build player states for emit
    const playerStates: Record<string, { position: VoidfallPosition; alive: boolean }> = {};
    for (const [sid, player] of Object.entries(round.players) as [string, VoidfallPlayer][]) {
      playerStates[sid] = {
        position: player.position,
        alive: player.alive,
      };
    }

    return {
      players: playerStates,
      safeZone: round.safeZone,
      eliminated,
      roundOver,
      startShrinking,
      tick: round.tickCount,
    };
  }

  startTick(roomId: string, onTick: () => void): void {
    const game = this.games.get(roomId);
    if (!game?.currentRound) return;

    const interval = setInterval(onTick, game.currentRound.tickRate);
    this.tickIntervals.set(roomId, interval);
  }

  stopTick(roomId: string): void {
    const interval = this.tickIntervals.get(roomId);
    if (interval) {
      clearInterval(interval);
      this.tickIntervals.delete(roomId);
    }
  }

  endRound(roomId: string): {
    rankings: Array<{ sessionId: string; username: string; position: number; score: number }>;
    isGameOver: boolean;
  } | null {
    const game = this.games.get(roomId);
    if (!game?.currentRound) return null;

    this.stopTick(roomId);
    game.currentRound.status = 'finished';

    const players = Object.values(game.currentRound.players) as VoidfallPlayer[];
    
    // Winner is the last one alive
    const alivePlayers = players.filter(p => p.alive);
    
    const rankings: Array<{ sessionId: string; username: string; position: number; score: number }> = [];
    
    if (alivePlayers.length === 1) {
      rankings.push({
        sessionId: alivePlayers[0].sessionId,
        username: alivePlayers[0].username,
        position: 1,
        score: 100,
      });
    }

    // For eliminated players, rank by survival time (those eliminated later score better)
    // We don't have exact elimination order stored, so use simple position assignment
    const eliminatedPlayers = players.filter(p => !p.alive);
    let pos = alivePlayers.length === 1 ? 2 : 1;
    
    for (const p of eliminatedPlayers) {
      rankings.push({
        sessionId: p.sessionId,
        username: p.username,
        position: pos,
        score: Math.max(10, 100 - (pos - 1) * 25),
      });
      pos++;
    }

    // If no one alive, everyone gets their position
    if (alivePlayers.length === 0) {
      rankings.forEach((r, i) => {
        r.position = i + 1;
      });
    }

    game.roundHistory.push({
      round: game.currentRound.round,
      rankings: rankings.map(r => ({
        sessionId: r.sessionId,
        username: r.username,
        position: r.position,
        score: r.score,
      })),
    });

    const isGameOver = game.roundHistory.length >= game.settings.roundCount;
    if (isGameOver) {
      game.status = 'finished';
    }

    return { rankings, isGameOver };
  }

  getFinalRankings(roomId: string): Array<{
    sessionId: string;
    username: string;
    totalScore: number;
    wins: number;
  }> | null {
    const game = this.games.get(roomId);
    if (!game) return null;

    const totals = new Map<string, { username: string; totalScore: number; wins: number }>();

    for (const round of game.roundHistory) {
      for (const r of round.rankings) {
        const existing = totals.get(r.sessionId) || { username: r.username, totalScore: 0, wins: 0 };
        existing.totalScore += r.score;
        if (r.position === 1) existing.wins++;
        totals.set(r.sessionId, existing);
      }
    }

    return Array.from(totals.entries())
      .map(([sessionId, data]) => ({
        sessionId,
        username: data.username,
        totalScore: data.totalScore,
        wins: data.wins,
      }))
      .sort((a, b) => b.totalScore - a.totalScore);
  }
}
