"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useSessionStore } from "@/lib/store";
import { connectSocket, disconnectSocket } from "@/lib/socket";
import { sfx } from "@/lib/sounds";
import ScribbleCanvas from "@/components/scribble/Canvas";
import type { DrawPoint, DrawStroke } from "@playarena/shared";

type Phase = "lobby" | "countdown" | "choosing" | "drawing" | "round-end" | "game-end";

interface Player { sessionId: string; username: string; isHost: boolean; }
interface ScribblePlayer { sessionId: string; username: string; score: number; roundScore: number; hasGuessed: boolean; isDrawing: boolean; }

function ordinal(n: number) {
  if (n === 1) return "1st"; if (n === 2) return "2nd"; if (n === 3) return "3rd"; return `${n}th`;
}

function avatarColor(name: string) {
  const hue = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return `hsl(${hue},65%,55%)`;
}

export default function ScribbleRoom() {
  const params = useParams<{ roomId: string }>();
  const router = useRouter();
  const roomId = params.roomId;
  const session = useSessionStore((s) => s.session);

  const [phase, setPhase] = useState<Phase>("lobby");
  const [players, setPlayers] = useState<Player[]>([]);
  const playersRef = useRef<Player[]>([]);
  const [visibility, setVisibility] = useState<"public" | "private">("private");
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [autoStartSeconds, setAutoStartSeconds] = useState<number | null>(null);
  const [gamePlayers, setGamePlayers] = useState<ScribblePlayer[]>([]);
  const [countdown, setCountdown] = useState(3);
  const [round, setRound] = useState(1);
  const [totalRounds, setTotalRounds] = useState(6);

  // Drawing state
  const [isDrawer, setIsDrawer] = useState(false);
  const [drawerUsername, setDrawerUsername] = useState("");
  const [wordChoices, setWordChoices] = useState<string[]>([]);
  const [myWord, setMyWord] = useState("");         // drawer knows the word
  const [hintPattern, setHintPattern] = useState(""); // guessers see _ _ _ _ _
  const [wordLength, setWordLength] = useState(0);
  const [timeLimit, setTimeLimit] = useState(80);
  const [timeLeft, setTimeLeft] = useState(80);
  const [canvasActive, setCanvasActive] = useState(false);
  const [strokes, setStrokes] = useState<DrawStroke[]>([]);
  const [remotePoints, setRemotePoints] = useState<DrawPoint[]>([]);

  // Round result
  const [roundWord, setRoundWord] = useState("");
  const [roundRankings, setRoundRankings] = useState<Array<{ sessionId: string; username: string; score: number; roundScore: number }>>([]);
  const [finalRankings, setFinalRankings] = useState<Array<{ sessionId: string; username: string; totalScore: number }>>([]);

  // Chat & guessing
  const [messages, setMessages] = useState<Array<{ username: string; text: string; type: "chat" | "close" | "correct" | "system"; timestamp: number }>>([]);
  const [guessInput, setGuessInput] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const socketRef = useRef<ReturnType<typeof connectSocket> | null>(null);
  const [myPoints, setMyPoints] = useState(0);
  const [hasGuessedCorrectly, setHasGuessedCorrectly] = useState(false);

  const showToast = useCallback((msg: string, ms = 2000) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), ms);
  }, []);

  useEffect(() => { if (!session) router.push("/"); }, [session, router]);

  useEffect(() => {
    if (!session) return;
    const socket = connectSocket();
    socketRef.current = socket;

    socket.emit("lobby:join-room", { roomId });

    socket.on("lobby:room-joined", ({ room }) => {
      setPlayers(room.players);
      playersRef.current = room.players;
      setVisibility(room.visibility);
      if (room.code) setRoomCode(room.code);
      sfx.join();
    });
    socket.on("lobby:player-joined", ({ player }) => {
      setPlayers((prev) => { const next = [...prev.filter((p) => p.sessionId !== player.sessionId), player]; playersRef.current = next; return next; });
      sfx.join();
    });
    socket.on("lobby:player-left", ({ sessionId: sid }) => setPlayers((prev) => { const next = prev.filter((p) => p.sessionId !== sid); playersRef.current = next; return next; }));
    socket.on("lobby:room-updated", ({ room }) => {
      setPlayers(room.players);
      playersRef.current = room.players;
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
          sfx.tick(); return prev - 1;
        });
      }, 1000);
    });

    socket.on("scribble:round-start", ({ round: r, totalRounds: tr, drawerId, drawerUsername: dName }) => {
      setPhase("choosing");
      setRound(r); setTotalRounds(tr);
      setIsDrawer(drawerId === session.sessionId);
      setDrawerUsername(dName);
      setMyWord(""); setHintPattern(""); setWordChoices([]); setStrokes([]); setRemotePoints([]);
      setCanvasActive(false); setHasGuessedCorrectly(false);
      if (timerRef.current) clearInterval(timerRef.current);
      // Initialize or reset scoreboard
      setGamePlayers((prev) => {
        if (prev.length === 0) {
          return playersRef.current.map((p) => ({
            sessionId: p.sessionId, username: p.username, score: 0, roundScore: 0,
            hasGuessed: false, isDrawing: p.sessionId === drawerId,
          }));
        }
        return prev.map((p) => ({ ...p, roundScore: 0, hasGuessed: false, isDrawing: p.sessionId === drawerId }));
      });
    });

    // Word choices only reach the drawer socket (server sends to room but client filters)
    socket.on("scribble:word-choices", ({ drawerId, words }: { drawerId: string; words: string[] }) => {
      if (drawerId === session.sessionId) setWordChoices(words);
    });

    socket.on("scribble:word-chosen", (data: { word?: string; wordLength?: number; hintPattern?: string; isDrawer: boolean }) => {
      if (data.isDrawer && data.word) setMyWord(data.word);
      else { setWordLength(data.wordLength ?? 0); setHintPattern(data.hintPattern ?? ""); }
    });

    socket.on("scribble:drawer-word", ({ drawerId, word }: { drawerId: string; word: string }) => {
      if (drawerId === session.sessionId) setMyWord(word);
    });

    socket.on("scribble:drawing-started", ({ timeLimit: tl, wordLength: wl, hintPattern: hp }) => {
      setPhase("drawing"); setTimeLimit(tl); setWordLength(wl); setHintPattern(hp);
      setTimeLeft(tl); setCanvasActive(true);
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) { if (timerRef.current) clearInterval(timerRef.current); return 0; }
          return prev - 1;
        });
      }, 1000);
      sfx.go();
    });

    socket.on("scribble:draw", ({ points }: { points: DrawPoint[] }) => {
      setRemotePoints(points);
    });

    socket.on("scribble:clear-canvas", () => {
      setStrokes([]); setRemotePoints([]);
    });

    socket.on("scribble:strokes-update", ({ strokes: newStrokes }: { strokes: DrawStroke[] }) => {
      setStrokes(newStrokes); setRemotePoints([]);
    });

    socket.on("scribble:hint", ({ pattern }: { pattern: string }) => {
      setHintPattern(pattern); sfx.pop();
    });

    socket.on("scribble:player-guessed", ({ sessionId: sid, username: uname, points: pts, guessedCount }: { sessionId: string; username: string; points: number; guessedCount: number }) => {
      setGamePlayers((prev) => prev.map((p) => {
        if (p.sessionId === sid) return { ...p, hasGuessed: true, score: p.score + pts, roundScore: (p.roundScore ?? 0) + pts };
        if (p.isDrawing) return { ...p, score: p.score + 15, roundScore: (p.roundScore ?? 0) + 15 };
        return p;
      }));
      setMessages((prev) => [...prev, { username: uname, text: `guessed the word! +${pts}`, type: "correct" as const, timestamp: Date.now() }]);
      sfx.correct();
      void guessedCount;
    });

    socket.on("scribble:correct-guess", ({ points: pts }: { points: number }) => {
      setHasGuessedCorrectly(true);
      setMyPoints(pts);
      showToast(`🎉 Correct! +${pts} points`, 2500);
      sfx.win();
    });

    socket.on("scribble:close-guess", ({ text }: { text: string }) => {
      showToast(`🤏 So close! "${text}" is almost it...`, 2000);
      sfx.pop();
    });

    socket.on("scribble:chat", (msg: { username: string; text: string; type: "chat" | "close" | "correct"; timestamp: number }) => {
      setMessages((prev) => [...prev.slice(-79), { ...msg }]);
    });

    socket.on("scribble:round-end", ({ word, rankings, nextRoundIn }: { word: string; rankings: Array<{ sessionId: string; username: string; score: number; roundScore: number }>; nextRoundIn: number }) => {
      setPhase("round-end"); setRoundWord(word); setRoundRankings(rankings);
      // Sync live scoreboard from authoritative server rankings
      setGamePlayers(rankings.map((r) => ({ ...r, hasGuessed: true, isDrawing: false })));
      setCanvasActive(false);
      if (timerRef.current) clearInterval(timerRef.current);
      void nextRoundIn;
    });

    socket.on("scribble:game-end", ({ finalRankings: fr }: { finalRankings: Array<{ sessionId: string; username: string; totalScore: number }> }) => {
      setPhase("game-end"); setFinalRankings(fr); sfx.win();
    });

    // Reconnection — restore game state after tab switch / disconnect
    socket.on("scribble:rejoin-state", (state: {
      phase: string; round: number; totalRounds: number;
      drawerId: string; drawerUsername: string; isDrawer: boolean;
      word: string; hintPattern: string; wordLength: number;
      timeLimit: number; elapsed: number; strokes: DrawStroke[];
      players: Array<{ sessionId: string; username: string; score: number; roundScore: number; hasGuessed: boolean; isDrawing: boolean }>;
    }) => {
      setRound(state.round); setTotalRounds(state.totalRounds);
      setIsDrawer(state.isDrawer); setDrawerUsername(state.drawerUsername);
      setHintPattern(state.hintPattern); setWordLength(state.wordLength);
      setGamePlayers(state.players);
      if (state.isDrawer && state.word) setMyWord(state.word);

      if (state.phase === "drawing") {
        setPhase("drawing");
        setTimeLimit(state.timeLimit);
        const remaining = Math.max(0, state.timeLimit - state.elapsed);
        setTimeLeft(remaining); setCanvasActive(true);
        // Replay strokes on canvas
        setStrokes(state.strokes);
        // Start client-side timer from remaining time
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = setInterval(() => {
          setTimeLeft((prev) => {
            if (prev <= 1) { if (timerRef.current) clearInterval(timerRef.current); return 0; }
            return prev - 1;
          });
        }, 1000);
        // Mark if we already guessed
        const me = state.players.find((p) => p.sessionId === session.sessionId);
        if (me?.hasGuessed) setHasGuessedCorrectly(true);
      } else if (state.phase === "choosing") {
        setPhase("choosing");
      }
    });

    socket.on("lobby:error", ({ message }: { message: string }) => { showToast(message, 3000); sfx.fail(); });

    return () => {
      socket.emit("lobby:leave-room", { roomId });
      socket.removeAllListeners();
      if (timerRef.current) clearInterval(timerRef.current);
      disconnectSocket();
    };
  }, [roomId, session, showToast]);

  // Auto-scroll chat
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const isHost = players.find((p) => p.sessionId === session?.sessionId)?.isHost ?? false;
  const startGame = () => { socketRef.current?.emit("lobby:start-game", { roomId }); sfx.click(); };

  const chooseWord = (word: string) => {
    socketRef.current?.emit("scribble:choose-word", { roomId, word });
    sfx.click();
  };

  const sendDraw = useCallback((points: DrawPoint[]) => {
    socketRef.current?.emit("scribble:draw", { roomId, points });
  }, [roomId]);

  const sendClear = useCallback(() => {
    socketRef.current?.emit("scribble:clear-canvas", { roomId });
  }, [roomId]);

  const sendUndo = useCallback(() => {
    socketRef.current?.emit("scribble:undo", { roomId });
  }, [roomId]);

  const sendRedo = useCallback(() => {
    socketRef.current?.emit("scribble:redo", { roomId });
  }, [roomId]);

  const sendGuess = () => {
    const text = guessInput.trim();
    if (!text || hasGuessedCorrectly || isDrawer) return;
    socketRef.current?.emit("scribble:guess", { roomId, text });
    setGuessInput("");
    sfx.send();
  };

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
  const timerPct = timeLeft / timeLimit;

  if (!session) return null;

  return (
    <div className="min-h-screen flex flex-col relative stars-bg" style={{ maxHeight: "100dvh", overflow: "hidden" }}>
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="blob w-64 h-64 top-[-5%] right-[-5%] opacity-10" style={{ background: "rgba(255,209,102,0.5)" }} />
        <div className="blob w-48 h-48 bottom-[5%] left-[-3%] opacity-10" style={{ background: "rgba(78,205,196,0.5)" }} />
      </div>

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-4 py-3 shrink-0 border-b" style={{ borderColor: "var(--border-subtle)" }}>
        <Link href="/games/scribble" className="flex items-center gap-1.5 hover:opacity-70 transition-opacity" onClick={() => sfx.click()}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          <span className="text-sm font-bold" style={{ color: "var(--text-muted)" }}>Leave</span>
        </Link>
        <div className="text-center">
          <div className="flex items-center gap-1.5 justify-center">
            <span className="text-base">🎨</span>
            <span className="text-base font-extrabold" style={{ color: "var(--text-primary)" }}>Scribble</span>
          </div>
          {phase === "drawing" && (
            <div className="flex items-center gap-2 justify-center mt-0.5">
              <span className="text-[11px] font-bold tabular-nums" style={{ color: timerLeft(timeLeft, timeLimit) }}>
                Round {round}/{totalRounds} · {formatTime(timeLeft)}
              </span>
              <div className="w-20 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-elevated)" }}>
                <motion.div className="h-full rounded-full" style={{ background: timerLeft(timeLeft, timeLimit), width: `${timerPct * 100}%` }} />
              </div>
            </div>
          )}
          {phase === "choosing" && (
            <p className="text-[11px] font-bold" style={{ color: "var(--accent-warm)" }}>
              {isDrawer ? "Choose your word!" : `${drawerUsername} is choosing...`}
            </p>
          )}
        </div>
        <div className="w-16" />
      </header>

      {/* Toast */}
      <div className="relative z-50 flex justify-center pointer-events-none">
        <AnimatePresence>
          {toast && (
            <motion.div initial={{ opacity: 0, y: -16, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -16 }}
              className="absolute top-2 px-5 py-2.5 rounded-2xl text-sm font-bold z-50"
              style={{ background: "var(--text-primary)", color: "var(--bg-primary)", boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }}>
              {toast}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Main */}
      <div className="relative z-10 flex flex-1 overflow-hidden">
        {/* === LOBBY === */}
        {(phase === "lobby" || phase === "countdown") && (
          <div className="flex-1 flex flex-col items-center justify-center gap-6 p-6">
            {phase === "countdown" ? (
              <motion.div key={countdown} initial={{ scale: 0.3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.4, type: "spring", stiffness: 200 }}
                className="text-7xl font-black" style={{ color: "var(--accent-warm)", textShadow: "0 0 40px rgba(255,209,102,0.4)" }}>
                {countdown > 0 ? countdown : "Draw!"}
              </motion.div>
            ) : (
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center gap-6">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl animate-float"
                  style={{ background: "rgba(255,209,102,0.12)", boxShadow: "0 8px 32px rgba(255,209,102,0.12)" }}>🎨</div>
                <div className="text-center">
                  <h2 className="text-xl font-extrabold mb-1" style={{ color: "var(--text-primary)" }}>Waiting for players</h2>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>{players.length} in room · need at least 2</p>
                </div>
                <div className="flex flex-wrap gap-2 justify-center">
                  {players.map((p, i) => (
                    <motion.div key={p.sessionId} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.08 }}
                      className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold"
                      style={{ background: "var(--bg-card)", border: "1px solid var(--border-default)" }}>
                      <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold"
                        style={{ background: avatarColor(p.username), color: "#fff" }}>
                        {p.username[0].toUpperCase()}
                      </div>
                      <span style={{ color: "var(--text-primary)" }}>{p.username}</span>
                      {p.isHost && visibility === "private" && <span className="text-[10px] px-1 rounded-full" style={{ background: "rgba(255,209,102,0.15)", color: "var(--accent-warm)" }}>Host</span>}
                    </motion.div>
                  ))}
                </div>
                <div className="flex gap-1.5">
                  {[0, 1, 2].map((i) => (
                    <motion.div key={i} className="w-2 h-2 rounded-full" style={{ background: "var(--accent-warm)" }}
                      animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.3 }} />
                  ))}
                </div>
                {isHost ? (
                  visibility === "private" ? (
                    <button onClick={startGame} disabled={players.length < 2}
                      className="btn-game px-8 py-3 rounded-2xl font-bold text-sm cursor-pointer disabled:opacity-40"
                      style={{ background: "var(--accent-warm)", color: "var(--bg-primary)" }}>
                      {players.length < 2 ? "Waiting for players..." : "Start Game 🎨"}
                    </button>
                  ) : (
                    <p className="text-sm font-bold tabular-nums" style={{ color: "var(--accent-warm)" }}>
                      {autoStartSeconds !== null ? `Starting in ${autoStartSeconds}s...` : "Waiting for players..."}
                    </p>
                  )
                ) : (
                  visibility === "private" ? (
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>Waiting for the host to start...</p>
                  ) : (
                    <p className="text-sm font-bold tabular-nums" style={{ color: "var(--accent-warm)" }}>
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
                      style={{ background: "rgba(255,209,102,0.15)", color: "var(--accent-warm)" }}>Copy</button>
                  </div>
                )}
              </motion.div>
            )}
          </div>
        )}

        {/* === CHOOSING === */}
        {phase === "choosing" && (
          <div className="flex-1 flex flex-col items-center justify-center gap-6 p-6">
            {isDrawer ? (
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center gap-5">
                <div className="text-center">
                  <p className="text-lg font-extrabold mb-1" style={{ color: "var(--text-primary)" }}>🖌️ Pick your word!</p>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>Others will try to guess what you draw</p>
                </div>
                <div className="flex flex-col sm:flex-row gap-3">
                  {wordChoices.map((word, i) => (
                    <motion.button key={word} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
                      onClick={() => chooseWord(word)} onMouseEnter={() => sfx.hover()}
                      className="game-card px-8 py-4 rounded-2xl font-extrabold text-base cursor-pointer capitalize"
                      style={{
                        background: i === 0 ? "rgba(78,205,196,0.1)" : i === 1 ? "rgba(255,209,102,0.1)" : "rgba(167,139,250,0.1)",
                        border: `1.5px solid ${i === 0 ? "var(--accent-primary)" : i === 1 ? "var(--accent-warm)" : "var(--accent-soft)"}`,
                        color: i === 0 ? "var(--accent-primary)" : i === 1 ? "var(--accent-warm)" : "var(--accent-soft)",
                      }}>
                      {word}
                    </motion.button>
                  ))}
                </div>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>Auto-picks in a few seconds if you don't choose</p>
              </motion.div>
            ) : (
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center gap-4 text-center">
                <div className="text-5xl animate-float">🖌️</div>
                <h3 className="text-lg font-extrabold" style={{ color: "var(--text-primary)" }}>{drawerUsername} is choosing a word...</h3>
                <div className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <motion.div key={i} className="w-2 h-2 rounded-full" style={{ background: "var(--accent-warm)" }}
                      animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.25 }} />
                  ))}
                </div>
              </motion.div>
            )}
          </div>
        )}

        {/* === DRAWING === */}
        {phase === "drawing" && (
          <>
            {/* Left: Canvas */}
            <div className="flex-1 flex flex-col p-3 overflow-hidden" style={{ minWidth: 0 }}>
              {/* Word display */}
              <div className="flex items-center justify-between mb-2 px-1 shrink-0">
                <div className="text-center flex-1">
                  {isDrawer ? (
                    <div>
                      <span className="text-xs font-bold" style={{ color: "var(--text-muted)" }}>Your word: </span>
                      <span className="text-base font-extrabold capitalize" style={{ color: "var(--accent-warm)" }}>{myWord}</span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-1">
                      {hintPattern.split(" ").map((ch, i) => (
                        <motion.span key={i} initial={ch !== "_" ? { scale: 1.4, color: "#4ecdc4" } : {}} animate={{ scale: 1 }}
                          className="text-lg font-black tracking-widest"
                          style={{ color: ch !== "_" && ch !== "/" ? "var(--accent-primary)" : "var(--text-muted)", minWidth: ch === "/" ? 12 : 16, textAlign: "center" }}>
                          {ch === "/" ? " " : ch}
                        </motion.span>
                      ))}
                      <span className="text-xs ml-2" style={{ color: "var(--text-muted)" }}>({wordLength} letters)</span>
                    </div>
                  )}
                </div>
                {hasGuessedCorrectly && !isDrawer && (
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="text-xs font-bold px-2 py-1 rounded-xl"
                    style={{ background: "rgba(78,205,196,0.15)", color: "var(--accent-primary)" }}>
                    ✓ +{myPoints}pts
                  </motion.div>
                )}
              </div>

              {/* Canvas */}
              <div className="flex-1 min-h-0">
                <ScribbleCanvas isDrawer={isDrawer} remotePoints={remotePoints} strokes={strokes}
                  onDraw={sendDraw} onClear={sendClear} onUndo={sendUndo} onRedo={sendRedo} active={canvasActive} />
              </div>

              {/* Guess input */}
              {!isDrawer && (
                <div className="flex gap-2 mt-2 shrink-0">
                  <input value={guessInput} onChange={(e) => setGuessInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && sendGuess()}
                    placeholder={hasGuessedCorrectly ? "You guessed it! 🎉" : "Type your guess..."}
                    disabled={hasGuessedCorrectly}
                    className="flex-1 h-10 px-4 rounded-xl text-sm font-semibold outline-none"
                    style={{ background: "var(--bg-tertiary)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
                    maxLength={50} />
                  <button onClick={sendGuess} disabled={hasGuessedCorrectly}
                    className="btn-game h-10 px-4 rounded-xl text-sm font-bold cursor-pointer disabled:opacity-40"
                    style={{ background: "var(--accent-primary)", color: "var(--bg-primary)" }}>
                    Guess
                  </button>
                </div>
              )}
            </div>

            {/* Right: Scoreboard + Chat */}
            <aside className="w-52 flex flex-col border-l shrink-0 overflow-hidden" style={{ borderColor: "var(--border-subtle)" }}>
              {/* Players */}
              <div className="p-3 border-b shrink-0" style={{ borderColor: "var(--border-subtle)" }}>
                <p className="text-[10px] font-black uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>Players</p>
                <div className="flex flex-col gap-1">
                  {(gamePlayers.length > 0 ? gamePlayers : players.map((p) => ({
                    sessionId: p.sessionId, username: p.username, score: 0, roundScore: 0, hasGuessed: false, isDrawing: false,
                  }))).map((p) => (
                    <div key={p.sessionId} className="flex items-center gap-1.5 py-1 px-1.5 rounded-lg"
                      style={{ background: p.isDrawing ? "rgba(255,209,102,0.08)" : p.hasGuessed ? "rgba(78,205,196,0.06)" : "transparent" }}>
                      <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0"
                        style={{ background: avatarColor(p.username), color: "#fff" }}>
                        {p.username[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                          <span className="text-[11px] font-bold truncate" style={{ color: "var(--text-primary)" }}>{p.username}</span>
                          {p.isDrawing && <span className="text-[9px]">🖌️</span>}
                          {p.hasGuessed && <span className="text-[9px]">✓</span>}
                        </div>
                        <span className="text-[10px] tabular-nums" style={{ color: "var(--accent-warm)" }}>{p.score}pts</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Chat */}
              <div className="flex-1 overflow-y-auto p-2 space-y-1" style={{ fontSize: 11 }}>
                {messages.length === 0 && (
                  <p className="text-center pt-4 text-xs" style={{ color: "var(--text-muted)" }}>Start guessing!</p>
                )}
                {messages.map((msg, i) => (
                  <motion.div key={i} initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }}
                    className="text-xs flex flex-wrap gap-x-1">
                    <span className="font-bold shrink-0" style={{ color: avatarColor(msg.username) }}>{msg.username}:</span>
                    <span style={{ color: msg.type === "correct" ? "var(--accent-primary)" : msg.type === "close" ? "var(--accent-warm)" : "var(--text-secondary)" }}>
                      {msg.text}
                    </span>
                  </motion.div>
                ))}
                <div ref={chatEndRef} />
              </div>
            </aside>
          </>
        )}

        {/* === ROUND END === */}
        {phase === "round-end" && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="flex-1 flex flex-col items-center justify-center gap-5 p-6">
            <div className="text-center">
              <h2 className="text-xl font-extrabold mb-1" style={{ color: "var(--text-primary)" }}>Round {round} over!</h2>
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                The word was <span className="font-extrabold capitalize" style={{ color: "var(--accent-warm)" }}>{roundWord}</span>
              </p>
            </div>
            {/* Personal rank message */}
            {(() => {
              const myRank = roundRankings.findIndex((r) => r.sessionId === session?.sessionId);
              if (myRank === 0 && roundRankings[0]?.roundScore > 0) return (
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 300, delay: 0.2 }}
                  className="text-2xl font-black" style={{ color: "var(--accent-warm)" }}>
                  🏆 You won this round!
                </motion.div>
              );
              if (myRank >= 0 && roundRankings[myRank]?.roundScore > 0) return (
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 300, delay: 0.2 }}
                  className="text-lg font-bold" style={{ color: "var(--text-secondary)" }}>
                  You came {ordinal(myRank + 1)}!
                </motion.div>
              );
              return null;
            })()}
            <div className="flex flex-col gap-2 w-72">
              {roundRankings.map((r, i) => (
                <motion.div key={r.sessionId} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08 }}
                  className="flex items-center justify-between px-4 py-2.5 rounded-xl"
                  style={{ background: "var(--bg-card)", border: i === 0 ? "1px solid var(--accent-warm)" : "1px solid var(--border-default)" }}>
                  <span className="flex items-center gap-2">
                    <span className="text-xs font-black w-6 text-center" style={{ color: i === 0 ? "var(--accent-warm)" : "var(--text-muted)" }}>
                      {ordinal(i + 1)}
                    </span>
                    <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold"
                      style={{ background: avatarColor(r.username), color: "#fff" }}>{r.username[0].toUpperCase()}</div>
                    <span className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>{r.username}</span>
                  </span>
                  <span className="flex items-center gap-2 text-xs font-bold">
                    {r.roundScore > 0 && <span style={{ color: "var(--accent-primary)" }}>+{r.roundScore}</span>}
                    <span className="tabular-nums" style={{ color: "var(--accent-warm)" }}>{r.score}pts</span>
                  </span>
                </motion.div>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <div className="loading-spinner" style={{ width: 14, height: 14, borderTopColor: "var(--accent-warm)" }} />
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>Next round starting...</p>
            </div>
          </motion.div>
        )}

        {/* === GAME END === */}
        {phase === "game-end" && (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex-1 flex flex-col items-center justify-center gap-6 p-6">
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
                  <p className="text-sm font-bold mt-1" style={{ color: "var(--text-secondary)" }}>Woohoo! Artist supreme!</p>
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
              if (myRank >= 0) return (
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", delay: 0.3 }}
                  className="text-center">
                  <h2 className="text-2xl font-black" style={{ color: "var(--text-primary)" }}>You came {ordinal(myRank + 1)}</h2>
                  <p className="text-sm font-bold mt-1" style={{ color: "var(--text-muted)" }}>Better luck next time!</p>
                </motion.div>
              );
              return null;
            })()}
            <div className="text-center">
              <h2 className="text-xl font-black mb-1" style={{ color: "var(--text-primary)" }}>Game Over!</h2>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>{totalRounds} rounds · {players.length} players</p>
            </div>
            <div className="flex flex-col gap-2 w-72">
              {finalRankings.map((r, i) => (
                <motion.div key={r.sessionId} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.12 }}
                  className="flex items-center justify-between px-4 py-3 rounded-2xl"
                  style={{
                    background: i === 0 ? "var(--bg-elevated)" : "var(--bg-card)",
                    border: i === 0 ? "2px solid var(--accent-warm)" : "1px solid var(--border-default)",
                    boxShadow: i === 0 ? "0 4px 24px rgba(255,209,102,0.18)" : "none",
                  }}>
                  <span className="flex items-center gap-3">
                    <span className="text-base font-black w-8 text-center">{["🥇", "🥈", "🥉"][i] ?? `${i + 1}.`}</span>
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                      style={{ background: avatarColor(r.username), color: "#fff" }}>{r.username[0].toUpperCase()}</div>
                    <span className="font-bold" style={{ color: "var(--text-primary)" }}>{r.username}</span>
                  </span>
                  <span className="font-black text-lg tabular-nums" style={{ color: "var(--accent-warm)" }}>{r.totalScore}</span>
                </motion.div>
              ))}
            </div>
            <div className="flex gap-3">
              <Link href="/games/scribble" className="btn-game px-6 py-3 rounded-2xl font-bold text-sm"
                style={{ background: "var(--accent-warm)", color: "var(--bg-primary)" }}>Play Again</Link>
              <Link href="/" className="px-6 py-3 rounded-2xl font-bold text-sm"
                style={{ background: "var(--bg-card)", border: "1px solid var(--border-default)", color: "var(--text-secondary)" }}>Home</Link>
            </div>
          </motion.div>
        )}
      </div>

      <footer className="relative z-10 py-2 text-center text-xs shrink-0" style={{ color: "var(--text-muted)" }}>
        Powered by <a href="https://spyll.in" target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}><span style={{ fontFamily: "'Liquids', sans-serif", color: "rgb(255, 89, 115)", fontSize: "1rem" }}>Spyll</span></a>
      </footer>
    </div>
  );
}

function timerLeft(timeLeft: number, timeLimit: number) {
  const pct = timeLeft / timeLimit;
  if (pct > 0.5) return "var(--accent-primary)";
  if (pct > 0.25) return "var(--accent-warm)";
  return "var(--accent-error)";
}
