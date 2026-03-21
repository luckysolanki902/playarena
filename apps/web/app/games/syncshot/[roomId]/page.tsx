"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { connectSocket, disconnectSocket } from "@/lib/socket";
import { useSessionStore } from "@/lib/store";
import { sfx } from "@/lib/sounds";
import {
  SyncShotPlayer,
  SyncShotTarget,
  SyncShotTickEvent,
  SyncShotRoundStartEvent,
  SyncShotTargetSpawnEvent,
  SyncShotTargetHitEvent,
  SyncShotRoundEndEvent,
  SyncShotSettings,
  DEFAULT_SYNCSHOT_SETTINGS,
} from "@playarena/shared";

const GAME_COLOR = "#f59e0b";

type Phase = "loading" | "lobby" | "countdown" | "playing" | "round-end" | "game-over";

interface RoomPlayer { sessionId: string; username: string; isHost?: boolean; }
interface RoomInfo {
  id: string;
  code?: string;
  hostSessionId: string;
  visibility: "public" | "private";
  players: RoomPlayer[];
}
interface HitEffect { id: string; cssX: number; cssY: number; points: number; color: string; }

function avatarColor(name: string) {
  const hue = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return `hsl(${hue},65%,55%)`;
}
function ordinal(n: number) {
  if (n === 1) return "1st"; if (n === 2) return "2nd"; if (n === 3) return "3rd"; return `${n}th`;
}

function drawCrosshair(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, alpha: number) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  const gap = 5, len = 14;
  ctx.beginPath(); ctx.moveTo(x - gap - len, y); ctx.lineTo(x - gap, y); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + gap, y); ctx.lineTo(x + gap + len, y); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x, y - gap - len); ctx.lineTo(x, y - gap); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x, y + gap); ctx.lineTo(x, y + gap + len); ctx.stroke();
  ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

export default function SyncShotRoom() {
  const params = useParams<{ roomId: string }>();
  const router = useRouter();
  const roomId = params.roomId;
  const session = useSessionStore((s) => s.session);

  const socketRef = useRef<ReturnType<typeof connectSocket> | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [countdown, setCountdown] = useState(3);
  const [roundNumber, setRoundNumber] = useState(0);
  const [totalRounds, setTotalRounds] = useState(3);
  const [players, setPlayers] = useState<Record<string, SyncShotPlayer>>({});
  const [settings, setSettings] = useState<SyncShotSettings>(DEFAULT_SYNCSHOT_SETTINGS);
  const [hitEffects, setHitEffects] = useState<HitEffect[]>([]);
  const [roundResults, setRoundResults] = useState<SyncShotRoundEndEvent | null>(null);
  const [targetsHit, setTargetsHit] = useState(0);
  const [autoStartSeconds, setAutoStartSeconds] = useState<number | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playersRef = useRef(players);
  const targetRef = useRef<SyncShotTarget | null>(null);
  const localCursorRef = useRef<{ x: number; y: number } | null>(null);
  const lastMoveRef = useRef(0);
  const phaseRef = useRef(phase);

  useEffect(() => { playersRef.current = players; }, [players]);
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  // ── Socket Setup ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!session) { router.push("/games/syncshot"); return; }

    const socket = connectSocket();
    socketRef.current = socket;
    socket.emit("lobby:join-room", { roomId });

    socket.on("lobby:room-joined", ({ room: r }: { room: RoomInfo }) => {
      setRoom(r); setPhase("lobby"); sfx.join();
    });
    socket.on("lobby:room-updated", ({ room: r }: { room: RoomInfo }) => setRoom(r));
    socket.on("lobby:player-joined", ({ player: p }: { player: RoomPlayer }) => {
      setRoom((prev) => prev ? { ...prev, players: [...prev.players.filter((x) => x.sessionId !== p.sessionId), p] } : prev);
      sfx.join();
    });
    socket.on("lobby:player-left", ({ sessionId: sid }: { sessionId: string }) => {
      setRoom((prev) => prev ? { ...prev, players: prev.players.filter((x) => x.sessionId !== sid) } : prev);
    });

    socket.on("lobby:auto-start", ({ secondsLeft }: { secondsLeft: number }) => setAutoStartSeconds(secondsLeft));
    socket.on("lobby:auto-start-cancelled", () => setAutoStartSeconds(null));
    socket.on("lobby:auto-start-timer", ({ timeLeft }: { timeLeft: number }) => setAutoStartSeconds(timeLeft));

    const startCountdown = (initial: number) => {
      setPhase("countdown"); setCountdown(initial); setAutoStartSeconds(null); sfx.tick();
      const iv = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) { clearInterval(iv); sfx.go(); return 0; }
          sfx.tick(); return prev - 1;
        });
      }, 1000);
    };
    socket.on("lobby:game-starting", ({ countdown: c }: { countdown: number }) => startCountdown(c));
    socket.on("game:starting", () => startCountdown(3));
    socket.on("game:countdown", ({ count }: { count: number }) => setCountdown(count));

    socket.on("syncshot:round-start", (data: SyncShotRoundStartEvent) => {
      setRoundNumber(data.roundNumber);
      setTotalRounds(data.settings.totalRounds);
      setPlayers(data.players);
      setSettings(data.settings);
      targetRef.current = null;
      localCursorRef.current = null;
      setTargetsHit(0);
      setHitEffects([]);
      setRoundResults(null);
      setPhase("playing");
    });

    socket.on("syncshot:tick", (data: SyncShotTickEvent) => {
      setPlayers(data.players);
      setTargetsHit(data.targetsHit);
    });

    socket.on("syncshot:target-spawn", (data: SyncShotTargetSpawnEvent) => {
      targetRef.current = data.target;
      sfx.pop();
    });

    socket.on("syncshot:target-hit", (data: SyncShotTargetHitEvent) => {
      const total = data.points + data.speedBonus + data.accuracyBonus;
      const canvas = canvasRef.current;
      const target = targetRef.current;
      let cssX = 0, cssY = 0;
      if (canvas && target) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = rect.width / canvas.width;
        const scaleY = rect.height / canvas.height;
        cssX = target.position.x * scaleX;
        cssY = target.position.y * scaleY;
      }
      targetRef.current = null;
      const color = playersRef.current[data.hitBy]?.oddsColor || GAME_COLOR;
      const effect: HitEffect = { id: data.targetId, cssX, cssY, points: total, color };
      setHitEffects((prev) => [...prev, effect]);
      setTimeout(() => setHitEffects((prev) => prev.filter((e) => e.id !== effect.id)), 900);
      if (data.hitBy === session?.sessionId) sfx.correct();
    });

    socket.on("syncshot:round-end", (data: SyncShotRoundEndEvent) => {
      targetRef.current = null;
      localCursorRef.current = null;
      setRoundResults(data);
      setPhase(data.isGameOver ? "game-over" : "round-end");
    });

    return () => {
      socket.removeAllListeners();
      disconnectSocket();
    };
  }, [roomId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Canvas Render Loop ────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "playing") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    const myId = session?.sessionId;

    const render = () => {
      const W = canvas.width, H = canvas.height;
      ctx.fillStyle = "#070711";
      ctx.fillRect(0, 0, W, H);

      // Grid
      ctx.strokeStyle = "rgba(255,255,255,0.035)";
      ctx.lineWidth = 1;
      for (let x = 0; x < W; x += 50) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
      for (let y = 0; y < H; y += 50) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

      // Target
      const target = targetRef.current;
      if (target) {
        const t = Date.now();
        const pulse = Math.sin(t / 120) * 4;
        const r = target.radius + pulse;
        const { x, y } = target.position;

        const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.2);
        g.addColorStop(0, "rgba(239,68,68,0.4)");
        g.addColorStop(1, "rgba(239,68,68,0)");
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x, y, r * 2.2, 0, Math.PI * 2); ctx.fill();

        ctx.strokeStyle = `rgba(239,68,68,${0.45 + Math.sin(t / 80) * 0.25})`;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, r + 7, 0, Math.PI * 2); ctx.stroke();

        ctx.fillStyle = "#ef4444";
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();

        ctx.strokeStyle = "#fca5a5"; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(x, y, r * 0.55, 0, Math.PI * 2); ctx.stroke();

        ctx.fillStyle = "#fff";
        ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
      }

      // Other players' cursors (server-driven)
      Object.values(playersRef.current).forEach((player) => {
        if (player.oddsId === myId) return;
        const pos = player.cursorPosition;
        if (!pos) return;
        drawCrosshair(ctx, pos.x, pos.y, player.oddsColor, 0.65);
      });

      // Local cursor — immediate, zero lag
      const lc = localCursorRef.current;
      if (myId && playersRef.current[myId] && lc) {
        drawCrosshair(ctx, lc.x, lc.y, playersRef.current[myId].oddsColor, 1.0);
      }

      animId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, [phase, session?.sessionId]);

  // ── Input Handlers ────────────────────────────────────────────────────
  const getCanvasCoords = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    // Map CSS display coords → canvas internal coords
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const coords = getCanvasCoords(e);
    if (!coords) return;
    localCursorRef.current = coords;
    if (phaseRef.current !== "playing") return;
    const now = Date.now();
    if (now - lastMoveRef.current < 33) return;
    lastMoveRef.current = now;
    socketRef.current?.emit("syncshot:move", { roomId, position: coords });
  }, [roomId, getCanvasCoords]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (phaseRef.current !== "playing") return;
    const coords = getCanvasCoords(e);
    if (!coords) return;
    socketRef.current?.emit("syncshot:shoot", { roomId, position: coords });
  }, [roomId, getCanvasCoords]);

  const handleMouseLeave = useCallback(() => { localCursorRef.current = null; }, []);

  // ── Derived ───────────────────────────────────────────────────────────
  const isHost = room?.hostSessionId === session?.sessionId;
  const myPlayer = session?.sessionId ? players[session.sessionId] : null;
  const displayCode = room?.code || roomId?.slice(-6).toUpperCase() || "";

  return (
    <div className="min-h-screen flex flex-col relative stars-bg" style={{ background: "var(--bg-primary)" }}>
      {/* Background blobs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="blob w-96 h-96 top-[-10%] left-[-10%] opacity-10" style={{ background: `${GAME_COLOR}44` }} />
        <div className="blob w-64 h-64 bottom-[5%] right-[-5%] opacity-10" style={{ background: "var(--glow-warm)" }} />
      </div>

      {/* Header */}
      <header className="relative z-10 w-full flex items-center justify-between px-4 sm:px-6 py-3 border-b shrink-0"
        style={{ borderColor: "var(--border-subtle)" }}>
        <Link href="/games/syncshot" className="flex items-center gap-1.5 hover:opacity-80 transition-opacity"
          onClick={() => sfx.click()}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          <span className="text-sm font-bold" style={{ color: "var(--text-muted)" }}>Leave</span>
        </Link>

        <div className="text-center">
          <div className="flex items-center gap-2 justify-center">
            <div className="w-6 h-6 rounded-md flex items-center justify-center text-xs font-black"
              style={{ background: `${GAME_COLOR}22`, color: GAME_COLOR }}>⊕</div>
            <span className="text-base font-extrabold" style={{ color: "var(--text-primary)" }}>SyncShot</span>
          </div>
          {phase === "playing" && (
            <span className="text-[11px] font-bold tabular-nums" style={{ color: "var(--text-muted)" }}>
              Round {roundNumber}/{totalRounds} · {targetsHit}/{settings.targetsPerRound} targets
            </span>
          )}
        </div>

        <div className="w-16 text-right">
          {phase === "playing" && myPlayer && (
            <span className="text-sm font-bold tabular-nums" style={{ color: GAME_COLOR }}>{myPlayer.oddsScore}pts</span>
          )}
        </div>
      </header>

      {/* Body */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 py-6 min-h-0">

        {/* Loading */}
        {phase === "loading" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-4">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl animate-float"
              style={{ background: `${GAME_COLOR}15`, color: GAME_COLOR, boxShadow: `0 8px 32px ${GAME_COLOR}22` }}>⊕</div>
            <div className="flex gap-1.5">
              {[0, 1, 2].map((i) => (
                <motion.div key={i} className="w-2 h-2 rounded-full" style={{ background: GAME_COLOR }}
                  animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.25 }} />
              ))}
            </div>
            <p className="text-sm font-medium" style={{ color: "var(--text-muted)" }}>Connecting…</p>
          </motion.div>
        )}

        {/* Lobby */}
        {phase === "lobby" && room && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center gap-6 w-full max-w-md">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl animate-float"
              style={{ background: `${GAME_COLOR}15`, color: GAME_COLOR, boxShadow: `0 8px 32px ${GAME_COLOR}22` }}>⊕</div>

            <div className="text-center">
              <h2 className="text-xl font-extrabold mb-1" style={{ color: "var(--text-primary)" }}>Waiting for players</h2>
              <p className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                {room.players.length} player{room.players.length !== 1 ? "s" : ""} in room
              </p>
            </div>

            <div className="flex flex-wrap gap-2 justify-center">
              {room.players.map((p, i) => (
                <motion.div key={p.sessionId} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.08 }}
                  className="px-3 py-2 rounded-xl text-sm font-bold flex items-center gap-2"
                  style={{ background: "var(--bg-card)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}>
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black"
                    style={{ background: avatarColor(p.username), color: "#fff" }}>
                    {p.username[0]?.toUpperCase()}
                  </div>
                  {p.username}
                  {p.sessionId === room.hostSessionId && room.visibility === "private" && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold"
                      style={{ background: `${GAME_COLOR}22`, color: GAME_COLOR }}>Host</span>
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
              room.visibility === "private" ? (
                <button
                  onClick={() => { socketRef.current?.emit("lobby:start-game", { roomId }); sfx.click(); }}
                  disabled={room.players.length < 2}
                  className="btn-game px-8 py-3 rounded-2xl font-bold text-sm cursor-pointer disabled:opacity-40"
                  style={{ background: GAME_COLOR, color: "var(--bg-primary)" }}>
                  {room.players.length < 2 ? "Waiting for players…" : "Start Game"}
                </button>
              ) : (
                <p className="text-sm font-bold tabular-nums" style={{ color: GAME_COLOR }}>
                  {autoStartSeconds !== null ? `Starting in ${autoStartSeconds}s…` : "Waiting for players…"}
                </p>
              )
            ) : (
              room.visibility === "private" ? (
                <p className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Waiting for the host to start…</p>
              ) : (
                <p className="text-sm font-bold tabular-nums" style={{ color: GAME_COLOR }}>
                  {autoStartSeconds !== null ? `Starting in ${autoStartSeconds}s…` : "Waiting for players…"}
                </p>
              )
            )}

            {displayCode && (
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl"
                style={{ background: "var(--bg-card)", border: "1px solid var(--border-default)" }}>
                <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Room code</span>
                <span className="font-mono font-bold text-sm" style={{ color: "var(--text-primary)" }}>{displayCode}</span>
                <button onClick={() => { navigator.clipboard?.writeText(displayCode); sfx.click(); }}
                  className="text-[10px] px-2 py-0.5 rounded-lg cursor-pointer font-bold"
                  style={{ background: `${GAME_COLOR}22`, color: GAME_COLOR }}>Copy</button>
              </div>
            )}
          </motion.div>
        )}

        {/* Countdown */}
        {phase === "countdown" && (
          <AnimatePresence mode="wait">
            <motion.div key={countdown}
              initial={{ scale: 0.3, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 1.5, opacity: 0 }}
              transition={{ duration: 0.35, type: "spring", stiffness: 260 }}
              className="text-7xl font-black tabular-nums"
              style={{
                color: countdown > 0 ? GAME_COLOR : "var(--accent-primary)",
                textShadow: `0 0 48px ${GAME_COLOR}66`,
              }}>
              {countdown > 0 ? countdown : "Go!"}
            </motion.div>
          </AnimatePresence>
        )}

        {/* Playing — responsive canvas fills container, coords scaled via scaleX/scaleY */}
        {phase === "playing" && (
          <div className="relative w-full rounded-2xl overflow-hidden"
            style={{ maxWidth: settings.arenaWidth, aspectRatio: `${settings.arenaWidth} / ${settings.arenaHeight}` }}>
            <canvas
              ref={canvasRef}
              width={settings.arenaWidth}
              height={settings.arenaHeight}
              onMouseMove={handleMouseMove}
              onClick={handleClick}
              onMouseLeave={handleMouseLeave}
              className="w-full h-full cursor-none block"
              style={{ border: `2px solid ${GAME_COLOR}55`, borderRadius: "1rem" }}
            />

            {/* Live scoreboard overlay */}
            <div className="absolute top-2 right-2 rounded-xl p-2.5 min-w-[130px]"
              style={{ background: "rgba(7,7,17,0.88)", border: "1px solid rgba(255,255,255,0.07)", backdropFilter: "blur(8px)" }}>
              {Object.values(players).sort((a, b) => b.oddsScore - a.oddsScore).map((p) => (
                <div key={p.oddsId} className="flex justify-between items-center gap-3 py-0.5 text-xs">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ background: p.oddsColor }} />
                    <span className="truncate max-w-[70px]"
                      style={{
                        color: p.oddsId === session?.sessionId ? "var(--text-primary)" : "var(--text-secondary)",
                        fontWeight: p.oddsId === session?.sessionId ? 700 : 400,
                      }}>
                      {room?.players.find((x) => x.sessionId === p.oddsId)?.username || "Player"}
                    </span>
                  </div>
                  <span className="font-bold tabular-nums" style={{ color: p.oddsColor }}>{p.oddsScore}</span>
                </div>
              ))}
            </div>

            {/* Reload indicator */}
            {myPlayer && myPlayer.shotCooldown > 0 && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[11px] font-bold"
                style={{ background: "rgba(7,7,17,0.88)", color: "var(--text-muted)", border: "1px solid rgba(255,255,255,0.07)" }}>
                reloading…
              </div>
            )}

            {/* Hit effects overlay — positions already in CSS space */}
            <AnimatePresence>
              {hitEffects.map((effect) => (
                <motion.div key={effect.id}
                  initial={{ opacity: 1, y: 0, scale: 1 }}
                  animate={{ opacity: 0, y: -44, scale: 1.5 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.75, ease: "easeOut" }}
                  className="absolute pointer-events-none font-black text-base leading-none select-none"
                  style={{
                    left: effect.cssX,
                    top: effect.cssY,
                    color: effect.color,
                    transform: "translateX(-50%)",
                    textShadow: "0 2px 8px rgba(0,0,0,0.9)",
                  }}>
                  +{effect.points}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}

        {/* Round End */}
        {phase === "round-end" && roundResults && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center gap-5 w-full max-w-sm">
            <div className="text-center">
              <h2 className="text-xl font-extrabold mb-1" style={{ color: "var(--text-primary)" }}>Round {roundNumber} Complete</h2>
              <p className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Next round starting soon…</p>
            </div>
            <div className="w-full space-y-2">
              {roundResults.results.map((r, i) => {
                const uname = room?.players.find((p) => p.sessionId === r.oddsId)?.username || "Player";
                return (
                  <motion.div key={r.oddsId} initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1 }}
                    className="flex items-center justify-between px-4 py-3 rounded-xl"
                    style={{
                      background: i === 0 ? `${GAME_COLOR}14` : "var(--bg-card)",
                      border: `1px solid ${i === 0 ? `${GAME_COLOR}44` : "var(--border-default)"}`,
                    }}>
                    <div className="flex items-center gap-3">
                      <span className="text-lg w-7 text-center">{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`}</span>
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-black"
                        style={{ background: avatarColor(uname), color: "#fff" }}>
                        {uname[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>{uname}</p>
                        <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>{r.hits} hits · {r.accuracy}%</p>
                      </div>
                    </div>
                    <span className="font-black text-lg tabular-nums" style={{ color: GAME_COLOR }}>{r.oddsScore}</span>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* Game Over */}
        {phase === "game-over" && roundResults && (() => {
          const finals = roundResults.finalResults || [];
          const myRank = finals.findIndex((r) => r.oddsId === session?.sessionId);
          return (
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center gap-5 w-full max-w-sm">

              {/* Confetti */}
              <div className="fixed inset-0 pointer-events-none overflow-hidden z-30">
                {Array.from({ length: 28 }).map((_, i) => (
                  <motion.div key={i}
                    initial={{ y: -20, x: `${Math.random() * 100}vw`, opacity: 1, rotate: 0 }}
                    animate={{ y: "110vh", opacity: 0, rotate: Math.random() * 720 - 360 }}
                    transition={{ duration: 2 + Math.random() * 2, delay: Math.random() * 0.8, ease: "easeIn" }}
                    className="absolute w-2.5 h-2.5 rounded-sm"
                    style={{ background: [GAME_COLOR, "#ef4444", "#22c55e", "#3b82f6", "#a78bfa"][i % 5] }} />
                ))}
              </div>

              {/* Rank badge */}
              <motion.div initial={{ scale: 0, rotate: -12 }} animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 220, delay: 0.25 }}
                className="flex flex-col items-center gap-1 text-center">
                {myRank === 0 && <><div className="text-5xl">🏆</div><h2 className="text-3xl font-black" style={{ color: GAME_COLOR }}>You Won!</h2><p className="text-sm" style={{ color: "var(--text-muted)" }}>Sharpshooter!</p></>}
                {myRank === 1 && <><div className="text-4xl">🥈</div><h2 className="text-2xl font-black" style={{ color: "var(--text-primary)" }}>2nd Place!</h2><p className="text-sm" style={{ color: "var(--text-muted)" }}>So close!</p></>}
                {myRank === 2 && <><div className="text-4xl">🥉</div><h2 className="text-2xl font-black" style={{ color: "#cd7f32" }}>3rd Place!</h2><p className="text-sm" style={{ color: "var(--text-muted)" }}>Nice effort!</p></>}
                {myRank > 2 && <><h2 className="text-2xl font-black" style={{ color: "var(--text-primary)" }}>{ordinal(myRank + 1)} Place</h2><p className="text-sm" style={{ color: "var(--text-muted)" }}>Better luck next time!</p></>}
              </motion.div>

              {/* Final leaderboard */}
              <div className="w-full space-y-2">
                {finals.map((r, i) => {
                  const uname = room?.players.find((p) => p.sessionId === r.oddsId)?.username || "Player";
                  const isMe = r.oddsId === session?.sessionId;
                  return (
                    <motion.div key={r.oddsId} initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.3 + i * 0.1 }}
                      className="flex items-center justify-between px-4 py-3 rounded-xl"
                      style={{
                        background: i === 0 ? `${GAME_COLOR}14` : "var(--bg-card)",
                        border: `1px solid ${isMe ? `${GAME_COLOR}66` : i === 0 ? `${GAME_COLOR}44` : "var(--border-default)"}`,
                        boxShadow: isMe ? `0 0 0 2px ${GAME_COLOR}33` : undefined,
                      }}>
                      <div className="flex items-center gap-3">
                        <span className="text-lg w-7 text-center">{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`}</span>
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-black"
                          style={{ background: r.oddsColor, color: "#fff" }}>
                          {uname[0].toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-bold" style={{ color: isMe ? GAME_COLOR : "var(--text-primary)" }}>{uname}</p>
                          <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>{r.totalHits} hits · {r.accuracy}%</p>
                        </div>
                      </div>
                      <span className="font-black text-lg tabular-nums" style={{ color: GAME_COLOR }}>{r.totalScore}</span>
                    </motion.div>
                  );
                })}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => { socketRef.current?.emit("lobby:play-again", { roomId }); setPhase("lobby"); setRoundResults(null); sfx.click(); }}
                  className="btn-game px-6 py-2.5 rounded-xl font-bold text-sm cursor-pointer"
                  style={{ background: GAME_COLOR, color: "var(--bg-primary)" }}>
                  Play Again
                </button>
                <Link href="/games/syncshot" onClick={() => sfx.click()}
                  className="btn-game px-6 py-2.5 rounded-xl font-bold text-sm"
                  style={{ background: "var(--bg-card)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}>
                  Leave
                </Link>
              </div>
            </motion.div>
          );
        })()}
      </div>

      {/* Footer */}
      <footer className="relative z-10 py-2 text-center text-xs shrink-0" style={{ color: "var(--text-muted)" }}>
        Powered by <a href="https://spyll.in" target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}><span style={{ fontFamily: "'Liquids', sans-serif", color: "rgb(255, 89, 115)", fontSize: "1rem" }}>Spyll</span></a>
      </footer>
    </div>
  );
}
