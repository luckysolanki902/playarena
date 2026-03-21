import type { LetterFeedback } from '@playarena/shared';
import WORDS from './words';

const WORD_SET = new Set(WORDS.map((w) => w.toLowerCase()));

export function getRandomWord(): string {
  return WORDS[Math.floor(Math.random() * WORDS.length)].toLowerCase();
}

export function isValidWord(word: string): boolean {
  return WORD_SET.has(word.toLowerCase());
}

export function getFeedback(guess: string, target: string): LetterFeedback[] {
  const g = guess.toLowerCase().split('');
  const t = target.toLowerCase().split('');
  const result: LetterFeedback[] = new Array(g.length).fill('absent');
  const targetCounts = new Map<string, number>();

  // Pass 1: mark correct
  for (let i = 0; i < t.length; i++) {
    if (g[i] === t[i]) {
      result[i] = 'correct';
    } else {
      targetCounts.set(t[i], (targetCounts.get(t[i]) || 0) + 1);
    }
  }

  // Pass 2: mark present
  for (let i = 0; i < g.length; i++) {
    if (result[i] === 'correct') continue;
    const count = targetCounts.get(g[i]);
    if (count && count > 0) {
      result[i] = 'present';
      targetCounts.set(g[i], count - 1);
    }
  }

  return result;
}

export type LetterState = 'correct' | 'present' | 'absent' | 'unused';

export function getKeyboardState(
  guesses: Array<{ word: string; feedback: LetterFeedback[] }>,
): Map<string, LetterState> {
  const states = new Map<string, LetterState>();
  for (const { word, feedback } of guesses) {
    for (let i = 0; i < word.length; i++) {
      const letter = word[i].toLowerCase();
      const current = states.get(letter);
      const next = feedback[i];
      // Priority: correct > present > absent
      if (next === 'correct') {
        states.set(letter, 'correct');
      } else if (next === 'present' && current !== 'correct') {
        states.set(letter, 'present');
      } else if (!current) {
        states.set(letter, 'absent');
      }
    }
  }
  return states;
}

// ─── Bot Solver (client-side for solo mode) ───

export function getBotSuggestions(
  guesses: Array<{ word: string; feedback: LetterFeedback[] }>,
): { suggestions: string[]; remaining: number; reasoning: string } {
  let candidates = WORDS.map((w) => w.toLowerCase());

  for (const { word, feedback } of guesses) {
    candidates = candidates.filter((c) => {
      const f = getFeedback(word.toLowerCase(), c);
      return f.every((v, i) => v === feedback[i]);
    });
  }

  if (candidates.length === 0) {
    return { suggestions: [], remaining: 0, reasoning: 'No matching words found.' };
  }

  // Score by unique letter frequency in remaining candidates
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
      : `Narrowed to ${candidates.length} words. Best coverage: ${suggestions[0]}`;

  return { suggestions, remaining: candidates.length, reasoning };
}
