# 🎮 PlayArena

Real-time multiplayer games platform. No sign-up. Just play.

## Games
- **Wordle** — 5 letters, 6 guesses, real-time duels
- **Scribble** — Draw, guess, and laugh together *(coming soon)*
- **More** — TypeRacer, Trivia, Connect Four *(planned)*

## Tech Stack
| Layer | Tech |
|-------|------|
| Frontend | Next.js 15, React 19, Tailwind CSS 4, Framer Motion, Zustand |
| Backend | Fastify 5, Socket.IO 4, JWT |
| Shared | TypeScript, Turborepo monorepo |
| Hosting | Vercel (frontend) + Render (backend) |

## Getting Started

```bash
# Install dependencies
pnpm install

# Start development (frontend + backend)
pnpm dev

# Frontend: http://localhost:3000
# Backend:  http://localhost:4000
```

## Project Structure
```
playarena/
├── apps/
│   ├── web/          # Next.js frontend
│   └── server/       # Fastify + Socket.IO backend
├── packages/
│   └── shared/       # Shared types, validation, utils
├── turbo.json        # Turborepo config
└── pnpm-workspace.yaml
```
