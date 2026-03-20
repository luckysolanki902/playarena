# Testing Strategy — PlayArena

## Testing Philosophy
Test what matters. Game logic must be bulletproof. UI should be tested for critical flows. Don't chase 100% coverage — focus on correctness, edge cases, and real user scenarios.

---

## 1. Tech Stack

| Layer | Tool | Purpose |
|-------|------|---------|
| Unit tests | **Vitest** | Fast, ESM-native, TypeScript-first |
| Component tests | **React Testing Library** | Test components as users use them |
| E2E tests | **Playwright** | Cross-browser, real flow testing |
| Socket testing | **socket.io-client** (in Vitest) | Test real-time events |
| API testing | **Supertest** (via Vitest) | HTTP endpoint testing |
| Coverage | **V8 coverage** (built into Vitest) | Coverage reports |
| Linting | **ESLint + Biomee** | Code quality |
| Type checking | **TypeScript strict** | Compile-time safety |

---

## 2. Testing Layers

### Layer 1: Unit Tests (Most tests here)
**What:** Pure functions, game logic, utilities, validation  
**Where:** `*.test.ts` next to source files  
**Speed:** <5s for entire suite  

#### Game Logic (Critical — must be exhaustive)

**Wordle Logic:**
```
tests/
  server/games/wordle/
    wordValidator.test.ts     — word in list, correct length, only letters
    feedbackEngine.test.ts    — correct/present/absent for all edge cases
    scoringEngine.test.ts     — base score, bonuses, penalties, ELO
    botSolver.test.ts         — hint quality, penalty calculation
    roundManager.test.ts      — round lifecycle, turn order, timeouts
```

Key test cases for feedback engine:
- All correct (GGGGG)
- All absent
- Duplicate letters in guess (e.g., guess "SLEEP" for target "CREEP")
- Duplicate letters in target
- Letter correct in one position, present in another
- Same letter guessed twice, only one in target → one correct, one absent

**Scribble Logic:**
```
tests/
  server/games/scribble/
    wordSelector.test.ts      — categories, difficulty, no repeats
    guessChecker.test.ts      — exact match, close match (Levenshtein), case insensitive
    hintEngine.test.ts        — correct timing, correct letters revealed
    scoringEngine.test.ts     — guesser score by speed, drawer score by count
    drawValidator.test.ts     — stroke format validation, coordinate bounds
```

**Shared Logic:**
```
tests/
  server/
    session.test.ts           — create, validate, expire, username rules
    room.test.ts              — create, join, leave, kick, capacity, lifecycle
    rateLimiter.test.ts       — limits enforced, cleanup, per-IP vs per-session
    profanityFilter.test.ts   — catches bad words, passes clean words
    validation.test.ts        — input sanitization, XSS prevention
```

### Layer 2: Integration Tests
**What:** API endpoints, socket event flows, multi-component interactions  
**Where:** `*.integration.test.ts`  
**Speed:** <30s  

#### API Integration
```typescript
// Example: room creation flow
describe('Room API', () => {
  it('creates a room and returns join code', async () => {
    const session = await createSession('TestUser');
    const room = await request(app)
      .post('/rooms')
      .set('Authorization', `Bearer ${session.token}`)
      .send({ game: 'wordle', visibility: 'private', maxPlayers: 4 })
      .expect(201);
    
    expect(room.body.code).toMatch(/^[A-Z0-9]{6}$/);
  });

  it('rejects room creation without auth', async () => {
    await request(app)
      .post('/rooms')
      .send({ game: 'wordle' })
      .expect(401);
  });
});
```

#### Socket Integration
```typescript
// Example: full Wordle round
describe('Wordle Socket Flow', () => {
  it('completes a 2-player round', async () => {
    const [p1, p2] = await createConnectedPlayers(2);
    const room = await createAndJoinRoom(p1, p2, 'wordle');
    
    // Host starts
    p1.emit('lobby:start-game', { roomId: room.id });
    
    // Both receive round-start
    const roundStart = await waitForEvent(p1, 'wordle:round-start');
    expect(roundStart.round).toBe(1);
    
    // P1 guesses
    p1.emit('wordle:guess', { roomId: room.id, word: 'stare' });
    const result = await waitForEvent(p1, 'wordle:guess-result');
    expect(result.feedback).toHaveLength(5);
    
    // P2 sees opponent update
    const opponentUpdate = await waitForEvent(p2, 'wordle:opponent-guess');
    expect(opponentUpdate.sessionId).toBe(p1.sessionId);
  });
});
```

### Layer 3: Component Tests
**What:** React components rendered in isolation  
**Where:** `*.test.tsx` next to components  
**Speed:** <15s  

Key components to test:
- `GameBoard` — renders correct number of rows/tiles, shows feedback colors
- `Keyboard` — highlights used letters, fires onKeyPress
- `Timer` — counts down, triggers warning state at 10s
- `Chat` — sends messages, renders history, handles system messages
- `RoomLobby` — shows players, settings, start button (host only)
- `Canvas` (Scribble) — tool selection, color change, undo

```typescript
// Example
describe('WordleBoard', () => {
  it('renders 6 rows of 5 tiles', () => {
    render(<WordleBoard guesses={[]} currentGuess="" wordLength={5} />);
    expect(screen.getAllByRole('cell')).toHaveLength(30);
  });

  it('shows feedback colors after guess', () => {
    const guesses = [{ word: 'STARE', feedback: ['correct', 'absent', 'present', 'absent', 'correct'] }];
    render(<WordleBoard guesses={guesses} currentGuess="" wordLength={5} />);
    const firstTile = screen.getAllByRole('cell')[0];
    expect(firstTile).toHaveClass('bg-wordle-correct');
  });
});
```

### Layer 4: E2E Tests (Playwright)
**What:** Full user flows in a real browser  
**Where:** `tests/e2e/`  
**Speed:** <2 min  

#### Critical E2E Flows
```
tests/e2e/
  landing.spec.ts          — enter username, see games, navigate
  wordle-solo.spec.ts      — play a full solo Wordle game
  wordle-multi.spec.ts     — 2 browser contexts, full multiplayer game
  scribble-multi.spec.ts   — draw + guess flow
  room-flow.spec.ts        — create room, share code, join, start
  chat.spec.ts             — send messages, see in other context
  mobile.spec.ts           — responsive layout, touch interactions
  reconnect.spec.ts        — disconnect + reconnect, state preserved
```

```typescript
// Example: multiplayer Wordle E2E
test('two players complete a Wordle game', async ({ browser }) => {
  const ctx1 = await browser.newContext();
  const ctx2 = await browser.newContext();
  const p1 = await ctx1.newPage();
  const p2 = await ctx2.newPage();

  // P1 creates room
  await p1.goto('/');
  await p1.fill('[data-testid="username-input"]', 'Player1');
  await p1.click('[data-testid="play-button"]');
  await p1.click('[data-testid="game-wordle"]');
  await p1.click('[data-testid="create-room"]');
  const code = await p1.textContent('[data-testid="room-code"]');

  // P2 joins with code
  await p2.goto('/');
  await p2.fill('[data-testid="username-input"]', 'Player2');
  await p2.click('[data-testid="play-button"]');
  await p2.click('[data-testid="join-room"]');
  await p2.fill('[data-testid="room-code-input"]', code!);
  await p2.click('[data-testid="join-button"]');

  // P1 starts game
  await p1.click('[data-testid="start-game"]');
  
  // Both see the game board
  await expect(p1.locator('[data-testid="game-board"]')).toBeVisible();
  await expect(p2.locator('[data-testid="game-board"]')).toBeVisible();
});
```

---

## 3. Test Organization

```
playarena/
├── apps/
│   ├── web/
│   │   ├── components/
│   │   │   ├── WordleBoard.tsx
│   │   │   └── WordleBoard.test.tsx      ← Component test
│   │   └── vitest.config.ts
│   ├── server/
│   │   ├── games/wordle/
│   │   │   ├── feedbackEngine.ts
│   │   │   └── feedbackEngine.test.ts    ← Unit test
│   │   ├── routes/
│   │   │   ├── rooms.ts
│   │   │   └── rooms.integration.test.ts ← Integration test
│   │   └── vitest.config.ts
├── tests/
│   └── e2e/
│       ├── wordle-multi.spec.ts           ← E2E test
│       └── playwright.config.ts
└── packages/
    └── shared/
        ├── validation.ts
        └── validation.test.ts             ← Shared unit test
```

---

## 4. CI Pipeline (Test Runs)

```yaml
# Triggered on: push to main, PR to main
jobs:
  lint:
    - pnpm lint          # ESLint + Biome
    - pnpm typecheck     # tsc --noEmit

  test-unit:
    - pnpm --filter server test
    - pnpm --filter web test
    - pnpm --filter shared test

  test-e2e:
    needs: [lint, test-unit]
    - Start server (background)
    - Start web (background)
    - pnpm playwright test
    - Upload test artifacts on failure (screenshots, traces)
```

---

## 5. Coverage Targets

| Area | Target | Rationale |
|------|--------|-----------|
| Game logic (server) | **90%+** | Core correctness — bugs here ruin gameplay |
| Validation / security | **95%+** | XSS, injection, rate limiting must be solid |
| Socket handlers | **80%+** | Event routing + error handling |
| API routes | **85%+** | All endpoints + error responses |
| React components | **70%+** | Critical UI, skip pure styling |
| E2E flows | N/A | Cover the 8 critical flows listed above |
| Overall | **80%+** | Healthy balance |

---

## 6. Test Utilities

### Shared Helpers (`tests/utils/`)

```typescript
// createSession — create a test session with auth token
async function createSession(username: string): Promise<{ sessionId: string; token: string }>;

// createConnectedPlayers — create N socket.io clients with sessions
async function createConnectedPlayers(count: number): Promise<TestPlayer[]>;

// createAndJoinRoom — create room and have all players join
async function createAndJoinRoom(host: TestPlayer, ...guests: TestPlayer[]): Promise<Room>;

// waitForEvent — promise that resolves on next socket event
function waitForEvent<T>(socket: Socket, event: string, timeout?: number): Promise<T>;

// typeWord — simulate typing a word on the Wordle keyboard (E2E)
async function typeWord(page: Page, word: string): Promise<void>;

// drawLine — simulate drawing on Scribble canvas (E2E)
async function drawLine(page: Page, from: [number, number], to: [number, number]): Promise<void>;
```

---

## 7. What NOT to Test

- Tailwind CSS classes (visual regression, not functional)
- Third-party library internals (Framer Motion, Socket.IO)
- Pure type definitions
- Static pages with no interactivity
- Console.log output
- Exact animation durations or easing
