'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useParams, useRouter } from 'next/navigation';
import type { Socket } from 'socket.io-client';
import { connectSocket, disconnectSocket } from '@/lib/socket';
import { useSessionStore } from '@/lib/store';
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
} from '@playarena/shared';

interface Player {
  sessionId: string;
  username: string;
  isHost?: boolean;
}

interface RoomInfo {
  id: string;
  hostSessionId: string;
  visibility: 'public' | 'private';
  players: Player[];
}

const THEME_COLOR = '#f59e0b';

type GamePhase = 'lobby' | 'countdown' | 'playing' | 'round-end' | 'game-over';

interface HitEffect {
  id: string;
  position: { x: number; y: number };
  points: number;
  playerId: string;
}

export default function SyncShotRoom() {
  const params = useParams();
  const router = useRouter();
  const roomId = params.roomId as string;
  const session = useSessionStore((s) => s.session);

  const [socket, setSocket] = useState<Socket | null>(null);
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [phase, setPhase] = useState<GamePhase>('lobby');
  const [countdown, setCountdown] = useState(3);
  const [roundNumber, setRoundNumber] = useState(0);
  const [players, setPlayers] = useState<Record<string, SyncShotPlayer>>({});
  const [settings, setSettings] = useState<SyncShotSettings>(DEFAULT_SYNCSHOT_SETTINGS);
  const [activeTarget, setActiveTarget] = useState<SyncShotTarget | null>(null);
  const [targetsHit, setTargetsHit] = useState(0);
  const [targetsSpawned, setTargetsSpawned] = useState(0);
  const [hitEffects, setHitEffects] = useState<HitEffect[]>([]);
  const [roundResults, setRoundResults] = useState<SyncShotRoundEndEvent | null>(null);
  const [playerNames, setPlayerNames] = useState<Record<string, string>>({});
  const [autoStartTimer, setAutoStartTimer] = useState<number | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playersRef = useRef(players);
  const targetRef = useRef(activeTarget);
  const lastMoveRef = useRef(0);

  useEffect(() => {
    playersRef.current = players;
  }, [players]);

  useEffect(() => {
    targetRef.current = activeTarget;
  }, [activeTarget]);

  useEffect(() => {
    if (!session) {
      router.push('/games/syncshot');
      return;
    }
    const newSocket = connectSocket();
    setSocket(newSocket);

    newSocket.emit('lobby:join-room', { roomId });

    newSocket.on('lobby:room-joined', ({ room: roomState }: { room: RoomInfo }) => {
      setRoom(roomState);
      const names: Record<string, string> = {};
      roomState.players.forEach((p: Player) => {
        names[p.sessionId || ''] = p.username || '';
      });
      setPlayerNames(names);
    });

    newSocket.on('lobby:room-updated', ({ room: roomState }: { room: RoomInfo }) => {
      setRoom(roomState);
      const names: Record<string, string> = {};
      roomState.players.forEach((p: Player) => {
        names[p.sessionId || ''] = p.username || '';
      });
      setPlayerNames(names);
    });

    newSocket.on('lobby:auto-start-timer', ({ timeLeft }: { timeLeft: number }) => {
      setAutoStartTimer(timeLeft);
    });

    newSocket.on('game:starting', () => {
      setPhase('countdown');
      setCountdown(3);
      setAutoStartTimer(null);
    });

    newSocket.on('game:countdown', ({ count }: { count: number }) => {
      setCountdown(count);
    });

    newSocket.on('syncshot:round-start', (data: SyncShotRoundStartEvent) => {
      setRoundNumber(data.roundNumber);
      setPlayers(data.players);
      setSettings(data.settings);
      setActiveTarget(null);
      setTargetsHit(0);
      setTargetsSpawned(0);
      setHitEffects([]);
      setPhase('playing');
    });

    newSocket.on('syncshot:tick', (data: SyncShotTickEvent) => {
      setPlayers(data.players);
      setTargetsHit(data.targetsHit);
      setTargetsSpawned(data.targetsSpawned);
    });

    newSocket.on('syncshot:target-spawn', (data: SyncShotTargetSpawnEvent) => {
      setActiveTarget(data.target);
      setTargetsSpawned((prev) => prev + 1);
    });

    newSocket.on('syncshot:target-hit', (data: SyncShotTargetHitEvent) => {
      setActiveTarget(null);
      setTargetsHit((prev) => prev + 1);

      // Add hit effect - total points = base + speed bonus + accuracy bonus
      const totalPoints = data.points + data.speedBonus + data.accuracyBonus;
      const effect: HitEffect = {
        id: data.targetId,
        position: targetRef.current?.position || { x: 0, y: 0 },
        points: totalPoints,
        playerId: data.hitBy,
      };
      setHitEffects((prev) => [...prev, effect]);

      // Remove effect after animation
      setTimeout(() => {
        setHitEffects((prev) => prev.filter((e) => e.id !== effect.id));
      }, 1000);
    });

    newSocket.on('syncshot:round-end', (data: SyncShotRoundEndEvent) => {
      setRoundResults(data);
      setPhase(data.isGameOver ? 'game-over' : 'round-end');
    });

    newSocket.on('error', (message: string) => {
      console.error('Socket error:', message);
    });

    return () => {
      newSocket.disconnect();
    };
  }, [roomId]);

  // Canvas rendering
  useEffect(() => {
    if (phase !== 'playing') return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;

    const render = () => {
      ctx.fillStyle = '#0a0a0f';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw grid lines
      ctx.strokeStyle = '#1a1a2f';
      ctx.lineWidth = 1;
      for (let x = 0; x < canvas.width; x += 50) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      for (let y = 0; y < canvas.height; y += 50) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }

      // Draw target
      const target = targetRef.current;
      if (target && !target.hitBy) {
        const pulse = Math.sin(Date.now() / 100) * 5;
        const radius = target.radius + pulse;

        // Outer glow
        const gradient = ctx.createRadialGradient(
          target.position.x,
          target.position.y,
          0,
          target.position.x,
          target.position.y,
          radius * 1.5
        );
        gradient.addColorStop(0, 'rgba(239, 68, 68, 0.3)');
        gradient.addColorStop(1, 'rgba(239, 68, 68, 0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(target.position.x, target.position.y, radius * 1.5, 0, Math.PI * 2);
        ctx.fill();

        // Main circle
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(target.position.x, target.position.y, radius, 0, Math.PI * 2);
        ctx.fill();

        // Inner ring
        ctx.strokeStyle = '#fca5a5';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(target.position.x, target.position.y, radius * 0.6, 0, Math.PI * 2);
        ctx.stroke();

        // Center dot
        ctx.fillStyle = '#fca5a5';
        ctx.beginPath();
        ctx.arc(target.position.x, target.position.y, 5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw player cursors
      Object.values(playersRef.current).forEach((player) => {
        const pos = player.cursorPosition;
        if (!pos) return;

        // Crosshair
        ctx.strokeStyle = player.oddsColor;
        ctx.lineWidth = 2;

        // Horizontal line
        ctx.beginPath();
        ctx.moveTo(pos.x - 15, pos.y);
        ctx.lineTo(pos.x - 5, pos.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(pos.x + 5, pos.y);
        ctx.lineTo(pos.x + 15, pos.y);
        ctx.stroke();

        // Vertical line
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y - 15);
        ctx.lineTo(pos.x, pos.y - 5);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y + 5);
        ctx.lineTo(pos.x, pos.y + 15);
        ctx.stroke();

        // Center circle
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 3, 0, Math.PI * 2);
        ctx.stroke();
      });

      animationId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [phase]);

  // Mouse tracking (throttled to reduce socket spam)
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!socket || phase !== 'playing') return;

      const now = Date.now();
      if (now - lastMoveRef.current < 33) return; // ~30fps throttle
      lastMoveRef.current = now;

      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      socket.emit('syncshot:move', { roomId, position: { x, y } });
    },
    [socket, roomId, phase]
  );

  // Click to shoot
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!socket || phase !== 'playing') return;

      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      socket.emit('syncshot:shoot', { roomId, position: { x, y } });
    },
    [socket, roomId, phase]
  );

  const handleStartGame = () => {
    if (socket && room?.hostSessionId === session?.sessionId) {
      socket.emit('lobby:start-game', { roomId });
    }
  };

  const handlePlayAgain = () => {
    if (socket) {
      socket.emit('lobby:play-again', { roomId });
      setPhase('lobby');
      setRoundResults(null);
    }
  };

  const handleBackToLobby = () => {
    router.push('/games/syncshot');
  };

  const myPlayer = session?.sessionId ? players[session.sessionId] : null;
  const isHost = session?.sessionId && room?.hostSessionId === session.sessionId;

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-800 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🎯</span>
          <span className="font-bold text-lg" style={{ color: THEME_COLOR }}>
            SyncShot
          </span>
          {room && (
            <span className="text-gray-500 font-mono text-sm">#{room.id}</span>
          )}
        </div>
        {phase === 'playing' && (
          <div className="flex gap-6 text-sm">
            <span className="text-gray-400">
              Round <span className="text-white font-bold">{roundNumber}</span>/3
            </span>
            <span className="text-gray-400">
              Targets <span className="text-white font-bold">{targetsHit}</span>/{settings.targetsPerRound}
            </span>
            {myPlayer && (
              <span className="text-gray-400">
                Score <span style={{ color: THEME_COLOR }} className="font-bold">{myPlayer.oddsScore}</span>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Main content */}
      <div className="flex-1 flex items-center justify-center p-6">
        {/* Lobby */}
        {phase === 'lobby' && room && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center"
          >
            <h2 className="text-2xl font-bold mb-6">Waiting for Players</h2>

            <div className="grid grid-cols-2 gap-4 mb-8 max-w-md mx-auto">
              {room.players.map((player: Player, i: number) => (
                <motion.div
                  key={player.sessionId}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="p-4 bg-gray-900 rounded-lg border border-gray-700"
                >
                  <div
                    className="w-10 h-10 rounded-full mx-auto mb-2 flex items-center justify-center text-black font-bold"
                    style={{ backgroundColor: ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b'][i % 4] }}
                  >
                    {(player.username || 'P')[0]}
                  </div>
                  <p className="font-semibold truncate">{player.username}</p>
                  {room.visibility === 'private' && player.sessionId === room.hostSessionId && (
                    <span className="text-xs text-amber-500">Host</span>
                  )}
                </motion.div>
              ))}
            </div>

            {autoStartTimer !== null && (
              <div className="mb-4 text-lg">
                Starting in <span style={{ color: THEME_COLOR }} className="font-bold">{autoStartTimer}s</span>
              </div>
            )}

            {isHost && room.visibility === 'private' && (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleStartGame}
                disabled={room.players.length < 2}
                className="px-8 py-3 rounded-lg font-bold text-black disabled:opacity-50"
                style={{ backgroundColor: THEME_COLOR }}
              >
                Start Game
              </motion.button>
            )}

            {room.visibility === 'public' && room.players.length < 2 && (
              <p className="text-gray-500">Waiting for more players...</p>
            )}

            <p className="mt-6 text-gray-500 text-sm">
              Share code: <span className="font-mono text-white">{room.id}</span>
            </p>
          </motion.div>
        )}

        {/* Countdown */}
        {phase === 'countdown' && (
          <motion.div
            key={countdown}
            initial={{ scale: 2, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.5, opacity: 0 }}
            className="text-8xl font-bold"
            style={{ color: THEME_COLOR }}
          >
            {countdown}
          </motion.div>
        )}

        {/* Playing */}
        {phase === 'playing' && (
          <div className="relative">
            <canvas
              ref={canvasRef}
              width={settings.arenaWidth}
              height={settings.arenaHeight}
              onMouseMove={handleMouseMove}
              onClick={handleClick}
              className="rounded-lg cursor-none"
              style={{ border: `2px solid ${THEME_COLOR}` }}
            />

            {/* Hit effects */}
            <AnimatePresence>
              {hitEffects.map((effect) => (
                <motion.div
                  key={effect.id}
                  initial={{ opacity: 1, y: 0, scale: 1 }}
                  animate={{ opacity: 0, y: -50, scale: 1.5 }}
                  exit={{ opacity: 0 }}
                  className="absolute pointer-events-none font-bold text-2xl"
                  style={{
                    left: effect.position.x,
                    top: effect.position.y,
                    color: players[effect.playerId]?.oddsColor || THEME_COLOR,
                  }}
                >
                  +{effect.points}
                </motion.div>
              ))}
            </AnimatePresence>

            {/* Scoreboard */}
            <div className="absolute top-2 right-2 bg-black/70 rounded-lg p-3 min-w-[150px]">
              {Object.values(players)
                .sort((a, b) => b.oddsScore - a.oddsScore)
                .map((player, i) => (
                  <div key={player.oddsId} className="flex justify-between items-center gap-4 text-sm py-1">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: player.oddsColor }}
                      />
                      <span className="truncate max-w-[80px]">
                        {playerNames[player.oddsId] || 'Player'}
                      </span>
                    </div>
                    <span className="font-bold" style={{ color: player.oddsColor }}>
                      {player.oddsScore}
                    </span>
                  </div>
                ))}
            </div>

            {/* Cooldown indicator */}
            {myPlayer && myPlayer.shotCooldown > 0 && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/70 px-4 py-2 rounded-full">
                <span className="text-gray-400">Cooldown...</span>
              </div>
            )}
          </div>
        )}

        {/* Round End / Game Over */}
        {(phase === 'round-end' || phase === 'game-over') && roundResults && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center max-w-md w-full"
          >
            {/* Confetti for game-over */}
            {phase === 'game-over' && (
              <div className="fixed inset-0 pointer-events-none overflow-hidden z-40">
                {Array.from({ length: 30 }).map((_, i) => (
                  <motion.div key={i}
                    initial={{ y: -20, x: Math.random() * (typeof window !== 'undefined' ? window.innerWidth : 400), opacity: 1, rotate: 0 }}
                    animate={{ y: (typeof window !== 'undefined' ? window.innerHeight : 800) + 50, opacity: 0, rotate: Math.random() * 720 - 360 }}
                    transition={{ duration: 2 + Math.random() * 2, delay: Math.random() * 0.5, ease: 'easeIn' }}
                    className="absolute w-3 h-3 rounded-sm"
                    style={{ background: ['#f59e0b', '#ef4444', '#22c55e', '#3b82f6', '#a78bfa'][i % 5] }}
                  />
                ))}
              </div>
            )}

            {/* Personal rank celebration for game-over */}
            {phase === 'game-over' && (() => {
              const results = roundResults.finalResults || [];
              const myRank = results.findIndex((r) => r.oddsId === session?.sessionId);
              if (myRank === 0) return (
                <motion.div initial={{ scale: 0, rotate: -10 }} animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', stiffness: 200, delay: 0.3 }}
                  className="mb-4">
                  <div className="text-5xl mb-2">🏆</div>
                  <h2 className="text-3xl font-bold" style={{ color: THEME_COLOR }}>You Won!</h2>
                  <p className="text-sm text-gray-400 mt-1">Woohoo! Sharpshooter!</p>
                </motion.div>
              );
              if (myRank === 1) return (
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', delay: 0.3 }}
                  className="mb-4">
                  <div className="text-4xl mb-2">🥈</div>
                  <h2 className="text-2xl font-bold text-gray-300">2nd Place!</h2>
                  <p className="text-sm text-gray-500 mt-1">So close!</p>
                </motion.div>
              );
              if (myRank === 2) return (
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', delay: 0.3 }}
                  className="mb-4">
                  <div className="text-4xl mb-2">🥉</div>
                  <h2 className="text-2xl font-bold" style={{ color: '#cd7f32' }}>3rd Place!</h2>
                  <p className="text-sm text-gray-500 mt-1">Nice effort!</p>
                </motion.div>
              );
              if (myRank >= 0) return (
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', delay: 0.3 }}
                  className="mb-4">
                  <h2 className="text-2xl font-bold text-white">You came {myRank + 1}th</h2>
                  <p className="text-sm text-gray-500 mt-1">Better luck next time!</p>
                </motion.div>
              );
              return null;
            })()}

            <h2 className="text-3xl font-bold mb-2" style={{ color: THEME_COLOR }}>
              {phase === 'game-over' ? '🏆 Game Over!' : `Round ${roundNumber} Complete`}
            </h2>

            <div className="mt-6 space-y-3">
              {(phase === 'game-over' ? roundResults.finalResults! : roundResults.results).map(
                (result, index) => (
                  <motion.div
                    key={result.oddsId}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className={`flex items-center justify-between p-4 rounded-lg ${
                      index === 0 ? 'bg-amber-500/20 border border-amber-500/50' : 'bg-gray-900'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">
                        {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : ''}
                      </span>
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-black font-bold"
                        style={{
                          backgroundColor:
                            'oddsColor' in result ? result.oddsColor : THEME_COLOR,
                        }}
                      >
                        {(playerNames[result.oddsId] || 'P')[0]}
                      </div>
                      <span className="font-semibold">
                        {playerNames[result.oddsId] || 'Player'}
                      </span>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-xl" style={{ color: THEME_COLOR }}>
                        {'totalScore' in result ? result.totalScore : result.oddsScore}
                      </div>
                      <div className="text-xs text-gray-500">
                        {'totalHits' in result
                          ? `${result.totalHits} hits · ${result.accuracy}%`
                          : `${result.hits} hits · ${result.accuracy}%`}
                      </div>
                    </div>
                  </motion.div>
                )
              )}
            </div>

            <div className="flex gap-4 mt-8 justify-center">
              {phase === 'game-over' && (
                <>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handlePlayAgain}
                    className="px-6 py-3 rounded-lg font-bold text-black"
                    style={{ backgroundColor: THEME_COLOR }}
                  >
                    Play Again
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleBackToLobby}
                    className="px-6 py-3 rounded-lg font-bold border-2"
                    style={{ borderColor: THEME_COLOR, color: THEME_COLOR }}
                  >
                    Back to Lobby
                  </motion.button>
                </>
              )}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
