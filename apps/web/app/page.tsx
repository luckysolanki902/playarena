"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { validateUsername } from "@playarena/shared";
import { useSessionStore } from "@/lib/store";
import { sfx } from "@/lib/sounds";

type GameCategory = "word" | "creative" | "typing" | "action" | "party";

interface Game {
  id: string;
  name: string;
  tagline: string;
  color: string;
  bgGlow: string;
  letter: string;
  ready: boolean;
  category: GameCategory;
}

const CATEGORIES: { id: GameCategory; label: string; emoji: string }[] = [
  { id: "word", label: "Word & Trivia", emoji: "🧠" },
  { id: "creative", label: "Creative", emoji: "🎨" },
  { id: "typing", label: "Typing", emoji: "⌨️" },
  { id: "action", label: "Action", emoji: "⚡" },
  { id: "party", label: "Party", emoji: "🎲" },
];

const GAMES: Game[] = [
  // Word & Trivia
  {
    id: "wordle",
    name: "Wordle",
    tagline: "Guess the word in 6 tries",
    color: "#4ecdc4",
    bgGlow: "rgba(78, 205, 196, 0.12)",
    letter: "W",
    ready: true,
    category: "word",
  },
  {
    id: "trivia",
    name: "Trivia",
    tagline: "Battle wits & knowledge",
    color: "#ff6b9d",
    bgGlow: "rgba(255, 107, 157, 0.12)",
    letter: "?",
    ready: false,
    category: "word",
  },
  // Creative
  {
    id: "scribble",
    name: "Scribble",
    tagline: "Draw & guess with friends",
    color: "#ffd166",
    bgGlow: "rgba(255, 209, 102, 0.12)",
    letter: "S",
    ready: true,
    category: "creative",
  },
  // Typing
  {
    id: "typerush",
    name: "TypeRush",
    tagline: "Race with glitchy twists",
    color: "#a78bfa",
    bgGlow: "rgba(167, 139, 250, 0.12)",
    letter: "T",
    ready: true,
    category: "typing",
  },
  // Action
  {
    id: "pulsegrid",
    name: "PulseGrid",
    tagline: "Capture territory with pulses",
    color: "#22d3ee",
    bgGlow: "rgba(34, 211, 238, 0.12)",
    letter: "P",
    ready: false,
    category: "action",
  },
  {
    id: "neondrift",
    name: "Neon Drift",
    tagline: "Tron-style line duel",
    color: "#f472b6",
    bgGlow: "rgba(244, 114, 182, 0.12)",
    letter: "N",
    ready: false,
    category: "action",
  },
  {
    id: "voidfall",
    name: "Voidfall",
    tagline: "Dodge the shrinking zone",
    color: "#818cf8",
    bgGlow: "rgba(129, 140, 248, 0.12)",
    letter: "V",
    ready: false,
    category: "action",
  },
  {
    id: "syncshot",
    name: "SyncShot",
    tagline: "Cursor sniper showdown",
    color: "#34d399",
    bgGlow: "rgba(52, 211, 153, 0.12)",
    letter: "⊕",
    ready: false,
    category: "action",
  },
  // Party
  {
    id: "glitcharena",
    name: "Glitch Arena",
    tagline: "Chaos button madness",
    color: "#fb923c",
    bgGlow: "rgba(251, 146, 60, 0.12)",
    letter: "G",
    ready: false,
    category: "party",
  },
  {
    id: "orbitbrawl",
    name: "Orbit Brawl",
    tagline: "Magnetic push mayhem",
    color: "#e879f9",
    bgGlow: "rgba(232, 121, 249, 0.12)",
    letter: "O",
    ready: false,
    category: "party",
  },
];

const FloatingLetter = ({ char, style, delay }: { char: string; style: React.CSSProperties; delay: number }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 0.12, y: 0 }}
    transition={{ delay, duration: 1 }}
    className="absolute text-6xl sm:text-8xl font-black select-none pointer-events-none animate-float-slow"
    style={{ ...style, color: "var(--accent-primary)" }}
  >
    {char}
  </motion.div>
);

export default function Home() {
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const [focused, setFocused] = useState(false);
  const { session, createSession } = useSessionStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const handlePlay = async () => {
    const result = validateUsername(username);
    if (!result.ok) {
      setError(result.error);
      sfx.fail();
      return;
    }
    setError("");
    sfx.go();
    await createSession(username.trim());
  };

  if (!mounted) return null;

  return (
    <main className="min-h-screen flex flex-col relative stars-bg">
      {/* Floating background decorations */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="blob w-72 h-72 top-[-5%] left-[-5%] opacity-30" style={{ background: "var(--glow-primary)" }} />
        <div className="blob w-96 h-96 bottom-[-10%] right-[-8%] opacity-20" style={{ background: "var(--glow-warm)" }} />
        <div className="blob w-64 h-64 top-[40%] right-[10%] opacity-15" style={{ background: "var(--glow-soft)" }} />

        <FloatingLetter char="W" style={{ top: "12%", left: "8%" }} delay={0.3} />
        <FloatingLetter char="O" style={{ top: "20%", right: "12%" }} delay={0.6} />
        <FloatingLetter char="R" style={{ bottom: "25%", left: "15%" }} delay={0.9} />
        <FloatingLetter char="D" style={{ bottom: "15%", right: "18%" }} delay={1.2} />
        <FloatingLetter char="S" style={{ top: "55%", left: "5%" }} delay={1.5} />
      </div>

      {/* Header */}
      <nav className="relative z-10 w-full px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-2"
          >
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-base font-black"
              style={{ background: "var(--accent-primary)", color: "var(--bg-primary)" }}>
              S
            </div>
            <span className="text-lg font-extrabold tracking-tight" style={{ color: "var(--text-primary)" }}>
              spyl<span style={{ color: "var(--accent-primary)" }}>lio</span>
            </span>
          </motion.div>

          {session && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-2.5 px-3 py-1.5 rounded-full"
              style={{ background: "var(--bg-tertiary)", border: "1px solid var(--border-default)" }}
            >
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                style={{ background: "var(--accent-primary)", color: "var(--bg-primary)" }}
              >
                {session.username[0].toUpperCase()}
              </div>
              <span className="text-sm font-semibold" style={{ color: "var(--text-secondary)" }}>
                {session.username}
              </span>
            </motion.div>
          )}
        </div>
      </nav>

      {/* Hero */}
      <section className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 pb-20">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="text-center max-w-lg w-full"
        >
          {/* Fun tile illustration */}
          <motion.div
            className="flex justify-center gap-2 mb-6"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2, duration: 0.5, type: "spring" }}
          >
            {["P", "L", "A", "Y"].map((ch, i) => (
              <motion.div
                key={ch}
                initial={{ rotateY: 180, opacity: 0 }}
                animate={{ rotateY: 0, opacity: 1 }}
                transition={{ delay: 0.3 + i * 0.12, duration: 0.5, type: "spring" }}
                className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl flex items-center justify-center text-xl sm:text-2xl font-black select-none"
                style={{
                  background: i === 0 ? "var(--accent-primary)" : i === 1 ? "var(--accent-warm)" : i === 2 ? "var(--accent-soft)" : "var(--accent-fun)",
                  color: "var(--bg-primary)",
                  boxShadow: `0 4px 16px ${i === 0 ? "rgba(78,205,196,0.3)" : i === 1 ? "rgba(255,209,102,0.3)" : i === 2 ? "rgba(167,139,250,0.3)" : "rgba(255,107,157,0.3)"}`,
                }}
              >
                {ch}
              </motion.div>
            ))}
          </motion.div>

          <h1
            className="text-4xl sm:text-5xl font-black tracking-tight mb-3"
            style={{ color: "var(--text-primary)" }}
          >
            Word games,{" "}
            <span className="shimmer-text">together</span>
          </h1>
          <p className="text-base sm:text-lg font-medium mb-10" style={{ color: "var(--text-secondary)" }}>
            Cozy multiplayer fun. No sign-up needed.
          </p>

          {/* Username entry */}
          {!session ? (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.5 }}
              className="flex flex-col gap-3 max-w-xs mx-auto"
            >
              <div
                className="relative rounded-2xl overflow-hidden transition-all duration-300"
                style={{
                  boxShadow: focused
                    ? "0 0 0 2px var(--accent-primary), 0 8px 32px rgba(78,205,196,0.15)"
                    : error
                    ? "0 0 0 2px var(--accent-error)"
                    : "0 0 0 1px var(--border-default)",
                }}
              >
                <input
                  type="text"
                  value={username}
                  onChange={(e) => { setUsername(e.target.value); setError(""); }}
                  onKeyDown={(e) => e.key === "Enter" && handlePlay()}
                  onFocus={() => { setFocused(true); sfx.click(); }}
                  onBlur={() => setFocused(false)}
                  placeholder="Pick a nickname..."
                  maxLength={16}
                  className="w-full h-14 px-5 rounded-2xl text-base font-semibold outline-none placeholder:font-normal"
                  style={{ background: "var(--bg-secondary)", color: "var(--text-primary)" }}
                />
              </div>
              <button
                onClick={handlePlay}
                className="btn-game h-14 rounded-2xl font-bold text-base cursor-pointer flex items-center justify-center gap-2"
                style={{ background: "var(--accent-primary)", color: "var(--bg-primary)" }}
                onMouseEnter={() => sfx.hover()}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                Let's play!
              </button>
              <AnimatePresence>
                {error && (
                  <motion.p
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="text-sm font-medium text-center"
                    style={{ color: "var(--accent-error)" }}
                  >
                    {error}
                  </motion.p>
                )}
              </AnimatePresence>
            </motion.div>
          ) : (
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
              <p className="text-base font-bold mb-1" style={{ color: "var(--accent-primary)" }}>
                Hey {session.username}!
              </p>
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                Pick a game below to get started
              </p>
            </motion.div>
          )}
        </motion.div>

        {/* Game Cards by Category */}
        <div className="mt-14 max-w-3xl w-full px-2 space-y-8">
          {CATEGORIES.map((category) => {
            const categoryGames = GAMES.filter((g) => g.category === category.id);
            if (categoryGames.length === 0) return null;
            return (
              <motion.div
                key={category.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
              >
                <h2
                  className="text-sm font-bold mb-3 flex items-center gap-2"
                  style={{ color: "var(--text-secondary)" }}
                >
                  <span>{category.emoji}</span>
                  {category.label}
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {categoryGames.map((game, i) => (
                    <motion.div
                      key={game.id}
                      initial={{ opacity: 0, y: 24 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.5 + i * 0.08, type: "spring", stiffness: 200 }}
                      onClick={() => {
                        if (game.ready && session) {
                          sfx.click();
                          window.location.href = `/games/${game.id}`;
                        }
                      }}
                      onMouseEnter={() => game.ready && session && sfx.hover()}
                      className={`game-card relative rounded-2xl p-4 sm:p-5 flex flex-col items-center text-center cursor-pointer overflow-hidden ${
                        !game.ready || !session ? "opacity-50 cursor-default !transform-none" : ""
                      }`}
                      style={{
                        background: "var(--bg-card)",
                        border: "1px solid var(--border-default)",
                      }}
                    >
                      {/* Glow */}
                      <div
                        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ background: `radial-gradient(circle at center, ${game.bgGlow}, transparent 70%)` }}
                      />

                      <div
                        className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center text-2xl sm:text-3xl font-black mb-3 relative z-10"
                        style={{
                          background: game.bgGlow,
                          color: game.color,
                          boxShadow: `0 4px 20px ${game.bgGlow}`,
                        }}
                      >
                        {game.letter}
                      </div>
                      <h3 className="text-sm sm:text-base font-bold relative z-10" style={{ color: "var(--text-primary)" }}>
                        {game.name}
                      </h3>
                      <p className="text-[11px] sm:text-xs mt-0.5 relative z-10" style={{ color: "var(--text-muted)" }}>
                        {game.tagline}
                      </p>
                      {!game.ready && (
                        <span
                          className="text-[10px] px-2 py-0.5 rounded-full font-bold mt-2 relative z-10"
                          style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}
                        >
                          Soon
                        </span>
                      )}
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 py-4 text-center">
        <p className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
          Made with care by <span style={{ color: "var(--accent-warm)" }}>Dharaa Singh</span>
        </p>
      </footer>
    </main>
  );
}
