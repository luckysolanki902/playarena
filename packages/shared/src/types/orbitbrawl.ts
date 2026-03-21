// Orbit Brawl - Magnetic push mayhem

export interface OrbitPosition {
  x: number;
  y: number;
}

export interface OrbitVelocity {
  vx: number;
  vy: number;
}

export interface OrbitPlayer {
  oddsId: string;
  oddsColor: string;
  oddsScore: number;
  position: OrbitPosition;
  velocity: OrbitVelocity;
  radius: number;
  mass: number;
  isCharging: boolean;
  chargeStartTime: number;
  chargePower: number; // 0 to 1
  chargeType: 'push' | 'pull' | null;
  cooldown: number; // ticks until can charge again
  alive: boolean;
  eliminatedAt: number | null;
  eliminations: number;
}

export interface OrbitBrawlSettings {
  arenaRadius: number;
  arenaCenter: OrbitPosition;
  playerRadius: number;
  playerMass: number;
  maxSpeed: number;
  friction: number;
  maxChargePower: number;
  chargeRate: number; // power per tick while charging
  pushForce: number;
  pullForce: number;
  pushRadius: number;
  pullRadius: number;
  cooldownTicks: number;
  tickRate: number;
  totalRounds: number;
  survivalPoints: number;
  eliminationPoints: number;
}

export const DEFAULT_ORBIT_BRAWL_SETTINGS: OrbitBrawlSettings = {
  arenaRadius: 280,
  arenaCenter: { x: 350, y: 280 },
  playerRadius: 20,
  playerMass: 1,
  maxSpeed: 15,
  friction: 0.98,
  maxChargePower: 1,
  chargeRate: 0.03,
  pushForce: 25,
  pullForce: 15,
  pushRadius: 150,
  pullRadius: 180,
  cooldownTicks: 30, // 1.5s at 50ms tick
  tickRate: 50,
  totalRounds: 5,
  survivalPoints: 100,
  eliminationPoints: 50,
};

export interface OrbitBrawlGameState {
  roomId: string;
  players: Record<string, OrbitPlayer>;
  currentRound: number;
  totalRounds: number;
  settings: OrbitBrawlSettings;
}

export interface OrbitBrawlRoundState {
  roomId: string;
  players: Record<string, OrbitPlayer>;
  roundStartTime: number;
  isActive: boolean;
  tickCount: number;
  alivePlayers: number;
}

export interface OrbitBrawlRoundResult {
  oddsId: string;
  oddsScore: number;
  position: number;
  eliminations: number;
  survived: boolean;
}

export interface OrbitBrawlFinalResult {
  oddsId: string;
  oddsColor: string;
  totalScore: number;
  totalEliminations: number;
  wins: number;
  rank: number;
}

// Socket events - Client to Server
export interface OrbitStartChargeEvent {
  roomId: string;
  chargeType: 'push' | 'pull';
}

export interface OrbitReleaseChargeEvent {
  roomId: string;
}

export interface OrbitMoveEvent {
  roomId: string;
  direction: { x: number; y: number };
}

// Socket events - Server to Client
export interface OrbitBrawlRoundStartEvent {
  roundNumber: number;
  players: Record<string, OrbitPlayer>;
  settings: OrbitBrawlSettings;
  countdownSeconds: number;
}

export interface OrbitBrawlTickEvent {
  players: Record<string, OrbitPlayer>;
  tick: number;
}

export interface OrbitBrawlForceUsedEvent {
  playerId: string;
  chargeType: 'push' | 'pull';
  power: number;
  position: OrbitPosition;
  radius: number;
}

export interface OrbitBrawlPlayerEliminatedEvent {
  playerId: string;
  eliminatedBy: string | null; // null if self-elimination
  position: OrbitPosition;
  remainingPlayers: number;
}

export interface OrbitBrawlRoundEndEvent {
  roundNumber: number;
  rankings: OrbitBrawlRoundResult[];
  isGameOver: boolean;
  finalResults?: OrbitBrawlFinalResult[];
}

// Player colors
export const ORBIT_BRAWL_COLORS = [
  '#3b82f6', // blue
  '#ef4444', // red
  '#22c55e', // green
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
];
