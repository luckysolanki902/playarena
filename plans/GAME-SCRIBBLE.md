# Game Plan — Scribble (Multiplayer Drawing Game)

## Overview
A drawing-and-guessing party game. One player draws, others guess the word from the drawing in real time. Rotate turns. Beautiful canvas with rich tools.

---

## 1. Game Modes

### 1A. Classic Mode (3-8 Players)
- Players take turns drawing
- Each round: drawer picks from 3 word options
- Other players type guesses in chat
- Points for guessing correctly (faster = more) + drawer gets points per correct guesser
- Fixed number of rounds (each player draws once or twice)

### 1B. Duel Mode (2 Players)
- Alternating turns: one draws, one guesses
- Best of 5 rounds (each player draws 2-3 times)
- Tighter time limits, more intense

### 1C. Speed Draw (2-8 Players)
- 15-second drawing rounds
- Everyone draws the SAME word simultaneously
- After 15s, all drawings revealed side by side
- Players vote on best drawing
- Hilarious and chaotic

### 1D. Single Player — Practice
- Random word, draw it yourself (relaxation mode)
- Or: AI guesses your drawing (using simple pattern matching — stretch goal)
- No scoring, just fun

---

## 2. Scoring System

### Guesser Scoring
| Speed | Points | Condition |
|-------|--------|-----------|
| First correct | 500 | First to guess in the round |
| Fast guess | 400 | Within first 25% of time |
| Medium guess | 300 | Within 25-50% of time |
| Slow guess | 200 | Within 50-75% of time |
| Late guess | 100 | Last 25% of time |

### Drawer Scoring
| Condition | Points |
|-----------|--------|
| Per correct guesser | +100 |
| All players guessed | +200 bonus |
| Half+ guessed in first 30s | +150 bonus |
| No one guessed | 0 (tough luck) |

### Bonuses
| Bonus | Points | Condition |
|-------|--------|-----------|
| Streak (3 correct in a row) | +75 | Guesser guesses 3 rounds straight |
| Perfect Round | +200 | Everyone guesses correctly |
| Speed Demon | +100 | Guess within 5 seconds |
| Artistic | Voted | Speed Draw mode vote winner |

---

## 3. Game Flow

```
┌──────────────┐     ┌──────────────────┐     ┌───────────────────────┐
│  Room Lobby  │ ──→ │  Round Start     │ ──→ │  Drawing Phase        │
│  3-8 players │     │  Drawer assigned │     │  Drawer: Canvas tools │
│  Host starts │     │  Word options(3) │     │  Others: Guess in chat│
└──────────────┘     │  Drawer picks    │     │  Timer: 60-90s        │
                     │  3s countdown    │     │  Hints reveal letters │
                     └──────────────────┘     │  over time            │
                                               └───────────┬───────────┘
                                                           │
              ┌────────────────────────────────────────────▼──────────┐
              │  Round End                                            │
              │  Word revealed, scores shown, correct guessers listed │
              │  5s pause → next round (or game over)                 │
              └──────────────────────────────────────────────────────┘
```

---

## 4. Drawing Canvas

### Canvas Features
| Feature | Description |
|---------|-------------|
| **Brush** | Freehand drawing, adjustable size (3 sizes) |
| **Eraser** | Erase strokes |
| **Color Palette** | 16 colors: black, white, gray, red, orange, yellow, green, cyan, blue, purple, pink, brown, dark green, navy, maroon, beige |
| **Fill Bucket** | Flood fill an area with color |
| **Undo** | Undo last stroke (up to 20) |
| **Clear** | Clear entire canvas |
| **Line Tool** | Draw straight lines |
| **Circle Tool** | Draw circles/ovals |
| **Rectangle Tool** | Draw rectangles |

### Canvas Technical
- HTML5 Canvas (2D context)
- Drawing data encoded as compact strokes:
  ```typescript
  interface Stroke {
    tool: 'brush' | 'eraser' | 'line' | 'circle' | 'rect' | 'fill';
    color: string;
    size: number;
    points: [number, number][];  // Normalized 0-1 coordinates (responsive!)
  }
  ```
- Strokes streamed via Socket.IO in real-time (batched per 50ms)
- Canvas is responsive — coordinates normalized to 0-1 range
- Replay all strokes on join/reconnect

### Canvas Size
- Desktop: 800x600px viewport (scales)
- Tablet: Full width, 4:3 ratio
- Mobile: Full width, square ratio
- All coordinates normalized → pixel-perfect at any size

---

## 5. Game State Object

```typescript
interface ScribbleGameState {
  status: 'lobby' | 'active' | 'finished';
  currentRound: number;
  totalRounds: number;
  currentDrawerId: string;
  currentWord: string;          // Server-only, never sent to guessers
  currentWordLength: number;    // Sent to all for hint underscores
  currentHints: number[];       // Indices of revealed letters
  roundStartedAt: number;
  roundTimeLimit: number;       // seconds (60, 80, or 90)
  players: Record<string, ScribblePlayerState>;
  drawOrder: string[];          // Rotation order
  strokes: Stroke[];            // Current canvas
  settings: ScribbleSettings;
}

interface ScribblePlayerState {
  sessionId: string;
  username: string;
  score: number;
  hasGuessedThisRound: boolean;
  guessedAtTime: number | null;  // ms into the round
  isDrawing: boolean;
  streak: number;
}

interface ScribbleSettings {
  rounds: 2 | 3 | 4;           // Rounds per player
  drawTime: 60 | 80 | 90;      // Seconds per round
  wordDifficulty: 'easy' | 'medium' | 'hard';
  customWords: string[];        // Host can add custom words
  hintsEnabled: boolean;        // Auto-reveal letters over time
}
```

---

## 6. Word Hint System

### Auto-Hints (During Drawing Phase)
- At **33%** of time: first letter revealed → `C _ _ _ _`
- At **66%** of time: one more random letter → `C _ A _ _`
- Last **10 seconds**: word length shown with bars → `C R A _ E`

### Word Display
- Top of screen: `_ _ _ _ _` (underscores for unguessed)
- Letters fill in as hints are revealed
- Correct guessers see the full word with a ✓

---

## 7. Socket Events

### Client → Server
| Event | Payload | Description |
|-------|---------|-------------|
| `scribble:pick-word` | `{ roomId, wordIndex }` | Drawer picks word (0, 1, or 2) |
| `scribble:draw` | `{ roomId, stroke }` | Drawing stroke data |
| `scribble:undo` | `{ roomId }` | Undo last stroke |
| `scribble:clear` | `{ roomId }` | Clear canvas |
| `scribble:guess` | `{ roomId, text }` | Submit a word guess |

### Server → Client
| Event | Payload | Description |
|-------|---------|-------------|
| `scribble:round-start` | `{ drawerId, wordOptions? wordLength, timeLimit }` | New round (drawer gets words, others get length) |
| `scribble:stroke` | `{ stroke }` | Broadcast stroke to guessers |
| `scribble:undo` | `{}` | Remove last stroke |
| `scribble:clear` | `{}` | Clear canvas |
| `scribble:hint` | `{ index, letter }` | Reveal a letter to guessers |
| `scribble:correct` | `{ playerId, position }` | Someone guessed correctly |
| `scribble:close-guess` | `{ playerId }` | "Almost!" notification |
| `scribble:round-end` | `{ word, scores, correctGuessers }` | Round finished |
| `scribble:game-end` | `{ rankings, scores }` | Game finished |
| `scribble:tick` | `{ remaining }` | Time remaining |

---

## 8. Chat Integration (Dual Purpose)

In Scribble, chat serves double duty:
1. **Guess submission** — all chat messages are checked as guesses during drawing phase
2. **Social chat** — between rounds, or after guessing correctly

### Chat Rules During Drawing
- If message matches the word → correct guess! Message not shown to others (prevents spoilers)
- If message is close (1-2 char off) → system shows "Almost!" to that player only
- Drawer cannot chat during their turn (prevents word leaks)
- Correctly guessed players' messages are hidden from unguessed players (to prevent hints)
- After round ends → full chat opens

### Chat UI
- Right panel on desktop / bottom sheet on mobile
- Messages have: avatar, username, timestamp
- Correct guesses show as: "🎉 PlayerName guessed the word!"
- Close guesses show as: "PlayerName is close!" (only to that player)

---

## 9. Mobile Drawing Experience

### Touch Drawing
- Full touch support with palm rejection (via `touch-action: none`)
- Pinch to zoom (stretch goal)
- Tool selector as a floating bottom bar
- Color picker as a pop-up palette
- Canvas takes full screen width, tools overlay

### Responsive Layout
```
Desktop (1024px+):
┌──────────────────────────┬──────────────┐
│                          │  Players     │
│        Canvas            │  Scoreboard  │
│       (800x600)          │              │
│                          │  Chat /      │
│                          │  Guesses     │
├──────────────────────────┤              │
│  Tools  │  Colors  │Undo│              │
└──────────────────────────┴──────────────┘

Tablet (768-1023px):
┌──────────────────────────┐
│  Players (horizontal)    │
├──────────────────────────┤
│                          │
│        Canvas            │
│                          │
├──────────────────────────┤
│  Tools    │   Colors     │
├──────────────────────────┤
│        Chat / Guesses    │
└──────────────────────────┘

Mobile (<768px):
┌──────────────────────────┐
│  Word hint + Timer       │
├──────────────────────────┤
│                          │
│     Canvas (full width)  │
│                          │
├──────────────────────────┤
│ 🖌 ✏️ 🎨 ↩️ 🗑️         │ (floating tool bar)
├──────────────────────────┤
│  Chat (bottom sheet,     │
│  swipe up to expand)     │
└──────────────────────────┘
```

---

## 10. Special Features

### 1. Custom Word Packs (Host Setting)
- Host can add custom words before starting
- "Inside jokes" mode — great for friend groups
- Mix with default words or custom-only

### 2. Drawing Replay
- After each round, option to replay the drawing sped up (2x)
- Satisfying to watch the creation process

### 3. "Gallery" — After Game
- All drawings shown in a gallery view
- Players can ❤️ favorite drawings
- "Best Artist" award for most likes

### 4. "Blind Draw" Mode (Fun Variant)
- Drawer's canvas is mirrored/rotated while drawing
- Makes it much harder but hilarious
- 1.5x score multiplier

### 5. Word Categories
- Animals, Food, Objects, Actions, Places, Movies, Abstract
- Host selects categories before game start

---

## 11. Word List

### Structure
```typescript
interface WordCategory {
  name: string;
  easy: string[];    // Common, simple words ("cat", "sun", "house")
  medium: string[];  // Moderate ("volcano", "telescope", "orchestra")
  hard: string[];    // Abstract/difficult ("democracy", "perspective", "nostalgia")
}
```

### Built-in Categories
- **Animals**: 100+ easy, 80+ medium, 50+ hard
- **Food**: 80+ easy, 60+ medium, 40+ hard
- **Objects**: 120+ easy, 100+ medium, 60+ hard
- **Actions**: 80+ easy, 60+ medium, 40+ hard
- **Places**: 60+ easy, 50+ medium, 40+ hard
- **Entertainment**: 70+ easy, 50+ medium, 40+ hard
- **Abstract**: 30+ easy, 50+ medium, 80+ hard

### Total: ~2000+ unique drawing prompts
