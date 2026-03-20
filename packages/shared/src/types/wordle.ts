// ─── Wordle Game Types ───

export type LetterFeedback = 'correct' | 'present' | 'absent';

export interface WordleSettings {
  rounds: number;
  timeLimit: number; // seconds per round
  wordLength: number;
  hintsEnabled: boolean;
}

export interface WordleGuess {
  word: string;
  feedback: LetterFeedback[];
  attempt: number;
  timestamp: number;
}

export interface WordlePlayerState {
  sessionId: string;
  username: string;
  guesses: WordleGuess[];
  solved: boolean;
  solvedAttempt: number | null;
  solvedTime: number | null;
  score: number;
  rating: number;
  hintsUsed: number;
}

export interface WordleRoundState {
  round: number;
  totalRounds: number;
  word: string; // server-only, never sent to clients
  wordLength: number;
  timeLimit: number;
  startedAt: number;
  status: 'active' | 'finished';
  players: Record<string, WordlePlayerState>;
}

export interface WordleGameState {
  status: 'lobby' | 'active' | 'finished';
  currentRound: WordleRoundState | null;
  roundHistory: Array<{
    round: number;
    word: string;
    rankings: Array<{ sessionId: string; username: string; score: number }>;
  }>;
  settings: WordleSettings;
}

// ─── Wordle Socket Events (Client → Server) ───

export interface WordleClientEvents {
  'wordle:guess': { roomId: string; word: string };
  'wordle:request-hint': { roomId: string };
  'wordle:replay-vote': { roomId: string; vote: boolean };
  'wordle:forfeit': { roomId: string };
}

// ─── Wordle Socket Events (Server → Client) ───

export interface WordleServerEvents {
  'wordle:round-start': {
    round: number;
    totalRounds: number;
    timeLimit: number;
    wordLength: number;
  };
  'wordle:guess-result': {
    word: string;
    feedback: LetterFeedback[];
    attempt: number;
  };
  'wordle:opponent-guess': {
    sessionId: string;
    attempt: number;
    feedback: LetterFeedback[];
  };
  'wordle:hint': {
    suggestions: string[];
    reasoning: string;
    penalty: number;
  };
  'wordle:player-solved': {
    sessionId: string;
    username: string;
    attempt: number;
    timeTaken: number;
  };
  'wordle:round-end': {
    word: string;
    rankings: Array<{ sessionId: string; username: string; score: number }>;
    nextRoundIn: number;
  };
  'wordle:game-end': {
    finalRankings: Array<{
      sessionId: string;
      username: string;
      totalScore: number;
      rating: number;
    }>;
  };
  'wordle:tick': { remaining: number };
  'wordle:error': { code: string; message: string };
}
