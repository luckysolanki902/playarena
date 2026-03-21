export type DrawEventType = 'start' | 'draw' | 'end' | 'shape' | 'fill';

export interface DrawPoint {
  x: number; // normalized 0–1
  y: number; // normalized 0–1
  type: DrawEventType;
  color: string;
  width: number;
  // Shape fields (present when type === 'shape')
  shape?: 'line' | 'rect' | 'circle' | 'triangle';
  x2?: number; // end x, normalized 0–1
  y2?: number; // end y, normalized 0–1
}

export interface DrawStroke {
  points: DrawPoint[];
}

export type ScribblePhase =
  | 'lobby'
  | 'choosing'   // drawer is picking a word
  | 'drawing'    // active drawing + guessing round
  | 'round-end'  // brief result screen
  | 'game-end';  // final rankings

export interface ScribblePlayerState {
  sessionId: string;
  username: string;
  score: number;
  roundScore: number;
  hasGuessed: boolean;
  isDrawing: boolean;
}

export interface ScribbleRoundStartPayload {
  round: number;
  totalRounds: number;
  drawerId: string;
  drawerUsername: string;
  wordLength: number;
  hintPattern: string; // e.g. "_ _ _ _ _"
  timeLimit: number;
  strokes: DrawStroke[]; // replay for late joiners
}

export interface ScribbleRoundEndPayload {
  word: string;
  rankings: Array<{ sessionId: string; username: string; score: number; roundScore: number }>;
  nextRoundIn: number;
}

export interface ScribbleFinalRanking {
  sessionId: string;
  username: string;
  totalScore: number;
}
