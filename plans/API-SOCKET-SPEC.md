# API & Socket.IO Specification — PlayArena

## Overview
Two communication channels:
1. **REST API** (Fastify) — session creation, room management, static data
2. **Socket.IO** — all real-time game communication, chat, presence

Base URL: `https://api.playarena.dev` (production) / `http://localhost:4000` (dev)

---

## 1. REST API Endpoints

### 1.1 Health & Meta

#### `GET /health`
```json
Response 200:
{
  "status": "ok",
  "uptime": 3600,
  "activePlayers": 128,
  "activeRooms": 34
}
```

#### `GET /meta`
```json
Response 200:
{
  "games": [
    { "id": "wordle", "name": "Wordle", "minPlayers": 1, "maxPlayers": 8, "activePlayers": 42 },
    { "id": "scribble", "name": "Scribble", "minPlayers": 3, "maxPlayers": 8, "activePlayers": 34 }
  ],
  "totalPlayers": 128
}
```

### 1.2 Session / Identity

#### `POST /session`
Create or resume a session. No password. Just a temporary username.
```json
Request:
{ "username": "CoolPlayer42" }

Response 201:
{
  "sessionId": "sess_a1b2c3d4e5f6",
  "username": "CoolPlayer42",
  "token": "eyJhbGciOiJIUzI1NiIs...",   // JWT, 24h expiry
  "expiresAt": "2025-01-20T12:00:00Z"
}

Error 400:
{ "error": "USERNAME_TAKEN", "message": "Username is already in use" }

Error 400:
{ "error": "USERNAME_INVALID", "message": "Must be 3-16 alphanumeric characters" }
```

**Username rules:**
- 3-16 characters
- Alphanumeric + underscores only
- Case-insensitive uniqueness check
- Profanity filter (server-side word list)
- Reserved: "admin", "system", "bot", "playarena"

#### `DELETE /session`
```
Headers: Authorization: Bearer <token>
Response 204 (no content)
```

### 1.3 Rooms

#### `GET /rooms?game=wordle&status=waiting`
List public rooms, optionally filtered.
```json
Response 200:
{
  "rooms": [
    {
      "id": "room_abc123",
      "game": "wordle",
      "name": "chill vibes",
      "hostUsername": "Player1",
      "status": "waiting",
      "players": 2,
      "maxPlayers": 4,
      "settings": { "rounds": 3, "timeLimit": 120 },
      "createdAt": "2025-01-20T10:30:00Z"
    }
  ],
  "total": 12
}
```

#### `POST /rooms`
Create a room.
```json
Headers: Authorization: Bearer <token>

Request:
{
  "game": "wordle",
  "name": "my room",
  "visibility": "private",
  "maxPlayers": 4,
  "settings": {
    "rounds": 3,
    "timeLimit": 120,
    "wordLength": 5
  }
}

Response 201:
{
  "id": "room_abc123",
  "code": "AXBZ42",           // Private room join code
  "game": "wordle",
  "name": "my room",
  "visibility": "private",
  "maxPlayers": 4,
  "settings": { ... }
}
```

#### `GET /rooms/:id`
Get room details.
```json
Response 200:
{
  "id": "room_abc123",
  "game": "wordle",
  "status": "waiting",
  "players": [
    { "sessionId": "sess_...", "username": "Player1", "isHost": true },
    { "sessionId": "sess_...", "username": "Player2", "isHost": false }
  ],
  "settings": { ... },
  "code": "AXBZ42"
}

Error 404:
{ "error": "ROOM_NOT_FOUND" }
```

### 1.4 Stats

#### `GET /stats/:sessionId`
```json
Response 200:
{
  "username": "CoolPlayer42",
  "gamesPlayed": 47,
  "gamesWon": 23,
  "winRate": 0.489,
  "byGame": {
    "wordle": { "played": 30, "won": 18, "avgScore": 840, "bestStreak": 5, "rating": 1250 },
    "scribble": { "played": 17, "won": 5, "avgScore": 620 }
  }
}
```

---

## 2. Socket.IO Connection

### Authentication
```typescript
// Client connects with JWT token
const socket = io('https://api.playarena.dev', {
  auth: { token: 'eyJhbGciOiJIUzI1NiIs...' },
  transports: ['websocket', 'polling'],  // Prefer websocket
});
```

Server validates JWT on connection. Invalid token → disconnect with `AUTH_FAILED` error.

### Namespaces
| Namespace | Purpose |
|-----------|---------|
| `/` | Default — auth, presence, global events |
| `/lobby` | Room browsing, quick match, matchmaking |
| `/wordle` | Wordle game events |
| `/scribble` | Scribble game events |
| `/chat` | In-game and lobby chat |

---

## 3. Global Events (Default Namespace `/`)

### Client → Server
| Event | Payload | Description |
|-------|---------|-------------|
| `ping` | `{}` | Heartbeat (every 25s) |

### Server → Client
| Event | Payload | Description |
|-------|---------|-------------|
| `connected` | `{ sessionId, username }` | Auth confirmed |
| `error` | `{ code, message }` | Error notification |
| `global:stats` | `{ activePlayers, activeRooms }` | Periodic stats (every 30s) |

---

## 4. Lobby Events (`/lobby`)

### Client → Server
| Event | Payload | Description |
|-------|---------|-------------|
| `lobby:quick-match` | `{ game: string }` | Find a match for this game |
| `lobby:cancel-match` | `{}` | Cancel matchmaking |
| `lobby:join-room` | `{ roomId: string }` OR `{ code: string }` | Join by ID or private code |
| `lobby:leave-room` | `{ roomId: string }` | Leave current room |
| `lobby:start-game` | `{ roomId: string }` | Host starts the game |
| `lobby:kick-player` | `{ roomId, targetSessionId }` | Host kicks a player |
| `lobby:update-settings` | `{ roomId, settings }` | Host changes room settings |

### Server → Client
| Event | Payload | Description |
|-------|---------|-------------|
| `lobby:matched` | `{ roomId }` | Quick match found |
| `lobby:match-progress` | `{ searching, elapsed }` | Matchmaking status |
| `lobby:room-joined` | `{ room: RoomState }` | Successfully joined |
| `lobby:room-updated` | `{ room: RoomState }` | Room state changed (player join/leave, settings) |
| `lobby:player-joined` | `{ player }` | New player joined room |
| `lobby:player-left` | `{ sessionId, username }` | Player left room |
| `lobby:game-starting` | `{ countdown: number }` | Game starting in N seconds |
| `lobby:kicked` | `{ reason }` | You were kicked |
| `lobby:error` | `{ code, message }` | Lobby-specific error |

---

## 5. Wordle Events (`/wordle`)

### Client → Server
| Event | Payload | Description |
|-------|---------|-------------|
| `wordle:guess` | `{ roomId, word: string }` | Submit a 5-letter guess |
| `wordle:request-hint` | `{ roomId }` | Request bot hint |
| `wordle:replay-vote` | `{ roomId, vote: boolean }` | Vote to replay |
| `wordle:forfeit` | `{ roomId }` | Give up current round |

### Server → Client
| Event | Payload | Description |
|-------|---------|-------------|
| `wordle:round-start` | `{ round, totalRounds, timeLimit, wordLength }` | New round begin |
| `wordle:guess-result` | `{ word, feedback: ('correct'\|'present'\|'absent')[], attempt }` | Your guess feedback |
| `wordle:opponent-guess` | `{ sessionId, attempt, feedback }` | Opponent made a guess (feedback only, no letters) |
| `wordle:hint` | `{ suggestions: string[], reasoning: string, penalty: number }` | Bot hint response |
| `wordle:player-solved` | `{ sessionId, username, attempt, timeTaken }` | Someone solved it |
| `wordle:round-end` | `{ word, rankings, scores, nextRoundIn }` | Round finished |
| `wordle:game-end` | `{ finalRankings, scores, stats }` | Game finished |
| `wordle:tick` | `{ remaining: number }` | Timer update (every 1s in last 30s) |
| `wordle:error` | `{ code, message }` | Guess validation error |

### Wordle Error Codes
| Code | Message |
|------|---------|
| `INVALID_WORD` | "Not a valid 5-letter word" |
| `NOT_YOUR_TURN` | "Wait for your turn" (if turn-based variant) |
| `ROUND_OVER` | "This round has ended" |
| `MAX_ATTEMPTS` | "No more guesses remaining" |
| `RATE_LIMITED` | "Too many guesses, slow down" |

---

## 6. Scribble Events (`/scribble`)

### Client → Server
| Event | Payload | Description |
|-------|---------|-------------|
| `scribble:pick-word` | `{ roomId, wordIndex: 0\|1\|2 }` | Drawer picks word from 3 options |
| `scribble:draw` | `{ roomId, stroke: Stroke }` | Send drawing stroke |
| `scribble:draw-batch` | `{ roomId, points: [x,y][] }` | Batch of points (optimization) |
| `scribble:undo` | `{ roomId }` | Undo last stroke |
| `scribble:clear` | `{ roomId }` | Clear canvas |
| `scribble:guess` | `{ roomId, text: string }` | Submit a guess (via chat) |

### Server → Client
| Event | Payload | Description |
|-------|---------|-------------|
| `scribble:round-start` | `{ drawerId, wordOptions?: string[], wordLength, timeLimit }` | Round start (drawer gets options, others get length) |
| `scribble:word-chosen` | `{ wordLength }` | Drawer picked, guessing begins |
| `scribble:stroke` | `{ stroke: Stroke }` | Broadcast stroke to guessers |
| `scribble:stroke-batch` | `{ points: [x,y][] }` | Batch of points |
| `scribble:undo` | `{}` | Undo broadcast |
| `scribble:clear` | `{}` | Clear broadcast |
| `scribble:hint` | `{ index: number, letter: string }` | Letter revealed |
| `scribble:correct-guess` | `{ sessionId, username, position, points }` | Someone guessed correctly |
| `scribble:close-guess` | `{}` | Your guess was close (to guesser only) |
| `scribble:round-end` | `{ word, scores, correctGuessers, drawerScore }` | Round finished |
| `scribble:game-end` | `{ finalRankings, scores, gallery }` | Game finished, gallery data |
| `scribble:tick` | `{ remaining }` | Timer |

### Stroke Data Format
```typescript
interface Stroke {
  tool: 'brush' | 'eraser' | 'line' | 'circle' | 'rect' | 'fill';
  color: string;       // hex
  size: 1 | 2 | 3;    // small, medium, large
  points: number[][];  // [[x,y], [x,y], ...] normalized 0-1
}
```

---

## 7. Chat Events (`/chat`)

### Client → Server
| Event | Payload | Description |
|-------|---------|-------------|
| `chat:message` | `{ roomId, text: string }` | Send message (max 200 chars) |
| `chat:reaction` | `{ roomId, emoji: string }` | Send floating emoji reaction |

### Server → Client
| Event | Payload | Description |
|-------|---------|-------------|
| `chat:message` | `{ sessionId, username, text, timestamp }` | New message |
| `chat:system` | `{ text, type: 'info'\|'warning'\|'success' }` | System message |
| `chat:reaction` | `{ sessionId, username, emoji }` | Emoji reaction |

### Chat Rate Limiting
- Max 3 messages per second per user
- Max 200 characters per message
- Profanity filter (same as username)
- Muted players: messages rejected silently

---

## 8. Error Code Reference

### Global Error Codes
| Code | HTTP | Description |
|------|------|-------------|
| `AUTH_FAILED` | 401 | Invalid or expired token |
| `AUTH_REQUIRED` | 401 | No token provided |
| `RATE_LIMITED` | 429 | Too many requests |
| `ROOM_NOT_FOUND` | 404 | Room doesn't exist |
| `ROOM_FULL` | 400 | Room at max capacity |
| `ROOM_IN_PROGRESS` | 400 | Game already started |
| `NOT_HOST` | 403 | Only host can do this |
| `NOT_IN_ROOM` | 400 | You're not in this room |
| `INVALID_INPUT` | 400 | Validation failed |
| `SERVER_ERROR` | 500 | Internal error |
| `USERNAME_TAKEN` | 400 | Username in use |
| `USERNAME_INVALID` | 400 | Doesn't meet rules |

---

## 9. Rate Limiting

| Endpoint / Event | Limit |
|-----------------|-------|
| `POST /session` | 5 per minute per IP |
| `POST /rooms` | 3 per minute per session |
| `GET /rooms` | 30 per minute per IP |
| Socket connection | 3 per minute per IP |
| `chat:message` | 3 per second per session |
| `wordle:guess` | 1 per second per session |
| `scribble:draw` | 60 per second per session (batched) |
| `scribble:guess` | 2 per second per session |

Rate limit response:
```json
{
  "error": "RATE_LIMITED",
  "message": "Too many requests",
  "retryAfter": 5
}
```

---

## 10. Input Validation Rules

### Username
- Length: 3-16 characters
- Pattern: `^[a-zA-Z0-9_]+$`
- Not in reserved list
- Not in profanity list
- Trimmed, case-preserved but uniqueness check is case-insensitive

### Room Name
- Length: 1-32 characters
- Trimmed, sanitized (HTML entities stripped)

### Chat Message
- Length: 1-200 characters
- Trimmed
- HTML entities stripped (prevent XSS)
- Links: stripped (no external links in chat)

### Wordle Guess
- Exactly 5 letters (or word length setting)
- Lowercase a-z only
- Must be in word list

### Scribble Guess
- Length: 1-50 characters
- Trimmed, lowercased for comparison
- Levenshtein distance ≤ 2 from answer → "close guess" notification

---

## 11. JWT Token Structure

```json
{
  "sub": "sess_a1b2c3d4e5f6",
  "username": "CoolPlayer42",
  "iat": 1705747200,
  "exp": 1705833600
}
```

- Algorithm: HS256
- Secret: `process.env.JWT_SECRET` (32+ char random string)
- Expiry: 24 hours
- Refresh: client calls `POST /session` again before expiry
- No refresh tokens — stateless, simple

---

## 12. CORS Configuration

```typescript
{
  origin: [
    'https://playarena.dev',
    'https://www.playarena.dev',
    process.env.NODE_ENV === 'development' && 'http://localhost:3000',
  ].filter(Boolean),
  methods: ['GET', 'POST', 'DELETE'],
  credentials: true,
  maxAge: 86400,
}
```
