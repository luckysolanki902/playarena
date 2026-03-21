// Glitch Arena - Chaos button madness

export interface GlitchButton {
  id: string;
  position: { x: number; y: number };
  type: 'normal' | 'bonus' | 'trap' | 'chaos';
  points: number;
  spawnTime: number;
  lifetime: number; // ms until button expires
  hitBy: string | null;
  hitTime: number | null;
  size: number; // radius
  color: string;
  symbol: string;
}

export interface GlitchEffect {
  type: 'shake' | 'invert' | 'blur' | 'teleport' | 'reverse' | 'flash';
  duration: number; // ms
  startTime: number;
  affectsAll: boolean;
  targetPlayerId?: string;
}

export interface GlitchArenaPlayer {
  oddsId: string;
  oddsColor: string;
  oddsScore: number;
  cursorPosition: { x: number; y: number };
  hits: number;
  misses: number;
  trapsHit: number;
  comboCount: number;
  lastHitTime: number;
  controlsReversed: boolean;
}

export interface GlitchArenaSettings {
  arenaWidth: number;
  arenaHeight: number;
  buttonBaseRadius: number;
  buttonSpawnInterval: number; // ms
  buttonLifetime: number; // ms
  maxActiveButtons: number;
  tickRate: number;
  roundDuration: number; // seconds
  totalRounds: number;
  normalPoints: number;
  bonusPoints: number;
  trapPenalty: number;
  comboMultiplier: number;
  comboTimeout: number; // ms
  glitchChance: number; // 0-1
}

export const DEFAULT_GLITCH_ARENA_SETTINGS: GlitchArenaSettings = {
  arenaWidth: 700,
  arenaHeight: 450,
  buttonBaseRadius: 35,
  buttonSpawnInterval: 800,
  buttonLifetime: 3000,
  maxActiveButtons: 6,
  tickRate: 50,
  roundDuration: 45,
  totalRounds: 3,
  normalPoints: 50,
  bonusPoints: 150,
  trapPenalty: 100,
  comboMultiplier: 0.25, // 25% bonus per combo
  comboTimeout: 1500,
  glitchChance: 0.15,
};

export interface GlitchArenaGameState {
  roomId: string;
  players: Record<string, GlitchArenaPlayer>;
  currentRound: number;
  totalRounds: number;
  settings: GlitchArenaSettings;
}

export interface GlitchArenaRoundState {
  roomId: string;
  players: Record<string, GlitchArenaPlayer>;
  buttons: GlitchButton[];
  activeEffects: GlitchEffect[];
  roundStartTime: number;
  roundEndTime: number;
  isActive: boolean;
  tickCount: number;
  buttonsSpawned: number;
}

export interface GlitchArenaRoundResult {
  oddsId: string;
  oddsScore: number;
  hits: number;
  misses: number;
  trapsHit: number;
  maxCombo: number;
}

export interface GlitchArenaFinalResult {
  oddsId: string;
  oddsColor: string;
  totalScore: number;
  totalHits: number;
  totalTraps: number;
  bestCombo: number;
  rank: number;
}

// Socket events - Client to Server
export interface GlitchArenaClickEvent {
  roomId: string;
  buttonId: string;
  position: { x: number; y: number };
}

export interface GlitchArenaMoveEvent {
  roomId: string;
  position: { x: number; y: number };
}

// Socket events - Server to Client
export interface GlitchArenaRoundStartEvent {
  roundNumber: number;
  players: Record<string, GlitchArenaPlayer>;
  settings: GlitchArenaSettings;
  roundDuration: number;
}

export interface GlitchArenaTickEvent {
  players: Record<string, GlitchArenaPlayer>;
  buttons: GlitchButton[];
  activeEffects: GlitchEffect[];
  timeRemaining: number;
}

export interface GlitchArenaButtonSpawnEvent {
  button: GlitchButton;
}

export interface GlitchArenaButtonHitEvent {
  buttonId: string;
  hitBy: string;
  points: number;
  comboBonus: number;
  newCombo: number;
}

export interface GlitchArenaButtonExpiredEvent {
  buttonId: string;
}

export interface GlitchArenaGlitchEvent {
  effect: GlitchEffect;
}

export interface GlitchArenaRoundEndEvent {
  roundNumber: number;
  results: GlitchArenaRoundResult[];
  isGameOver: boolean;
  finalResults?: GlitchArenaFinalResult[];
}

// Button type configs
export const BUTTON_TYPES = {
  normal: { color: '#22c55e', symbol: '●', chance: 0.6 },
  bonus: { color: '#fbbf24', symbol: '★', chance: 0.15 },
  trap: { color: '#ef4444', symbol: '✖', chance: 0.15 },
  chaos: { color: '#a855f7', symbol: '◆', chance: 0.1 },
} as const;

// Player colors
export const GLITCH_ARENA_COLORS = [
  '#3b82f6', // blue
  '#ef4444', // red
  '#22c55e', // green
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
];
