"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useSessionStore } from "@/lib/store";
import { connectSocket, disconnectSocket } from "@/lib/socket";
import { sfx } from "@/lib/sounds";
import type { TypeRushWord, GlitchType } from "@playarena/shared";

type Phase = "lobby" | "countdown" | "playing" | "round-end" | "game-end";

interface Player { sessionId: string; username: string; isHost: boolean; }
interface PlayerProgress { sessionId: string; username: string; progress: number; wpm: number; finished: boolean; position?: number; }
interface RoundRanking { sessionId: string; username: string; wpm: number; accuracy: number; score: number; position: number; }
interface FinalRanking { sessionId: string; username: string; totalScore: number; avgWpm: number; avgAccuracy: number; }

function ordinal(n: number): string {
  if (n === 1) return "1st";
  if (n === 2) return "2nd";
  if (n === 3) return "3rd";
  return `${n}th`;
}

// Scramble word letters (not first and last)
function scrambleWord(word: string): string {
  if (word.length <= 3) return word;
  const middle = word.slice(1, -1).split("");
  for (let i = middle.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [middle[i], middle[j]] = [middle[j], middle[i]];
  }
  return word[0] + middle.join("") + word[word.length - 1];
}

export default function TypeRushRoomPage() {
  const params = useParams<{ roomId: string }>();
  const router = useRouter();
  const roomId = params.roomId;
  const session = useSessionStore((s) => s.session);

  const [phase, setPhase] = useState<Phase>("lobby");
  const [players, setPlayers] = useState<Player[]>([]);
  const [visibility, setVisibility] = useState<"public" | "private">("private");
  const [autoStartSeconds, setAutoStartSeconds] = useState<number | null>(null);
  const [countdown, setCountdown] = useState(3);
  const [round, setRound] = useState(1);
  const [totalRounds, setTotalRounds] = useState(3);

  const [text, setText] = useState("");
  const [words, setWords] = useState<TypeRushWord[]>([]);
  const [typedChars, setTypedChars] = useState(0);
  const [errorCount, setErrorCount] = useState(0);
  const [currentInput, setCurrentInput] = useState("");
  const [finished, setFinished] = useState(false);
  const [wpm, setWpm] = useState(0);

  const [playerProgress, setPlayerProgress] = useState<Record<string, PlayerProgress>>({});
  const [roundRankings, setRoundRankings] = useState<RoundRanking[]>([]);
  const [finalRankings, setFinalRankings] = useState<FinalRanking[]>([]);
  const [nextRoundIn, setNextRoundIn] = useState(0);

  const [toast, setToast] = useState("");

  const socketRef = useRef<ReturnType<typeof connectSocket> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const startTimeRef = useRef<number>(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string, ms = 1500) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), ms);
  }, []);

  useEffect(() => {
    if (!session) router.push("/");
  }, [session, router]);

  useEffect(() => {
    if (!session) return;
    const socket = connectSocket();
    socketRef.current = socket;

    socket.emit("lobby:join-room", { roomId });

    socket.on("lobby:room-joined", ({ room }) => {
      setPlayers(room.players);
      setVisibility(room.visibility);
      sfx.join();
    });
    socket.on("lobby:player-joined", ({ player }) => {
      setPlayers((prev) => [...prev.filter((p) => p.sessionId !== player.sessionId), player]);
      sfx.join();
    });
    socket.on("lobby:player-left", ({ sessionId: sid }) => {
      setPlayers((prev) => prev.filter((p) => p.sessionId !== sid));
    });
    socket.on("lobby:room-updated", ({ room }) => {
      setPlayers(room.players);
      setVisibility(room.visibility);
    });

    // Auto-start
    socket.on("lobby:auto-start", ({ secondsLeft }) => {
      setAutoStartSeconds(secondsLeft);
    });
    socket.on("lobby:auto-start-cancelled", () => {
      setAutoStartSeconds(null);
    });

    socket.on("lobby:game-starting", ({ countdown: c }) => {
      setPhase("countdown");
      setCountdown(c);
      sfx.tick();
      const interval = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) { clearInterval(interval); sfx.go(); return 0; }
          sfx.tick();
          return prev - 1;
        });
      }, 1000);
    });

    socket.on("typerush:round-start", ({ round: r, totalRounds: tr, text: t, words: w }) => {
      setPhase("playing");
      setRound(r);
      setTotalRounds(tr);
      setText(t);
      setWords(w);
      setTypedChars(0);
      setErrorCount(0);
      setCurrentInput("");
      setFinished(false);
      setWpm(0);
      setPlayerProgress({});
      setRoundRankings([]);
      startTimeRef.current = Date.now();
      setTimeout(() => inputRef.current?.focus(), 100);
    });

    socket.on("typerush:player-progress", ({ sessionId: sid, progress, wpm: w, charsTyped }) => {
      setPlayerProgress((prev) => ({
        ...prev,
        [sid]: { ...prev[sid], sessionId: sid, progress, wpm: w, finished: false },
      }));
    });

    socket.on("typerush:player-finished", ({ sessionId: sid, username: uname, position, wpm: w, accuracy, time }) => {
      if (sid === session.sessionId) {
        setFinished(true);
        sfx.win();
        showToast(`${ordinal(position)} place! ${w} WPM`, 3000);
      } else {
        showToast(`${uname} finished ${ordinal(position)}!`, 2000);
      }
      setPlayerProgress((prev) => ({
        ...prev,
        [sid]: { ...prev[sid], sessionId: sid, username: uname, progress: 100, wpm: w, finished: true, position },
      }));
    });

    socket.on("typerush:speed-boost", ({ sessionId: sid, bonus }) => {
      if (sid === session.sessionId) {
        showToast(`⚡ Speed Boost! +${bonus}pts`, 1500);
        sfx.win();
      }
    });

    socket.on("typerush:trap-triggered", ({ sessionId: sid, penalty }) => {
      if (sid === session.sessionId) {
        showToast(`💥 Trap! -${penalty}pts`, 1500);
        sfx.fail();
      }
    });

    socket.on("typerush:round-end", ({ rankings, nextRoundIn: next }) => {
      setPhase("round-end");
      setRoundRankings(rankings);
      setNextRoundIn(next);
    });

    socket.on("typerush:game-end", ({ finalRankings: fr }) => {
      setPhase("game-end");
      setFinalRankings(fr);
      sfx.win();
    });

    socket.on("typerush:error", ({ message }) => {
      showToast(message, 2000);
      sfx.fail();
    });

    socket.on("lobby:error", ({ message }) => {
      showToast(message, 3000);
      sfx.fail();
    });

    return () => {
      socket.emit("lobby:leave-room", { roomId });
      socket.removeAllListeners();
      disconnectSocket();
    };
  }, [roomId, session, showToast]);

  // Calculate WPM periodically
  useEffect(() => {
    if (phase !== "playing" || finished) return;
    const interval = setInterval(() => {
      if (startTimeRef.current && typedChars > 0) {
        const minutes = (Date.now() - startTimeRef.current) / 60000;
        const words = typedChars / 5; // standard: 5 chars = 1 word
        setWpm(Math.round(words / minutes) || 0);
      }
    }, 500);
    return () => clearInterval(interval);
  }, [phase, finished, typedChars]);

  const isHost = players.find((p) => p.sessionId === session?.sessionId)?.isHost ?? false;
  const startGame = () => { socketRef.current?.emit("lobby:start-game", { roomId }); sfx.click(); };

  const handleInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (finished) return;
    const value = e.target.value;
    const expected = text.slice(0, value.length);
    
    // Count errors
    let errors = 0;
    for (let i = 0; i < value.length; i++) {
      if (value[i] !== expected[i]) errors++;
    }
    
    setCurrentInput(value);
    setTypedChars(value.length);
    setErrorCount(errors);

    // Send progress to server
    const progress = Math.round((value.length / text.length) * 100);
    socketRef.current?.emit("typerush:progress", {
      roomId,
      charsTyped: value.length,
      errors,
      currentWord: text.slice(0, value.length).split(" ").length - 1,
    });

    // Check if finished
    if (value === text) {
      const totalTime = Date.now() - startTimeRef.current;
      socketRef.current?.emit("typerush:finished", { roomId, totalTime, errors });
      setFinished(true);
    }
  }, [finished, text, roomId]);

  // Find current word's glitch type
  const getCurrentGlitch = useCallback((): GlitchType => {
    const word = words.find((w) => typedChars >= w.startIndex && typedChars < w.endIndex);
    return word?.glitch || "none";
  }, [words, typedChars]);

  // Render text with highlighting and glitch effects
  const renderText = () => {
    if (!text) return null;
    
    return (
      <div className="font-mono text-lg leading-relaxed select-none" style={{ color: "var(--text-muted)" }}>
        {words.map((word, idx) => {
          const wordText = text.slice(word.startIndex, word.endIndex);
          const isTyped = typedChars >= word.endIndex;
          const isTyping = typedChars >= word.startIndex && typedChars < word.endIndex;
          const typedInWord = Math.max(0, Math.min(typedChars - word.startIndex, wordText.length));
          
          // Display text based on glitch type
          let displayText = wordText;
          if (word.glitch === "scramble" && !isTyped) {
            displayText = scrambleWord(wordText.replace(/\s+$/, "")) + wordText.slice(wordText.trimEnd().length);
          }
          
          return (
            <span
              key={idx}
              className={`
                ${word.glitch === "blur" && !isTyped ? "blur-[3px]" : ""}
                ${word.glitch === "speedboost" && !isTyped ? "text-yellow-400 font-bold" : ""}
                ${word.glitch === "trap" && !isTyped ? "text-red-400" : ""}
                ${isTyping ? "bg-white/10 rounded" : ""}
              `.trim()}
              style={{
                color: isTyped ? "var(--accent-primary)" : undefined,
              }}
            >
              {displayText.split("").map((char, charIdx) => {
                const globalIdx = word.startIndex + charIdx;
                const isCharTyped = typedChars > globalIdx;
                const isCharCurrent = typedChars === globalIdx;
                const isCorrect = isCharTyped && currentInput[globalIdx] === char;
                const isWrong = isCharTyped && currentInput[globalIdx] !== char;
                
                return (
                  <span
                    key={charIdx}
                    className={`
                      ${isCharCurrent ? "border-l-2 border-white animate-pulse" : ""}
                      ${isWrong ? "bg-red-500/30 text-red-400" : ""}
                    `.trim()}
                    style={{
                      color: isCorrect ? "var(--accent-primary)" : isWrong ? "#f87171" : undefined,
                    }}
                  >
                    {char}
                  </span>
                );
              })}
            </span>
          );
        })}
      </div>
    );
  };

  if (!session) return null;

  const progress = text.length > 0 ? Math.round((typedChars / text.length) * 100) : 0;
  const accuracy = typedChars > 0 ? Math.round(((typedChars - errorCount) / typedChars) * 100) : 100;

  return (
    <div className="min-h-screen flex flex-col relative stars-bg">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="blob w-64 h-64 top-[-5%] left-[-5%] opacity-15" style={{ background: "rgba(167,139,250,0.3)" }} />
        <div className="blob w-48 h-48 bottom-[5%] right-[-3%] opacity-10" style={{ background: "var(--glow-warm)" }} />
      </div>

      {/* Header */}
      <header className="relative z-10 w-full flex items-center justify-between px-4 sm:px-6 py-3 border-b" style={{ borderColor: "var(--border-subtle)" }}>
        <Link href="/games/typerush" className="flex items-center gap-1.5 hover:opacity-80 transition-opacity" onClick={() => sfx.click()}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          <span className="text-sm font-bold" style={{ color: "var(--text-muted)" }}>Leave</span>
        </Link>
        <div className="text-center">
          <div className="flex items-center gap-2 justify-center">
            <div className="w-6 h-6 rounded-md flex items-center justify-center text-xs font-black"
              style={{ background: "rgba(167,139,250,0.15)", color: "#a78bfa" }}>T</div>
            <span className="text-base font-extrabold" style={{ color: "var(--text-primary)" }}>TypeRush</span>
          </div>
          {phase === "playing" && (
            <span className="text-[11px] font-bold tabular-nums" style={{ color: "var(--text-muted)" }}>
              Round {round}/{totalRounds} · {wpm} WPM
            </span>
          )}
        </div>
        <div className="w-16" /> {/* Spacer for centering */}
      </header>

      {/* Toast */}
      <div className="relative z-50 w-full flex justify-center">
        <AnimatePresence>
          {toast && (
            <motion.div initial={{ opacity: 0, y: -20, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -20, scale: 0.9 }}
              className="absolute top-4 px-5 py-2.5 rounded-2xl text-sm font-bold z-50"
              style={{ background: "var(--text-primary)", color: "var(--bg-primary)", boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }}>
              {toast}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="relative z-10 flex-1 flex flex-col items-center justify-center gap-5 px-4 py-6">
        {/* Lobby */}
        {phase === "lobby" && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center gap-6">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl font-black animate-float"
              style={{ background: "rgba(167,139,250,0.12)", color: "#a78bfa", boxShadow: "0 8px 32px rgba(167,139,250,0.1)" }}>
              T
            </div>
            <div className="text-center">
              <h2 className="text-xl font-extrabold mb-1" style={{ color: "var(--text-primary)" }}>Ready to race?</h2>
              <p className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                {players.length} racer{players.length !== 1 ? "s" : ""} in room
              </p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center">
              {players.map((p, i) => (
                <motion.div key={p.sessionId} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.1 }}
                  className="px-3 py-2 rounded-xl text-sm font-bold flex items-center gap-2"
                  style={{ background: "var(--bg-card)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}>
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black"
                    style={{ background: "#a78bfa", color: "var(--bg-primary)" }}>
                    {p.username[0].toUpperCase()}
                  </div>
                  {p.username}
                  {p.isHost && visibility === "private" && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold"
                      style={{ background: "rgba(255,209,102,0.15)", color: "var(--accent-warm)" }}>Host</span>
                  )}
                </motion.div>
              ))}
            </div>
            <div className="flex gap-1.5">
              {[0, 1, 2].map((i) => (
                <motion.div key={i} className="w-2 h-2 rounded-full"
                  style={{ background: "#a78bfa" }}
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.3 }} />
              ))}
            </div>
            {isHost ? (
              visibility === "private" ? (
                <button onClick={startGame} disabled={players.length < 2}
                  className="btn-game px-8 py-3 rounded-2xl font-bold text-sm text-white cursor-pointer disabled:opacity-40"
                  style={{ background: "#a78bfa", color: "var(--bg-primary)" }}>
                  {players.length < 2 ? "Waiting for racers..." : "Start Race"}
                </button>
              ) : (
                <p className="text-sm font-bold tabular-nums" style={{ color: "#a78bfa" }}>
                  {autoStartSeconds !== null ? `Starting in ${autoStartSeconds}s...` : "Waiting for racers..."}
                </p>
              )
            ) : (
              visibility === "private" ? (
                <p className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Waiting for the host to start...</p>
              ) : (
                <p className="text-sm font-bold tabular-nums" style={{ color: "#a78bfa" }}>
                  {autoStartSeconds !== null ? `Starting in ${autoStartSeconds}s...` : "Waiting for racers..."}
                </p>
              )
            )}
          </motion.div>
        )}

        {/* Countdown */}
        {phase === "countdown" && (
          <motion.div key={countdown} initial={{ scale: 0.3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.4, type: "spring", stiffness: 200 }}
            className="text-7xl font-black tabular-nums" style={{ color: "#a78bfa", textShadow: "0 0 40px rgba(167,139,250,0.3)" }}>
            {countdown > 0 ? countdown : "Type!"}
          </motion.div>
        )}

        {/* Playing */}
        {phase === "playing" && (
          <div className="w-full max-w-3xl space-y-6">
            {/* Player progress bars */}
            <div className="space-y-2">
              {/* Self */}
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold w-20 truncate" style={{ color: "var(--accent-primary)" }}>
                  You
                </span>
                <div className="flex-1 h-3 rounded-full overflow-hidden" style={{ background: "var(--bg-tertiary)" }}>
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: "var(--accent-primary)" }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.2 }}
                  />
                </div>
                <span className="text-xs font-bold w-12 text-right tabular-nums" style={{ color: "var(--text-muted)" }}>
                  {wpm}
                </span>
              </div>
              {/* Others */}
              {players.filter((p) => p.sessionId !== session?.sessionId).map((p) => {
                const prog = playerProgress[p.sessionId];
                return (
                  <div key={p.sessionId} className="flex items-center gap-3">
                    <span className="text-xs font-bold w-20 truncate" style={{ color: "var(--text-secondary)" }}>
                      {p.username}
                    </span>
                    <div className="flex-1 h-3 rounded-full overflow-hidden" style={{ background: "var(--bg-tertiary)" }}>
                      <motion.div
                        className="h-full rounded-full"
                        style={{ background: prog?.finished ? "var(--accent-warm)" : "var(--text-muted)" }}
                        animate={{ width: `${prog?.progress || 0}%` }}
                        transition={{ duration: 0.2 }}
                      />
                    </div>
                    <span className="text-xs font-bold w-12 text-right tabular-nums" style={{ color: "var(--text-muted)" }}>
                      {prog?.wpm || 0}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Text to type */}
            <div className="p-5 rounded-2xl" style={{ background: "var(--bg-card)", border: "1px solid var(--border-default)" }}>
              {renderText()}
            </div>

            {/* Hidden input for typing */}
            <input
              ref={inputRef}
              type="text"
              value={currentInput}
              onChange={handleInput}
              disabled={finished}
              className="opacity-0 absolute -z-10"
              autoFocus
            />

            {/* Stats bar */}
            <div className="flex justify-center gap-6 text-sm">
              <div className="text-center">
                <p className="font-black text-xl tabular-nums" style={{ color: "var(--accent-primary)" }}>{wpm}</p>
                <p className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>WPM</p>
              </div>
              <div className="text-center">
                <p className="font-black text-xl tabular-nums" style={{ color: accuracy >= 95 ? "var(--accent-primary)" : accuracy >= 80 ? "var(--accent-warm)" : "var(--accent-error)" }}>{accuracy}%</p>
                <p className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Accuracy</p>
              </div>
              <div className="text-center">
                <p className="font-black text-xl tabular-nums" style={{ color: "var(--text-secondary)" }}>{progress}%</p>
                <p className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Progress</p>
              </div>
            </div>

            {finished && (
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center text-sm font-bold"
                style={{ color: "var(--accent-primary)" }}>
                Finished! Waiting for others...
              </motion.p>
            )}

            {/* Click to focus hint */}
            {!finished && (
              <p 
                className="text-center text-xs cursor-pointer" 
                style={{ color: "var(--text-muted)" }}
                onClick={() => inputRef.current?.focus()}
              >
                Click here or start typing to race
              </p>
            )}
          </div>
        )}

        {/* Round End */}
        {phase === "round-end" && roundRankings.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center gap-5">
            <h2 className="text-xl font-extrabold" style={{ color: "var(--text-primary)" }}>Round {round} Results</h2>
            <div className="flex flex-col gap-2 w-72">
              {roundRankings.map((r) => (
                <div key={r.sessionId}
                  className="flex items-center justify-between px-4 py-3 rounded-xl"
                  style={{
                    background: r.sessionId === session?.sessionId ? "rgba(167,139,250,0.15)" : "var(--bg-card)",
                    border: `1px solid ${r.sessionId === session?.sessionId ? "rgba(167,139,250,0.3)" : "var(--border-default)"}`,
                  }}>
                  <div className="flex items-center gap-3">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black ${
                      r.position === 1 ? "bg-yellow-400 text-black" :
                      r.position === 2 ? "bg-gray-400 text-black" :
                      r.position === 3 ? "bg-amber-600 text-white" :
                      "bg-gray-700 text-white"
                    }`}>
                      {r.position}
                    </span>
                    <span className="font-bold text-sm" style={{ color: "var(--text-primary)" }}>{r.username}</span>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-sm tabular-nums" style={{ color: "#a78bfa" }}>{r.wpm} WPM</p>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>{r.accuracy}% acc</p>
                  </div>
                </div>
              ))}
            </div>
            {nextRoundIn > 0 && (
              <p className="text-sm font-bold tabular-nums" style={{ color: "var(--text-muted)" }}>
                Next round in {nextRoundIn}s...
              </p>
            )}
          </motion.div>
        )}

        {/* Game End */}
        {phase === "game-end" && (
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center gap-6">
            <h2 className="text-2xl font-extrabold" style={{ color: "var(--text-primary)" }}>🏁 Race Complete!</h2>
            <div className="flex flex-col gap-2 w-80">
              {finalRankings.map((r, i) => (
                <motion.div key={r.sessionId}
                  initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className="flex items-center justify-between px-4 py-3 rounded-xl"
                  style={{
                    background: r.sessionId === session?.sessionId ? "rgba(167,139,250,0.15)" : "var(--bg-card)",
                    border: `1px solid ${r.sessionId === session?.sessionId ? "rgba(167,139,250,0.3)" : "var(--border-default)"}`,
                  }}>
                  <div className="flex items-center gap-3">
                    <span className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-black ${
                      i === 0 ? "bg-yellow-400 text-black" :
                      i === 1 ? "bg-gray-400 text-black" :
                      i === 2 ? "bg-amber-600 text-white" :
                      "bg-gray-700 text-white"
                    }`}>
                      {i + 1}
                    </span>
                    <div>
                      <p className="font-bold text-sm" style={{ color: "var(--text-primary)" }}>{r.username}</p>
                      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                        {r.avgWpm} WPM avg · {r.avgAccuracy}% acc
                      </p>
                    </div>
                  </div>
                  <p className="font-black text-lg tabular-nums" style={{ color: "#a78bfa" }}>{r.totalScore}</p>
                </motion.div>
              ))}
            </div>
            <Link href="/games/typerush"
              className="btn-game px-8 py-3 rounded-2xl font-bold text-sm cursor-pointer"
              style={{ background: "#a78bfa", color: "var(--bg-primary)" }}
              onClick={() => sfx.click()}>
              Play Again
            </Link>
          </motion.div>
        )}
      </div>
    </div>
  );
}
