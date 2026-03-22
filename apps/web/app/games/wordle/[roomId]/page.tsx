"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import WordleBoard from "@/components/wordle/Board";
import Keyboard from "@/components/wordle/Keyboard";
import { isValidWord, getKeyboardState } from "@/lib/wordle";
import { useSessionStore } from "@/lib/store";
import { connectSocket, disconnectSocket } from "@/lib/socket";
import { sfx } from "@/lib/sounds";
import type { LetterFeedback } from "@playarena/shared";

const WORD_LENGTH = 5;
const MAX_ATTEMPTS = 6;

type Phase = "lobby" | "countdown" | "playing" | "round-end" | "game-end";

interface Player { sessionId: string; username: string; isHost: boolean; }
interface Guess { word: string; feedback: LetterFeedback[]; }
interface RoundResult { word: string; rankings: Array<{ sessionId: string; username: string; score: number }>; nextRoundIn: number; }
interface FinalRanking { sessionId: string; username: string; totalScore: number; rating: number; }

function ordinal(n: number): string {
  if (n === 1) return "1st";
  if (n === 2) return "2nd";
  if (n === 3) return "3rd";
  return `${n}th`;
}

export default function MultiplayerWordlePage() {
  const params = useParams<{ roomId: string }>();
  const router = useRouter();
  const roomId = params.roomId;
  const session = useSessionStore((s) => s.session);

  const [phase, setPhase] = useState<Phase>("lobby");
  const [players, setPlayers] = useState<Player[]>([]);
  const [visibility, setVisibility] = useState<"public" | "private">("private");
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [autoStartSeconds, setAutoStartSeconds] = useState<number | null>(null);
  const [countdown, setCountdown] = useState(3);
  const [round, setRound] = useState(1);
  const [totalRounds, setTotalRounds] = useState(3);
  const [timeLeft, setTimeLeft] = useState(120);

  const [guesses, setGuesses] = useState<Guess[]>([]);
  const [pendingWord, setPendingWord] = useState<string | null>(null);
  const [currentGuess, setCurrentGuess] = useState("");
  const [shake, setShake] = useState(false);
  const [toast, setToast] = useState("");
  const [solved, setSolved] = useState(false);

  const [roundResult, setRoundResult] = useState<RoundResult | null>(null);
  const [finalRankings, setFinalRankings] = useState<FinalRanking[]>([]);

  const [opponents, setOpponents] = useState<
    Record<string, { username: string; guessCount: number; solved: boolean; feedbacks: LetterFeedback[][] }>
  >({});

  const [messages, setMessages] = useState<Array<{ username: string; text: string; timestamp: number }>>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatOpen, setChatOpen] = useState(false);

  const socketRef = useRef<ReturnType<typeof connectSocket> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
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
      if (room.code) setRoomCode(room.code);
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
      if (room.code) setRoomCode(room.code);
    });

    // Auto-start for public rooms
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

    socket.on("wordle:round-start", ({ round: r, totalRounds: tr, timeLimit }) => {
      setPhase("playing");
      setRound(r);
      setTotalRounds(tr);
      setTimeLeft(timeLimit);
      setGuesses([]);
      setPendingWord(null);
      setCurrentGuess("");
      setSolved(false);
      setOpponents({});
      setRoundResult(null);

      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) { if (timerRef.current) clearInterval(timerRef.current); return 0; }
          return prev - 1;
        });
      }, 1000);
    });

    socket.on("wordle:guess-result", ({ word, feedback }: { word: string; feedback: LetterFeedback[]; attempt: number }) => {
      setGuesses((prev) => {
        const existing = prev.find((g) => g.word === word && g.feedback.length === 0);
        if (existing) return prev.map((g) => (g === existing ? { word, feedback } : g));
        return [...prev, { word, feedback }];
      });
      setPendingWord(null);
      sfx.flip();
    });

    socket.on("wordle:opponent-guess", ({ sessionId: sid, username: uname, attempt, feedback }) => {
      setOpponents((prev) => {
        const opp = prev[sid] || { username: uname || "", guessCount: 0, solved: false, feedbacks: [] };
        return { ...prev, [sid]: { ...opp, username: uname || opp.username, guessCount: attempt, feedbacks: [...opp.feedbacks, feedback] } };
      });
    });

    socket.on("wordle:player-solved", ({ sessionId: sid, username: uname, attempt }) => {
      if (sid === session.sessionId) {
        setSolved(true);
        sfx.win();
        const msgs = ["Genius!", "Magnificent!", "Impressive!", "Splendid!", "Great!", "Phew!"];
        showToast(msgs[attempt - 1] ?? "Solved!", 2000);
      } else {
        showToast(`${uname} solved in ${attempt}`, 2000);
      }
      setOpponents((prev) => {
        const opp = prev[sid] || { username: uname, guessCount: attempt, solved: false, feedbacks: [] };
        return { ...prev, [sid]: { ...opp, username: uname, solved: true } };
      });
    });

    socket.on("wordle:round-end", (result: RoundResult) => { setPhase("round-end"); setRoundResult(result); if (timerRef.current) clearInterval(timerRef.current); });
    socket.on("wordle:game-end", ({ finalRankings: fr }) => { setPhase("game-end"); setFinalRankings(fr); sfx.win(); });
    socket.on("wordle:hint", ({ suggestions, reasoning, penalty }) => {
      const hint = suggestions[0] ?? reasoning;
      showToast(`${hint} ${penalty > 0 ? `(-${penalty}pts)` : "(free)"}`, 3000);
    });
    socket.on("wordle:error", ({ message }) => { showToast(message, 2000); sfx.fail(); setPendingWord(null); setGuesses((prev) => prev.filter((g) => g.feedback.length > 0)); });
    socket.on("lobby:error", ({ message }) => { showToast(message, 3000); sfx.fail(); });
    socket.on("chat:message", (msg) => { setMessages((prev) => [...prev.slice(-49), msg]); sfx.send(); });

    return () => {
      socket.emit("lobby:leave-room", { roomId });
      socket.removeAllListeners();
      if (timerRef.current) clearInterval(timerRef.current);
      disconnectSocket();
    };
  }, [roomId, session, showToast]);

  const isHost = players.find((p) => p.sessionId === session?.sessionId)?.isHost ?? false;
  const startGame = () => { socketRef.current?.emit("lobby:start-game", { roomId }); sfx.click(); };

  const submitGuess = useCallback(() => {
    if (currentGuess.length !== WORD_LENGTH || solved || pendingWord) return;
    if (guesses.length >= MAX_ATTEMPTS) return;
    if (!isValidWord(currentGuess)) {
      setShake(true); showToast("Not in word list"); sfx.fail();
      setTimeout(() => setShake(false), 500);
      return;
    }
    socketRef.current?.emit("wordle:guess", { roomId, word: currentGuess });
    setPendingWord(currentGuess);
    setGuesses((prev) => [...prev, { word: currentGuess, feedback: [] }]);
    setCurrentGuess("");
  }, [currentGuess, guesses, roomId, solved, pendingWord, showToast]);

  const handleKey = useCallback(
    (key: string) => {
      if (phase !== "playing" || solved || pendingWord) return;
      if (key === "enter") { submitGuess(); }
      else if (key === "\u232B" || key === "backspace") { setCurrentGuess((prev) => prev.slice(0, -1)); sfx.click(); }
      else if (/^[a-z]$/i.test(key) && currentGuess.length < WORD_LENGTH) { setCurrentGuess((prev) => prev + key.toLowerCase()); sfx.pop(); }
    },
    [phase, solved, pendingWord, currentGuess, submitGuess],
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

  const letterStates = getKeyboardState(guesses.filter((g) => g.feedback.length > 0));
  const requestHint = () => { socketRef.current?.emit("wordle:request-hint", { roomId }); sfx.click(); };
  const sendChat = () => {
    const trimmed = chatInput.trim();
    if (!trimmed || !socketRef.current) return;
    socketRef.current.emit("chat:message", { roomId, text: trimmed });
    setChatInput("");
  };
  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  if (!session) return null;

  return (
    <div className="min-h-screen flex flex-col relative stars-bg">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="blob w-64 h-64 top-[-5%] left-[-5%] opacity-15" style={{ background: "var(--glow-primary)" }} />
        <div className="blob w-48 h-48 bottom-[5%] right-[-3%] opacity-10" style={{ background: "var(--glow-warm)" }} />
      </div>

      {/* Header */}
      <header className="relative z-10 w-full flex items-center justify-between px-4 sm:px-6 py-3 border-b" style={{ borderColor: "var(--border-subtle)" }}>
        <Link href="/games/wordle" className="flex items-center gap-1.5 hover:opacity-80 transition-opacity" onClick={() => sfx.click()}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          <span className="text-sm font-bold" style={{ color: "var(--text-muted)" }}>Leave</span>
        </Link>
        <div className="text-center">
          <div className="flex items-center gap-2 justify-center">
            <div className="w-6 h-6 rounded-md flex items-center justify-center text-xs font-black"
              style={{ background: "rgba(78,205,196,0.15)", color: "var(--accent-primary)" }}>W</div>
            <span className="text-base font-extrabold" style={{ color: "var(--text-primary)" }}>Wordle</span>
          </div>
          {phase === "playing" && (
            <span className="text-[11px] font-bold tabular-nums"
              style={{ color: timeLeft <= 30 ? "var(--accent-error)" : "var(--text-muted)" }}>
              Round {round}/{totalRounds} · {formatTime(timeLeft)}
            </span>
          )}
        </div>
        <button onClick={() => { setChatOpen(!chatOpen); sfx.click(); }}
          className="btn-game text-xs px-3 py-1.5 rounded-xl font-bold cursor-pointer"
          style={{ background: chatOpen ? "var(--bg-elevated)" : "var(--bg-tertiary)", color: "var(--text-secondary)" }}>
          Chat
          {messages.length > 0 && (
            <span className="ml-1 text-[10px] font-black" style={{ color: "var(--accent-warm)" }}>{messages.length}</span>
          )}
        </button>
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

      <div className="relative z-10 flex-1 flex">
        <div className="flex-1 flex flex-col items-center justify-center gap-5 px-4 py-6">
          {/* Lobby */}
          {phase === "lobby" && (
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center gap-6">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl font-black animate-float"
                style={{ background: "rgba(78,205,196,0.12)", color: "var(--accent-primary)", boxShadow: "0 8px 32px rgba(78,205,196,0.1)" }}>
                W
              </div>
              <div className="text-center">
                <h2 className="text-xl font-extrabold mb-1" style={{ color: "var(--text-primary)" }}>Waiting for players</h2>
                <p className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                  {players.length} player{players.length !== 1 ? "s" : ""} in room
                </p>
              </div>
              <div className="flex flex-wrap gap-2 justify-center">
                {players.map((p, i) => (
                  <motion.div key={p.sessionId} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.1 }}
                    className="px-3 py-2 rounded-xl text-sm font-bold flex items-center gap-2"
                    style={{ background: "var(--bg-card)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}>
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black"
                      style={{ background: "var(--accent-primary)", color: "var(--bg-primary)" }}>
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
              {/* Waiting animation dots */}
              <div className="flex gap-1.5">
                {[0, 1, 2].map((i) => (
                  <motion.div key={i} className="w-2 h-2 rounded-full"
                    style={{ background: "var(--accent-primary)" }}
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.3 }} />
                ))}
              </div>
              {isHost ? (
                visibility === "private" ? (
                  <button onClick={startGame} disabled={players.length < 2}
                    className="btn-game px-8 py-3 rounded-2xl font-bold text-sm text-white cursor-pointer disabled:opacity-40"
                    style={{ background: "var(--accent-primary)", color: "var(--bg-primary)" }}>
                    {players.length < 2 ? "Waiting for players..." : "Start Game"}
                  </button>
                ) : (
                  <p className="text-sm font-bold tabular-nums" style={{ color: "var(--accent-primary)" }}>
                    {autoStartSeconds !== null ? `Starting in ${autoStartSeconds}s...` : "Waiting for players..."}
                  </p>
                )
              ) : (
                visibility === "private" ? (
                  <p className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Waiting for the host to start...</p>
                ) : (
                  <p className="text-sm font-bold tabular-nums" style={{ color: "var(--accent-primary)" }}>
                    {autoStartSeconds !== null ? `Starting in ${autoStartSeconds}s...` : "Waiting for players..."}
                  </p>
                )
              )}
              {visibility === "private" && roomCode && (
                <div className="flex items-center gap-2 px-4 py-2 rounded-xl"
                  style={{ background: "var(--bg-card)", border: "1px solid var(--border-default)" }}>
                  <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Room code</span>
                  <span className="font-mono font-bold text-sm tracking-widest" style={{ color: "var(--text-primary)" }}>{roomCode}</span>
                  <button onClick={() => { navigator.clipboard?.writeText(roomCode); sfx.click(); }}
                    className="text-[10px] px-2 py-0.5 rounded-lg cursor-pointer font-bold"
                    style={{ background: "rgba(78,205,196,0.15)", color: "var(--accent-primary)" }}>Copy</button>
                </div>
              )}
            </motion.div>
          )}

          {/* Countdown */}
          {phase === "countdown" && (
            <motion.div key={countdown} initial={{ scale: 0.3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.4, type: "spring", stiffness: 200 }}
              className="text-7xl font-black tabular-nums" style={{ color: "var(--accent-warm)", textShadow: "0 0 40px rgba(255,209,102,0.3)" }}>
              {countdown > 0 ? countdown : "Go!"}
            </motion.div>
          )}

          {/* Playing */}
          {phase === "playing" && (
            <>
              {Object.keys(opponents).length > 0 && (
                <div className="md:hidden w-full max-w-sm overflow-x-auto pb-1">
                  <div className="flex gap-2 min-w-max">
                    {Object.entries(opponents).map(([sid, opp]) => (
                      <div key={sid}
                        className="px-3 py-2 rounded-2xl"
                        style={{ background: "var(--bg-card)", border: "1px solid var(--border-default)" }}>
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-bold" style={{ color: "var(--text-primary)" }}>{opp.username || "Player"}</span>
                          <span className="font-bold" style={{ color: opp.solved ? "var(--accent-primary)" : "var(--text-muted)" }}>
                            {opp.solved ? "Solved" : `${opp.guessCount}/${MAX_ATTEMPTS}`}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <WordleBoard guesses={guesses} currentGuess={currentGuess} maxAttempts={MAX_ATTEMPTS} wordLength={WORD_LENGTH} shake={shake} />
              {solved && (
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-sm font-bold"
                  style={{ color: "var(--accent-primary)" }}>
                  Solved — waiting for others
                </motion.p>
              )}
              <Keyboard letterStates={letterStates} onKey={handleKey} disabled={solved || !!pendingWord} />
              <button onClick={requestHint} disabled={solved} onMouseEnter={() => sfx.hover()}
                className="btn-game text-xs px-4 py-2 rounded-xl font-bold cursor-pointer disabled:opacity-30"
                style={{ background: "var(--bg-card)", color: "var(--text-muted)", border: "1px solid var(--border-default)" }}>
                Get hint
              </button>
            </>
          )}

          {/* Round End */}
          {phase === "round-end" && roundResult && (
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center gap-5">
              <h2 className="text-xl font-extrabold" style={{ color: "var(--text-primary)" }}>Round Over</h2>
              <p className="text-sm font-bold" style={{ color: "var(--accent-primary)" }}>
                The word was <span className="uppercase tracking-wider">{roundResult.word}</span>
              </p>
              {/* Personal rank message */}
              {(() => {
                const myRank = roundResult.rankings.findIndex((r) => r.sessionId === session?.sessionId);
                if (myRank === 0) return (
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 300, delay: 0.2 }}
                    className="text-3xl font-black" style={{ color: "var(--accent-warm)" }}>
                    🏆 You won this round!
                  </motion.div>
                );
                if (myRank >= 0) return (
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 300, delay: 0.2 }}
                    className="text-lg font-bold" style={{ color: "var(--text-secondary)" }}>
                    You came {ordinal(myRank + 1)}!
                  </motion.div>
                );
                return null;
              })()}
              <div className="flex flex-col gap-2 w-full max-w-xs">
                {roundResult.rankings.map((r, i) => (
                  <motion.div key={r.sessionId} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1 }}
                    className="flex items-center justify-between px-3 py-2.5 rounded-xl"
                    style={{ background: "var(--bg-card)", border: i === 0 ? "1px solid var(--accent-warm)" : "1px solid transparent" }}>
                    <span className="flex items-center gap-2">
                      <span className="text-xs font-black w-6 text-center"
                        style={{ color: i === 0 ? "var(--accent-warm)" : "var(--text-muted)" }}>{ordinal(i + 1)}</span>
                      <span className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>{r.username}</span>
                    </span>
                    <span className="text-sm font-black tabular-nums" style={{ color: "var(--accent-warm)" }}>{r.score}</span>
                  </motion.div>
                ))}
              </div>
              {roundResult.nextRoundIn > 0 && (
                <div className="flex items-center gap-2">
                  <div className="loading-spinner" style={{ width: 14, height: 14, borderTopColor: "var(--accent-primary)" }} />
                  <p className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Next round starting...</p>
                </div>
              )}
            </motion.div>
          )}

          {/* Game End */}
          {phase === "game-end" && (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center gap-6">
              {/* Confetti burst */}
              <div className="fixed inset-0 pointer-events-none overflow-hidden z-40">
                {Array.from({ length: 30 }).map((_, i) => (
                  <motion.div key={i}
                    initial={{ y: -20, x: Math.random() * (typeof window !== "undefined" ? window.innerWidth : 400), opacity: 1, rotate: 0 }}
                    animate={{ y: (typeof window !== "undefined" ? window.innerHeight : 800) + 50, opacity: 0, rotate: Math.random() * 720 - 360 }}
                    transition={{ duration: 2 + Math.random() * 2, delay: Math.random() * 0.5, ease: "easeIn" }}
                    className="absolute w-3 h-3 rounded-sm"
                    style={{ background: ["#ffd166", "#4ecdc4", "#ff6b6b", "#a78bfa", "#22c55e"][i % 5] }}
                  />
                ))}
              </div>
              {/* Personal rank celebration */}
              {(() => {
                const myRank = finalRankings.findIndex((r) => r.sessionId === session?.sessionId);
                if (myRank === 0) return (
                  <motion.div initial={{ scale: 0, rotate: -10 }} animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: "spring", stiffness: 200, delay: 0.3 }}
                    className="text-center">
                    <div className="text-5xl mb-2">🏆</div>
                    <h2 className="text-3xl font-black" style={{ color: "var(--accent-warm)" }}>You Won!</h2>
                    <p className="text-sm font-bold mt-1" style={{ color: "var(--text-secondary)" }}>Woohoo! Champion!</p>
                  </motion.div>
                );
                if (myRank === 1) return (
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", delay: 0.3 }}
                    className="text-center">
                    <div className="text-4xl mb-2">🥈</div>
                    <h2 className="text-2xl font-black" style={{ color: "var(--text-secondary)" }}>2nd Place!</h2>
                    <p className="text-sm font-bold mt-1" style={{ color: "var(--text-muted)" }}>So close!</p>
                  </motion.div>
                );
                if (myRank === 2) return (
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", delay: 0.3 }}
                    className="text-center">
                    <div className="text-4xl mb-2">🥉</div>
                    <h2 className="text-2xl font-black" style={{ color: "#cd7f32" }}>3rd Place!</h2>
                    <p className="text-sm font-bold mt-1" style={{ color: "var(--text-muted)" }}>Nice effort!</p>
                  </motion.div>
                );
                return (
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", delay: 0.3 }}
                    className="text-center">
                    <h2 className="text-2xl font-black" style={{ color: "var(--text-primary)" }}>You came {ordinal(myRank + 1)}</h2>
                    <p className="text-sm font-bold mt-1" style={{ color: "var(--text-muted)" }}>Better luck next time!</p>
                  </motion.div>
                );
              })()}
              <div className="text-center">
                <p className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>{totalRounds} rounds completed</p>
              </div>
              <div className="flex flex-col gap-2 w-full max-w-xs">
                {finalRankings.map((r, i) => (
                  <motion.div key={r.sessionId} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 + i * 0.15 }}
                    className="flex items-center justify-between px-4 py-3 rounded-2xl"
                    style={{
                      background: i === 0 ? "var(--bg-elevated)" : "var(--bg-card)",
                      border: i === 0 ? "2px solid var(--accent-warm)" : "1px solid var(--border-default)",
                      boxShadow: i === 0 ? "0 4px 24px rgba(255,209,102,0.15)" : "none",
                    }}>
                    <span className="flex items-center gap-3">
                      <span className="text-sm font-black w-8 text-center"
                        style={{ color: i === 0 ? "var(--accent-warm)" : i === 1 ? "var(--text-secondary)" : "var(--text-muted)" }}>
                        {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : ordinal(i + 1)}
                      </span>
                      <span className="font-bold" style={{ color: "var(--text-primary)" }}>{r.username}</span>
                    </span>
                    <span className="font-black text-lg tabular-nums" style={{ color: "var(--accent-warm)" }}>{r.totalScore}</span>
                  </motion.div>
                ))}
              </div>
              <Link href="/games/wordle"
                className="btn-game px-6 py-3 rounded-2xl font-bold text-sm"
                style={{ background: "var(--accent-primary)", color: "var(--bg-primary)" }}>
                Play Again
              </Link>
            </motion.div>
          )}
        </div>

        {/* Opponents sidebar */}
        {(phase === "playing" || phase === "round-end") && Object.keys(opponents).length > 0 && (
          <aside className="hidden md:flex flex-col gap-3 p-4 w-52 border-l" style={{ borderColor: "var(--border-subtle)" }}>
            <h3 className="text-[10px] font-black uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Opponents</h3>
            {Object.entries(opponents).map(([sid, opp]) => (
              <div key={sid} className="flex flex-col gap-1.5 p-2 rounded-xl" style={{ background: "var(--bg-card)" }}>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold" style={{ color: "var(--text-primary)" }}>{opp.username || "Player"}</span>
                  <span className="font-bold" style={{ color: opp.solved ? "var(--accent-primary)" : "var(--text-muted)" }}>
                    {opp.solved ? "Solved" : `${opp.guessCount}/${MAX_ATTEMPTS}`}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5">
                  {opp.feedbacks.map((fb, i) => (
                    <div key={i} className="flex gap-0.5">
                      {fb.map((f, j) => (
                        <div key={j} className="w-3 h-3 rounded-sm"
                          style={{ background: f === "correct" ? "var(--wordle-correct)" : f === "present" ? "var(--wordle-present)" : "var(--wordle-absent)" }} />
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </aside>
        )}

        {/* Chat panel — sidebar on desktop, bottom sheet on mobile */}
        {chatOpen && (
          <aside className="hidden md:flex flex-col w-64 border-l" style={{ borderColor: "var(--border-subtle)", background: "var(--bg-secondary)" }}>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {messages.length === 0 && (
                <p className="text-xs text-center pt-8 font-medium" style={{ color: "var(--text-muted)" }}>No messages yet</p>
              )}
              {messages.map((msg, i) => (
                <div key={i} className="text-xs">
                  <span className="font-bold" style={{ color: "var(--accent-warm)" }}>{msg.username}: </span>
                  <span style={{ color: "var(--text-secondary)" }}>{msg.text}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-1.5 p-2.5 border-t" style={{ borderColor: "var(--border-default)" }}>
              <input value={chatInput} onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendChat()}
                maxLength={200} placeholder="Type..."
                className="flex-1 px-3 py-2 rounded-xl text-xs font-medium outline-none"
                style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)" }} />
              <button onClick={sendChat}
                className="btn-game px-3 py-2 rounded-xl text-xs font-bold cursor-pointer"
                style={{ background: "var(--accent-primary)", color: "var(--bg-primary)" }}>
                Send
              </button>
            </div>
          </aside>
        )}
      </div>

      {/* Mobile chat bottom sheet */}
      <AnimatePresence>
        {chatOpen && (
          <>
            <motion.div className="md:hidden fixed inset-0 z-40" style={{ background: "rgba(0,0,0,0.5)" }}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setChatOpen(false)} />
            <motion.div
              className="md:hidden fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-3xl"
              style={{ background: "var(--bg-secondary)", maxHeight: "65dvh", border: "1px solid var(--border-subtle)" }}
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 300 }}
            >
              <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b shrink-0" style={{ borderColor: "var(--border-subtle)" }}>
                <p className="text-sm font-extrabold" style={{ color: "var(--text-primary)" }}>Chat</p>
                <button onClick={() => setChatOpen(false)}
                  className="w-7 h-7 rounded-full flex items-center justify-center cursor-pointer"
                  style={{ background: "var(--bg-tertiary)", color: "var(--text-muted)" }}>✕</button>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {messages.length === 0 && (
                  <p className="text-xs text-center pt-4 font-medium" style={{ color: "var(--text-muted)" }}>No messages yet</p>
                )}
                {messages.map((msg, i) => (
                  <div key={i} className="text-sm">
                    <span className="font-bold" style={{ color: "var(--accent-warm)" }}>{msg.username}: </span>
                    <span style={{ color: "var(--text-secondary)" }}>{msg.text}</span>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 p-3 border-t shrink-0" style={{ borderColor: "var(--border-default)" }}>
                <input value={chatInput} onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendChat()}
                  maxLength={200} placeholder="Say something..."
                  className="flex-1 h-11 px-4 rounded-xl text-sm font-medium outline-none"
                  style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)" }} autoFocus />
                <button onClick={sendChat}
                  className="btn-game h-11 px-4 rounded-xl text-sm font-bold cursor-pointer"
                  style={{ background: "var(--accent-primary)", color: "var(--bg-primary)" }}>Send</button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <footer className="relative z-10 py-3 text-center text-xs" style={{ color: "var(--text-muted)" }}>
        Powered by <a href="https://spyll.in" target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}><span style={{ fontFamily: "'Liquids', sans-serif", color: "rgb(255, 89, 115)", fontSize: "1rem" }}>Spyll</span></a>
      </footer>
    </div>
  );
}
