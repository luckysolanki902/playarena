// ─── Session & Identity ───

export interface Session {
  sessionId: string;
  username: string;
  createdAt: number;
  lastSeenAt: number;
}

export interface SessionToken {
  sub: string; // sessionId
  username: string;
  iat: number;
  exp: number;
}

// ─── Room System ───

export type GameType = 'wordle' | 'scribble' | 'typerush' | 'pulsegrid' | 'neondrift';
export type RoomVisibility = 'public' | 'private';
export type RoomStatus = 'waiting' | 'starting' | 'in_progress' | 'finished';

export interface Room {
  id: string;
  game: GameType;
  name: string;
  visibility: RoomVisibility;
  status: RoomStatus;
  code: string | null; // 6-char code for private rooms
  hostSessionId: string;
  maxPlayers: number;
  players: RoomPlayer[];
  createdAt: number;
}

export interface RoomPlayer {
  sessionId: string;
  username: string;
  isHost: boolean;
  joinedAt: number;
}

// ─── Chat ───

export interface ChatMessage {
  id: string;
  sessionId: string;
  username: string;
  text: string;
  timestamp: number;
  type: 'player' | 'system' | 'correct' | 'close';
}
