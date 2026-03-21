// ─── Neon Drift Game Types ───
// Tron-style light trail game where players avoid walls and trails

export type Direction = 'up' | 'down' | 'left' | 'right';

export interface Position {
  x: number;
  y: number;
}

export interface NeonDriftPlayer {
  sessionId: string;
  username: string;
  color: string;
  position: Position;
  direction: Direction;
  trail: Position[];
  alive: boolean;
  score: number;
}

export interface NeonDriftSettings {
  gridWidth: number;   // Arena width (e.g., 80)
  gridHeight: number;  // Arena height (e.g., 60)
  tickRate: number;    // ms per game tick (e.g., 100 = 10 ticks/sec)
  roundCount: number;  // Number of rounds
  speedBoostEnabled: boolean;
}

export interface NeonDriftRoundState {
  round: number;
  totalRounds: number;
  gridWidth: number;
  gridHeight: number;
  players: Record<string, NeonDriftPlayer>;
  status: 'countdown' | 'active' | 'finished';
  startedAt: number;
  tickRate: number;
}

export interface NeonDriftGameState {
  status: 'lobby' | 'active' | 'finished';
  currentRound: NeonDriftRoundState | null;
  roundHistory: Array<{
    round: number;
    rankings: Array<{ sessionId: string; username: string; position: number; score: number }>;
  }>;
  settings: NeonDriftSettings;
}

// ─── Socket Events (Client → Server) ───

export interface NeonDriftClientEvents {
  'neondrift:turn': {
    roomId: string;
    direction: Direction;
  };
  'neondrift:boost': {
    roomId: string;
  };
}

// ─── Socket Events (Server → Client) ───

export interface NeonDriftServerEvents {
  'neondrift:round-start': {
    round: number;
    totalRounds: number;
    gridWidth: number;
    gridHeight: number;
    players: Record<string, { sessionId: string; username: string; color: string; position: Position; direction: Direction }>;
    tickRate: number;
    countdownSeconds: number;
  };
  'neondrift:countdown': {
    seconds: number;
  };
  'neondrift:go': object;
  'neondrift:tick': {
    players: Record<string, { position: Position; direction: Direction; alive: boolean; trailTip: Position }>;
    tick: number;
  };
  'neondrift:player-crashed': {
    sessionId: string;
    username: string;
    position: number; // Position they finished in this round
  };
  'neondrift:round-end': {
    rankings: Array<{ sessionId: string; username: string; position: number; score: number }>;
    nextRoundIn: number;
  };
  'neondrift:game-end': {
    finalRankings: Array<{ sessionId: string; username: string; totalScore: number; wins: number }>;
  };
  'neondrift:error': {
    message: string;
  };
}

// Player colors  
export const NEONDRIFT_COLORS = [
  '#f472b6', // pink
  '#4ade80', // green
  '#60a5fa', // blue
  '#facc15', // yellow
  '#a78bfa', // purple
  '#fb923c', // orange
];
