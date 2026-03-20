'use client';

import { motion } from 'framer-motion';
import type { LetterState } from '@/lib/wordle';

const ROWS = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['enter', 'z', 'x', 'c', 'v', 'b', 'n', 'm', '⌫'],
];

interface KeyboardProps {
  letterStates: Map<string, LetterState>;
  onKey: (key: string) => void;
  disabled?: boolean;
}

export default function Keyboard({ letterStates, onKey, disabled }: KeyboardProps) {
  const getKeyStyle = (key: string) => {
    const state = letterStates.get(key);
    if (state === 'correct') return { background: 'var(--wordle-correct)', color: '#fff' };
    if (state === 'present') return { background: 'var(--wordle-present)', color: '#fff' };
    if (state === 'absent') return { background: 'var(--wordle-absent)', color: 'var(--text-muted)' };
    return { background: 'var(--bg-tertiary)', color: 'var(--text-primary)' };
  };

  return (
    <div className="flex flex-col items-center gap-[6px] w-full max-w-[500px] mx-auto">
      {ROWS.map((row, rowIdx) => (
        <div key={rowIdx} className="flex gap-[5px] justify-center w-full">
          {row.map((key) => {
            const isSpecial = key === 'enter' || key === '⌫';
            const style = isSpecial
              ? { background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }
              : getKeyStyle(key);

            return (
              <motion.button
                key={key}
                whileTap={{ scale: 0.92 }}
                onClick={() => !disabled && onKey(key)}
                disabled={disabled}
                className={`${
                  isSpecial ? 'px-3 sm:px-4 text-xs sm:text-sm' : 'w-[32px] sm:w-[40px] text-sm sm:text-base'
                } h-[50px] sm:h-[56px] rounded-lg font-semibold uppercase select-none cursor-pointer transition-colors flex items-center justify-center`}
                style={{
                  ...style,
                  minWidth: isSpecial ? '52px' : undefined,
                  opacity: disabled ? 0.5 : 1,
                }}
              >
                {key === 'enter' ? 'ENTER' : key === '⌫' ? '⌫' : key}
              </motion.button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
