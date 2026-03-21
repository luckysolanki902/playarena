import type { DrawPoint, DrawStroke } from '@playarena/shared';
import { getWordChoices } from '../data/scribble-words';

export interface ScribblePlayer {
  sessionId: string;
  username: string;
  score: number;
  roundScore: number;
  hasGuessed: boolean;
  isDrawing: boolean;
}

interface RoundState {
  round: number;
  totalRounds: number;
  drawerId: string;
  drawerUsername: string;
  word: string;
  hintPattern: string;       // '_a__e' style — underscore per letter
  wordChoices: string[];
  timeLimit: number;
  startedAt: number;
  strokes: DrawStroke[];     // full history for late-joiner replay
  currentStroke: DrawPoint[];
  guessedOrder: string[];    // sessionIds in order of correct guess
}

interface ScribbleGame {
  roomId: string;
  phase: 'choosing' | 'drawing' | 'finished';
  round: number;
  totalRounds: number;
  drawerOrder: string[];     // sessionIds, rotated each round
  drawerIndex: number;
  players: Map<string, ScribblePlayer>;
  currentRound: RoundState | null;
  roundTimer: ReturnType<typeof setTimeout> | null;
  hintTimers: ReturnType<typeof setTimeout>[];
  chooseTimer: ReturnType<typeof setTimeout> | null;
}

// Levenshtein distance for "close guess" detection
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function buildPattern(word: string, revealedIndices: Set<number>): string {
  return word
    .split('')
    .map((ch, i) => (ch === ' ' ? '/' : revealedIndices.has(i) ? ch : '_'))
    .join(' ');
}

export class ScribbleEngine {
  private games = new Map<string, ScribbleGame>();

  createGame(
    roomId: string,
    players: Array<{ sessionId: string; username: string }>,
    opts: { rounds?: number; timeLimit?: number } = {},
  ): void {
    const drawerOrder = [...players].sort(() => Math.random() - 0.5).map((p) => p.sessionId);
    const playerMap = new Map<string, ScribblePlayer>();
    for (const p of players) {
      playerMap.set(p.sessionId, {
        sessionId: p.sessionId,
        username: p.username,
        score: 0,
        roundScore: 0,
        hasGuessed: false,
        isDrawing: false,
      });
    }
    this.games.set(roomId, {
      roomId,
      phase: 'choosing',
      round: 0,
      totalRounds: opts.rounds ?? Math.min(players.length * 2, 6),
      drawerOrder,
      drawerIndex: -1,
      players: playerMap,
      currentRound: null,
      roundTimer: null,
      hintTimers: [],
      chooseTimer: null,
    });
  }

  getGame(roomId: string): ScribbleGame | undefined {
    return this.games.get(roomId);
  }

  /** Start next round — returns word choices + round meta, or null if game finished */
  startRound(roomId: string): {
    round: number;
    totalRounds: number;
    drawerId: string;
    drawerUsername: string;
    wordChoices: string[];
    timeLimit: number;
  } | null {
    const game = this.games.get(roomId);
    if (!game) return null;

    game.round++;
    if (game.round > game.totalRounds) {
      game.phase = 'finished';
      return null;
    }

    game.drawerIndex = (game.drawerIndex + 1) % game.drawerOrder.length;
    const drawerId = game.drawerOrder[game.drawerIndex];
    const drawer = game.players.get(drawerId);
    if (!drawer) return null;

    // Reset round scores
    for (const p of game.players.values()) {
      p.roundScore = 0;
      p.hasGuessed = false;
      p.isDrawing = p.sessionId === drawerId;
    }

    const wordChoices = getWordChoices(3);
    const timeLimit = 80;

    game.phase = 'choosing';
    game.currentRound = {
      round: game.round,
      totalRounds: game.totalRounds,
      drawerId,
      drawerUsername: drawer.username,
      word: '',
      hintPattern: '',
      wordChoices,
      timeLimit,
      startedAt: 0,
      strokes: [],
      currentStroke: [],
      guessedOrder: [],
    };

    return {
      round: game.round,
      totalRounds: game.totalRounds,
      drawerId,
      drawerUsername: drawer.username,
      wordChoices,
      timeLimit,
    };
  }

  /** Drawer chose a word — begin drawing phase */
  chooseWord(
    roomId: string,
    drawerId: string,
    word: string,
    onHintReveal: (pattern: string) => void,
    onTimeUp: () => void,
  ): { wordLength: number; hintPattern: string; timeLimit: number } | null {
    const game = this.games.get(roomId);
    if (!game || !game.currentRound) return null;
    if (game.currentRound.drawerId !== drawerId) return null;
    if (!game.currentRound.wordChoices.includes(word) && word !== '__auto__') return null;

    const chosenWord = word === '__auto__' ? game.currentRound.wordChoices[0] : word;
    const revealed = new Set<number>();

    game.phase = 'drawing';
    game.currentRound.word = chosenWord;
    game.currentRound.hintPattern = buildPattern(chosenWord, revealed);
    game.currentRound.startedAt = Date.now();

    const timeLimit = game.currentRound.timeLimit;

    // Clear any leftover timers
    game.hintTimers.forEach(clearTimeout);
    game.hintTimers = [];
    if (game.chooseTimer) { clearTimeout(game.chooseTimer); game.chooseTimer = null; }
    if (game.roundTimer) { clearTimeout(game.roundTimer); game.roundTimer = null; }

    // Schedule progressive hints (reveal 1 letter at 40% and 75% of time)
    const hint1At = Math.floor(timeLimit * 0.4) * 1000;
    const hint2At = Math.floor(timeLimit * 0.75) * 1000;

    const revealHint = () => {
      if (!game.currentRound) return;
      const indices = chosenWord
        .split('')
        .map((ch, i) => ({ ch, i }))
        .filter(({ ch, i }) => ch !== ' ' && !revealed.has(i));
      if (indices.length === 0) return;
      const pick = indices[Math.floor(Math.random() * indices.length)];
      revealed.add(pick.i);
      game.currentRound.hintPattern = buildPattern(chosenWord, revealed);
      onHintReveal(game.currentRound.hintPattern);
    };

    game.hintTimers.push(setTimeout(revealHint, hint1At));
    game.hintTimers.push(setTimeout(revealHint, hint2At));
    game.roundTimer = setTimeout(onTimeUp, timeLimit * 1000);

    return {
      wordLength: chosenWord.length,
      hintPattern: game.currentRound.hintPattern,
      timeLimit,
    };
  }

  /** Auto-choose if drawer didn't choose in time */
  autoChooseWord(
    roomId: string,
    onHintReveal: (pattern: string) => void,
    onTimeUp: () => void,
  ) {
    const game = this.games.get(roomId);
    if (!game?.currentRound) return null;
    return this.chooseWord(roomId, game.currentRound.drawerId, '__auto__', onHintReveal, onTimeUp);
  }

  /** Record a draw point from the drawer */
  recordDrawPoint(roomId: string, drawerId: string, point: DrawPoint): boolean {
    const game = this.games.get(roomId);
    if (!game?.currentRound) return false;
    if (game.currentRound.drawerId !== drawerId) return false;

    if (point.type === 'start') {
      game.currentRound.currentStroke = [point];
    } else if (point.type === 'draw') {
      game.currentRound.currentStroke.push(point);
    } else if (point.type === 'end') {
      game.currentRound.currentStroke.push(point);
      if (game.currentRound.currentStroke.length > 0) {
        game.currentRound.strokes.push({ points: [...game.currentRound.currentStroke] });
      }
      game.currentRound.currentStroke = [];
    } else if (point.type === 'shape') {
      // Shape committed in one shot — store as its own single-point stroke
      game.currentRound.strokes.push({ points: [point] });
      game.currentRound.currentStroke = [];
    } else if (point.type === 'fill') {
      // Fill committed in one shot — store as its own single-point stroke
      game.currentRound.strokes.push({ points: [point] });
      game.currentRound.currentStroke = [];
    }
    return true;
  }

  /** Clear the canvas — removes all strokes */
  clearCanvas(roomId: string, drawerId: string): boolean {
    const game = this.games.get(roomId);
    if (!game?.currentRound) return false;
    if (game.currentRound.drawerId !== drawerId) return false;
    game.currentRound.strokes = [];
    game.currentRound.currentStroke = [];
    return true;
  }

  /** Submit a guess — returns result */
  submitGuess(roomId: string, guesserSessionId: string, guess: string): {
    correct: boolean;
    close: boolean;
    points: number;
    guessedCount: number;
    allGuessed: boolean;
  } | null {
    const game = this.games.get(roomId);
    if (!game?.currentRound || game.phase !== 'drawing') return null;

    const player = game.players.get(guesserSessionId);
    if (!player) return null;
    if (player.isDrawing || player.hasGuessed) return null;

    const word = game.currentRound.word.toLowerCase();
    const g = guess.trim().toLowerCase();

    const correct = g === word;
    const close = !correct && levenshtein(g, word) <= 1 && word.length > 3;

    if (!correct) return { correct: false, close, points: 0, guessedCount: game.currentRound.guessedOrder.length, allGuessed: false };

    // Award points — 300 base, decreasing by 2 per second elapsed, min 50
    const elapsed = Math.floor((Date.now() - game.currentRound.startedAt) / 1000);
    const points = Math.max(50, 300 - elapsed * 2);
    player.score += points;
    player.roundScore = points;
    player.hasGuessed = true;
    game.currentRound.guessedOrder.push(guesserSessionId);

    // Drawer earns 15 per correct guesser
    const drawer = game.players.get(game.currentRound.drawerId);
    if (drawer) {
      drawer.score += 15;
      drawer.roundScore = (drawer.roundScore ?? 0) + 15;
    }

    const guessersCount = [...game.players.values()].filter((p) => !p.isDrawing).length;
    const allGuessed = game.currentRound.guessedOrder.length >= guessersCount;

    return { correct: true, close: false, points, guessedCount: game.currentRound.guessedOrder.length, allGuessed };
  }

  /** End the current round — returns rankings */
  endRound(roomId: string): {
    word: string;
    rankings: Array<{ sessionId: string; username: string; score: number; roundScore: number }>;
    isGameOver: boolean;
  } | null {
    const game = this.games.get(roomId);
    if (!game?.currentRound) return null;

    // Clear all timers
    if (game.roundTimer) { clearTimeout(game.roundTimer); game.roundTimer = null; }
    game.hintTimers.forEach(clearTimeout);
    game.hintTimers = [];
    if (game.chooseTimer) { clearTimeout(game.chooseTimer); game.chooseTimer = null; }

    const word = game.currentRound.word;
    const rankings = [...game.players.values()]
      .sort((a, b) => b.score - a.score)
      .map((p) => ({ sessionId: p.sessionId, username: p.username, score: p.score, roundScore: p.roundScore }));

    const isGameOver = game.round >= game.totalRounds;
    if (isGameOver) game.phase = 'finished';

    return { word, rankings, isGameOver };
  }

  getFinalRankings(roomId: string): Array<{ sessionId: string; username: string; totalScore: number }> {
    const game = this.games.get(roomId);
    if (!game) return [];
    return [...game.players.values()]
      .sort((a, b) => b.score - a.score)
      .map((p) => ({ sessionId: p.sessionId, username: p.username, totalScore: p.score }));
  }

  removeGame(roomId: string): void {
    const game = this.games.get(roomId);
    if (!game) return;
    if (game.roundTimer) clearTimeout(game.roundTimer);
    game.hintTimers.forEach(clearTimeout);
    if (game.chooseTimer) clearTimeout(game.chooseTimer);
    this.games.delete(roomId);
  }

  isRoundOver(roomId: string): boolean {
    const game = this.games.get(roomId);
    if (!game?.currentRound || game.phase !== 'drawing') return false;
    const guessers = [...game.players.values()].filter((p) => !p.isDrawing);
    return guessers.every((p) => p.hasGuessed);
  }
}
