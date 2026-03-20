# Future Games — PlayArena Roadmap

## Overview
Games to add after Wordle and Scribble are stable. Every game follows the platform patterns: rooms, chat, bot mode, responsive UI, no sign-in.

---

## Phase 2 Games (Post-Launch)

### 1. TypeRacer — Multiplayer Typing Race
**Players:** 2-8  
**Concept:** Players race to type a passage fastest. Real-time progress bars show everyone's position.

| Aspect | Detail |
|--------|--------|
| Gameplay | A paragraph appears, type it word-by-word. First to finish wins. |
| Scoring | WPM-based. 1st = 500pts, 2nd = 350pts, 3rd = 250pts, etc. Accuracy multiplier (99%+ = 1.2x) |
| Modes | Sprint (single paragraph), Marathon (3 passages), Custom text |
| Real-time | Progress bars, cursor positions, WPM counters for all players |
| Bot | CPU types at configurable WPM (40-120) with realistic typo rate |
| Mobile | Virtual keyboard with haptic feedback, larger text |
| Unique | "Ghost mode" — race your own previous best time |

### 2. Connect Four — Drop & Win
**Players:** 2  
**Concept:** Classic Connect Four with beautiful animations and smart AI.

| Aspect | Detail |
|--------|--------|
| Gameplay | Take turns dropping discs into 7x6 grid. First to connect 4 wins. |
| Scoring | Win = 500pts, win streaks add 50/100/200 bonus. ELO rating. |
| Modes | Quick match, ranked, vs Bot |
| Real-time | Opponent moves appear with drop animation |
| Bot | 3 difficulty levels using minimax with alpha-beta pruning |
| Mobile | Tap column to drop, landscape supported |
| Unique | "Power-ups" variant — bombs (remove a disc), freeze (block a column for 1 turn) |

### 3. Trivia Battle — Knowledge Showdown
**Players:** 2-8  
**Concept:** Buzzer-style trivia. Questions appear, first to answer correctly scores.

| Aspect | Detail |
|--------|--------|
| Gameplay | 10-20 questions per game. Multiple choice (4 options). 15s per question. |
| Scoring | Correct: 100-500 (faster = more). Wrong: -50. Streak bonus. |
| Modes | General knowledge, categories (science, history, pop culture, tech, sports), custom |
| Real-time | See who buzzed in, answer reveal with stats (% who got it right) |
| Bot | Answers with configurable accuracy (50-95%) and delay |
| Mobile | Big tappable answer buttons, swipe for categories |
| Unique | "Double or Nothing" — wager points on confidence. Open Trivia DB API for questions. |

### 4. Battleship — Naval Strategy
**Players:** 2  
**Concept:** Classic Battleship with modern visuals and animations.

| Aspect | Detail |
|--------|--------|
| Gameplay | Place 5 ships on 10x10 grid. Take turns firing. Sink all ships to win. |
| Scoring | Win = 500pts. Bonus for fewer shots used. Efficiency rating. |
| Modes | Classic, Salvo (shoot N times where N = remaining ships), quick (7x7, 3 ships) |
| Real-time | Hit/miss animations, ship sinking effects, fog of war |
| Bot | Random → Hunt/Target → Probability density (3 difficulty levels) |
| Mobile | Pinch to zoom grid, tap to fire, drag to place ships |
| Unique | "Radar scan" power-up (reveals 3x3 area), "Airstrike" (hits entire row/column once per game) |

---

## Phase 3 Games

### 5. Code Breaker — Mastermind Reimagined
**Players:** 2-4  
**Concept:** Guess the secret 4-color code. Feedback after each guess: correct position, correct color wrong position.

| Aspect | Detail |
|--------|--------|
| Gameplay | 6 colors, 4 slots, 10 guesses. Deduction logic game. |
| Scoring | Fewer guesses = more points. Speed bonus. |
| Modes | Duel (both guess same code, race), setter-guesser (one sets, other guesses) |
| Bot | Knuth's algorithm for near-optimal play |
| Unique | "Rainbow" mode — 8 colors, 5 slots for hardcore players |

### 6. Memory Match — Flip & Pair
**Players:** 2-4  
**Concept:** Flip cards to find matching pairs. Take turns. Most pairs wins.

| Aspect | Detail |
|--------|--------|
| Gameplay | Grid of face-down cards. Flip 2 per turn. Match = keep + go again. Most pairs wins. |
| Scoring | Per pair: 100pts. Speed bonus per match. Perfect memory streak bonus. |
| Grid sizes | 4x4 (easy), 6x6 (medium), 8x8 (hard) |
| Themes | Emojis, animals, flags, food, abstract art |
| Real-time | See opponent flip cards in real-time, cannot flip during their turn |
| Unique | "Bomb cards" variant — 2 bomb cards on the grid, flip one and lose a pair |

### 7. Word Chain — Think Fast
**Players:** 2-6  
**Concept:** Say a word starting with the last letter of the previous word. Timer pressure.

| Aspect | Detail |
|--------|--------|
| Gameplay | First player says a word. Next must say a word starting with its last letter. No repeats. 10s timer. |
| Scoring | +50 per valid word. Fail to answer = lose a life (3 lives). Last standing wins. |
| Modes | Free-for-all, categories-only (animals, food, etc.), minimum length (5+ letters) |
| Real-time | Timer ticking, word chain displayed as flowing list |
| Unique | "Bomb" variant — random letters are banned each round, making it harder |

### 8. Reaction Arena — Speed Tests
**Players:** 2-8  
**Concept:** Collection of micro reaction games. Quick rounds.

| Mini-games | Description |
|------------|-------------|
| Color match | Tap when text color matches the word |
| Number flash | Remember a sequence of flashing numbers |
| Aim trainer | Click targets as fast as possible |
| Simon Says | Repeat increasing pattern sequence |
| Quick math | Solve simple equations fastest |

- Each mini-game is 10-30 seconds
- 5 random mini-games per match
- Cumulative scoring
- Perfect for mobile with touch interactions

---

## Phase 4 (Community Requests)

### 9. Chess (Simplified)
- 2-player, real-time or turn-based
- Optional timer (bullet, blitz, rapid)
- Move validation on server
- Bot via Stockfish WASM (or simple minimax)

### 10. Pictionary Telephone
- Like "Gartic Phone" — draw → guess → draw → guess
- Chain of reinterpretations creates hilarious results
- 4-10 players ideal
- Gallery reveal at the end

### 11. Who Am I?
- Each player gets a character/thing on their "forehead"
- Ask yes/no questions in chat
- Others vote yes/no
- First to guess their own thing wins

---

## Game Prioritization Matrix

| Game | Fun Factor | Dev Effort | Multiplayer Value | Mobile Fit | Priority |
|------|-----------|------------|-------------------|------------|----------|
| TypeRacer | ⭐⭐⭐⭐ | Low | High | Medium | **P2-A** |
| Connect Four | ⭐⭐⭐⭐ | Low | Medium | High | **P2-A** |
| Trivia Battle | ⭐⭐⭐⭐⭐ | Medium | Very High | High | **P2-B** |
| Battleship | ⭐⭐⭐⭐ | Medium | Medium | Medium | **P2-B** |
| Code Breaker | ⭐⭐⭐ | Low | Medium | High | **P3** |
| Memory Match | ⭐⭐⭐⭐ | Low | Medium | High | **P3** |
| Word Chain | ⭐⭐⭐⭐ | Low | High | High | **P3** |
| Reaction Arena | ⭐⭐⭐⭐⭐ | Medium | Very High | Very High | **P3** |
| Chess | ⭐⭐⭐⭐ | High | Medium | Medium | **P4** |
| Pictionary Telephone | ⭐⭐⭐⭐⭐ | High | Very High | Medium | **P4** |
| Who Am I | ⭐⭐⭐ | Low | High | High | **P4** |

---

## Shared Game Infrastructure

Every game reuses these platform components:

```
Room System ──→ Quick match / Private / Public
Chat ──────→ In-game chat with emojis + reactions
Bot ───────→ CPU opponent with difficulty settings
Scoring ───→ Per-game scores + overall PlayArena level
Spectate ──→ Watch ongoing games (read-only room join)
Replay ────→ Save and share game replays
Stats ─────→ Per-game win rate, avg score, streaks
```

### Adding a New Game — Checklist
1. Define game state interface in `packages/shared/types/`
2. Create Socket.IO namespace `/game-name`
3. Implement server-side game logic in `apps/server/games/`
4. Build React components in `apps/web/app/games/game-name/`
5. Add bot logic
6. Write tests for game logic (server) + socket events
7. Add to lobby game selector
8. Mobile-responsive layout
9. Add game rules/tutorial modal
