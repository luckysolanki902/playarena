import type {
  GlitchType,
  TypeRushWord,
  TypeRushGameState,
  TypeRushRoundState,
  TypeRushPlayerState,
  TypeRushSettings,
} from '@playarena/shared';

// Sample texts for typing (varied difficulty)
const SHORT_TEXTS = [
  "The quick brown fox jumps over the lazy dog.",
  "Pack my box with five dozen liquor jugs.",
  "How vexingly quick daft zebras jump.",
  "The five boxing wizards jump quickly.",
  "Sphinx of black quartz, judge my vow.",
];

const MEDIUM_TEXTS = [
  "The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs. How vexingly quick daft zebras jump.",
  "In a hole in the ground there lived a hobbit. Not a nasty, dirty, wet hole, filled with the ends of worms and an oozy smell.",
  "It was the best of times, it was the worst of times, it was the age of wisdom, it was the age of foolishness.",
  "All happy families are alike; each unhappy family is unhappy in its own way. Everything was in confusion in the house.",
  "Call me Ishmael. Some years ago, never mind how long precisely, having little or no money in my purse.",
];

const LONG_TEXTS = [
  "The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs. How vexingly quick daft zebras jump. The five boxing wizards jump quickly. Sphinx of black quartz, judge my vow. Two driven jocks help fax my big quiz.",
  "In a hole in the ground there lived a hobbit. Not a nasty, dirty, wet hole, filled with the ends of worms and an oozy smell, nor yet a dry, bare, sandy hole with nothing in it to sit down on or to eat: it was a hobbit-hole, and that means comfort.",
  "It was the best of times, it was the worst of times, it was the age of wisdom, it was the age of foolishness, it was the epoch of belief, it was the epoch of incredulity, it was the season of Light, it was the season of Darkness.",
];

const DEFAULT_SETTINGS: TypeRushSettings = {
  rounds: 3,
  textLength: 'medium',
  glitchFrequency: 'normal',
};

// ─── Scoring ───

function computeWpmScore(wpm: number): number {
  // Base score: 10 points per WPM
  return Math.round(wpm * 10);
}

function computeAccuracyBonus(accuracy: number): number {
  // Perfect accuracy = +200 bonus, scales down
  if (accuracy >= 100) return 200;
  if (accuracy >= 98) return 150;
  if (accuracy >= 95) return 100;
  if (accuracy >= 90) return 50;
  return 0;
}

function computePositionBonus(position: number, totalPlayers: number): number {
  // 1st place gets 300, 2nd gets 200, 3rd gets 100
  if (position === 1) return 300;
  if (position === 2) return 200;
  if (position === 3) return 100;
  return 0;
}

// ─── Text & Glitch Generation ───

function getRandomText(length: 'short' | 'medium' | 'long'): string {
  const pool = length === 'short' ? SHORT_TEXTS : length === 'long' ? LONG_TEXTS : MEDIUM_TEXTS;
  return pool[Math.floor(Math.random() * pool.length)];
}

function generateGlitchMap(
  text: string, 
  frequency: 'low' | 'normal' | 'high'
): TypeRushWord[] {
  const words: TypeRushWord[] = [];
  const glitchChance = frequency === 'low' ? 0.1 : frequency === 'high' ? 0.3 : 0.2;
  
  // Split text into words while preserving positions
  let currentIndex = 0;
  const textWords = text.split(/(\s+)/); // Split but keep whitespace
  
  for (const word of textWords) {
    const startIndex = currentIndex;
    const endIndex = currentIndex + word.length;
    currentIndex = endIndex;
    
    // Only apply glitches to actual words (not whitespace)
    if (word.trim().length === 0) {
      words.push({ text: word, glitch: 'none', startIndex, endIndex });
      continue;
    }
    
    // Random glitch assignment
    let glitch: GlitchType = 'none';
    if (Math.random() < glitchChance) {
      const roll = Math.random();
      if (roll < 0.3) glitch = 'blur';
      else if (roll < 0.55) glitch = 'scramble';
      else if (roll < 0.8) glitch = 'speedboost';
      else glitch = 'trap';
    }
    
    words.push({ text: word, glitch, startIndex, endIndex });
  }
  
  return words;
}

// ─── Game State Manager ───

export class TypeRushEngine {
  private games = new Map<string, TypeRushGameState>();
  private finishOrder = new Map<string, number>(); // roomId -> next position

  createGame(
    roomId: string, 
    players: Array<{ sessionId: string; username: string }>, 
    settings?: Partial<TypeRushSettings>
  ): TypeRushGameState {
    const merged: TypeRushSettings = { ...DEFAULT_SETTINGS, ...settings };
    const state: TypeRushGameState = {
      status: 'active',
      currentRound: null,
      roundHistory: [],
      settings: merged,
    };
    this.games.set(roomId, state);
    this.finishOrder.set(roomId, 1);
    return state;
  }

  getGame(roomId: string): TypeRushGameState | undefined {
    return this.games.get(roomId);
  }

  removeGame(roomId: string): void {
    this.games.delete(roomId);
    this.finishOrder.delete(roomId);
  }

  startRound(
    roomId: string,
    players: Array<{ sessionId: string; username: string }>,
  ): { round: number; totalRounds: number; text: string; words: TypeRushWord[] } | null {
    const game = this.games.get(roomId);
    if (!game) return null;

    const roundNum = game.roundHistory.length + 1;
    if (roundNum > game.settings.rounds) return null;

    const text = getRandomText(game.settings.textLength);
    const words = generateGlitchMap(text, game.settings.glitchFrequency);

    const playerStates: Record<string, TypeRushPlayerState> = {};
    for (const p of players) {
      playerStates[p.sessionId] = {
        sessionId: p.sessionId,
        username: p.username,
        progress: 0,
        charsTyped: 0,
        errors: 0,
        wpm: 0,
        accuracy: 100,
        finished: false,
        finishTime: null,
        score: 0,
        speedBoosts: 0,
        trapPenalties: 0,
      };
    }

    game.currentRound = {
      round: roundNum,
      totalRounds: game.settings.rounds,
      text,
      words,
      startedAt: Date.now(),
      status: 'active',
      players: playerStates,
    };

    // Reset finish order for this round
    this.finishOrder.set(roomId, 1);

    return {
      round: roundNum,
      totalRounds: game.settings.rounds,
      text,
      words,
    };
  }

  updateProgress(
    roomId: string,
    sessionId: string,
    charsTyped: number,
    errors: number,
    currentWord: number,
  ): { progress: number; wpm: number; speedBoost?: number; trapPenalty?: number } | null {
    const game = this.games.get(roomId);
    if (!game?.currentRound || game.currentRound.status !== 'active') return null;

    const player = game.currentRound.players[sessionId];
    if (!player || player.finished) return null;

    const text = game.currentRound.text;
    const words = game.currentRound.words;
    const elapsed = Date.now() - game.currentRound.startedAt;
    
    // Calculate progress and WPM
    const progress = Math.min(100, Math.round((charsTyped / text.length) * 100));
    const minutes = elapsed / 60000;
    const wordCount = charsTyped / 5; // Standard: 5 chars = 1 word
    const wpm = minutes > 0 ? Math.round(wordCount / minutes) : 0;
    const accuracy = charsTyped > 0 ? Math.round(((charsTyped - errors) / charsTyped) * 100) : 100;

    const prevWord = player.charsTyped > 0 
      ? words.findIndex((w) => player.charsTyped >= w.startIndex && player.charsTyped < w.endIndex)
      : -1;
    
    // Check for glitch effects on word completion
    let speedBoost: number | undefined;
    let trapPenalty: number | undefined;

    // Check if player just completed a word
    if (currentWord > prevWord) {
      const completedWord = words[prevWord];
      if (completedWord) {
        if (completedWord.glitch === 'speedboost') {
          // Bonus for typing speed boost word quickly
          const bonus = 50;
          player.speedBoosts += bonus;
          speedBoost = bonus;
        }
        if (completedWord.glitch === 'trap' && errors > player.errors) {
          // Penalty for making error on trap word
          const penalty = 30;
          player.trapPenalties += penalty;
          trapPenalty = penalty;
        }
      }
    }

    player.progress = progress;
    player.charsTyped = charsTyped;
    player.errors = errors;
    player.wpm = wpm;
    player.accuracy = accuracy;

    return { progress, wpm, speedBoost, trapPenalty };
  }

  playerFinished(
    roomId: string,
    sessionId: string,
    totalTime: number,
    errors: number,
  ): { position: number; wpm: number; accuracy: number; time: number } | null {
    const game = this.games.get(roomId);
    if (!game?.currentRound || game.currentRound.status !== 'active') return null;

    const player = game.currentRound.players[sessionId];
    if (!player || player.finished) return null;

    const text = game.currentRound.text;
    const minutes = totalTime / 60000;
    const wordCount = text.length / 5;
    const wpm = minutes > 0 ? Math.round(wordCount / minutes) : 0;
    const accuracy = Math.round(((text.length - errors) / text.length) * 100);

    const position = this.finishOrder.get(roomId) ?? 1;
    this.finishOrder.set(roomId, position + 1);

    player.finished = true;
    player.finishTime = totalTime;
    player.wpm = wpm;
    player.accuracy = accuracy;
    player.progress = 100;
    player.errors = errors;

    // Calculate score
    const totalPlayers = Object.keys(game.currentRound.players).length;
    player.score = 
      computeWpmScore(wpm) + 
      computeAccuracyBonus(accuracy) + 
      computePositionBonus(position, totalPlayers) +
      player.speedBoosts -
      player.trapPenalties;

    return { position, wpm, accuracy, time: totalTime };
  }

  isRoundComplete(roomId: string): boolean {
    const game = this.games.get(roomId);
    if (!game?.currentRound) return false;
    return Object.values(game.currentRound.players).every((p) => p.finished);
  }

  endRound(roomId: string): {
    rankings: Array<{ sessionId: string; username: string; wpm: number; accuracy: number; score: number; position: number }>;
    isGameOver: boolean;
  } | null {
    const game = this.games.get(roomId);
    if (!game?.currentRound) return null;

    game.currentRound.status = 'finished';

    // Build rankings sorted by score
    const rankings = Object.values(game.currentRound.players)
      .map((p, _, arr) => {
        // Calculate position if not already assigned
        const finishedBefore = arr.filter((other) => 
          other.finished && other.finishTime !== null && p.finishTime !== null && 
          other.finishTime < p.finishTime
        ).length;
        return {
          sessionId: p.sessionId,
          username: p.username,
          wpm: p.wpm,
          accuracy: p.accuracy,
          score: p.score,
          position: p.finished ? finishedBefore + 1 : arr.length,
        };
      })
      .sort((a, b) => b.score - a.score);

    // Re-assign positions by score
    rankings.forEach((r, i) => { r.position = i + 1; });

    game.roundHistory.push({
      round: game.currentRound.round,
      rankings: rankings.map((r) => ({
        sessionId: r.sessionId,
        username: r.username,
        wpm: r.wpm,
        accuracy: r.accuracy,
        score: r.score,
      })),
    });

    const isGameOver = game.roundHistory.length >= game.settings.rounds;
    if (isGameOver) {
      game.status = 'finished';
    }

    return { rankings, isGameOver };
  }

  getFinalRankings(roomId: string): Array<{
    sessionId: string;
    username: string;
    totalScore: number;
    avgWpm: number;
    avgAccuracy: number;
  }> | null {
    const game = this.games.get(roomId);
    if (!game) return null;

    // Aggregate scores across all rounds
    const totals = new Map<string, { username: string; totalScore: number; wpmSum: number; accSum: number; count: number }>();

    for (const round of game.roundHistory) {
      for (const r of round.rankings) {
        const existing = totals.get(r.sessionId) || { username: r.username, totalScore: 0, wpmSum: 0, accSum: 0, count: 0 };
        existing.totalScore += r.score;
        existing.wpmSum += r.wpm;
        existing.accSum += r.accuracy;
        existing.count++;
        totals.set(r.sessionId, existing);
      }
    }

    return Array.from(totals.entries())
      .map(([sessionId, data]) => ({
        sessionId,
        username: data.username,
        totalScore: data.totalScore,
        avgWpm: Math.round(data.wpmSum / data.count),
        avgAccuracy: Math.round(data.accSum / data.count),
      }))
      .sort((a, b) => b.totalScore - a.totalScore);
  }
}
