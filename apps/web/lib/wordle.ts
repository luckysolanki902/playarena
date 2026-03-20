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
