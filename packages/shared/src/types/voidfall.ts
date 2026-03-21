// ─── Voidfall Game Types ───
// Battle royale style game where players dodge a shrinking safe zone

export interface VoidfallPosition {
  x: number;
  y: number;
}

export interface VoidfallPlayer {
  sessionId: string;
  username: string;
  color: string;
  position: VoidfallPosition;
  velocity: VoidfallPosition;
  alive: boolean;
  score: number;
}

export interface SafeZone {
  centerX: number;
  centerY: number;
  radius: number;
  targetRadius: number;
  shrinkRate: number; // radius per tick
}

export interface VoidfallSettings {
  arenaWidth: number;
  arenaHeight: number;
  playerSpeed: number;
  tickRate: number;
  initialZoneRadius: number;
  finalZoneRadius: number;
  shrinkDelay: number;     // ticks before shrinking starts
  shrinkDuration: number;  // ticks to shrink fully
  roundCount: number;
}

export interface VoidfallRoundState {
  round: number;
  totalRounds: number;
  arenaWidth: number;
  arenaHeight: number;
  players: Record<string, VoidfallPlayer>;
  safeZone: SafeZone;
  status: 'countdown' | 'active' | 'shrinking' | 'finished';
  startedAt: number;
  tickCount: number;
  tickRate: number;
}

export interface VoidfallGameState {
  status: 'lobby' | 'active' | 'finished';
  currentRound: VoidfallRoundState | null;
  roundHistory: Array<{
    round: number;
    rankings: Array<{ sessionId: string; username: string; position: number; score: number }>;
  }>;
  settings: VoidfallSettings;
}

// ─── Socket Events (Client → Server) ───

export interface VoidfallClientEvents {
  'voidfall:move': {
    roomId: string;
    direction: { x: number; y: number }; // normalized direction vector
  };
  'voidfall:stop': {
    roomId: string;
  };
}

// ─── Socket Events (Server → Client) ───

export interface VoidfallServerEvents {
  'voidfall:round-start': {
    round: number;
    totalRounds: number;
    arenaWidth: number;
    arenaHeight: number;
    players: Record<string, { sessionId: string; username: string; color: string; position: VoidfallPosition }>;
    safeZone: SafeZone;
    tickRate: number;
    countdownSeconds: number;
  };
  'voidfall:countdown': {
    seconds: number;
  };
  'voidfall:go': object;
  'voidfall:tick': {
    players: Record<string, { position: VoidfallPosition; alive: boolean }>;
    safeZone: SafeZone;
    tick: number;
  };
  'voidfall:zone-shrinking': {
    newTargetRadius: number;
    duration: number; // seconds
  };
  'voidfall:player-eliminated': {
    sessionId: string;
    username: string;
    position: number;
  };
  'voidfall:round-end': {
    rankings: Array<{ sessionId: string; username: string; position: number; score: number }>;
    nextRoundIn: number;
  };
  'voidfall:game-end': {
    finalRankings: Array<{ sessionId: string; username: string; totalScore: number; wins: number }>;
  };
  'voidfall:error': {
    message: string;
  };
}

// Player colors
export const VOIDFALL_COLORS = [
  '#818cf8', // indigo
  '#f472b6', // pink
  '#4ade80', // green
  '#facc15', // yellow
  '#22d3ee', // cyan
  '#fb923c', // orange
];
