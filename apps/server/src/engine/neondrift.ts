import type {
  Direction,
  Position,
  NeonDriftPlayer,
  NeonDriftGameState,
  NeonDriftRoundState,
  NeonDriftSettings,
} from '@playarena/shared';

const COLORS = [
  '#f472b6', // pink
  '#4ade80', // green
  '#60a5fa', // blue
  '#facc15', // yellow
  '#a78bfa', // purple
  '#fb923c', // orange
];

const DEFAULT_SETTINGS: NeonDriftSettings = {
  gridWidth: 80,
  gridHeight: 50,
  tickRate: 80, // 80ms per tick = 12.5 fps
  roundCount: 3,
  speedBoostEnabled: false,
};

// Direction to velocity
function getVelocity(dir: Direction): Position {
  switch (dir) {
    case 'up': return { x: 0, y: -1 };
    case 'down': return { x: 0, y: 1 };
    case 'left': return { x: -1, y: 0 };
    case 'right': return { x: 1, y: 0 };
  }
}

// Check if turning is valid (can't reverse directly)
function isValidTurn(current: Direction, next: Direction): boolean {
  if (current === 'up' && next === 'down') return false;
  if (current === 'down' && next === 'up') return false;
  if (current === 'left' && next === 'right') return false;
  if (current === 'right' && next === 'left') return false;
  return true;
}

export class NeonDriftEngine {
  private games = new Map<string, NeonDriftGameState>();
  private tickIntervals = new Map<string, ReturnType<typeof setInterval>>();
  private occupiedCells = new Map<string, Set<string>>(); // roomId -> Set of "x,y" strings for collision

  createGame(
    roomId: string,
    players: Array<{ sessionId: string; username: string }>,
    settings?: Partial<NeonDriftSettings>
  ): NeonDriftGameState {
    const merged: NeonDriftSettings = { ...DEFAULT_SETTINGS, ...settings };
    const state: NeonDriftGameState = {
      status: 'active',
      currentRound: null,
      roundHistory: [],
      settings: merged,
    };
    this.games.set(roomId, state);
    return state;
  }

  getGame(roomId: string): NeonDriftGameState | undefined {
    return this.games.get(roomId);
  }

  removeGame(roomId: string): void {
    this.stopTick(roomId);
    this.games.delete(roomId);
    this.occupiedCells.delete(roomId);
  }

  startRound(
    roomId: string,
    players: Array<{ sessionId: string; username: string }>,
  ): {
    round: number;
    totalRounds: number;
    gridWidth: number;
    gridHeight: number;
    players: Record<string, { sessionId: string; username: string; color: string; position: Position; direction: Direction }>;
    tickRate: number;
    countdownSeconds: number;
  } | null {
    const game = this.games.get(roomId);
    if (!game) return null;

    const roundNum = game.roundHistory.length + 1;
    if (roundNum > game.settings.roundCount) return null;

    const { gridWidth, gridHeight } = game.settings;
    
    // Spawn players at different corners/edges
    const spawnPositions = this.getSpawnPositions(players.length, gridWidth, gridHeight);
    const spawnDirections: Direction[] = ['right', 'left', 'down', 'up', 'right', 'left'];
    
    const playerStates: Record<string, NeonDriftPlayer> = {};
    const playerInfo: Record<string, { sessionId: string; username: string; color: string; position: Position; direction: Direction }> = {};

    // Initialize occupied cells for this room
    this.occupiedCells.set(roomId, new Set<string>());

    players.forEach((p, i) => {
      const pos = spawnPositions[i];
      const dir = spawnDirections[i % spawnDirections.length];
      const color = COLORS[i % COLORS.length];
      
      playerStates[p.sessionId] = {
        sessionId: p.sessionId,
        username: p.username,
        color,
        position: { ...pos },
        direction: dir,
        trail: [{ ...pos }], // Start with initial position in trail
        alive: true,
        score: 0,
      };
      
      playerInfo[p.sessionId] = {
        sessionId: p.sessionId,
        username: p.username,
        color,
        position: pos,
        direction: dir,
      };
      
      // Mark starting position as occupied
      this.occupiedCells.get(roomId)!.add(`${pos.x},${pos.y}`);
    });

    game.currentRound = {
      round: roundNum,
      totalRounds: game.settings.roundCount,
      gridWidth,
      gridHeight,
      players: playerStates,
      status: 'countdown',
      startedAt: Date.now(),
      tickRate: game.settings.tickRate,
    };

    return {
      round: roundNum,
      totalRounds: game.settings.roundCount,
      gridWidth,
      gridHeight,
      players: playerInfo,
      tickRate: game.settings.tickRate,
      countdownSeconds: 3,
    };
  }

  private getSpawnPositions(playerCount: number, width: number, height: number): Position[] {
    const margin = 5;
    const positions: Position[] = [
      { x: margin, y: Math.floor(height / 2) },                  // Left middle
      { x: width - margin - 1, y: Math.floor(height / 2) },      // Right middle
      { x: Math.floor(width / 2), y: margin },                   // Top middle
      { x: Math.floor(width / 2), y: height - margin - 1 },      // Bottom middle
      { x: margin, y: margin },                                   // Top-left
      { x: width - margin - 1, y: height - margin - 1 },         // Bottom-right
    ];
    return positions.slice(0, playerCount);
  }

  markRoundActive(roomId: string): void {
    const game = this.games.get(roomId);
    if (game?.currentRound) {
      game.currentRound.status = 'active';
    }
  }

  turn(roomId: string, sessionId: string, direction: Direction): boolean {
    const game = this.games.get(roomId);
    if (!game?.currentRound || game.currentRound.status !== 'active') return false;

    const player = game.currentRound.players[sessionId];
    if (!player || !player.alive) return false;

    if (!isValidTurn(player.direction, direction)) return false;

    player.direction = direction;
    return true;
  }

  /**
   * Process one game tick. Returns state updates and crash info.
   */
  tick(roomId: string): {
    players: Record<string, { position: Position; direction: Direction; alive: boolean; trailTip: Position }>;
    crashed: Array<{ sessionId: string; position: number }>;
    roundOver: boolean;
    tick: number;
  } | null {
    const game = this.games.get(roomId);
    if (!game?.currentRound || game.currentRound.status !== 'active') return null;

    const round = game.currentRound;
    const occupied = this.occupiedCells.get(roomId)!;
    
    const alivePlayers = Object.values(round.players).filter(p => p.alive) as NeonDriftPlayer[];
    if (alivePlayers.length <= 1) {
      return { 
        players: this.getPlayerStates(round), 
        crashed: [], 
        roundOver: true,
        tick: 0,
      };
    }

    const crashed: Array<{ sessionId: string; position: number }> = [];
    const newPositions: Map<string, Position> = new Map();

    // Calculate new positions for all alive players
    for (const player of alivePlayers) {
      const vel = getVelocity(player.direction);
      const newPos: Position = {
        x: player.position.x + vel.x,
        y: player.position.y + vel.y,
      };
      newPositions.set(player.sessionId, newPos);
    }

    // Check for collisions
    for (const player of alivePlayers) {
      const newPos = newPositions.get(player.sessionId)!;
      
      // Wall collision
      if (newPos.x < 0 || newPos.x >= round.gridWidth || newPos.y < 0 || newPos.y >= round.gridHeight) {
        player.alive = false;
        const aliveCount = Object.values(round.players).filter(p => p.alive).length;
        crashed.push({ sessionId: player.sessionId, position: aliveCount + 1 });
        continue;
      }

      // Trail collision (including other players' new positions)
      const posKey = `${newPos.x},${newPos.y}`;
      if (occupied.has(posKey)) {
        player.alive = false;
        const aliveCount = Object.values(round.players).filter(p => p.alive).length;
        crashed.push({ sessionId: player.sessionId, position: aliveCount + 1 });
        continue;
      }

      // Head-to-head collision (two players moving to same cell)
      for (const [otherId, otherPos] of newPositions) {
        if (otherId !== player.sessionId && otherPos.x === newPos.x && otherPos.y === newPos.y) {
          player.alive = false;
          const aliveCount = Object.values(round.players).filter(p => p.alive).length;
          crashed.push({ sessionId: player.sessionId, position: aliveCount + 1 });
          break;
        }
      }
    }

    // Update positions and trails for surviving players
    for (const player of Object.values(round.players) as NeonDriftPlayer[]) {
      if (!player.alive) continue;
      
      const newPos = newPositions.get(player.sessionId)!;
      player.position = newPos;
      player.trail.push({ ...newPos });
      occupied.add(`${newPos.x},${newPos.y}`);
    }

    // Check if round is over (0 or 1 player remaining)
    const aliveCount = Object.values(round.players).filter(p => p.alive).length;
    const roundOver = aliveCount <= 1;

    return {
      players: this.getPlayerStates(round),
      crashed,
      roundOver,
      tick: round.players[Object.keys(round.players)[0]]?.trail.length ?? 0,
    };
  }

  private getPlayerStates(round: NeonDriftRoundState): Record<string, { position: Position; direction: Direction; alive: boolean; trailTip: Position }> {
    const states: Record<string, { position: Position; direction: Direction; alive: boolean; trailTip: Position }> = {};
    for (const [sid, player] of Object.entries(round.players) as [string, NeonDriftPlayer][]) {
      states[sid] = {
        position: player.position,
        direction: player.direction,
        alive: player.alive,
        trailTip: player.trail[player.trail.length - 1] || player.position,
      };
    }
    return states;
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

    const players = Object.values(game.currentRound.players) as NeonDriftPlayer[];
    
    // Winner is the last one alive (or first if all crashed at same time)
    const alivePlayers = players.filter(p => p.alive);
    
    // Build rankings - alive player is 1st, rest based on when they crashed
    const rankings: Array<{ sessionId: string; username: string; position: number; score: number }> = [];
    
    if (alivePlayers.length === 1) {
      rankings.push({
        sessionId: alivePlayers[0].sessionId,
        username: alivePlayers[0].username,
        position: 1,
        score: 100, // Winner gets 100 points
      });
    }

    // For crashed players, position based on trail length (longer trail = survived longer = better)
    const crashedPlayers = players.filter(p => !p.alive).sort((a, b) => b.trail.length - a.trail.length);
    let pos = alivePlayers.length === 1 ? 2 : 1;
    
    for (const p of crashedPlayers) {
      rankings.push({
        sessionId: p.sessionId,
        username: p.username,
        position: pos,
        score: Math.max(10, 100 - (pos - 1) * 25), // 100, 75, 50, 25, 10
      });
      pos++;
    }

    // If no one alive (all crashed), everyone gets their position
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

  getAliveCount(roomId: string): number {
    const game = this.games.get(roomId);
    if (!game?.currentRound) return 0;
    return Object.values(game.currentRound.players).filter(p => p.alive).length;
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
