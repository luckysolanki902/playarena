// SyncShot - Reaction targeting game

export interface SyncShotPosition {
  x: number;
  y: number;
}

export interface SyncShotTarget {
  id: string;
  position: SyncShotPosition;
  radius: number;
  spawnTime: number;
  hitBy: string | null; // playerId who hit it first
  hitTime: number | null;
}

export interface SyncShotPlayer {
  oddsId: string; // keep consistent
  oddsColor: string;
  oddsScore: number;
  cursorPosition: SyncShotPosition;
  shotCooldown: number; // ticks until can shoot again
  hits: number;
  misses: number;
  eliminated: boolean;
}

export interface SyncShotSettings {
  arenaWidth: number;
  arenaHeight: number;
  targetRadius: number;
  targetMinRadius: number;
  targetMaxRadius: number;
  targetsPerRound: number;
  targetSpawnInterval: number; // ms between spawns
  shotCooldownTicks: number;
  tickRate: number;
  totalRounds: number;
  hitPoints: number;
  speedBonusMax: number; // bonus points for fast hits
  accuracyBonusMax: number; // bonus points for center hits
  missPenalty: number;
}

export const DEFAULT_SYNCSHOT_SETTINGS: SyncShotSettings = {
  arenaWidth: 700,
  arenaHeight: 450,
  targetRadius: 30,
  targetMinRadius: 20,
  targetMaxRadius: 40,
  targetsPerRound: 15,
  targetSpawnInterval: 1500,
  shotCooldownTicks: 10, // 500ms at 50ms tick
  tickRate: 50,
  totalRounds: 3,
  hitPoints: 50, // base points for any hit
  speedBonusMax: 50, // bonus for hitting within 500ms
  accuracyBonusMax: 100, // bonus for hitting center (0 at edge)
  missPenalty: 25,
};

export interface SyncShotGameState {
  roomId: string;
  players: Record<string, SyncShotPlayer>;
  currentRound: number;
  totalRounds: number;
  settings: SyncShotSettings;
}

export interface SyncShotRoundState {
  roomId: string;
  players: Record<string, SyncShotPlayer>;
  targets: SyncShotTarget[];
  activeTarget: SyncShotTarget | null;
  targetsSpawned: number;
  targetsHit: number;
  roundStartTime: number;
  isActive: boolean;
  tickCount: number;
}

export interface SyncShotRoundResult {
  oddsId: string;
  oddsScore: number;
  hits: number;
  misses: number;
  accuracy: number;
}

export interface SyncShotFinalResult {
  oddsId: string;
  oddsColor: string;
  totalScore: number;
  totalHits: number;
  totalMisses: number;
  accuracy: number;
  rank: number;
}

// Socket events - Client to Server
export interface SyncShotMoveEvent {
  roomId: string;
  position: SyncShotPosition;
}

export interface SyncShotShootEvent {
  roomId: string;
  position: SyncShotPosition;
}

// Socket events - Server to Client
export interface SyncShotRoundStartEvent {
  roundNumber: number;
  players: Record<string, SyncShotPlayer>;
  settings: SyncShotSettings;
}

export interface SyncShotTickEvent {
  players: Record<string, SyncShotPlayer>;
  activeTarget: SyncShotTarget | null;
  targetsSpawned: number;
  targetsHit: number;
}

export interface SyncShotTargetSpawnEvent {
  target: SyncShotTarget;
}

export interface SyncShotTargetHitEvent {
  targetId: string;
  hitBy: string;
  hitTime: number;
  points: number;
  speedBonus: number;
  accuracyBonus: number;
}

export interface SyncShotMissEvent {
  playerId: string;
  position: SyncShotPosition;
}

export interface SyncShotRoundEndEvent {
  roundNumber: number;
  results: SyncShotRoundResult[];
  isGameOver: boolean;
  finalResults?: SyncShotFinalResult[];
}

// Colors for SyncShot
export const SYNCSHOT_COLORS = [
  '#ef4444', // red
  '#3b82f6', // blue
  '#22c55e', // green
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
];
