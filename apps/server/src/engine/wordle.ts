import type {
  LetterFeedback,
  WordleGameState,
  WordleRoundState,
  WordlePlayerState,
  WordleSettings,
} from '@playarena/shared';
import { getRandomWord, isValidGuess, ANSWER_WORDS } from '../data/words';

const DEFAULT_SETTINGS: WordleSettings = {
  rounds: 3,
  timeLimit: 120,
  wordLength: 5,
  hintsEnabled: true,
};

const MAX_ATTEMPTS = 6;

// ─── Scoring ───

function computeBaseScore(attempt: number): number {
  const table: Record<number, number> = { 1: 1000, 2: 800, 3: 600, 4: 400, 5: 250, 6: 100 };
  return table[attempt] ?? 0;
}

function computeSpeedBonus(timeTakenMs: number, timeLimitSec: number): number {
  if (timeLimitSec === 0) return 0;
  const fraction = 1 - timeTakenMs / (timeLimitSec * 1000);
  if (fraction <= 0) return 0;
  return Math.round(fraction * 200); // max +200
}

// ─── Feedback Engine ───

export function getFeedback(guess: string, target: string): LetterFeedback[] {
  const g = guess.toLowerCase().split('');
  const t = target.toLowerCase().split('');
  const result: LetterFeedback[] = new Array(g.length).fill('absent');
  const counts = new Map<string, number>();

  for (let i = 0; i < t.length; i++) {
    if (g[i] === t[i]) {
      result[i] = 'correct';
    } else {
      counts.set(t[i], (counts.get(t[i]) || 0) + 1);
    }
  }
  for (let i = 0; i < g.length; i++) {
    if (result[i] === 'correct') continue;
    const c = counts.get(g[i]);
    if (c && c > 0) {
      result[i] = 'present';
      counts.set(g[i], c - 1);
    }
  }
  return result;
}

// ─── Bot Solver (frequency-based) ───

export function getBotSuggestions(
  guesses: Array<{ word: string; feedback: LetterFeedback[] }>,
  validWords: string[],
): { suggestions: string[]; remaining: number; reasoning: string } {
  let candidates = validWords.map((w) => w.toLowerCase());

  for (const { word, feedback } of guesses) {
    candidates = candidates.filter((c) => {
      const f = getFeedback(word.toLowerCase(), c);
      return f.every((v, i) => v === feedback[i]);
    });
  }

  if (candidates.length === 0) {
    return { suggestions: [], remaining: 0, reasoning: 'No matching words found.' };
  }

  // Score by letter frequency in remaining candidates
  const freq = new Map<string, number>();
  for (const w of candidates) {
    const seen = new Set<string>();
    for (const ch of w) {
      if (!seen.has(ch)) {
        freq.set(ch, (freq.get(ch) || 0) + 1);
        seen.add(ch);
      }
    }
  }

  const scored = candidates.map((w) => {
    const seen = new Set<string>();
    let score = 0;
    for (const ch of w) {
      if (!seen.has(ch)) {
        score += freq.get(ch) || 0;
        seen.add(ch);
      }
    }
    return { word: w, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const suggestions = scored.slice(0, 3).map((s) => s.word.toUpperCase());
  const reasoning =
    candidates.length === 1
      ? `Only one word remaining: ${suggestions[0]}`
      : `Narrowed down to ${candidates.length} words. Best coverage: ${suggestions[0]}`;

  return { suggestions, remaining: candidates.length, reasoning };
}

// ─── Game State Manager ───

export class WordleEngine {
  private games = new Map<string, WordleGameState>();

  createGame(roomId: string, players: Array<{ sessionId: string; username: string }>, settings?: Partial<WordleSettings>): WordleGameState {
    const merged: WordleSettings = { ...DEFAULT_SETTINGS, ...settings };
    const state: WordleGameState = {
      status: 'active',
      currentRound: null,
      roundHistory: [],
      settings: merged,
    };
    this.games.set(roomId, state);
    return state;
  }

  getGame(roomId: string): WordleGameState | undefined {
    return this.games.get(roomId);
  }

  startRound(
    roomId: string,
    players: Array<{ sessionId: string; username: string }>,
  ): WordleRoundState | null {
    const game = this.games.get(roomId);
    if (!game) return null;

    const roundNum = game.roundHistory.length + 1;
    if (roundNum > game.settings.rounds) return null;

    const word = getRandomWord();
    const playerStates: Record<string, WordlePlayerState> = {};
    for (const p of players) {
      playerStates[p.sessionId] = {
        sessionId: p.sessionId,
        username: p.username,
        guesses: [],
        solved: false,
        solvedAttempt: null,
        solvedTime: null,
        score: 0,
        rating: 1000,
        hintsUsed: 0,
      };
    }

    const round: WordleRoundState = {
      round: roundNum,
      totalRounds: game.settings.rounds,
      word,
      wordLength: game.settings.wordLength,
      timeLimit: game.settings.timeLimit,
      startedAt: Date.now(),
      status: 'active',
      players: playerStates,
    };

    game.currentRound = round;
    return round;
  }

  submitGuess(
    roomId: string,
    sessionId: string,
    word: string,
  ): {
    ok: boolean;
    feedback?: LetterFeedback[];
    attempt?: number;
    solved?: boolean;
    score?: number;
    error?: string;
  } {
    const game = this.games.get(roomId);
    if (!game || !game.currentRound || game.currentRound.status !== 'active') {
      return { ok: false, error: 'NO_ACTIVE_ROUND' };
    }

    const round = game.currentRound;
    const player = round.players[sessionId];
    if (!player) return { ok: false, error: 'NOT_IN_GAME' };
    if (player.solved) return { ok: false, error: 'ALREADY_SOLVED' };
    if (player.guesses.length >= MAX_ATTEMPTS) return { ok: false, error: 'MAX_ATTEMPTS' };

    const normalized = word.toLowerCase().trim();
    if (!isValidGuess(normalized)) {
      return { ok: false, error: 'INVALID_WORD' };
    }

    const feedback = getFeedback(normalized, round.word);
    const attempt = player.guesses.length + 1;
    const solved = normalized === round.word.toLowerCase();

    player.guesses.push({ word: normalized, feedback, attempt, timestamp: Date.now() });
    player.solved = solved;

    if (solved) {
      player.solvedAttempt = attempt;
      player.solvedTime = Date.now() - round.startedAt;
      const base = computeBaseScore(attempt);
      const speed = computeSpeedBonus(player.solvedTime, round.timeLimit);
      const hintPenalty = player.hintsUsed <= 1 ? 0 : (player.hintsUsed - 1) * 50;
      player.score = Math.max(0, base + speed - hintPenalty);
    }

    return { ok: true, feedback, attempt, solved, score: player.score };
  }

  useHint(roomId: string, sessionId: string): {
    ok: boolean;
    suggestions?: string[];
    reasoning?: string;
    penalty?: number;
    error?: string;
  } {
    const game = this.games.get(roomId);
    if (!game?.currentRound || game.currentRound.status !== 'active') {
      return { ok: false, error: 'NO_ACTIVE_ROUND' };
    }
    if (!game.settings.hintsEnabled) return { ok: false, error: 'HINTS_DISABLED' };

    const player = game.currentRound.players[sessionId];
    if (!player) return { ok: false, error: 'NOT_IN_GAME' };
    if (player.solved) return { ok: false, error: 'ALREADY_SOLVED' };

    player.hintsUsed++;
    const penalty = player.hintsUsed <= 1 ? 0 : player.hintsUsed === 2 ? 50 : 100;

    const { suggestions, reasoning } = getBotSuggestions(
      player.guesses,
      ANSWER_WORDS,
    );

    return { ok: true, suggestions, reasoning, penalty };
  }

  endRound(roomId: string): {
    word: string;
    rankings: Array<{ sessionId: string; username: string; score: number }>;
  } | null {
    const game = this.games.get(roomId);
    if (!game?.currentRound) return null;

    const round = game.currentRound;
    round.status = 'finished';

    const rankings = Object.values(round.players)
      .sort((a, b) => {
        if (a.solved && !b.solved) return -1;
        if (!a.solved && b.solved) return 1;
        if (a.solved && b.solved) return (a.solvedAttempt ?? 99) - (b.solvedAttempt ?? 99);
        return 0;
      })
      .map((p) => ({ sessionId: p.sessionId, username: p.username, score: p.score }));

    game.roundHistory.push({ round: round.round, word: round.word, rankings });

    const nextRound = round.round + 1;
    if (nextRound > game.settings.rounds) {
      game.status = 'finished';
    }

    return { word: round.word, rankings };
  }

  getFinalRankings(roomId: string): Array<{ sessionId: string; username: string; totalScore: number; rating: number }> | null {
    const game = this.games.get(roomId);
    if (!game) return null;

    const totals = new Map<string, { username: string; totalScore: number }>();
    for (const rh of game.roundHistory) {
      for (const r of rh.rankings) {
        const curr = totals.get(r.sessionId) || { username: r.username, totalScore: 0 };
        curr.totalScore += r.score;
        totals.set(r.sessionId, curr);
      }
    }

    return Array.from(totals.entries())
      .map(([sessionId, t]) => ({ sessionId, username: t.username, totalScore: t.totalScore, rating: 1000 }))
      .sort((a, b) => b.totalScore - a.totalScore);
  }

  isRoundComplete(roomId: string): boolean {
    const game = this.games.get(roomId);
    if (!game?.currentRound) return false;
    return Object.values(game.currentRound.players).every(
      (p) => p.solved || p.guesses.length >= MAX_ATTEMPTS,
    );
  }

  removeGame(roomId: string): void {
    this.games.delete(roomId);
  }
}
