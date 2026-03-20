// ─── Lobby Socket Events ───

export interface LobbyClientEvents {
  'lobby:quick-match': { game: string };
  'lobby:cancel-match': Record<string, never>;
  'lobby:join-room': { roomId?: string; code?: string };
  'lobby:leave-room': { roomId: string };
  'lobby:start-game': { roomId: string };
  'lobby:kick-player': { roomId: string; targetSessionId: string };
  'lobby:update-settings': { roomId: string; settings: Record<string, unknown> };
}

export interface LobbyServerEvents {
  'lobby:matched': { roomId: string };
  'lobby:match-progress': { searching: boolean; elapsed: number };
  'lobby:room-joined': { room: import('./common').Room };
  'lobby:room-updated': { room: import('./common').Room };
  'lobby:player-joined': { player: import('./common').RoomPlayer };
  'lobby:player-left': { sessionId: string; username: string };
  'lobby:game-starting': { countdown: number };
  'lobby:kicked': { reason: string };
  'lobby:error': { code: string; message: string };
}

// ─── Chat Socket Events ───

export interface ChatClientEvents {
  'chat:message': { roomId: string; text: string };
  'chat:reaction': { roomId: string; emoji: string };
}

export interface ChatServerEvents {
  'chat:message': {
    sessionId: string;
    username: string;
    text: string;
    timestamp: number;
  };
  'chat:system': { text: string; type: 'info' | 'warning' | 'success' };
  'chat:reaction': { sessionId: string; username: string; emoji: string };
}
