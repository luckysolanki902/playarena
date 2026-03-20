# Game Plan — Wordle (Multiplayer)

## Overview
Two (or more) players race to guess the **same secret word** in real time. See each other's progress live. First to solve wins. Bot hints available at a score penalty.

---

## 1. Game Modes

### 1A. Duel Mode (2 Players)
- Both players get the **same 5-letter word**
- Race to guess it in 6 attempts
- See opponent's grid live (letters hidden, only colors shown)
- First to solve wins; if both solve on same attempt → score tiebreaker
- If neither solves → both lose, word revealed

### 1B. Party Mode (3-8 Players)
- Same concept as Duel but with a room of players
- Leaderboard shown in real-time as players solve
- Rankings: 1st, 2nd, 3rd... with point awards
- Players who fail see the word at the end

### 1C. Single Player
- Classic Wordle — guess in 6 attempts
- **Bot Assist**: press a button to get the bot's suggestion for that attempt
  - First hint: **free** (no penalty)
  - Second hint: **-50 points**
  - Third+ hints: **-100 points each**
  - Using a hint marks that round with a "hint used" badge
- **Bot Auto-Play**: watch the bot solve it (for fun, no score)
- Score system encourages independence

---

## 2. Scoring System

### Base Score
| Solved in | Points |
|-----------|--------|
| Attempt 1 | 1000 (near impossible, legendary) |
| Attempt 2 | 800 |
| Attempt 3 | 600 |
| Attempt 4 | 400 |
| Attempt 5 | 250 |
| Attempt 6 | 100 |
| Failed | 0 |

### Multiplayer Bonuses
| Bonus | Points | Condition |
|-------|--------|-----------|
| Speed Bonus | +50 to +200 | Based on time taken (faster = more) |
| First Solver | +150 | First player to solve |
| Streak Bonus | +25 per streak | Consecutive wins (capped at +250) |
| Flawless | +100 | No incorrect letters at all |
| Underdog | +75 | Won with fewer attempts remaining |

### Penalties
| Penalty | Points | Condition |
|---------|--------|-----------|
| Bot Hint (2nd) | -50 | Used 2nd bot hint in single player |
| Bot Hint (3rd+) | -100 each | Used 3+ bot hints |
| Slow Penalty | -25 | Took more than 3 minutes total |

### ELO-like Rating (Multiplayer)
- Each player has a **rating** (starts at 1000)
- Win against higher-rated player → big gain
- Lose against lower-rated player → big loss
- Stored in session (resets when session expires)

---

## 3. Game Flow

### Multiplayer Flow
```
┌─────────────┐     ┌──────────────┐     ┌──────────────────┐
│  Room Lobby  │ ──→ │  Countdown   │ ──→ │   Game Active    │
│  (players    │     │  3... 2... 1 │     │  Both guessing   │
│   join/ready)│     │  Word picked │     │  Live opponent   │
└─────────────┘     └──────────────┘     │  grid visible    │
                                          └────────┬─────────┘
                                                   │
                                          ┌────────▼─────────┐
                                          │   Game Over       │
                                          │  Winner announced │
                                          │  Stats shown      │
                                          │  Word revealed    │
                                          │  [Replay] [Menu]  │
                                          └──────────────────┘
```

### Single Player Flow
```
┌─────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  Mode Select │ ──→ │   Game Active    │ ──→ │   Game Over       │
│  (Single)    │     │  Guessing        │     │  Score shown      │
│              │     │  Bot hint button │     │  [Replay] [Menu]  │
└─────────────┘     │  Timer running   │     └──────────────────┘
                     └──────────────────┘
```

---

## 4. Real-Time Opponent View

### What you see of your opponent:
- Their grid: **colored tiles only** (green/yellow/gray) — **no letters visible**
- Which attempt they're on (attempt counter)
- A "typing..." indicator when they're entering a guess
- A checkmark animation when they submit
- Their score (live-updated)
- A pulsing avatar border when they solve it

### Privacy:
- Never reveal opponent's letters until game over
- After game over → full grids revealed for both players

---

## 5. Game State Object

```typescript
interface WordleGameState {
  word: string;                          // Server-only, never sent to clients
  wordHash: string;                      // SHA-256, sent for verification
  startedAt: number;
  timeLimit: number;                     // 0 = unlimited, or 180000 (3 min)
  players: Record<string, WordlePlayerState>;
  status: 'active' | 'finished';
  winnerId: string | null;
  settings: WordleSettings;
}

interface WordlePlayerState {
  sessionId: string;
  guesses: string[];                     // Server stores actual letters
  feedbacks: LetterFeedback[][];         // Sent to all players
  solved: boolean;
  solvedAtAttempt: number | null;
  solvedAtTime: number | null;           // ms since game start
  score: number;
  hintsUsed: number;
  isTyping: boolean;
}

interface WordleSettings {
  maxAttempts: 6;
  wordLength: 5;
  timeLimit: 0 | 120 | 180 | 300;       // seconds, 0 = unlimited
  hardMode: boolean;                     // Must use revealed hints
  difficulty: 'normal' | 'hard';         // Word difficulty filter
}

type LetterFeedback = 'correct' | 'present' | 'absent';
```

---

## 6. Socket Events

### Client → Server
| Event | Payload | Description |
|-------|---------|-------------|
| `wordle:guess` | `{ roomId, guess }` | Submit a 5-letter guess |
| `wordle:hint` | `{ roomId }` | Request bot hint (single player) |
| `wordle:typing` | `{ roomId, isTyping }` | Typing indicator |
| `wordle:replay` | `{ roomId }` | Request to play again |
| `wordle:settings` | `{ roomId, settings }` | Host changes settings |

### Server → Client
| Event | Payload | Description |
|-------|---------|-------------|
| `wordle:start` | `{ wordHash, settings, players }` | Game started |
| `wordle:feedback` | `{ guess, feedback, attempt }` | Your guess result |
| `wordle:opponent` | `{ playerId, feedback, attempt, isTyping }` | Opponent update (no letters!) |
| `wordle:solved` | `{ playerId, attempt, time, score }` | Someone solved it |
| `wordle:gameover` | `{ winnerId, word, scores, stats }` | Game ended |
| `wordle:hint-result` | `{ suggestion, penalty }` | Bot hint response |
| `wordle:replay-request` | `{ playerId }` | Opponent wants replay |
| `wordle:countdown` | `{ seconds }` | Pre-game countdown |
| `wordle:tick` | `{ elapsed }` | Timer sync (every 10s) |

---

## 7. Validation Rules

- Guess must be exactly 5 alphabetic characters
- Guess must be in the valid word list (server validates)
- Max 6 attempts
- Cannot submit while opponent's round is being animated (client-side throttle)
- Hard mode: must use all revealed greens/yellows in subsequent guesses
- Cannot request hint after game over
- Cannot guess after solving or after 6 attempts

---

## 8. Bot Hint System (Single Player)

### Bot Behavior
- Uses frequency analysis of remaining candidates (same algo as pygame version, optimized)
- Returns top 3 suggestions with brief reasoning
- Displays in a slide-out panel (similar to pygame sidebar)

### Hint UI
- Floating button below grid: "Ask Bot 🤖"
- First use: green label "FREE"
- Second use: orange label "-50pts"
- Third+: red label "-100pts"
- Clicking shows a drawer with bot's analysis:
  - "I narrowed it down to 47 words"
  - "Letters confirmed: A, R"
  - "My suggestion: CRANE (best coverage)"
  - "Other options: SLATE, TRACE"

---

## 9. Post-Game Screen

### Elements
1. **Winner banner** with confetti animation
2. **Word reveal** — the secret word, large and animated
3. **Side-by-side grids** — both players' full grids with letters now visible
4. **Score breakdown**:
   - Base score
   - Speed bonus
   - First solver bonus
   - Streak bonus
   - Final score
5. **Stats update** — games played, win rate, streak
6. **Action buttons**:
   - 🔄 **Play Again** (R) — same opponent, new word
   - 🏠 **Back to Lobby** (ESC)
   - 📤 **Share Result** — copy shareable grid (emoji squares)
7. **Chat** stays visible for post-game banter

### Shareable Result Format
```
🎮 PlayArena Wordle — Duel
🏆 Player1 beat Player2!

Player1: ⬛⬛🟨⬛⬛ → 🟩🟩🟩🟩🟩 (3/6)
Player2: ⬛🟨⬛⬛⬛ → ❌ (6/6)

🔗 playarena.vercel.app/wordle
```

---

## 10. Special Features

### 1. "Ghost Mode" (Unlockable)
- After 5 wins: unlock ghost mode
- Opponent's grid is completely hidden until game over
- Higher stakes, higher score multiplier (1.5x)

### 2. Daily Challenge
- One word per day, everyone plays the same word
- Global leaderboard for the day
- Compare with friends via share code

### 3. Word Categories (Room Setting)
- General (default)
- Animals only
- Food only
- Technology
- Hard words (obscure)
- Easy words (common)

### 4. Emoji Reactions (During Game)
- Quick-send emoji reactions: 😱 🔥 🤔 😂 💀 👏
- Appear as floating bubbles above opponent's grid
- Adds social fun without revealing info

### 5. "Sudden Death" Mode
- After both players use 4 attempts, a 30-second timer starts
- Must solve before timer runs out
- Creates clutch moments
