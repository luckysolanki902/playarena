'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import WordleBoard from '@/components/wordle/Board';
import Keyboard from '@/components/wordle/Keyboard';
import { getRandomWord, isValidWord, getFeedback, getKeyboardState } from '@/lib/wordle';
import type { LetterFeedback } from '@playarena/shared';

const WORD_LENGTH = 5;
const MAX_ATTEMPTS = 6;

type GameStatus = 'playing' | 'won' | 'lost';

interface Guess {
  word: string;
  feedback: LetterFeedback[];
}

export default function SoloWordlePage() {
  const [target, setTarget] = useState(() => getRandomWord());
  const [guesses, setGuesses] = useState<Guess[]>([]);
  const [currentGuess, setCurrentGuess] = useState('');
  const [status, setStatus] = useState<GameStatus>('playing');
  const [shake, setShake] = useState(false);
  const [toast, setToast] = useState('');
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

    if (currentGuess.toLowerCase() === target.toLowerCase()) {
      setStatus('won');
      const msgs = ['Genius', 'Magnificent', 'Impressive', 'Splendid', 'Great', 'Phew'];
      showToast(msgs[newGuesses.length - 1] ?? 'Nice!', 3000);
    } else if (newGuesses.length >= MAX_ATTEMPTS) {
      setStatus('lost');
      showToast(target.toUpperCase(), 5000);
    }
  }, [currentGuess, guesses, target, showToast]);

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

  // Physical keyboard listener
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

  const resetGame = () => {
    setTarget(getRandomWord());
    setGuesses([]);
    setCurrentGuess('');
    setStatus('playing');
    setToast('');
  };

  return (
    <div className="min-h-screen flex flex-col items-center" style={{ background: 'var(--bg-primary)' }}>
      {/* Header */}
      <header
        className="w-full flex items-center justify-between px-4 sm:px-6 py-3 border-b"
        style={{ borderColor: 'var(--border-default)' }}
      >
        <Link
          href="/games/wordle"
          className="text-sm font-medium flex items-center gap-1 hover:opacity-80 transition-opacity"
          style={{ color: 'var(--text-secondary)' }}
        >
          ← Lobby
        </Link>
        <h1 className="text-lg font-bold tracking-wide" style={{ color: 'var(--text-primary)' }}>
          WORDLE
        </h1>
        <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
          {guesses.length}/{MAX_ATTEMPTS}
        </span>
      </header>

      {/* Toast */}
      <div className="relative w-full flex justify-center">
        <AnimatePresence>
          {toast && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="absolute top-4 px-4 py-2 rounded-lg text-sm font-bold z-50"
              style={{ background: 'var(--text-primary)', color: 'var(--bg-primary)' }}
            >
              {toast}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Game area */}
      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-4 py-6 w-full max-w-lg">
        <WordleBoard
          guesses={guesses}
          currentGuess={currentGuess}
          maxAttempts={MAX_ATTEMPTS}
          wordLength={WORD_LENGTH}
          shake={shake}
        />

        {/* Game Over overlay */}
        <AnimatePresence>
          {status !== 'playing' && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-4 py-4"
            >
              <p className="text-xl font-bold" style={{ color: status === 'won' ? 'var(--wordle-correct)' : 'var(--accent-red)' }}>
                {status === 'won' ? '🎉 You got it!' : `The word was ${target.toUpperCase()}`}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={resetGame}
                  className="px-5 py-2.5 rounded-lg font-semibold text-sm transition-transform hover:scale-105 cursor-pointer"
                  style={{ background: 'var(--accent-purple)', color: '#fff' }}
                >
                  Play Again
                </button>
                <Link
                  href="/games/wordle"
                  className="px-5 py-2.5 rounded-lg font-semibold text-sm transition-transform hover:scale-105"
                  style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
                >
                  Lobby
                </Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <Keyboard letterStates={letterStates} onKey={handleKey} disabled={status !== 'playing'} />
      </div>

      {/* Footer */}
      <footer className="py-3 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
        Built with 💜 by Dharaa Singh
      </footer>
    </div>
  );
}
