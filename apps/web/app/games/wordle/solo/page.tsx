'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import WordleBoard from '@/components/wordle/Board';
import Keyboard from '@/components/wordle/Keyboard';
import { getRandomWord, isValidWord, getFeedback, getKeyboardState, getBotSuggestions } from '@/lib/wordle';
import type { LetterFeedback } from '@playarena/shared';

const WORD_LENGTH = 5;
const MAX_ATTEMPTS = 6;

type GameStatus = 'playing' | 'won' | 'lost';

interface Guess {
  word: string;
  feedback: LetterFeedback[];
}

function computeScore(attempt: number, hintsUsed: number, elapsedMs: number): number {
  const base: Record<number, number> = { 1: 1000, 2: 800, 3: 600, 4: 400, 5: 250, 6: 100 };
  const b = base[attempt] ?? 0;
  const hintPenalty = hintsUsed <= 1 ? 0 : hintsUsed === 2 ? 50 : (hintsUsed - 1) * 100;
  const slowPenalty = elapsedMs > 180_000 ? 25 : 0;
  return Math.max(0, b - hintPenalty - slowPenalty);
}

function buildShareText(guesses: Guess[], won: boolean): string {
  const grid = guesses
    .map((g) =>
      g.feedback.map((f) => (f === 'correct' ? '🟩' : f === 'present' ? '🟨' : '⬛')).join(''),
    )
    .join('\n');
  return `🎮 PlayArena Wordle\n${won ? `${guesses.length}/${MAX_ATTEMPTS}` : `X/${MAX_ATTEMPTS}`}\n\n${grid}\n\nplayarena.vercel.app/wordle`;
}

export default function SoloWordlePage() {
  const [target, setTarget] = useState(() => getRandomWord());
  const [guesses, setGuesses] = useState<Guess[]>([]);
  const [currentGuess, setCurrentGuess] = useState('');
  const [status, setStatus] = useState<GameStatus>('playing');
  const [shake, setShake] = useState(false);
  const [toast, setToast] = useState('');
  const [startTime, setStartTime] = useState(() => Date.now());
  const [score, setScore] = useState(0);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [hintPanel, setHintPanel] = useState<{ suggestions: string[]; reasoning: string; penalty: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string, ms = 1500) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), ms);
  }, []);

  const submitGuess = useCallback(() => {
    if (currentGuess.length !== WORD_LENGTH) return;
    if (!isValidWord(currentGuess)) {
      setShake(true);
      showToast('Not in word list');
      setTimeout(() => setShake(false), 500);
      return;
    }
    const feedback = getFeedback(currentGuess, target);
    const newGuesses = [...guesses, { word: currentGuess, feedback }];
    setGuesses(newGuesses);
    setCurrentGuess('');
    setHintPanel(null);

    if (currentGuess.toLowerCase() === target.toLowerCase()) {
      setStatus('won');
      const elapsed = Date.now() - startTime;
      const s = computeScore(newGuesses.length, hintsUsed, elapsed);
      setScore(s);
      const msgs = ['Genius', 'Magnificent', 'Impressive', 'Splendid', 'Great', 'Phew'];
      showToast(msgs[newGuesses.length - 1] ?? 'Nice!', 3000);
    } else if (newGuesses.length >= MAX_ATTEMPTS) {
      setStatus('lost');
      setScore(0);
      showToast(target.toUpperCase(), 5000);
    }
  }, [currentGuess, guesses, target, showToast, startTime, hintsUsed]);

  const handleKey = useCallback(
    (key: string) => {
      if (status !== 'playing') return;
      if (key === 'enter') {
        submitGuess();
      } else if (key === '⌫' || key === 'backspace') {
        setCurrentGuess((prev) => prev.slice(0, -1));
      } else if (/^[a-z]$/i.test(key) && currentGuess.length < WORD_LENGTH) {
        setCurrentGuess((prev) => prev + key.toLowerCase());
      }
    },
    [status, currentGuess, submitGuess],
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Enter') handleKey('enter');
      else if (e.key === 'Backspace') handleKey('backspace');
      else if (/^[a-z]$/i.test(e.key)) handleKey(e.key.toLowerCase());
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleKey]);

  const letterStates = getKeyboardState(guesses);

  const askBot = () => {
    if (status !== 'playing') return;
    const newCount = hintsUsed + 1;
    setHintsUsed(newCount);
    const result = getBotSuggestions(guesses);
    const penalty = newCount <= 1 ? 0 : newCount === 2 ? 50 : 100;
    setHintPanel({ suggestions: result.suggestions, reasoning: result.reasoning, penalty });
  };

  const hintLabel = hintsUsed === 0 ? 'FREE' : hintsUsed === 1 ? '-50pts' : '-100pts';
  const hintColor = hintsUsed === 0 ? 'var(--accent-green)' : hintsUsed === 1 ? 'var(--accent-orange)' : 'var(--accent-red)';

  const shareResult = async () => {
    const text = buildShareText(guesses, status === 'won');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast('Copy failed');
    }
  };

  const resetGame = () => {
    setTarget(getRandomWord());
    setGuesses([]);
    setCurrentGuess('');
    setStatus('playing');
    setToast('');
    setScore(0);
    setHintsUsed(0);
    setHintPanel(null);
    setCopied(false);
    setStartTime(Date.now());
  };

  return (
    <div className="min-h-screen flex flex-col items-center" style={{ background: 'var(--bg-primary)' }}>
      {/* Header */}
      <header className="w-full flex items-center justify-between px-4 sm:px-6 py-3 border-b" style={{ borderColor: 'var(--border-default)' }}>
        <Link href="/games/wordle" className="text-sm font-medium flex items-center gap-1 hover:opacity-80 transition-opacity" style={{ color: 'var(--text-secondary)' }}>
          ← Lobby
        </Link>
        <h1 className="text-lg font-bold tracking-wide" style={{ color: 'var(--text-primary)' }}>WORDLE</h1>
        <span className="text-sm" style={{ color: 'var(--text-muted)' }}>{guesses.length}/{MAX_ATTEMPTS}</span>
      </header>

      {/* Toast */}
      <div className="relative w-full flex justify-center">
        <AnimatePresence>
          {toast && (
            <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="absolute top-4 px-4 py-2 rounded-lg text-sm font-bold z-50" style={{ background: 'var(--text-primary)', color: 'var(--bg-primary)' }}>
              {toast}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Game area */}
      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-4 py-6 w-full max-w-lg">
        <WordleBoard guesses={guesses} currentGuess={currentGuess} maxAttempts={MAX_ATTEMPTS} wordLength={WORD_LENGTH} shake={shake} />

        {/* Bot Hint Panel */}
        <AnimatePresence>
          {hintPanel && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="w-full max-w-sm rounded-xl p-4 overflow-hidden"
              style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-default)' }}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm">🤖</span>
                <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Bot Analysis</span>
                {hintPanel.penalty > 0 && (
                  <span className="text-xs px-1.5 py-0.5 rounded ml-auto" style={{ background: 'var(--accent-red)', color: '#fff' }}>
                    -{hintPanel.penalty}pts
                  </span>
                )}
              </div>
              <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>{hintPanel.reasoning}</p>
              <div className="flex gap-2">
                {hintPanel.suggestions.map((s) => (
                  <span key={s} className="px-2.5 py-1 rounded-lg text-sm font-bold uppercase tracking-wider" style={{ background: 'var(--bg-hover)', color: 'var(--text-primary)' }}>
                    {s}
                  </span>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Game Over */}
        <AnimatePresence>
          {status !== 'playing' && (
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-4 py-4">
              <p className="text-xl font-bold" style={{ color: status === 'won' ? 'var(--wordle-correct)' : 'var(--accent-red)' }}>
                {status === 'won' ? '🎉 You got it!' : `The word was ${target.toUpperCase()}`}
              </p>

              {/* Score breakdown */}
              <div className="flex flex-col items-center gap-1">
                <span className="text-3xl font-black" style={{ color: 'var(--accent-purple)' }}>{score}</span>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>points</span>
                {hintsUsed > 0 && (
                  <span className="text-xs" style={{ color: 'var(--accent-orange)' }}>
                    {hintsUsed} hint{hintsUsed > 1 ? 's' : ''} used
                  </span>
                )}
              </div>

              <div className="flex gap-3">
                <button onClick={resetGame} className="px-5 py-2.5 rounded-lg font-semibold text-sm transition-transform hover:scale-105 cursor-pointer" style={{ background: 'var(--accent-purple)', color: '#fff' }}>
                  Play Again
                </button>
                <button onClick={shareResult} className="px-5 py-2.5 rounded-lg font-semibold text-sm transition-transform hover:scale-105 cursor-pointer" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}>
                  {copied ? '✓ Copied!' : '📤 Share'}
                </button>
                <Link href="/games/wordle" className="px-5 py-2.5 rounded-lg font-semibold text-sm transition-transform hover:scale-105" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}>
                  Lobby
                </Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <Keyboard letterStates={letterStates} onKey={handleKey} disabled={status !== 'playing'} />

        {/* Bot hint button */}
        {status === 'playing' && (
          <button
            onClick={askBot}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-all hover:scale-105"
            style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--border-default)' }}
          >
            🤖 Ask Bot
            <span className="text-xs px-1.5 py-0.5 rounded font-bold" style={{ background: hintColor, color: '#fff' }}>
              {hintLabel}
            </span>
          </button>
        )}
      </div>

      <footer className="py-3 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
        Built with 💜 by Dharaa Singh
      </footer>
    </div>
  );
}
