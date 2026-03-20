# Deployment & DevOps — PlayArena

## Hosting Overview

| Service | Platform | Plan | Purpose |
|---------|----------|------|---------|
| Frontend (Next.js) | **Vercel** | Free / Pro | SSR, static, edge functions |
| Backend (Fastify + Socket.IO) | **Render** | Free / Starter | Persistent WebSocket server |
| Domain | **playarena.dev** | — | Custom domain |
| DNS | **Cloudflare** | Free | DNS + CDN + DDoS protection |

---

## 1. Vercel Configuration (Frontend)

### Project Setup
```bash
# Connect repo → Vercel dashboard
# Root directory: apps/web
# Framework: Next.js (auto-detected)
# Build: pnpm build
# Output: .next
```

### vercel.json
```json
{
  "buildCommand": "cd ../.. && pnpm turbo build --filter=web",
  "installCommand": "cd ../.. && pnpm install",
  "framework": "nextjs",
  "outputDirectory": ".next"
}
```

### Environment Variables (Vercel Dashboard)
```
NEXT_PUBLIC_API_URL=https://api.playarena.dev
NEXT_PUBLIC_SOCKET_URL=https://api.playarena.dev
NEXT_PUBLIC_SITE_URL=https://playarena.dev
```

### Vercel Features to Enable
- **Analytics** — Web Vitals tracking (free tier)
- **Speed Insights** — Performance monitoring
- **Edge Config** — Feature flags (optional, future)
- **Preview Deployments** — Auto-deploy PRs
- **Production Branch** — `main`

---

## 2. Render Configuration (Backend)

### Service Setup
- **Type:** Web Service
- **Runtime:** Node
- **Region:** US East (closest to Vercel default)
- **Root Directory:** `apps/server`
- **Build Command:** `cd ../.. && pnpm install && pnpm turbo build --filter=server`
- **Start Command:** `node dist/index.js`

### render.yaml (Blueprint)
```yaml
services:
  - type: web
    name: playarena-api
    runtime: node
    region: ohio
    plan: starter
    buildCommand: cd ../.. && pnpm install && pnpm turbo build --filter=server
    startCommand: node dist/index.js
    healthCheckPath: /health
    envVars:
      - key: NODE_ENV
        value: production
      - key: PORT
        value: 4000
      - key: JWT_SECRET
        generateValue: true
      - key: CORS_ORIGINS
        value: https://playarena.dev,https://www.playarena.dev
      - key: LOG_LEVEL
        value: info
```

### Render Considerations
- **Free tier:** Spins down after 15 min idle → 30s cold start (bad for WebSocket)
- **Starter ($7/mo):** Always on — recommended for production
- **WebSocket support:** Yes, native. No special config needed.
- **Auto-deploy:** Connect GitHub repo, deploys on push to `main`

---

## 3. Domain & DNS (Cloudflare)

### DNS Records
```
Type  Name              Value                     Proxy
A     playarena.dev     76.76.21.21 (Vercel)      ✅
CNAME www               cname.vercel-dns.com      ✅
CNAME api               playarena-api.onrender.com ✅ (or DNS-only if WS issues)
```

### Cloudflare Settings
- **SSL/TLS:** Full (strict)
- **Always Use HTTPS:** On
- **Minimum TLS:** 1.2
- **HTTP/2:** On
- **WebSockets:** On (important for Socket.IO)
- **Caching:** Default rules (Next.js handles its own caching)
- **Rate limiting:** Basic DDoS protection (free tier)

> **Note:** If WebSocket connections drop through Cloudflare proxy, switch `api` CNAME to DNS-only mode (gray cloud).

---

## 4. CI/CD Pipeline (GitHub Actions)

### Workflow: `.github/workflows/ci.yml`
```yaml
name: CI/CD

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm lint

  test-unit:
    needs: quality
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm test -- --coverage
      - uses: actions/upload-artifact@v4
        with:
          name: coverage
          path: coverage/

  test-e2e:
    needs: test-unit
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm turbo build
      - run: npx playwright install --with-deps chromium
      - run: pnpm test:e2e
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: tests/e2e/test-results/

  # Deployment is handled by Vercel + Render GitHub integrations
  # No manual deploy steps needed in CI
```

### Branch Strategy
```
main (production)
  └── feat/wordle-scoring    (feature branch → PR → merge)
  └── fix/socket-reconnect   (bugfix branch → PR → merge)
```

- Direct push to `main` blocked — must go through PR
- PRs require: passing CI + 1 approval (if team grows)
- Vercel auto-deploys `main` to production
- Vercel auto-deploys PR branches to preview URLs
- Render auto-deploys `main` to production

---

## 5. Environment Variables Summary

### Frontend (Vercel)
| Variable | Value | Public |
|----------|-------|--------|
| `NEXT_PUBLIC_API_URL` | `https://api.playarena.dev` | Yes |
| `NEXT_PUBLIC_SOCKET_URL` | `https://api.playarena.dev` | Yes |
| `NEXT_PUBLIC_SITE_URL` | `https://playarena.dev` | Yes |

### Backend (Render)
| Variable | Value | Public |
|----------|-------|--------|
| `NODE_ENV` | `production` | — |
| `PORT` | `4000` | — |
| `JWT_SECRET` | (generated, 64+ chars) | **No** |
| `CORS_ORIGINS` | `https://playarena.dev,https://www.playarena.dev` | — |
| `LOG_LEVEL` | `info` | — |

### Local Development (`.env.local`)
```
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_SOCKET_URL=http://localhost:4000
NEXT_PUBLIC_SITE_URL=http://localhost:3000
JWT_SECRET=dev-secret-change-in-production-abc123
PORT=4000
```

> `.env.local` is gitignored. `.env.example` is committed with placeholder values.

---

## 6. Monitoring & Observability

### Logging (Backend)
- **Pino** logger (built into Fastify)
- Structured JSON logs in production
- Pretty-print in development
- Log levels: `error`, `warn`, `info`, `debug`
- Key events logged: session create/expire, room lifecycle, game events, errors

### Monitoring (Free Tier)
| Tool | Purpose | Cost |
|------|---------|------|
| Vercel Analytics | Web Vitals, page views | Free |
| Render Dashboard | CPU, memory, request count | Free |
| UptimeRobot | Uptime monitoring (5-min checks) | Free |
| Sentry (free tier) | Error tracking (both frontend + backend) | Free (5K events/mo) |

### Sentry Setup
```typescript
// Frontend: apps/web/instrumentation.ts
import * as Sentry from '@sentry/nextjs';
Sentry.init({ dsn: process.env.NEXT_PUBLIC_SENTRY_DSN, tracesSampleRate: 0.1 });

// Backend: apps/server/src/index.ts
import * as Sentry from '@sentry/node';
Sentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 0.1 });
```

### Health Check
- Render pings `GET /health` every 30s
- UptimeRobot pings both `playarena.dev` and `api.playarena.dev/health`
- Alerts via email (or Discord webhook) on downtime

---

## 7. Performance Targets

| Metric | Target | Tool |
|--------|--------|------|
| First Contentful Paint | < 1.2s | Vercel Analytics |
| Largest Contentful Paint | < 2.5s | Lighthouse |
| Time to Interactive | < 3.5s | Lighthouse |
| Cumulative Layout Shift | < 0.1 | Lighthouse |
| Lighthouse Score | > 95 (all categories) | CI check |
| Socket connection time | < 200ms | Custom logging |
| Socket event latency | < 50ms | Custom logging |
| API response time (p95) | < 100ms | Render dashboard |
| Uptime | > 99.5% | UptimeRobot |

---

## 8. Scaling Considerations (Future)

### When Free Tier Isn't Enough
| Trigger | Action |
|---------|--------|
| > 100 concurrent WebSocket connections | Upgrade Render to Starter ($7/mo) |
| > 500 concurrent players | Add Redis (Render Redis) for session store + Socket.IO adapter |
| > 1000 concurrent players | Horizontal scale: multiple Render instances + Redis pub/sub |
| Global audience | Add Render regions (EU, Asia) + Cloudflare edge routing |
| Need persistence | Add PostgreSQL (Render managed) for stats, leaderboards |

### Socket.IO Scaling Path
```
Phase 1: Single server (in-memory) — up to ~500 connections
Phase 2: Redis adapter — multiple server instances share state
Phase 3: Redis cluster + sticky sessions — thousands of connections
```

---

## 9. Local Development Setup

```bash
# Clone
git clone https://github.com/username/playarena.git
cd playarena

# Install
pnpm install

# Start all (Turborepo)
pnpm dev
# → Frontend: http://localhost:3000
# → Backend:  http://localhost:4000

# Or start individually
pnpm --filter web dev
pnpm --filter server dev

# Run tests
pnpm test                    # All unit + integration
pnpm test:e2e                # Playwright E2E
pnpm lint                    # ESLint + Biome
pnpm typecheck               # TypeScript

# Build
pnpm build                   # Turborepo builds all packages
```

---

## 10. Pre-Launch Checklist

- [ ] All E2E tests pass
- [ ] Lighthouse score > 95 on all pages
- [ ] WebSocket connections work through Cloudflare
- [ ] JWT_SECRET is a strong random value (not default)
- [ ] CORS origins are production-only
- [ ] Rate limiting tested and working
- [ ] Error tracking (Sentry) receiving events
- [ ] Uptime monitoring configured
- [ ] `.env.local` is gitignored
- [ ] No secrets in client-side code
- [ ] Profanity filter loaded
- [ ] Mobile tested on real devices (iOS Safari, Android Chrome)
- [ ] OG/meta tags render correctly (social preview)
- [ ] 404 page exists and is styled
- [ ] Favicon + PWA manifest
