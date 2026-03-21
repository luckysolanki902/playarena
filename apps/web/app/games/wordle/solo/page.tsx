"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import WordleBoard from "@/components/wordle/Board";
import Keyboard from "@/components/wordle/Keyboard";
import { getRandomWord, isValidWord, getFeedback, getKeyboardState, getBotSuggestions } from "@/lib/wordle";
import { sfx } from "@/lib/sounds";
import type { LetterFeedback } from "@playarena/shared";

const WORD_LENGTH = 5;
const MAX_ATTEMPTS = 6;

type GameStatus = "playing" | "won" | "lost";

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
      g.feedback.map((f) => (f === "correct" ? "\u{1F7E9}" : f === "present" ? "\u{1F7E8}" : "\u{2B1B}")).join(""),
    )
    .join("\n");
  return `PlayArena Wordle ${won ? `${guesses.length}/${MAX_ATTEMPTS}` : `X/${MAX_ATTEMPTS}`}\n\n${grid}\n\nplayarena.vercel.app`;
}

export default function SoloWordlePage() {
  const [target, setTarget] = useState(() => getRandomWord());
  const [guesses, setGuesses] = useState<Guess[]>([]);
  const [currentGuess, setCurrentGuess] = useState("");
  const [status, setStatus] = useState<GameStatus>("playing");
  const [shake, setShake] = useState(false);
  const [toast, setToast] = useState("");
  const [startTime, setStartTime] = useState(() => Date.now());
  const [score, setScore] = useState(0);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [hintPanel, setHintPanel] = useState<{ suggestions: string[]; reasoning: string; penalty: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string, ms = 1500) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), ms);
  }, []);

  const submitGuess = useCallback(() => {
    if (currentGuess.length !== WORD_LENGTH) return;
    if (!isValidWord(currentGuess)) {
      setShake(true);
      showToast("Not in word list");
      sfx.fail();
      setTimeout(() => setShake(false), 500);
      return;
    }
    sfx.flip();
    const feedback = getFeedback(currentGuess, target);
    const newGuesses = [...guesses, { word: currentGuess, feedback }];
    setGuesses(newGuesses);
    setCurrentGuess("");
    setHintPanel(null);

    // Play correct sound after flip animation
    setTimeout(() => {
      if (feedback.every((f) => f === "correct")) sfx.win();
      else if (feedback.some((f) => f === "correct")) sfx.correct();
    }, 400);

    if (currentGuess.toLowerCase() === target.toLowerCase()) {
      setStatus("won");
      const elapsed = Date.now() - startTime;
      const s = computeScore(newGuesses.length, hintsUsed, elapsed);
      setScore(s);
      const msgs = ["Genius!", "Magnificent!", "Impressive!", "Splendid!", "Great!", "Phew!"];
      showToast(msgs[newGuesses.length - 1] ?? "Nice!", 3000);
    } else if (newGuesses.length >= MAX_ATTEMPTS) {
      setStatus("lost");
      setScore(0);
      showToast(target.toUpperCase(), 5000);
    }
  }, [currentGuess, guesses, target, showToast, startTime, hintsUsed]);

  const handleKey = useCallback(
    (key: string) => {
      if (status !== "playing") return;
      if (key === "enter") {
        submitGuess();
      } else if (key === "\u232B" || key === "backspace") {
        setCurrentGuess((prev) => prev.slice(0, -1));
        sfx.click();
      } else if (/^[a-z]$/i.test(key) && currentGuess.length < WORD_LENGTH) {
        setCurrentGuess((prev) => prev + key.toLowerCase());
        sfx.pop();
      }
    },
    [status, currentGuess, submitGuess],
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "Enter") handleKey("enter");
      else if (e.key === "Backspace") handleKey("backspace");
      else if (/^[a-z]$/i.test(e.key)) handleKey(e.key.toLowerCase());
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleKey]);

  const letterStates = getKeyboardState(guesses);

  const askBot = () => {
    if (status !== "playing") return;
    sfx.click();
    const newCount = hintsUsed + 1;
    setHintsUsed(newCount);
    const result = getBotSuggestions(guesses);
    const penalty = newCount <= 1 ? 0 : newCount === 2 ? 50 : 100;
    setHintPanel({ suggestions: result.suggestions, reasoning: result.reasoning, penalty });
  };

  const hintLabel = hintsUsed === 0 ? "Free" : hintsUsed === 1 ? "-50pts" : "-100pts";

  const shareResult = async () => {
    sfx.click();
    const text = buildShareText(guesses, status === "won");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast("Copy failed");
    }
  };

  const resetGame = () => {
    sfx.go();
    setTarget(getRandomWord());
    setGuesses([]);
    setCurrentGuess("");
    setStatus("playing");
    setToast("");
    setScore(0);
    setHintsUsed(0);
    setHintPanel(null);
    setCopied(false);
    setStartTime(Date.now());
  };

  return (
    <div className="min-h-screen flex flex-col items-center relative stars-bg">
      {/* Blobs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="blob w-64 h-64 top-[-5%] left-[-5%] opacity-20" style={{ background: "var(--glow-primary)" }} />
        <div className="blob w-48 h-48 bottom-[5%] right-[-3%] opacity-15" style={{ background: "var(--glow-warm)" }} />
      </div>

      {/* Header */}
      <header className="relative z-10 w-full flex items-center justify-between px-4 sm:px-6 py-3 border-b" style={{ borderColor: "var(--border-subtle)" }}>
        <Link href="/games/wordle" className="flex items-center gap-1.5 hover:opacity-80 transition-opacity" onClick={() => sfx.click()}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          <span className="text-sm font-bold" style={{ color: "var(--text-muted)" }}>Back</span>
        </Link>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm font-black"
            style={{ background: "rgba(78,205,196,0.15)", color: "var(--accent-primary)" }}>
            W
          </div>
          <span className="text-base font-extrabold" style={{ color: "var(--text-primary)" }}>Wordle</span>
        </div>
        <span className="text-xs font-bold tabular-nums px-2 py-1 rounded-lg"
          style={{ background: "var(--bg-tertiary)", color: "var(--text-muted)" }}>
          {guesses.length}/{MAX_ATTEMPTS}
        </span>
      </header>

      {/* Toast */}
      <div className="relative z-50 w-full flex justify-center">
        <AnimatePresence>
          {toast && (
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.9 }}
              className="absolute top-4 px-5 py-2.5 rounded-2xl text-sm font-bold z-50"
              style={{ background: "var(--text-primary)", color: "var(--bg-primary)", boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }}
            >
              {toast}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Game area */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center gap-5 px-4 py-6 w-full max-w-lg">
        <WordleBoard guesses={guesses} currentGuess={currentGuess} maxAttempts={MAX_ATTEMPTS} wordLength={WORD_LENGTH} shake={shake} />

        {/* Hint Panel */}
        <AnimatePresence>
          {hintPanel && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="w-full max-w-sm rounded-2xl p-4 overflow-hidden"
              style={{ background: "var(--bg-card)", border: "1px solid var(--border-default)" }}
            >
              <div className="flex items-center gap-2 mb-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent-warm)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
                </svg>
                <span className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>Hint</span>
                {hintPanel.penalty > 0 && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-bold ml-auto"
                    style={{ background: "rgba(239,100,97,0.12)", color: "var(--accent-error)" }}>
                    -{hintPanel.penalty}pts
                  </span>
                )}
              </div>
              <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>{hintPanel.reasoning}</p>
              <div className="flex gap-2">
                {hintPanel.suggestions.map((s) => (
                  <span key={s} className="px-3 py-1.5 rounded-xl text-sm font-bold uppercase tracking-wider"
                    style={{ background: "var(--bg-elevated)", color: "var(--text-primary)" }}>
                    {s}
                  </span>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Game Over */}
        <AnimatePresence>
          {status !== "playing" && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-4 py-4"
            >
              <p className="text-xl font-extrabold"
                style={{ color: status === "won" ? "var(--accent-primary)" : "var(--accent-error)" }}>
                {status === "won" ? "Well done!" : `The word was ${target.toUpperCase()}`}
              </p>
              <div className="flex flex-col items-center gap-1">
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 300 }}
                  className="text-4xl font-black tabular-nums"
                  style={{ color: "var(--accent-warm)" }}>
                  {score}
                </motion.span>
                <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>points</span>
                {hintsUsed > 0 && (
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {hintsUsed} hint{hintsUsed > 1 ? "s" : ""} used
                  </span>
                )}
              </div>
              <div className="flex gap-2.5">
                <button onClick={resetGame}
                  className="btn-game px-5 py-2.5 rounded-2xl font-bold text-sm cursor-pointer"
                  style={{ background: "var(--accent-primary)", color: "var(--bg-primary)" }}>
                  Play Again
                </button>
                <button onClick={shareResult}
                  className="btn-game px-5 py-2.5 rounded-2xl font-bold text-sm cursor-pointer"
                  style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)" }}>
                  {copied ? "Copied!" : "Share"}
                </button>
                <Link href="/games/wordle"
                  className="btn-game px-5 py-2.5 rounded-2xl font-bold text-sm flex items-center"
                  style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}>
                  Lobby
                </Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <Keyboard letterStates={letterStates} onKey={handleKey} disabled={status !== "playing"} />

        {/* Hint button */}
        {status === "playing" && (
          <button onClick={askBot} onMouseEnter={() => sfx.hover()}
            className="btn-game flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold cursor-pointer"
            style={{ background: "var(--bg-card)", color: "var(--text-secondary)", border: "1px solid var(--border-default)" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            Get hint
            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold"
              style={{
                background: hintsUsed === 0 ? "rgba(78,205,196,0.12)" : hintsUsed === 1 ? "rgba(255,209,102,0.12)" : "rgba(239,100,97,0.12)",
                color: hintsUsed === 0 ? "var(--accent-primary)" : hintsUsed === 1 ? "var(--accent-warm)" : "var(--accent-error)",
              }}>
              {hintLabel}
            </span>
          </button>
        )}
      </div>

      <footer className="relative z-10 py-3 text-center text-xs font-medium" style={{ color: "var(--text-muted)" }}>
        Made with care by <span style={{ color: "var(--accent-warm)" }}>Dharaa Singh</span>
      </footer>
    </div>
  );
}
