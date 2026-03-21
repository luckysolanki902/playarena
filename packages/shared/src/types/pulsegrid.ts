// ─── PulseGrid Game Types ───
// Territory capture game where players pulse to claim cells on a grid

export type CellState = 'empty' | 'neutral' | string; // string = sessionId of owner

export interface PulseGridCell {
  x: number;
  y: number;
  owner: CellState;
  strength: number; // 0-3, higher = harder to capture
  pulseAnimation?: number; // timestamp of last pulse for animation
}

export interface PulseGridSettings {
  gridSize: number; // e.g., 8x8, 10x10, 12x12
  roundDuration: number; // seconds
  pulseCooldown: number; // ms between pulses
  pulseRadius: number; // cells affected by pulse (1 = adjacent only)
  overchargeEnabled: boolean; // special ability to do 2x pulse
}

export interface PulseGridPlayerState {
  sessionId: string;
  username: string;
  color: string; // player color for cells
  cellCount: number;
  score: number;
  pulseCount: number;
  overchargesUsed: number;
  lastPulseAt: number;
}

export interface PulseGridRoundState {
  round: number;
  totalRounds: number;
  grid: PulseGridCell[][];
  gridSize: number;
  startedAt: number;
  endsAt: number;
  status: 'active' | 'finished';
  players: Record<string, PulseGridPlayerState>;
}

export interface PulseGridGameState {
  status: 'lobby' | 'active' | 'finished';
  currentRound: PulseGridRoundState | null;
  roundHistory: Array<{
    round: number;
    rankings: Array<{ sessionId: string; username: string; cellCount: number; score: number }>;
  }>;
  settings: PulseGridSettings;
}

// ─── PulseGrid Socket Events (Client → Server) ───

export interface PulseGridClientEvents {
  'pulsegrid:pulse': {
    roomId: string;
    x: number;
    y: number;
    overcharge?: boolean; // use overcharge for 2x radius
  };
}

// ─── PulseGrid Socket Events (Server → Client) ───

export interface PulseGridServerEvents {
  'pulsegrid:round-start': {
    round: number;
    totalRounds: number;
    gridSize: number;
    grid: PulseGridCell[][];
    players: Record<string, { sessionId: string; username: string; color: string }>;
    duration: number;
  };
  'pulsegrid:pulse-result': {
    sessionId: string;
    x: number;
    y: number;
    radius: number;
    capturedCells: Array<{ x: number; y: number; newOwner: string; newStrength: number }>;
    overcharge: boolean;
  };
  'pulsegrid:cell-update': {
    cells: Array<{ x: number; y: number; owner: CellState; strength: number }>;
  };
  'pulsegrid:score-update': {
    scores: Record<string, { cellCount: number; score: number }>;
  };
  'pulsegrid:round-end': {
    rankings: Array<{
      sessionId: string;
      username: string;
      cellCount: number;
      score: number;
      position: number;
    }>;
    nextRoundIn: number;
  };
  'pulsegrid:game-end': {
    finalRankings: Array<{
      sessionId: string;
      username: string;
      totalScore: number;
      totalCells: number;
    }>;
  };
  'pulsegrid:error': {
    message: string;
  };
  'pulsegrid:time-sync': {
    timeLeft: number;
  };
}

// Player colors for the game
export const PULSEGRID_COLORS = [
  '#4ecdc4', // teal
  '#ff6b9d', // pink
  '#a78bfa', // purple
  '#ffd166', // yellow
  '#34d399', // green
  '#fb923c', // orange
];
