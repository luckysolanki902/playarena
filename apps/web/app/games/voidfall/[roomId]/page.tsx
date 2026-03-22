"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useSessionStore } from "@/lib/store";
import { connectSocket, disconnectSocket } from "@/lib/socket";
import { sfx } from "@/lib/sounds";
import DirectionPad from "@/components/game/DirectionPad";
import type { VoidfallPosition, SafeZone } from "@playarena/shared";

type Phase = "lobby" | "countdown" | "playing" | "round-end" | "game-end";
type MoveDirection = "up" | "down" | "left" | "right";

interface Player { sessionId: string; username: string; isHost: boolean; }
interface GamePlayer {
  sessionId: string;
  username: string;
  color: string;
  position: VoidfallPosition;
  alive: boolean;
}
interface RoundRanking { sessionId: string; username: string; position: number; score: number; }
interface FinalRanking { sessionId: string; username: string; totalScore: number; wins: number; }

const GAME_COLOR = "#818cf8";
const PLAYER_RADIUS = 12;

export default function VoidfallRoomPage() {
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

  const [arenaWidth, setArenaWidth] = useState(600);
  const [arenaHeight, setArenaHeight] = useState(400);
  const [gamePlayers, setGamePlayers] = useState<Record<string, GamePlayer>>({});
  const [safeZone, setSafeZone] = useState<SafeZone | null>(null);
  
  const [roundRankings, setRoundRankings] = useState<RoundRanking[]>([]);
  const [finalRankings, setFinalRankings] = useState<FinalRanking[]>([]);
  const [nextRoundIn, setNextRoundIn] = useState(0);

  const [toast, setToast] = useState("");
  const [touchDirection, setTouchDirection] = useState<MoveDirection | null>(null);

  const socketRef = useRef<ReturnType<typeof connectSocket> | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const keysPressed = useRef<Set<string>>(new Set());
  const animFrameRef = useRef<number>(0);

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

    canvas.width = arenaWidth;
    canvas.height = arenaHeight;

    // Clear with dark background
    ctx.fillStyle = "#0a0a12";
    ctx.fillRect(0, 0, arenaWidth, arenaHeight);

    // Draw danger zone (outside safe zone) with red gradient
    if (safeZone) {
      // Draw danger zone
      ctx.fillStyle = "rgba(220, 38, 38, 0.2)";
      ctx.fillRect(0, 0, arenaWidth, arenaHeight);
      
      // Cut out safe zone
      ctx.save();
      ctx.beginPath();
      ctx.arc(safeZone.centerX, safeZone.centerY, safeZone.radius, 0, Math.PI * 2);
      ctx.clip();
      
      // Safe zone interior
      const gradient = ctx.createRadialGradient(
        safeZone.centerX, safeZone.centerY, 0,
        safeZone.centerX, safeZone.centerY, safeZone.radius
      );
      gradient.addColorStop(0, "rgba(34, 197, 94, 0.1)");
      gradient.addColorStop(0.8, "rgba(34, 197, 94, 0.05)");
      gradient.addColorStop(1, "rgba(34, 197, 94, 0.15)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, arenaWidth, arenaHeight);
      ctx.restore();

      // Safe zone border
      ctx.beginPath();
      ctx.arc(safeZone.centerX, safeZone.centerY, safeZone.radius, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(34, 197, 94, 0.6)";
      ctx.lineWidth = 3;
      ctx.stroke();

      // Pulsing glow effect
      ctx.shadowColor = "#22c55e";
      ctx.shadowBlur = 20;
      ctx.beginPath();
      ctx.arc(safeZone.centerX, safeZone.centerY, safeZone.radius, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(34, 197, 94, 0.3)";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Draw players
    for (const player of Object.values(gamePlayers)) {
      ctx.beginPath();
      ctx.arc(player.position.x, player.position.y, PLAYER_RADIUS, 0, Math.PI * 2);
      
      if (player.alive) {
        // Glow effect
        ctx.shadowColor = player.color;
        ctx.shadowBlur = 15;
        ctx.fillStyle = player.color;
        ctx.fill();
        ctx.shadowBlur = 0;
        
        // Border
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // Username
        ctx.font = "bold 10px system-ui";
        ctx.fillStyle = "#fff";
        ctx.textAlign = "center";
        ctx.fillText(player.username, player.position.x, player.position.y - PLAYER_RADIUS - 6);
      } else {
        // Dead player - faded
        ctx.fillStyle = `${player.color}44`;
        ctx.fill();
        ctx.strokeStyle = "#ffffff44";
        ctx.lineWidth = 1;
        ctx.stroke();
        
        // X mark
        ctx.strokeStyle = "#ff0000";
        ctx.lineWidth = 2;
        const s = 6;
        ctx.beginPath();
        ctx.moveTo(player.position.x - s, player.position.y - s);
        ctx.lineTo(player.position.x + s, player.position.y + s);
        ctx.moveTo(player.position.x + s, player.position.y - s);
        ctx.lineTo(player.position.x - s, player.position.y + s);
        ctx.stroke();
      }
    }

    // Arena border
    ctx.strokeStyle = "rgba(255,255,255,0.3)";
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, arenaWidth, arenaHeight);
  }, [arenaWidth, arenaHeight, gamePlayers, safeZone]);

  useEffect(() => {
    if (phase === "playing") {
      const animate = () => {
        draw();
        animFrameRef.current = requestAnimationFrame(animate);
      };
      animFrameRef.current = requestAnimationFrame(animate);
      return () => {
        if (animFrameRef.current) {
          cancelAnimationFrame(animFrameRef.current);
        }
      };
    }
  }, [phase, draw]);

  const startTouchMove = useCallback((direction: MoveDirection) => {
    const directionMap: Record<MoveDirection, { x: number; y: number }> = {
      up: { x: 0, y: -1 },
      down: { x: 0, y: 1 },
      left: { x: -1, y: 0 },
      right: { x: 1, y: 0 },
    };
    setTouchDirection(direction);
    socketRef.current?.emit("voidfall:move", { roomId, direction: directionMap[direction] });
  }, [roomId]);

  const stopTouchMove = useCallback((direction?: MoveDirection) => {
    setTouchDirection((current) => {
      if (direction && current !== direction) return current;
      socketRef.current?.emit("voidfall:stop", { roomId });
      return null;
    });
  }, [roomId]);

  // Keyboard controls
  useEffect(() => {
    const updateDirection = () => {
      let dx = 0;
      let dy = 0;
      
      if (keysPressed.current.has("arrowup") || keysPressed.current.has("w")) dy -= 1;
      if (keysPressed.current.has("arrowdown") || keysPressed.current.has("s")) dy += 1;
      if (keysPressed.current.has("arrowleft") || keysPressed.current.has("a")) dx -= 1;
      if (keysPressed.current.has("arrowright") || keysPressed.current.has("d")) dx += 1;

      if (dx !== 0 || dy !== 0) {
        socketRef.current?.emit("voidfall:move", { roomId, direction: { x: dx, y: dy } });
      } else {
        socketRef.current?.emit("voidfall:stop", { roomId });
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (phase !== "playing") return;
      
      const key = e.key.toLowerCase();
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d"].includes(key)) {
        e.preventDefault();
        if (!keysPressed.current.has(key)) {
          keysPressed.current.add(key);
          setTouchDirection(null);
          updateDirection();
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (keysPressed.current.has(key)) {
        keysPressed.current.delete(key);
        if (phase === "playing") {
          updateDirection();
        }
      }
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

    socket.on("voidfall:round-start", ({ round: r, totalRounds: tr, arenaWidth: aw, arenaHeight: ah, players: p, safeZone: sz }) => {
      setRound(r);
      setTotalRounds(tr);
      setArenaWidth(aw);
      setArenaHeight(ah);
      setSafeZone(sz);
      
      const gps: Record<string, GamePlayer> = {};
      for (const [sid, info] of Object.entries(p) as [string, { sessionId: string; username: string; color: string; position: VoidfallPosition }][]) {
        gps[sid] = { ...info, alive: true };
      }
      setGamePlayers(gps);
      setRoundRankings([]);
    });

    socket.on("voidfall:countdown", ({ seconds }) => {
      showToast(String(seconds), 900);
      sfx.tick();
    });

    socket.on("voidfall:go", () => {
      setPhase("playing");
      showToast("SURVIVE!", 800);
      sfx.go();
    });

    socket.on("voidfall:tick", ({ players: tickData, safeZone: sz }) => {
      setSafeZone(sz);
      setGamePlayers((prev) => {
        const updated = { ...prev };
        for (const [sid, data] of Object.entries(tickData) as [string, { position: VoidfallPosition; alive: boolean }][]) {
          if (updated[sid]) {
            updated[sid] = { ...updated[sid], position: data.position, alive: data.alive };
          }
        }
        return updated;
      });
    });

    socket.on("voidfall:zone-shrinking", () => {
      showToast("⚠️ Zone shrinking!", 2000);
    });

    socket.on("voidfall:player-eliminated", ({ username }) => {
      showToast(`${username} fell into the void!`, 1500);
      sfx.fail();
    });

    socket.on("voidfall:round-end", ({ rankings, nextRoundIn: next }) => {
      setPhase("round-end");
      setRoundRankings(rankings);
      setNextRoundIn(next);
      keysPressed.current.clear();
    });

    socket.on("voidfall:game-end", ({ finalRankings: fr }) => {
      setPhase("game-end");
      setFinalRankings(fr);
      sfx.win();
    });

    socket.on("voidfall:error", ({ message }) => {
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
        <Link href="/games/voidfall" className="flex items-center gap-1.5 hover:opacity-80 transition-opacity" onClick={() => sfx.click()}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          <span className="text-sm font-bold" style={{ color: "var(--text-muted)" }}>Leave</span>
        </Link>
        <div className="text-center">
          <div className="flex items-center gap-2 justify-center">
            <div className="w-6 h-6 rounded-md flex items-center justify-center text-xs font-black"
              style={{ background: `${GAME_COLOR}22`, color: GAME_COLOR }}>V</div>
            <span className="text-base font-extrabold" style={{ color: "var(--text-primary)" }}>Voidfall</span>
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
              V
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
            {visibility === "private" && roomCode && (
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl"
                style={{ background: "var(--bg-card)", border: "1px solid var(--border-default)" }}>
                <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Room code</span>
                <span className="font-mono font-bold text-sm tracking-widest" style={{ color: "var(--text-primary)" }}>{roomCode}</span>
                <button onClick={() => { navigator.clipboard?.writeText(roomCode); sfx.click(); }}
                  className="text-[10px] px-2 py-0.5 rounded-lg cursor-pointer font-bold"
                  style={{ background: `${GAME_COLOR}22`, color: GAME_COLOR }}>Copy</button>
              </div>
            )}
          </motion.div>
        )}

        {/* Countdown */}
        {phase === "countdown" && (
          <motion.div key={countdown} initial={{ scale: 0.3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.4, type: "spring", stiffness: 200 }}
            className="text-7xl font-black tabular-nums" style={{ color: GAME_COLOR, textShadow: `0 0 40px ${GAME_COLOR}55` }}>
            {countdown > 0 ? countdown : "SURVIVE!"}
          </motion.div>
        )}

        {/* Playing */}
        {phase === "playing" && (
          <div className="flex flex-col items-center gap-4 w-full">
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
            <div className="w-full max-w-[640px] rounded-xl overflow-hidden"
              style={{ boxShadow: `0 0 40px ${GAME_COLOR}22` }}>
              <canvas ref={canvasRef} className="block w-full h-auto" />
            </div>

            {/* Controls hint */}
            <p className="text-center text-xs" style={{ color: "var(--text-muted)" }}>
              Use ↑ ↓ ← → or WASD to move. On mobile, hold the pad below.
            </p>

            <DirectionPad
              className="lg:hidden"
              accentColor={GAME_COLOR}
              title="Move"
              hint="Hold a direction to keep moving"
              activeDirection={touchDirection}
              onDirectionStart={startTouchMove}
              onDirectionEnd={stopTouchMove}
            />
          </div>
        )}

        {/* Round End */}
        {phase === "round-end" && roundRankings.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center gap-5">
            <h2 className="text-xl font-extrabold" style={{ color: "var(--text-primary)" }}>Round {round} Results</h2>
            <div className="flex flex-col gap-2 w-full max-w-xs">
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
            <div className="flex flex-col gap-2 w-full max-w-sm">
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
            <Link href="/games/voidfall"
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
