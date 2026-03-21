"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useSessionStore } from "@/lib/store";
import { connectSocket, disconnectSocket } from "@/lib/socket";
import { sfx } from "@/lib/sounds";
import type { Position, Direction } from "@playarena/shared";

type Phase = "lobby" | "countdown" | "playing" | "round-end" | "game-end";

interface Player { sessionId: string; username: string; isHost: boolean; }
interface GamePlayer {
  sessionId: string;
  username: string;
  color: string;
  position: Position;
  direction: Direction;
  alive: boolean;
  trail: Position[];
}
interface RoundRanking { sessionId: string; username: string; position: number; score: number; }
interface FinalRanking { sessionId: string; username: string; totalScore: number; wins: number; }

const CELL_SIZE = 8;
const GAME_COLOR = "#f472b6";

export default function NeonDriftRoomPage() {
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

  const [gridWidth, setGridWidth] = useState(80);
  const [gridHeight, setGridHeight] = useState(50);
  const [gamePlayers, setGamePlayers] = useState<Record<string, GamePlayer>>({});
  
  const [roundRankings, setRoundRankings] = useState<RoundRanking[]>([]);
  const [finalRankings, setFinalRankings] = useState<FinalRanking[]>([]);
  const [nextRoundIn, setNextRoundIn] = useState(0);

  const [toast, setToast] = useState("");

  const socketRef = useRef<ReturnType<typeof connectSocket> | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const keysPressed = useRef<Set<string>>(new Set());

  const showToast = useCallback((msg: string, ms = 1500) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), ms);
  }, []);

  useEffect(() => {
    if (!session) router.push("/");
  }, [session, router]);

  // Draw game state on canvas
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = gridWidth * CELL_SIZE;
    const height = gridHeight * CELL_SIZE;
    canvas.width = width;
    canvas.height = height;

    // Clear
    ctx.fillStyle = "#0a0a0f";
    ctx.fillRect(0, 0, width, height);

    // Draw grid lines (subtle)
    ctx.strokeStyle = "rgba(255,255,255,0.03)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= gridWidth; x++) {
      ctx.beginPath();
      ctx.moveTo(x * CELL_SIZE, 0);
      ctx.lineTo(x * CELL_SIZE, height);
      ctx.stroke();
    }
    for (let y = 0; y <= gridHeight; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * CELL_SIZE);
      ctx.lineTo(width, y * CELL_SIZE);
      ctx.stroke();
    }

    // Draw trails and heads
    for (const player of Object.values(gamePlayers)) {
      // Trail
      ctx.fillStyle = player.alive ? player.color : `${player.color}44`;
      for (const pos of player.trail) {
        ctx.fillRect(pos.x * CELL_SIZE, pos.y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
      }

      // Head (brighter)
      if (player.alive) {
        ctx.fillStyle = "#fff";
        ctx.fillRect(
          player.position.x * CELL_SIZE + 1,
          player.position.y * CELL_SIZE + 1,
          CELL_SIZE - 2,
          CELL_SIZE - 2
        );
        
        // Glow effect
        ctx.shadowColor = player.color;
        ctx.shadowBlur = 10;
        ctx.fillStyle = player.color;
        ctx.fillRect(
          player.position.x * CELL_SIZE,
          player.position.y * CELL_SIZE,
          CELL_SIZE,
          CELL_SIZE
        );
        ctx.shadowBlur = 0;
      }
    }

    // Border
    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, width, height);
  }, [gridWidth, gridHeight, gamePlayers]);

  useEffect(() => {
    if (phase === "playing") {
      draw();
    }
  }, [phase, draw, gamePlayers]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (phase !== "playing") return;
      
      const key = e.key.toLowerCase();
      if (keysPressed.current.has(key)) return;
      keysPressed.current.add(key);

      let direction: Direction | null = null;
      
      if (key === "arrowup" || key === "w") direction = "up";
      else if (key === "arrowdown" || key === "s") direction = "down";
      else if (key === "arrowleft" || key === "a") direction = "left";
      else if (key === "arrowright" || key === "d") direction = "right";

      if (direction) {
        e.preventDefault();
        socketRef.current?.emit("neondrift:turn", { roomId, direction });
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysPressed.current.delete(e.key.toLowerCase());
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [phase, roomId]);

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

    socket.on("neondrift:round-start", ({ round: r, totalRounds: tr, gridWidth: gw, gridHeight: gh, players: p }) => {
      setRound(r);
      setTotalRounds(tr);
      setGridWidth(gw);
      setGridHeight(gh);
      
      // Initialize players with empty trails
      const gps: Record<string, GamePlayer> = {};
      for (const [sid, info] of Object.entries(p) as [string, { sessionId: string; username: string; color: string; position: Position; direction: Direction }][]) {
        gps[sid] = {
          ...info,
          alive: true,
          trail: [{ ...info.position }],
        };
      }
      setGamePlayers(gps);
      setRoundRankings([]);
    });

    socket.on("neondrift:countdown", ({ seconds }) => {
      showToast(String(seconds), 900);
      sfx.tick();
    });

    socket.on("neondrift:go", () => {
      setPhase("playing");
      showToast("GO!", 800);
      sfx.go();
    });

    socket.on("neondrift:tick", ({ players: tickData }) => {
      setGamePlayers((prev) => {
        const updated = { ...prev };
        for (const [sid, data] of Object.entries(tickData) as [string, { position: Position; direction: Direction; alive: boolean; trailTip: Position }][]) {
          if (updated[sid]) {
            updated[sid] = {
              ...updated[sid],
              position: data.position,
              direction: data.direction,
              alive: data.alive,
              trail: [...updated[sid].trail, data.trailTip],
            };
          }
        }
        return updated;
      });
    });

    socket.on("neondrift:player-crashed", ({ sessionId: sid, username }) => {
      showToast(`${username} crashed!`, 1200);
      sfx.fail();
    });

    socket.on("neondrift:round-end", ({ rankings, nextRoundIn: next }) => {
      setPhase("round-end");
      setRoundRankings(rankings);
      setNextRoundIn(next);
    });

    socket.on("neondrift:game-end", ({ finalRankings: fr }) => {
      setPhase("game-end");
      setFinalRankings(fr);
      sfx.win();
    });

    socket.on("neondrift:error", ({ message }) => {
      showToast(message, 2000);
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

  const isHost = players.find((p) => p.sessionId === session?.sessionId)?.isHost ?? false;
  const startGame = () => { socketRef.current?.emit("lobby:start-game", { roomId }); sfx.click(); };

  if (!session) return null;

  return (
    <div className="min-h-screen flex flex-col relative stars-bg">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="blob w-64 h-64 top-[-5%] left-[-5%] opacity-15" style={{ background: `${GAME_COLOR}33` }} />
      </div>

      {/* Header */}
      <header className="relative z-10 w-full flex items-center justify-between px-4 sm:px-6 py-3 border-b" style={{ borderColor: "var(--border-subtle)" }}>
        <Link href="/games/neondrift" className="flex items-center gap-1.5 hover:opacity-80 transition-opacity" onClick={() => sfx.click()}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          <span className="text-sm font-bold" style={{ color: "var(--text-muted)" }}>Leave</span>
        </Link>
        <div className="text-center">
          <div className="flex items-center gap-2 justify-center">
            <div className="w-6 h-6 rounded-md flex items-center justify-center text-xs font-black"
              style={{ background: `${GAME_COLOR}22`, color: GAME_COLOR }}>N</div>
            <span className="text-base font-extrabold" style={{ color: "var(--text-primary)" }}>Neon Drift</span>
          </div>
          {phase === "playing" && (
            <span className="text-[11px] font-bold" style={{ color: "var(--text-muted)" }}>
              Round {round}/{totalRounds}
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
              style={{ background: `${GAME_COLOR}15`, color: GAME_COLOR, boxShadow: `0 8px 32px ${GAME_COLOR}22` }}>
              N
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
                    style={{ background: GAME_COLOR, color: "var(--bg-primary)" }}>{p.username[0].toUpperCase()}</div>
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
                <motion.div key={i} className="w-2 h-2 rounded-full" style={{ background: GAME_COLOR }}
                  animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.3 }} />
              ))}
            </div>
            {isHost ? (
              visibility === "private" ? (
                <button onClick={startGame} disabled={players.length < 2}
                  className="btn-game px-8 py-3 rounded-2xl font-bold text-sm cursor-pointer disabled:opacity-40"
                  style={{ background: GAME_COLOR, color: "var(--bg-primary)" }}>
                  {players.length < 2 ? "Waiting for players..." : "Start Game"}
                </button>
              ) : (
                <p className="text-sm font-bold tabular-nums" style={{ color: GAME_COLOR }}>
                  {autoStartSeconds !== null ? `Starting in ${autoStartSeconds}s...` : "Waiting for players..."}
                </p>
              )
            ) : (
              visibility === "private" ? (
                <p className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Waiting for the host to start...</p>
              ) : (
                <p className="text-sm font-bold tabular-nums" style={{ color: GAME_COLOR }}>
                  {autoStartSeconds !== null ? `Starting in ${autoStartSeconds}s...` : "Waiting for players..."}
                </p>
              )
            )}
          </motion.div>
        )}

        {/* Countdown */}
        {phase === "countdown" && (
          <motion.div key={countdown} initial={{ scale: 0.3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.4, type: "spring", stiffness: 200 }}
            className="text-7xl font-black tabular-nums" style={{ color: GAME_COLOR, textShadow: `0 0 40px ${GAME_COLOR}55` }}>
            {countdown > 0 ? countdown : "DRIFT!"}
          </motion.div>
        )}

        {/* Playing */}
        {phase === "playing" && (
          <div className="flex flex-col items-center gap-4">
            {/* Player status */}
            <div className="flex justify-center gap-3 flex-wrap">
              {Object.values(gamePlayers).map((p) => (
                <div key={p.sessionId}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-opacity ${p.alive ? "" : "opacity-40"}`}
                  style={{ background: p.sessionId === session?.sessionId ? `${p.color}22` : "var(--bg-card)", border: `1px solid ${p.sessionId === session?.sessionId ? p.color : "var(--border-default)"}` }}>
                  <div className="w-4 h-4 rounded-full" style={{ background: p.color }} />
                  <span className="text-xs font-bold" style={{ color: "var(--text-primary)" }}>{p.username}</span>
                  {!p.alive && <span className="text-[10px]">💀</span>}
                </div>
              ))}
            </div>

            {/* Game canvas */}
            <div className="rounded-xl overflow-hidden" style={{ boxShadow: `0 0 40px ${GAME_COLOR}22` }}>
              <canvas ref={canvasRef} style={{ display: "block" }} />
            </div>

            {/* Controls hint */}
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Use ↑ ↓ ← → or WASD to steer
            </p>
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
                    background: r.sessionId === session?.sessionId ? `${GAME_COLOR}22` : "var(--bg-card)",
                    border: `1px solid ${r.sessionId === session?.sessionId ? `${GAME_COLOR}55` : "var(--border-default)"}`,
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
                  <p className="font-bold text-sm tabular-nums" style={{ color: GAME_COLOR }}>{r.score} pts</p>
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
            <h2 className="text-2xl font-extrabold" style={{ color: "var(--text-primary)" }}>🏆 Game Over!</h2>
            <div className="flex flex-col gap-2 w-80">
              {finalRankings.map((r, i) => (
                <motion.div key={r.sessionId}
                  initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }}
                  className="flex items-center justify-between px-4 py-3 rounded-xl"
                  style={{
                    background: r.sessionId === session?.sessionId ? `${GAME_COLOR}22` : "var(--bg-card)",
                    border: `1px solid ${r.sessionId === session?.sessionId ? `${GAME_COLOR}55` : "var(--border-default)"}`,
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
                      <p className="text-xs" style={{ color: "var(--text-muted)" }}>{r.wins} win{r.wins !== 1 ? "s" : ""}</p>
                    </div>
                  </div>
                  <p className="font-black text-lg tabular-nums" style={{ color: GAME_COLOR }}>{r.totalScore}</p>
                </motion.div>
              ))}
            </div>
            <Link href="/games/neondrift"
              className="btn-game px-8 py-3 rounded-2xl font-bold text-sm cursor-pointer"
              style={{ background: GAME_COLOR, color: "var(--bg-primary)" }}
              onClick={() => sfx.click()}>
              Play Again
            </Link>
          </motion.div>
        )}
      </div>
    </div>
  );
}
