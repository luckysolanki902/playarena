"use client";

import { motion } from "framer-motion";
import type { LetterState } from "@/lib/wordle";

const ROWS = [
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
  ["enter", "z", "x", "c", "v", "b", "n", "m", "\u232B"],
];

interface KeyboardProps {
  letterStates: Map<string, LetterState>;
  onKey: (key: string) => void;
  disabled?: boolean;
}

export default function Keyboard({ letterStates, onKey, disabled }: KeyboardProps) {
  const getKeyStyle = (key: string) => {
    const state = letterStates.get(key);
    if (state === "correct") return { background: "var(--wordle-correct)", color: "#fff", boxShadow: "0 2px 8px rgba(83,141,78,0.3)" };
    if (state === "present") return { background: "var(--wordle-present)", color: "#fff", boxShadow: "0 2px 8px rgba(181,159,59,0.2)" };
    if (state === "absent") return { background: "var(--wordle-absent)", color: "var(--text-muted)", boxShadow: "none" };
    return { background: "var(--bg-tertiary)", color: "var(--text-primary)", boxShadow: "none" };
  };

  return (
    <div className="flex flex-col items-center gap-[6px] w-full max-w-[500px] mx-auto">
      {ROWS.map((row, rowIdx) => (
        <div key={rowIdx} className="flex gap-[5px] justify-center w-full">
          {row.map((key) => {
            const isSpecial = key === "enter" || key === "\u232B";
            const style = isSpecial
              ? { background: "var(--bg-tertiary)", color: "var(--text-primary)", boxShadow: "none" }
              : getKeyStyle(key);

            return (
              <motion.button
                key={key}
                whileTap={{ scale: 0.9 }}
                onClick={() => !disabled && onKey(key)}
                disabled={disabled}
                className={`${
                  isSpecial ? "px-3 sm:px-4 text-xs sm:text-sm" : "w-[30px] sm:w-[38px] text-sm sm:text-base"
                } h-[48px] sm:h-[56px] rounded-xl font-bold uppercase select-none cursor-pointer flex items-center justify-center`}
                style={{
                  ...(style as Record<string, string>),
                  minWidth: isSpecial ? "52px" : undefined,
                  opacity: disabled ? 0.3 : 1,
                  transition: "background-color 0.3s ease, opacity 0.2s ease",
                }}
              >
                {key === "enter" ? "ENTER" : key === "\u232B" ? "\u232B" : key}
              </motion.button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
