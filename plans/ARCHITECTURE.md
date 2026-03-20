# Architecture Plan — PlayArena (Multiplayer Game Platform)

## Project Name: **PlayArena**
> _"Where every round is a story."_

---

## 1. High-Level Architecture

```
┌───────────────────────────────────────────────────────────┐
│                    CLIENTS (Browsers)                     │
│         Next.js 14 App Router — Vercel Hosting            │
│  ┌─────────┐  ┌──────────┐  ┌──────────┐  ┌───────────┐  │
│  │  Wordle  │  │ Scribble │  │ Future   │  │  Lobby /  │  │
│  │  Game UI │  │ Game UI  │  │ Game UIs │  │  Profile  │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └─────┬─────┘  │
│       │              │             │              │        │
│       └──────────────┴─────────────┴──────────────┘        │
│                          │                                 │
│              Socket.IO Client + REST fetch                 │
└──────────────────────────┬─────────────────────────────────┘
                           │  wss:// + https://
┌──────────────────────────┴─────────────────────────────────┐
│              SERVER — Fastify + Socket.IO                  │
│                   Render Hosting                           │
│                                                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  REST API    │  │  Socket.IO   │  │  Game Engines    │  │
│  │  /api/rooms  │  │  Namespaces  │  │  (Wordle,        │  │
│  │  /api/health │  │  /wordle     │  │   Scribble, ...) │  │
│  │              │  │  /scribble   │  │                  │  │
│  └──────┬───────┘  │  /chat       │  └────────┬─────────┘  │
│         │          └──────┬───────┘           │            │
│         └─────────────────┴───────────────────┘            │
│                           │                                │
│              ┌────────────┴────────────┐                   │
│              │   In-Memory Store       │                   │
│              │   (Users, Rooms, Games, │                   │
│              │    Sessions, Chat)      │                   │
│              │   TTL: session + 1 hour │                   │
│              └─────────────────────────┘                   │
└────────────────────────────────────────────────────────────┘
```

---

## 2. Tech Stack

### Frontend (Next.js — Vercel)
| Layer | Tech | Why |
|-------|------|-----|
| Framework | **Next.js 14** (App Router) | SSR/SSG for SEO, file-based routing |
| Language | **TypeScript** | Type safety across client + shared types |
| Styling | **Tailwind CSS 4** + **Framer Motion** | Utility-first + buttery animations |
| State | **Zustand** | Lightweight, no boilerplate |
| Realtime | **socket.io-client** | Paired with Fastify Socket.IO server |
| Canvas | **HTML5 Canvas** (Scribble) | No heavy libs needed |
| Icons | **Lucide React** | Beautiful, consistent, tree-shakeable |
| Fonts | **Geist** (Vercel) + **Space Grotesk** | Modern, clean, gaming aesthetic |
| SEO | Next.js Metadata API | Per-page meta, Open Graph, JSON-LD |
| Sound | **Tone.js** or **Web Audio API** | Procedural sound effects |
| Toast/UI | **Sonner** + custom components | No heavy UI lib dependency |

### Backend (Fastify — Render)
| Layer | Tech | Why |
|-------|------|-----|
| Framework | **Fastify 5** | Fastest Node.js framework, plugin ecosystem |
| Realtime | **@fastify/socket.io** (Socket.IO 4) | Room management, namespaces, reconnection |
| Language | **TypeScript** | Shared types with frontend |
| Validation | **Zod** | Schema validation for API + socket events |
| CORS | **@fastify/cors** | Allow Vercel origin |
| Rate Limit | **@fastify/rate-limit** | Prevent abuse |
| Session | **In-memory Map** with TTL cleanup | No database needed |
| Word List | **Static JSON** (curated 5-letter words) | Loaded at startup |
| Logging | **Pino** (built into Fastify) | Structured JSON logs |

### Shared
| Layer | Tech |
|-------|------|
| Monorepo | **Turborepo** |
| Packages | `@playarena/shared` — types, constants, validation schemas |
| Package Manager | **pnpm** |

---

## 3. Monorepo Structure

```
playarena/
├── apps/
│   ├── web/                    # Next.js frontend
│   │   ├── app/
│   │   │   ├── layout.tsx      # Root layout, fonts, metadata
│   │   │   ├── page.tsx        # Landing page (game gallery)
│   │   │   ├── wordle/
│   │   │   │   ├── page.tsx    # Wordle SEO landing
│   │   │   │   ├── play/
│   │   │   │   │   └── page.tsx # Game player (client component)
│   │   │   │   └── room/
│   │   │   │       └── [code]/
│   │   │   │           └── page.tsx  # Room with code
│   │   │   ├── scribble/
│   │   │   │   ├── page.tsx
│   │   │   │   ├── play/
│   │   │   │   └── room/[code]/
│   │   │   └── profile/
│   │   │       └── page.tsx    # Temp profile page (stats, avatar)
│   │   ├── components/
│   │   │   ├── ui/             # Design system primitives
│   │   │   ├── game/           # Shared game components
│   │   │   ├── wordle/         # Wordle-specific components
│   │   │   ├── scribble/       # Scribble-specific components
│   │   │   ├── chat/           # Chat components
│   │   │   └── lobby/          # Room/lobby components
│   │   ├── hooks/
│   │   │   ├── useSocket.ts
│   │   │   ├── useRoom.ts
│   │   │   ├── useChat.ts
│   │   │   ├── useWordle.ts
│   │   │   └── useScribble.ts
│   │   ├── stores/
│   │   │   ├── userStore.ts
│   │   │   ├── roomStore.ts
│   │   │   └── gameStore.ts
│   │   ├── lib/
│   │   │   ├── socket.ts       # Socket.IO client singleton
│   │   │   ├── sounds.ts       # Sound effects
│   │   │   └── utils.ts
│   │   ├── public/
│   │   │   ├── og/             # Open Graph images per game
│   │   │   └── sounds/         # Optional sound files
│   │   ├── tailwind.config.ts
│   │   ├── next.config.ts
│   │   └── package.json
│   │
│   └── server/                 # Fastify backend
│       ├── src/
│       │   ├── index.ts        # Server entry point
│       │   ├── config.ts       # Environment config
│       │   ├── plugins/
│       │   │   ├── cors.ts
│       │   │   ├── rateLimit.ts
│       │   │   └── socketio.ts
│       │   ├── routes/
│       │   │   ├── health.ts
│       │   │   ├── rooms.ts
│       │   │   └── stats.ts
│       │   ├── socket/
│       │   │   ├── index.ts        # Namespace registration
│       │   │   ├── lobby.ts        # Connection, user creation
│       │   │   ├── wordle.ts       # Wordle game socket handlers
│       │   │   ├── scribble.ts     # Scribble game socket handlers
│       │   │   └── chat.ts         # Chat socket handlers
│       │   ├── engine/
│       │   │   ├── wordle.ts       # Wordle game logic
│       │   │   ├── scribble.ts     # Scribble game logic
│       │   │   └── bot.ts          # Bot solver logic
│       │   ├── store/
│       │   │   ├── memoryStore.ts  # In-memory store with TTL
│       │   │   ├── userStore.ts    # User sessions
│       │   │   ├── roomStore.ts    # Room management
│       │   │   └── gameStore.ts    # Active game states
│       │   ├── data/
│       │   │   └── words.json      # Curated word list
│       │   └── utils/
│       │       ├── roomCode.ts     # Generate 6-char room codes
│       │       └── timer.ts        # Game timer utilities
│       ├── package.json
│       └── tsconfig.json
│
├── packages/
│   └── shared/                 # Shared types & constants
│       ├── src/
│       │   ├── types/
│       │   │   ├── user.ts
│       │   │   ├── room.ts
│       │   │   ├── wordle.ts
│       │   │   ├── scribble.ts
│       │   │   ├── chat.ts
│       │   │   └── socket-events.ts  # All event names + payloads
│       │   ├── constants/
│       │   │   ├── games.ts
│       │   │   └── config.ts
│       │   └── index.ts
│       ├── package.json
│       └── tsconfig.json
│
├── turbo.json
├── pnpm-workspace.yaml
├── package.json
└── README.md
```

---

## 4. Session & Identity System (No Database)

### User Creation Flow
1. User visits site → prompted for **username** (3-16 chars, alphanumeric + underscore)
2. Server generates a **sessionId** (crypto.randomUUID)
3. Client stores `sessionId` in **localStorage** (not a cookie — no auth needed)
4. Server stores in memory: `Map<sessionId, UserSession>`

### UserSession Object
```typescript
interface UserSession {
  sessionId: string;
  username: string;
  avatarSeed: string;          // For DiceBear avatar generation
  createdAt: number;
  lastActiveAt: number;        // Updated on every socket event
  currentRoomId: string | null;
  stats: Record<GameType, PlayerStats>;
}
```

### TTL / Cleanup
- **Every 5 minutes**, server runs a cleanup sweep
- Removes sessions where `Date.now() - lastActiveAt > 1 hour`
- When user disconnects, `lastActiveAt` is updated → session persists 1 hour after disconnect
- When user reconnects with same `sessionId` from localStorage → session restored
- If session expired → user must pick a new username

### Reconnection
- Socket.IO `auth: { sessionId }` on connect
- Server validates sessionId → restores user to their room/game
- If mid-game disconnect → 60s grace period, opponent sees "Reconnecting..." 
- After 60s → auto-forfeit

---

## 5. Room System

### Room Types
| Type | Description | Max Players |
|------|-------------|-------------|
| **Quick Match** | Auto-matchmaking, random opponent | 2 |
| **Private Room** | 6-char invite code, share link | 2-8 (game dependent) |
| **Public Room** | Listed in lobby, anyone can join | 2-8 |

### Room Lifecycle
```
WAITING → STARTING (3s countdown) → IN_PROGRESS → FINISHED → (replay or dissolve)
```

### Room Object
```typescript
interface Room {
  id: string;
  code: string;              // 6-char join code (e.g., "ABCX42")
  type: 'quick' | 'private' | 'public';
  gameType: GameType;
  hostId: string;            // sessionId of creator
  players: string[];         // sessionIds
  spectators: string[];      // sessionIds (future feature)
  maxPlayers: number;
  state: RoomState;
  gameState: GameSpecificState | null;
  settings: GameSettings;
  chat: ChatMessage[];       // Last 100 messages
  createdAt: number;
}
```

---

## 6. Communication Protocol

### REST Endpoints (Fastify)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Server health check |
| POST | `/api/users` | Create session (username) |
| GET | `/api/rooms` | List public rooms |
| POST | `/api/rooms` | Create a room |
| GET | `/api/rooms/:code` | Get room info |
| GET | `/api/stats/:sessionId` | Get player stats |

### Socket.IO Namespaces & Events
```
/                     # Default namespace — connection, user auth
├── user:connect      # Auth with sessionId
├── user:disconnect   # Cleanup
│
/lobby                # Room management
├── lobby:create      # Create room
├── lobby:join        # Join by code
├── lobby:quick       # Quick match
├── lobby:leave       # Leave room
├── lobby:ready       # Toggle ready
├── lobby:start       # Host starts game
├── lobby:update      # Room state broadcast
│
/wordle               # Wordle game
├── wordle:guess      # Submit a guess
├── wordle:feedback   # Receive feedback
├── wordle:opponent   # Opponent progress update
├── wordle:hint       # Use bot hint (costs points)
├── wordle:finish     # Game end
├── wordle:replay     # Request replay
│
/scribble             # Scribble game
├── scribble:draw     # Drawing data stream
├── scribble:guess    # Word guess
├── scribble:correct  # Correct guess notification  
├── scribble:round    # New round start
├── scribble:turn     # Turn change
├── scribble:word     # Word options for drawer
│
/chat                 # In-game chat
├── chat:message      # Send message
├── chat:reaction     # React to message (emoji)
├── chat:system       # System messages (joins, leaves)
```

---

## 7. Performance Targets

| Metric | Target |
|--------|--------|
| First Contentful Paint | < 1.2s |
| Lighthouse Performance | > 95 |
| Lighthouse SEO | 100 |
| Socket latency (same region) | < 50ms |
| Reconnection time | < 2s |
| Memory per user session | < 5KB |
| Memory per active room | < 20KB |
| Max concurrent rooms | 1000+ (Render free tier limited) |

---

## 8. Security Considerations

- **Rate limiting** on all endpoints (100 req/min per IP)
- **Socket event rate limiting** (30 events/sec per socket)
- **Input sanitization** — all usernames, chat messages, guesses validated with Zod
- **Room code brute-force protection** — max 10 join attempts per minute
- **No sensitive data** — no passwords, no emails, no PII stored
- **CORS** locked to Vercel deployment URL + localhost
- **Chat message length cap** — 200 chars
- **Username profanity filter** — basic word list check
- **CSP headers** — Content Security Policy on Next.js

---

## 9. Hosting & Deployment

### Frontend — Vercel
- Auto-deploy from `apps/web` on push to `main`
- Preview deployments for PRs
- Edge functions for API routes (if needed)
- Custom domain: `playarena.vercel.app` (or custom)

### Backend — Render
- Web Service (free tier)
- Auto-deploy from `apps/server` on push to `main`
- Environment variables for CORS origin, port
- Health check endpoint: `/api/health`
- **Important**: Render free tier spins down after 15 min inactivity
  - Mitigate: Vercel cron job pings `/api/health` every 14 min
  - Or upgrade to Render paid tier ($7/mo)

### CI/CD
- **GitHub Actions**: lint → typecheck → test → build → deploy
- Turborepo caching for fast CI
