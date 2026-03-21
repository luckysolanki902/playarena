import type {
  PulseGridCell,
  PulseGridGameState,
  PulseGridRoundState,
  PulseGridPlayerState,
  PulseGridSettings,
} from '@playarena/shared';

const COLORS = [
  '#4ecdc4', // teal
  '#ff6b9d', // pink
  '#a78bfa', // purple
  '#ffd166', // yellow
  '#34d399', // green
  '#fb923c', // orange
];

const DEFAULT_SETTINGS: PulseGridSettings = {
  gridSize: 10,
  roundDuration: 60, // 60 seconds per round
  pulseCooldown: 500, // 500ms between pulses
  pulseRadius: 1, // adjacent cells only
  overchargeEnabled: true,
};

// ─── Scoring ───

function computeCellScore(cellCount: number): number {
  // 10 points per cell owned at end of round
  return cellCount * 10;
}

function computePositionBonus(position: number): number {
  if (position === 1) return 200;
  if (position === 2) return 100;
  if (position === 3) return 50;
  return 0;
}

// ─── Grid Generation ───

function createEmptyGrid(size: number): PulseGridCell[][] {
  const grid: PulseGridCell[][] = [];
  for (let y = 0; y < size; y++) {
    const row: PulseGridCell[] = [];
    for (let x = 0; x < size; x++) {
      // Place some neutral cells randomly
      const isNeutral = Math.random() < 0.15;
      row.push({
        x,
        y,
        owner: isNeutral ? 'neutral' : 'empty',
        strength: isNeutral ? 2 : 0,
      });
    }
    grid.push(row);
  }
  return grid;
}

function getAdjacentCells(x: number, y: number, radius: number, gridSize: number): Array<{ x: number; y: number }> {
  const cells: Array<{ x: number; y: number }> = [];
  
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx === 0 && dy === 0) continue; // skip center
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && nx < gridSize && ny >= 0 && ny < gridSize) {
        // For radius > 1, use manhattan distance
        const dist = Math.abs(dx) + Math.abs(dy);
        if (dist <= radius) {
          cells.push({ x: nx, y: ny });
        }
      }
    }
  }
  
  return cells;
}

// ─── Game State Manager ───

export class PulseGridEngine {
  private games = new Map<string, PulseGridGameState>();
  private roundTimers = new Map<string, ReturnType<typeof setTimeout>>();

  createGame(
    roomId: string,
    players: Array<{ sessionId: string; username: string }>,
    settings?: Partial<PulseGridSettings>
  ): PulseGridGameState {
    const merged: PulseGridSettings = { ...DEFAULT_SETTINGS, ...settings };
    const state: PulseGridGameState = {
      status: 'active',
      currentRound: null,
      roundHistory: [],
      settings: merged,
    };
    this.games.set(roomId, state);
    return state;
  }

  getGame(roomId: string): PulseGridGameState | undefined {
    return this.games.get(roomId);
  }

  removeGame(roomId: string): void {
    this.games.delete(roomId);
    const timer = this.roundTimers.get(roomId);
    if (timer) {
      clearTimeout(timer);
      this.roundTimers.delete(roomId);
    }
  }

  startRound(
    roomId: string,
    players: Array<{ sessionId: string; username: string }>,
  ): {
    round: number;
    totalRounds: number;
    gridSize: number;
    grid: PulseGridCell[][];
    players: Record<string, { sessionId: string; username: string; color: string }>;
    duration: number;
  } | null {
    const game = this.games.get(roomId);
    if (!game) return null;

    const roundNum = game.roundHistory.length + 1;
    if (roundNum > 3) return null; // 3 rounds total

    const gridSize = game.settings.gridSize;
    const grid = createEmptyGrid(gridSize);
    const now = Date.now();

    // Assign colors and create player states
    const playerStates: Record<string, PulseGridPlayerState> = {};
    const playerInfo: Record<string, { sessionId: string; username: string; color: string }> = {};
    
    players.forEach((p, i) => {
      const color = COLORS[i % COLORS.length];
      playerStates[p.sessionId] = {
        sessionId: p.sessionId,
        username: p.username,
        color,
        cellCount: 0,
        score: 0,
        pulseCount: 0,
        overchargesUsed: 0,
        lastPulseAt: 0,
      };
      playerInfo[p.sessionId] = { sessionId: p.sessionId, username: p.username, color };
    });

    game.currentRound = {
      round: roundNum,
      totalRounds: 3,
      grid,
      gridSize,
      startedAt: now,
      endsAt: now + game.settings.roundDuration * 1000,
      status: 'active',
      players: playerStates,
    };

    return {
      round: roundNum,
      totalRounds: 3,
      gridSize,
      grid,
      players: playerInfo,
      duration: game.settings.roundDuration,
    };
  }

  pulse(
    roomId: string,
    sessionId: string,
    x: number,
    y: number,
    overcharge: boolean = false,
  ): {
    capturedCells: Array<{ x: number; y: number; newOwner: string; newStrength: number }>;
    radius: number;
    cooldownError?: boolean;
  } | null {
    const game = this.games.get(roomId);
    if (!game?.currentRound || game.currentRound.status !== 'active') return null;

    const player = game.currentRound.players[sessionId];
    if (!player) return null;

    const now = Date.now();
    
    // Check cooldown
    if (now - player.lastPulseAt < game.settings.pulseCooldown) {
      return { capturedCells: [], radius: 0, cooldownError: true };
    }

    // Check overcharge availability (max 2 per round)
    if (overcharge && (!game.settings.overchargeEnabled || player.overchargesUsed >= 2)) {
      overcharge = false;
    }

    const grid = game.currentRound.grid;
    const gridSize = game.currentRound.gridSize;

    // Validate position
    if (x < 0 || x >= gridSize || y < 0 || y >= gridSize) return null;

    const radius = overcharge ? game.settings.pulseRadius * 2 : game.settings.pulseRadius;
    const capturedCells: Array<{ x: number; y: number; newOwner: string; newStrength: number }> = [];

    // Capture the center cell
    const centerCell = grid[y][x];
    if (centerCell.owner !== sessionId) {
      if (centerCell.strength > 0) {
        centerCell.strength--;
        if (centerCell.strength === 0) {
          centerCell.owner = sessionId;
          centerCell.strength = 1;
          capturedCells.push({ x, y, newOwner: sessionId, newStrength: 1 });
        } else {
          capturedCells.push({ x, y, newOwner: centerCell.owner as string, newStrength: centerCell.strength });
        }
      } else {
        centerCell.owner = sessionId;
        centerCell.strength = 1;
        capturedCells.push({ x, y, newOwner: sessionId, newStrength: 1 });
      }
    } else {
      // Reinforce own cell (max strength 3)
      if (centerCell.strength < 3) {
        centerCell.strength++;
        capturedCells.push({ x, y, newOwner: sessionId, newStrength: centerCell.strength });
      }
    }

    // Capture/weaken adjacent cells
    const adjacent = getAdjacentCells(x, y, radius, gridSize);
    for (const pos of adjacent) {
      const cell = grid[pos.y][pos.x];
      if (cell.owner === sessionId) {
        // Reinforce own cells (less effective for adjacent)
        if (cell.strength < 2) {
          cell.strength++;
          capturedCells.push({ x: pos.x, y: pos.y, newOwner: sessionId, newStrength: cell.strength });
        }
      } else if (cell.owner === 'neutral') {
        // Neutral cells need 2 hits to capture
        cell.strength--;
        if (cell.strength <= 0) {
          cell.owner = sessionId;
          cell.strength = 1;
        }
        capturedCells.push({ x: pos.x, y: pos.y, newOwner: cell.owner as string, newStrength: cell.strength });
      } else if (cell.owner === 'empty') {
        // Empty cells are claimed instantly
        cell.owner = sessionId;
        cell.strength = 1;
        capturedCells.push({ x: pos.x, y: pos.y, newOwner: sessionId, newStrength: 1 });
      } else {
        // Enemy cell - weaken it
        cell.strength--;
        if (cell.strength <= 0) {
          cell.owner = sessionId;
          cell.strength = 1;
        }
        capturedCells.push({ x: pos.x, y: pos.y, newOwner: cell.owner as string, newStrength: cell.strength });
      }
    }

    // Update player stats
    player.lastPulseAt = now;
    player.pulseCount++;
    if (overcharge) player.overchargesUsed++;

    // Recalculate cell counts
    this.updateCellCounts(game.currentRound);

    return { capturedCells, radius };
  }

  private updateCellCounts(round: PulseGridRoundState): void {
    // Reset counts
    for (const player of Object.values(round.players) as PulseGridPlayerState[]) {
      player.cellCount = 0;
    }

    // Count cells per player
    for (const row of round.grid) {
      for (const cell of row) {
        if (cell.owner !== 'empty' && cell.owner !== 'neutral' && round.players[cell.owner]) {
          round.players[cell.owner].cellCount++;
        }
      }
    }
  }

  getScores(roomId: string): Record<string, { cellCount: number; score: number }> | null {
    const game = this.games.get(roomId);
    if (!game?.currentRound) return null;

    const scores: Record<string, { cellCount: number; score: number }> = {};
    for (const [sid, player] of Object.entries(game.currentRound.players) as [string, PulseGridPlayerState][]) {
      scores[sid] = {
        cellCount: player.cellCount,
        score: computeCellScore(player.cellCount),
      };
    }
    return scores;
  }

  getTimeLeft(roomId: string): number {
    const game = this.games.get(roomId);
    if (!game?.currentRound) return 0;
    return Math.max(0, Math.ceil((game.currentRound.endsAt - Date.now()) / 1000));
  }

  endRound(roomId: string): {
    rankings: Array<{ sessionId: string; username: string; cellCount: number; score: number; position: number }>;
    isGameOver: boolean;
  } | null {
    const game = this.games.get(roomId);
    if (!game?.currentRound) return null;

    // Clear timer
    const timer = this.roundTimers.get(roomId);
    if (timer) {
      clearTimeout(timer);
      this.roundTimers.delete(roomId);
    }

    game.currentRound.status = 'finished';
    this.updateCellCounts(game.currentRound);

    // Build rankings sorted by cell count
    const rankings = (Object.values(game.currentRound.players) as PulseGridPlayerState[])
      .map((p) => ({
        sessionId: p.sessionId,
        username: p.username,
        cellCount: p.cellCount,
        score: computeCellScore(p.cellCount),
        position: 0,
      }))
      .sort((a, b) => b.cellCount - a.cellCount);

    // Assign positions and add position bonus
    rankings.forEach((r, i) => {
      r.position = i + 1;
      r.score += computePositionBonus(r.position);
    });

    game.roundHistory.push({
      round: game.currentRound.round,
      rankings: rankings.map((r) => ({
        sessionId: r.sessionId,
        username: r.username,
        cellCount: r.cellCount,
        score: r.score,
      })),
    });

    const isGameOver = game.roundHistory.length >= 3;
    if (isGameOver) {
      game.status = 'finished';
    }

    return { rankings, isGameOver };
  }

  getFinalRankings(roomId: string): Array<{
    sessionId: string;
    username: string;
    totalScore: number;
    totalCells: number;
  }> | null {
    const game = this.games.get(roomId);
    if (!game) return null;

    const totals = new Map<string, { username: string; totalScore: number; totalCells: number }>();

    for (const round of game.roundHistory) {
      for (const r of round.rankings) {
        const existing = totals.get(r.sessionId) || { username: r.username, totalScore: 0, totalCells: 0 };
        existing.totalScore += r.score;
        existing.totalCells += r.cellCount;
        totals.set(r.sessionId, existing);
      }
    }

    return Array.from(totals.entries())
      .map(([sessionId, data]) => ({
        sessionId,
        username: data.username,
        totalScore: data.totalScore,
        totalCells: data.totalCells,
      }))
      .sort((a, b) => b.totalScore - a.totalScore);
  }
}
