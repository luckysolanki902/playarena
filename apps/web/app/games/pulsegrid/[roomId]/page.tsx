"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useSessionStore } from "@/lib/store";
import { connectSocket, disconnectSocket } from "@/lib/socket";
import { sfx } from "@/lib/sounds";
import type { PulseGridCell } from "@playarena/shared";

type Phase = "lobby" | "countdown" | "playing" | "round-end" | "game-end";

function ordinal(n: number): string {
  if (n === 1) return "1st";
  if (n === 2) return "2nd";
  if (n === 3) return "3rd";
  return `${n}th`;
}

interface Player { sessionId: string; username: string; isHost: boolean; }
interface GamePlayer { sessionId: string; username: string; color: string; }
interface RoundRanking { sessionId: string; username: string; cellCount: number; score: number; position: number; }
interface FinalRanking { sessionId: string; username: string; totalScore: number; totalCells: number; }

export default function PulseGridRoomPage() {
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
  const [timeLeft, setTimeLeft] = useState(60);

  const [grid, setGrid] = useState<PulseGridCell[][]>([]);
  const [gridSize, setGridSize] = useState(10);
  const [gamePlayers, setGamePlayers] = useState<Record<string, GamePlayer>>({});
  const [scores, setScores] = useState<Record<string, { cellCount: number; score: number }>>({});
  
  const [roundRankings, setRoundRankings] = useState<RoundRanking[]>([]);
  const [finalRankings, setFinalRankings] = useState<FinalRanking[]>([]);
  const [nextRoundIn, setNextRoundIn] = useState(0);

  const [cooldown, setCooldown] = useState(false);
  const [toast, setToast] = useState("");

  const socketRef = useRef<ReturnType<typeof connectSocket> | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

    socket.on("lobby:auto-start", ({ secondsLeft }) => setAutoStartSeconds(secondsLeft));
    socket.on("lobby:auto-start-cancelled", () => setAutoStartSeconds(null));

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

    socket.on("pulsegrid:round-start", ({ round: r, totalRounds: tr, gridSize: gs, grid: g, players: p, duration }) => {
      setPhase("playing");
      setRound(r);
      setTotalRounds(tr);
      setGridSize(gs);
      setGrid(g);
      setGamePlayers(p);
      setTimeLeft(duration);
      setRoundRankings([]);
      setScores({});

      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) { if (timerRef.current) clearInterval(timerRef.current); return 0; }
          return prev - 1;
        });
      }, 1000);
    });

    socket.on("pulsegrid:pulse-result", ({ sessionId: sid, x, y, radius, capturedCells, overcharge }) => {
      // Update grid with captured cells
      setGrid((prev) => {
        const newGrid = prev.map((row) => row.map((cell) => ({ ...cell })));
        for (const c of capturedCells) {
          if (newGrid[c.y] && newGrid[c.y][c.x]) {
            newGrid[c.y][c.x].owner = c.newOwner;
            newGrid[c.y][c.x].strength = c.newStrength;
            newGrid[c.y][c.x].pulseAnimation = Date.now();
          }
        }
        return newGrid;
      });

      if (sid === session?.sessionId && overcharge) {
        showToast("⚡ OVERCHARGE!", 1000);
      }
    });

    socket.on("pulsegrid:score-update", ({ scores: s }) => {
      setScores(s);
    });

    socket.on("pulsegrid:round-end", ({ rankings, nextRoundIn: next }) => {
      setPhase("round-end");
      setRoundRankings(rankings);
      setNextRoundIn(next);
      if (timerRef.current) clearInterval(timerRef.current);
    });

    socket.on("pulsegrid:game-end", ({ finalRankings: fr }) => {
      setPhase("game-end");
      setFinalRankings(fr);
      sfx.win();
    });

    socket.on("pulsegrid:error", ({ message }) => {
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
      if (timerRef.current) clearInterval(timerRef.current);
      disconnectSocket();
    };
  }, [roomId, session, showToast]);

  const isHost = players.find((p) => p.sessionId === session?.sessionId)?.isHost ?? false;
  const startGame = () => { socketRef.current?.emit("lobby:start-game", { roomId }); sfx.click(); };
  const myColor = session ? gamePlayers[session.sessionId]?.color : undefined;

  const handleCellClick = useCallback((x: number, y: number, overcharge: boolean = false) => {
    if (phase !== "playing" || cooldown) return;
    
    socketRef.current?.emit("pulsegrid:pulse", { roomId, x, y, overcharge });
    sfx.pop();
    
    // Local cooldown feedback
    setCooldown(true);
    setTimeout(() => setCooldown(false), 500);
  }, [phase, cooldown, roomId]);

  const getCellColor = (cell: PulseGridCell): string => {
    if (cell.owner === "empty") return "rgba(255,255,255,0.05)";
    if (cell.owner === "neutral") return "rgba(100,100,100,0.5)";
    const player = gamePlayers[cell.owner];
    if (player) {
      const alpha = 0.3 + cell.strength * 0.2;
      return `${player.color}${Math.round(alpha * 255).toString(16).padStart(2, "0")}`;
    }
    return "rgba(255,255,255,0.1)";
  };

  if (!session) return null;

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  return (
    <div className="min-h-screen flex flex-col relative stars-bg">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="blob w-64 h-64 top-[-5%] left-[-5%] opacity-15" style={{ background: "rgba(34,211,238,0.3)" }} />
        <div className="blob w-48 h-48 bottom-[5%] right-[-3%] opacity-10" style={{ background: "var(--glow-warm)" }} />
      </div>

      {/* Header */}
      <header className="relative z-10 w-full flex items-center justify-between px-4 sm:px-6 py-3 border-b" style={{ borderColor: "var(--border-subtle)" }}>
        <Link href="/games/pulsegrid" className="flex items-center gap-1.5 hover:opacity-80 transition-opacity" onClick={() => sfx.click()}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          <span className="text-sm font-bold" style={{ color: "var(--text-muted)" }}>Leave</span>
        </Link>
        <div className="text-center">
          <div className="flex items-center gap-2 justify-center">
            <div className="w-6 h-6 rounded-md flex items-center justify-center text-xs font-black"
              style={{ background: "rgba(34,211,238,0.15)", color: "#22d3ee" }}>P</div>
            <span className="text-base font-extrabold" style={{ color: "var(--text-primary)" }}>PulseGrid</span>
          </div>
          {phase === "playing" && (
            <span className="text-[11px] font-bold tabular-nums"
              style={{ color: timeLeft <= 10 ? "var(--accent-error)" : "var(--text-muted)" }}>
              Round {round}/{totalRounds} · {formatTime(timeLeft)}
            </span>
          )}
        </div>
        <div className="w-16" />
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
              style={{ background: "rgba(34,211,238,0.12)", color: "#22d3ee", boxShadow: "0 8px 32px rgba(34,211,238,0.1)" }}>
              P
            </div>
            <div className="text-center">
              <h2 className="text-xl font-extrabold mb-1" style={{ color: "var(--text-primary)" }}>Waiting for players</h2>
              <p className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                {players.length} player{players.length !== 1 ? "s" : ""} in arena
              </p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center">
              {players.map((p, i) => (
                <motion.div key={p.sessionId} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.1 }}
                  className="px-3 py-2 rounded-xl text-sm font-bold flex items-center gap-2"
                  style={{ background: "var(--bg-card)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}>
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black"
                    style={{ background: "#22d3ee", color: "var(--bg-primary)" }}>{p.username[0].toUpperCase()}</div>
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
                <motion.div key={i} className="w-2 h-2 rounded-full" style={{ background: "#22d3ee" }}
                  animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.3 }} />
              ))}
            </div>
            {isHost ? (
              visibility === "private" ? (
                <button onClick={startGame} disabled={players.length < 2}
                  className="btn-game px-8 py-3 rounded-2xl font-bold text-sm cursor-pointer disabled:opacity-40"
                  style={{ background: "#22d3ee", color: "var(--bg-primary)" }}>
                  {players.length < 2 ? "Waiting for players..." : "Start Game"}
                </button>
              ) : (
                <p className="text-sm font-bold tabular-nums" style={{ color: "#22d3ee" }}>
                  {autoStartSeconds !== null ? `Starting in ${autoStartSeconds}s...` : "Waiting for players..."}
                </p>
              )
            ) : (
              visibility === "private" ? (
                <p className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Waiting for the host to start...</p>
              ) : (
                <p className="text-sm font-bold tabular-nums" style={{ color: "#22d3ee" }}>
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
                  style={{ background: "rgba(34,211,238,0.15)", color: "#22d3ee" }}>Copy</button>
              </div>
            )}
          </motion.div>
        )}

        {/* Countdown */}
        {phase === "countdown" && (
          <motion.div key={countdown} initial={{ scale: 0.3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.4, type: "spring", stiffness: 200 }}
            className="text-7xl font-black tabular-nums" style={{ color: "#22d3ee", textShadow: "0 0 40px rgba(34,211,238,0.3)" }}>
            {countdown > 0 ? countdown : "Pulse!"}
          </motion.div>
        )}

        {/* Playing */}
        {phase === "playing" && (
          <div className="w-full max-w-2xl space-y-4">
            {/* Score bar */}
            <div className="flex justify-center gap-4 flex-wrap">
              {Object.entries(gamePlayers).map(([sid, p]) => (
                <div key={sid} className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
                  style={{ background: sid === session?.sessionId ? `${p.color}22` : "var(--bg-card)", border: `1px solid ${sid === session?.sessionId ? p.color : "var(--border-default)"}` }}>
                  <div className="w-4 h-4 rounded-full" style={{ background: p.color }} />
                  <span className="text-xs font-bold" style={{ color: "var(--text-primary)" }}>{p.username}</span>
                  <span className="text-xs font-bold tabular-nums" style={{ color: p.color }}>
                    {scores[sid]?.cellCount ?? 0}
                  </span>
                </div>
              ))}
            </div>

            {/* Grid */}
            <div className="flex justify-center">
              <div
                className="grid gap-1 p-3 rounded-2xl"
                style={{
                  gridTemplateColumns: `repeat(${gridSize}, 1fr)`,
                  background: "var(--bg-card)",
                  border: "1px solid var(--border-default)",
                }}
              >
                {grid.map((row, y) =>
                  row.map((cell, x) => (
                    <motion.button
                      key={`${x}-${y}`}
                      onClick={(e) => handleCellClick(x, y, e.shiftKey)}
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      className="w-6 h-6 sm:w-7 sm:h-7 rounded-md cursor-pointer transition-colors"
                      style={{
                        background: getCellColor(cell),
                        boxShadow: cell.pulseAnimation && Date.now() - cell.pulseAnimation < 300
                          ? `0 0 12px ${getCellColor(cell)}`
                          : undefined,
                      }}
                      title={`(${x}, ${y}) - ${cell.owner === "empty" ? "Empty" : cell.owner === "neutral" ? "Neutral" : gamePlayers[cell.owner]?.username ?? "Unknown"}`}
                    />
                  ))
                )}
              </div>
            </div>

            {/* Controls hint */}
            <p className="text-center text-xs" style={{ color: "var(--text-muted)" }}>
              Click to pulse • Hold <kbd className="px-1.5 py-0.5 rounded bg-white/10">Shift</kbd> + click for overcharge (2x radius, 2 per round)
            </p>
          </div>
        )}

        {/* Round End */}
        {phase === "round-end" && roundRankings.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center gap-5">
            <h2 className="text-xl font-extrabold" style={{ color: "var(--text-primary)" }}>Round {round} Results</h2>
            {/* Personal rank message */}
            {(() => {
              const myRank = roundRankings.findIndex((r) => r.sessionId === session?.sessionId);
              if (myRank === 0) return (
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 300, delay: 0.2 }}
                  className="text-2xl font-black" style={{ color: "#22d3ee" }}>
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
            <div className="flex flex-col gap-2 w-72">
              {roundRankings.map((r) => (
                <div key={r.sessionId}
                  className="flex items-center justify-between px-4 py-3 rounded-xl"
                  style={{
                    background: r.sessionId === session?.sessionId ? "rgba(34,211,238,0.15)" : "var(--bg-card)",
                    border: `1px solid ${r.sessionId === session?.sessionId ? "rgba(34,211,238,0.3)" : "var(--border-default)"}`,
                  }}>
                  <div className="flex items-center gap-3">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black ${
                      r.position === 1 ? "bg-yellow-400 text-black" :
                      r.position === 2 ? "bg-gray-400 text-black" :
                      r.position === 3 ? "bg-amber-600 text-white" :
                      "bg-gray-700 text-white"
                    }`}>{r.position}</span>
                    <span className="font-bold text-sm" style={{ color: "var(--text-primary)" }}>{r.username}</span>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-sm tabular-nums" style={{ color: "#22d3ee" }}>{r.cellCount} cells</p>
                    <p className="text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>{r.score} pts</p>
                  </div>
                </div>
              ))}
            </div>
            {nextRoundIn > 0 && (
              <p className="text-sm font-bold tabular-nums" style={{ color: "var(--text-muted)" }}>Next round in {nextRoundIn}s...</p>
            )}
          </motion.div>
        )}

        {/* Game End */}
        {phase === "game-end" && (
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center gap-6">
            {/* Confetti burst */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden z-40">
              {Array.from({ length: 30 }).map((_, i) => (
                <motion.div key={i}
                  initial={{ y: -20, x: Math.random() * (typeof window !== "undefined" ? window.innerWidth : 400), opacity: 1, rotate: 0 }}
                  animate={{ y: (typeof window !== "undefined" ? window.innerHeight : 800) + 50, opacity: 0, rotate: Math.random() * 720 - 360 }}
                  transition={{ duration: 2 + Math.random() * 2, delay: Math.random() * 0.5, ease: "easeIn" }}
                  className="absolute w-3 h-3 rounded-sm"
                  style={{ background: ["#22d3ee", "#ffd166", "#ff6b6b", "#a78bfa", "#22c55e"][i % 5] }}
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
                  <h2 className="text-3xl font-black" style={{ color: "#22d3ee" }}>You Won!</h2>
                  <p className="text-sm font-bold mt-1" style={{ color: "var(--text-secondary)" }}>Woohoo! Territory master!</p>
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
            <h2 className="text-lg font-extrabold" style={{ color: "var(--text-primary)" }}>Game Over!</h2>
            <div className="flex flex-col gap-2 w-80">
              {finalRankings.map((r, i) => (
                <motion.div key={r.sessionId}
                  initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }}
                  className="flex items-center justify-between px-4 py-3 rounded-xl"
                  style={{
                    background: r.sessionId === session?.sessionId ? "rgba(34,211,238,0.15)" : "var(--bg-card)",
                    border: `1px solid ${r.sessionId === session?.sessionId ? "rgba(34,211,238,0.3)" : "var(--border-default)"}`,
                  }}>
                  <div className="flex items-center gap-3">
                    <span className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-black ${
                      i === 0 ? "bg-yellow-400 text-black" :
                      i === 1 ? "bg-gray-400 text-black" :
                      i === 2 ? "bg-amber-600 text-white" :
                      "bg-gray-700 text-white"
                    }`}>{i + 1}</span>
                    <div>
                      <p className="font-bold text-sm" style={{ color: "var(--text-primary)" }}>{r.username}</p>
                      <p className="text-xs" style={{ color: "var(--text-muted)" }}>{r.totalCells} cells captured</p>
                    </div>
                  </div>
                  <p className="font-black text-lg tabular-nums" style={{ color: "#22d3ee" }}>{r.totalScore}</p>
                </motion.div>
              ))}
            </div>
            <Link href="/games/pulsegrid"
              className="btn-game px-8 py-3 rounded-2xl font-bold text-sm cursor-pointer"
              style={{ background: "#22d3ee", color: "var(--bg-primary)" }}
              onClick={() => sfx.click()}>
              Play Again
            </Link>
          </motion.div>
        )}
      </div>
    </div>
  );
}
