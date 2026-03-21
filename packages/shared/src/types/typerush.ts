// ─── TypeRush Game Types ───

export type GlitchType = 'blur' | 'scramble' | 'speedboost' | 'trap' | 'none';

export interface TypeRushWord {
  text: string;
  glitch: GlitchType;
  startIndex: number; // position in the full text
  endIndex: number;
}

export interface TypeRushSettings {
  rounds: number;
  textLength: 'short' | 'medium' | 'long'; // ~50, ~100, ~150 words
  glitchFrequency: 'low' | 'normal' | 'high'; // % of glitch words
}

export interface TypeRushPlayerState {
  sessionId: string;
  username: string;
  progress: number; // 0-100% of text typed
  charsTyped: number;
  errors: number;
  wpm: number; // words per minute
  accuracy: number; // 0-100%
  finished: boolean;
  finishTime: number | null; // ms from round start
  score: number;
  speedBoosts: number; // bonus points from speed boost words
  trapPenalties: number; // penalty points from trap words
}

export interface TypeRushRoundState {
  round: number;
  totalRounds: number;
  text: string; // the full text to type
  words: TypeRushWord[]; // words with glitch metadata
  startedAt: number;
  status: 'active' | 'finished';
  players: Record<string, TypeRushPlayerState>;
}

export interface TypeRushGameState {
  status: 'lobby' | 'active' | 'finished';
  currentRound: TypeRushRoundState | null;
  roundHistory: Array<{
    round: number;
    rankings: Array<{ sessionId: string; username: string; wpm: number; accuracy: number; score: number }>;
  }>;
  settings: TypeRushSettings;
}

// ─── TypeRush Socket Events (Client → Server) ───

export interface TypeRushClientEvents {
  'typerush:progress': { 
    roomId: string; 
    charsTyped: number; 
    errors: number;
    currentWord: number; // index of word being typed
  };
  'typerush:finished': { 
    roomId: string; 
    totalTime: number; // ms
    errors: number;
  };
}

// ─── TypeRush Socket Events (Server → Client) ───

export interface TypeRushServerEvents {
  'typerush:round-start': {
    round: number;
    totalRounds: number;
    text: string;
    words: TypeRushWord[];
  };
  'typerush:player-progress': {
    sessionId: string;
    progress: number;
    wpm: number;
    charsTyped: number;
  };
  'typerush:player-finished': {
    sessionId: string;
    username: string;
    position: number;
    wpm: number;
    accuracy: number;
    time: number;
  };
  'typerush:speed-boost': {
    sessionId: string;
    bonus: number;
  };
  'typerush:trap-triggered': {
    sessionId: string;
    penalty: number;
  };
  'typerush:round-end': {
    rankings: Array<{
      sessionId: string;
      username: string;
      wpm: number;
      accuracy: number;
      score: number;
      position: number;
    }>;
    nextRoundIn: number;
  };
  'typerush:game-end': {
    finalRankings: Array<{
      sessionId: string;
      username: string;
      totalScore: number;
      avgWpm: number;
      avgAccuracy: number;
    }>;
  };
  'typerush:error': {
    message: string;
  };
}
