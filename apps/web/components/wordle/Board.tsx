'use client';

import { motion } from 'framer-motion';
import type { LetterFeedback } from '@playarena/shared';

interface TileProps {
  letter: string;
  feedback?: LetterFeedback;
  delay?: number;
  active?: boolean;
}

function Tile({ letter, feedback, delay = 0, active }: TileProps) {
  const bgColor = feedback === 'correct'
    ? 'var(--wordle-correct)'
    : feedback === 'present'
    ? 'var(--wordle-present)'
    : feedback === 'absent'
    ? 'var(--wordle-absent)'
    : 'var(--wordle-empty)';

  const borderColor = active
    ? 'var(--text-muted)'
    : feedback
    ? 'transparent'
    : letter
    ? 'var(--text-muted)'
    : 'var(--border-default)';

  return (
    <motion.div
      initial={feedback ? { rotateX: 0 } : undefined}
      animate={feedback ? { rotateX: [0, 90, 0] } : letter ? { scale: [1, 1.08, 1] } : undefined}
      transition={feedback ? { duration: 0.5, delay, times: [0, 0.5, 1] } : { duration: 0.1 }}
      className="w-[58px] h-[58px] sm:w-[62px] sm:h-[62px] flex items-center justify-center text-2xl font-bold uppercase rounded-lg select-none"
      style={{
        background: bgColor,
        border: `2px solid ${borderColor}`,
        color: feedback ? '#fff' : 'var(--text-primary)',
      }}
    >
      {letter}
    </motion.div>
  );
}

interface BoardProps {
  guesses: Array<{ word: string; feedback: LetterFeedback[] }>;
  currentGuess: string;
  maxAttempts: number;
  wordLength: number;
  shake?: boolean;
}

export default function WordleBoard({ guesses, currentGuess, maxAttempts, wordLength, shake }: BoardProps) {
  const rows: Array<{ word: string; feedback?: LetterFeedback[] }> = [];

  // Completed guesses
  for (const g of guesses) {
    rows.push({ word: g.word, feedback: g.feedback });
  }

  // Current guess row
  if (guesses.length < maxAttempts) {
    rows.push({ word: currentGuess.padEnd(wordLength, ' ').slice(0, wordLength) });
  }

  // Empty rows
  while (rows.length < maxAttempts) {
    rows.push({ word: ' '.repeat(wordLength) });
  }

  return (
    <div className="flex flex-col items-center gap-[6px]">
      {rows.map((row, rowIdx) => {
        const isCurrentRow = rowIdx === guesses.length;
        return (
          <motion.div
            key={rowIdx}
            animate={shake && isCurrentRow ? { x: [0, -8, 8, -8, 8, 0] } : {}}
            transition={{ duration: 0.4 }}
            className="flex gap-[6px]"
          >
            {row.word.split('').map((letter, colIdx) => (
              <Tile
                key={`${rowIdx}-${colIdx}`}
                letter={letter.trim()}
                feedback={row.feedback?.[colIdx]}
                delay={row.feedback ? colIdx * 0.15 : 0}
                active={isCurrentRow && colIdx === currentGuess.length}
              />
            ))}
          </motion.div>
        );
      })}
    </div>
  );
}
