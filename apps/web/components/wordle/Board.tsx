"use client";

import { motion } from "framer-motion";
import type { LetterFeedback } from "@playarena/shared";

interface TileProps {
  letter: string;
  feedback?: LetterFeedback;
  delay?: number;
  active?: boolean;
}

function Tile({ letter, feedback, delay = 0, active }: TileProps) {
  const bgColor = feedback === "correct"
    ? "var(--wordle-correct)"
    : feedback === "present"
    ? "var(--wordle-present)"
    : feedback === "absent"
    ? "var(--wordle-absent)"
    : "var(--wordle-empty)";

  const borderColor = active
    ? "var(--accent-primary)"
    : feedback
    ? "transparent"
    : letter
    ? "var(--border-focus)"
    : "var(--border-default)";

  const shadow = feedback === "correct"
    ? "0 0 16px rgba(83, 141, 78, 0.25)"
    : feedback === "present"
    ? "0 0 16px rgba(181, 159, 59, 0.2)"
    : "none";

  return (
    <motion.div
      initial={feedback ? { rotateX: 0 } : undefined}
      animate={feedback ? { rotateX: [0, 90, 0] } : letter ? { scale: [1, 1.08, 1] } : undefined}
      transition={feedback ? { duration: 0.55, delay, times: [0, 0.5, 1], ease: "easeInOut" } : { duration: 0.1 }}
      className="w-[54px] h-[54px] sm:w-[62px] sm:h-[62px] flex items-center justify-center text-xl sm:text-2xl font-black uppercase rounded-xl select-none"
      style={{
        background: bgColor,
        border: `2.5px solid ${borderColor}`,
        boxShadow: shadow,
        color: feedback ? "#fff" : "var(--text-primary)",
        letterSpacing: "0.04em",
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

  for (const g of guesses) {
    rows.push({ word: g.word, feedback: g.feedback });
  }

  if (guesses.length < maxAttempts) {
    rows.push({ word: currentGuess.padEnd(wordLength, " ").slice(0, wordLength) });
  }

  while (rows.length < maxAttempts) {
    rows.push({ word: " ".repeat(wordLength) });
  }

  return (
    <div className="flex flex-col items-center gap-[6px]">
      {rows.map((row, rowIdx) => {
        const isCurrentRow = rowIdx === guesses.length;
        return (
          <motion.div
            key={rowIdx}
            animate={shake && isCurrentRow ? { x: [0, -8, 8, -8, 8, 0] } : {}}
            transition={{ duration: 0.4, ease: "easeInOut" }}
            className="flex gap-[6px]"
          >
            {row.word.split("").map((letter, colIdx) => (
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
