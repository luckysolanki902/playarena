'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useParams, useRouter } from 'next/navigation';
import type { Socket } from 'socket.io-client';
import { connectSocket, disconnectSocket } from '@/lib/socket';
import { useSessionStore } from '@/lib/store';
import {
  OrbitPlayer,
  OrbitPosition,
  OrbitBrawlTickEvent,
  OrbitBrawlRoundStartEvent,
  OrbitBrawlForceUsedEvent,
  OrbitBrawlPlayerEliminatedEvent,
  OrbitBrawlRoundEndEvent,
  OrbitBrawlSettings,
  DEFAULT_ORBIT_BRAWL_SETTINGS,
} from '@playarena/shared';

interface Player {
  sessionId: string;
  username: string;
  isHost?: boolean;
}

interface RoomInfo {
  id: string;
  code?: string;
  hostSessionId: string;
  visibility: 'public' | 'private';
  players: Player[];
}

const THEME_COLOR = '#e879f9';

type GamePhase = 'lobby' | 'countdown' | 'playing' | 'round-end' | 'game-over';

interface ForceWave {
  id: string;
  position: OrbitPosition;
  radius: number;
  maxRadius: number;
  color: string;
  type: 'push' | 'pull';
}

export default function OrbitBrawlRoom() {
  const params = useParams();
  const router = useRouter();
  const roomId = params.roomId as string;
  const session = useSessionStore((s) => s.session);

  const [socket, setSocket] = useState<Socket | null>(null);
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [phase, setPhase] = useState<GamePhase>('lobby');
  const [countdown, setCountdown] = useState(3);
  const [roundNumber, setRoundNumber] = useState(0);
  const [players, setPlayers] = useState<Record<string, OrbitPlayer>>({});
  const [settings, setSettings] = useState<OrbitBrawlSettings>(DEFAULT_ORBIT_BRAWL_SETTINGS);
  const [forceWaves, setForceWaves] = useState<ForceWave[]>([]);
  const [roundResults, setRoundResults] = useState<OrbitBrawlRoundEndEvent | null>(null);
  const [playerNames, setPlayerNames] = useState<Record<string, string>>({});
  const [autoStartTimer, setAutoStartTimer] = useState<number | null>(null);
  const [isCharging, setIsCharging] = useState(false);
  const [chargeType, setChargeType] = useState<'push' | 'pull' | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playersRef = useRef(players);
  const settingsRef = useRef(settings);

  useEffect(() => {
    playersRef.current = players;
  }, [players]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    if (!session) {
      router.push('/games/orbitbrawl');
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

    newSocket.on('orbitbrawl:round-start', (data: OrbitBrawlRoundStartEvent) => {
      setRoundNumber(data.roundNumber);
      setPlayers(data.players);
      setSettings(data.settings);
      setForceWaves([]);
      setPhase('playing');
    });

    newSocket.on('orbitbrawl:tick', (data: OrbitBrawlTickEvent) => {
      setPlayers(data.players);
    });

    newSocket.on('orbitbrawl:force-used', (data: OrbitBrawlForceUsedEvent) => {
      // Add visual force wave
      const wave: ForceWave = {
        id: `${data.playerId}-${Date.now()}`,
        position: data.position,
        radius: 0,
        maxRadius: data.radius,
        color: data.chargeType === 'push' ? '#3b82f6' : '#a855f7',
        type: data.chargeType,
      };
      setForceWaves((prev) => [...prev, wave]);

      // Animate and remove
      setTimeout(() => {
        setForceWaves((prev) => prev.filter((w) => w.id !== wave.id));
      }, 500);
    });

    newSocket.on('orbitbrawl:player-eliminated', (data: OrbitBrawlPlayerEliminatedEvent) => {
      // Could add elimination effect here
    });

    newSocket.on('orbitbrawl:round-end', (data: OrbitBrawlRoundEndEvent) => {
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
      const s = settingsRef.current;
      ctx.fillStyle = '#0a0a0f';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw arena circle
      const gradient = ctx.createRadialGradient(
        s.arenaCenter.x, s.arenaCenter.y, s.arenaRadius * 0.8,
        s.arenaCenter.x, s.arenaCenter.y, s.arenaRadius
      );
      gradient.addColorStop(0, 'transparent');
      gradient.addColorStop(1, `${THEME_COLOR}30`);

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(s.arenaCenter.x, s.arenaCenter.y, s.arenaRadius, 0, Math.PI * 2);
      ctx.fill();

      // Arena border
      ctx.strokeStyle = THEME_COLOR;
      ctx.lineWidth = 3;
      ctx.setLineDash([10, 5]);
      ctx.beginPath();
      ctx.arc(s.arenaCenter.x, s.arenaCenter.y, s.arenaRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw force waves
      forceWaves.forEach((wave) => {
        const progress = wave.radius / wave.maxRadius;
        ctx.strokeStyle = wave.color;
        ctx.lineWidth = 3 * (1 - progress);
        ctx.globalAlpha = 1 - progress;
        ctx.beginPath();
        ctx.arc(wave.position.x, wave.position.y, 
          wave.radius + (wave.maxRadius - wave.radius) * 0.3, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
        
        // Animate wave
        wave.radius += wave.maxRadius * 0.1;
      });

      // Draw players
      Object.values(playersRef.current).forEach((player) => {
        if (!player.alive) {
          // Draw ghost of eliminated player
          ctx.globalAlpha = 0.3;
          ctx.strokeStyle = player.oddsColor;
          ctx.lineWidth = 2;
          ctx.setLineDash([5, 5]);
          ctx.beginPath();
          ctx.arc(player.position.x, player.position.y, player.radius, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.globalAlpha = 1;
          return;
        }

        // Draw player glow
        const glowGradient = ctx.createRadialGradient(
          player.position.x, player.position.y, 0,
          player.position.x, player.position.y, player.radius * 2
        );
        glowGradient.addColorStop(0, `${player.oddsColor}40`);
        glowGradient.addColorStop(1, 'transparent');
        ctx.fillStyle = glowGradient;
        ctx.beginPath();
        ctx.arc(player.position.x, player.position.y, player.radius * 2, 0, Math.PI * 2);
        ctx.fill();

        // Draw player
        ctx.fillStyle = player.oddsColor;
        ctx.beginPath();
        ctx.arc(player.position.x, player.position.y, player.radius, 0, Math.PI * 2);
        ctx.fill();

        // Draw charge indicator
        if (player.isCharging) {
          const chargeRadius = player.radius + 10 + player.chargePower * 30;
          ctx.strokeStyle = player.chargeType === 'push' ? '#3b82f6' : '#a855f7';
          ctx.lineWidth = 2 + player.chargePower * 3;
          ctx.globalAlpha = 0.5 + player.chargePower * 0.5;
          ctx.beginPath();
          ctx.arc(player.position.x, player.position.y, chargeRadius, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }

        // Draw cooldown indicator
        if (player.cooldown > 0) {
          const cooldownProgress = player.cooldown / 30; // 30 is default cooldown
          ctx.strokeStyle = '#666';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(
            player.position.x, player.position.y, player.radius + 5,
            -Math.PI / 2, -Math.PI / 2 + (1 - cooldownProgress) * Math.PI * 2
          );
          ctx.stroke();
        }

        // Draw player initial
        ctx.fillStyle = '#000';
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(
          (playerNames[player.oddsId] || 'P')[0],
          player.position.x,
          player.position.y
        );
      });

      animationId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [phase, forceWaves, playerNames]);

  // Mouse controls for charging
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!socket || phase !== 'playing') return;

      const type = e.button === 0 ? 'push' : e.button === 2 ? 'pull' : null;
      if (!type) return;

      setIsCharging(true);
      setChargeType(type);
      socket.emit('orbitbrawl:start-charge', { roomId, chargeType: type });
    },
    [socket, roomId, phase]
  );

  const handleMouseUp = useCallback(() => {
    if (!socket || !isCharging) return;

    setIsCharging(false);
    setChargeType(null);
    socket.emit('orbitbrawl:release-charge', { roomId });
  }, [socket, roomId, isCharging]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

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
    router.push('/games/orbitbrawl');
  };

  const myPlayer = session?.sessionId ? players[session.sessionId] : null;
  const isHost = session?.sessionId && room?.hostSessionId === session.sessionId;
  const alivePlayers = Object.values(players).filter((p) => p.alive).length;

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-800 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🌀</span>
          <span className="font-bold text-lg" style={{ color: THEME_COLOR }}>
            Orbit Brawl
          </span>
          {room && (
            <span className="text-gray-500 font-mono text-sm">#{room.id}</span>
          )}
        </div>
        {phase === 'playing' && (
          <div className="flex gap-6 text-sm">
            <span className="text-gray-400">
              Round <span className="text-white font-bold">{roundNumber}</span>/5
            </span>
            <span className="text-gray-400">
              Alive <span className="text-white font-bold">{alivePlayers}</span>
            </span>
            {myPlayer && (
              <span className={myPlayer.alive ? 'text-green-400' : 'text-red-400'}>
                {myPlayer.alive ? '● ALIVE' : '✖ ELIMINATED'}
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
                    style={{ backgroundColor: ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b'][i % 4] }}
                  >
                    {(player.username || 'P')[0]}
                  </div>
                  <p className="font-semibold truncate">{player.username}</p>
                  {room.visibility === 'private' && player.sessionId === room.hostSessionId && (
                    <span className="text-xs text-fuchsia-500">Host</span>
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

            {room.visibility === 'private' && room.code && (
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl mt-2"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)' }}>
                <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Room code</span>
                <span className="font-mono font-bold text-sm tracking-widest" style={{ color: 'var(--text-primary)' }}>{room.code}</span>
                <button onClick={() => { navigator.clipboard?.writeText(room.code!); }}
                  className="text-[10px] px-2 py-0.5 rounded-lg cursor-pointer font-bold"
                  style={{ background: 'rgba(232,121,249,0.15)', color: THEME_COLOR }}>Copy</button>
              </div>
            )}
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
          <div className="flex gap-6">
            <div className="relative">
              <canvas
                ref={canvasRef}
                width={settings.arenaCenter.x * 2}
                height={settings.arenaCenter.y * 2}
                onMouseDown={handleMouseDown}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onContextMenu={handleContextMenu}
                className="rounded-lg cursor-crosshair"
                style={{ border: `2px solid ${THEME_COLOR}` }}
              />

              {/* Controls hint */}
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/70 px-4 py-2 rounded-lg text-sm">
                <span className="text-blue-400">Left-click</span> = Push · 
                <span className="text-purple-400 ml-2">Right-click</span> = Pull
              </div>

              {/* Charge indicator */}
              {isCharging && myPlayer && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/70 px-6 py-3 rounded-lg">
                  <div className="text-center mb-2">
                    Charging <span style={{ color: chargeType === 'push' ? '#3b82f6' : '#a855f7' }}>
                      {chargeType?.toUpperCase()}
                    </span>
                  </div>
                  <div className="w-40 h-3 bg-gray-700 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full"
                      style={{ backgroundColor: chargeType === 'push' ? '#3b82f6' : '#a855f7' }}
                      animate={{ width: `${(myPlayer.chargePower || 0) * 100}%` }}
                      transition={{ duration: 0.1 }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Scoreboard */}
            <div className="bg-gray-900/80 rounded-lg p-4 min-w-[180px]">
              <h3 className="font-bold mb-4 text-center" style={{ color: THEME_COLOR }}>
                Players
              </h3>
              <div className="space-y-2">
                {Object.values(players).map((player) => (
                  <div
                    key={player.oddsId}
                    className={`flex items-center gap-2 p-2 rounded ${
                      player.alive ? 'bg-gray-800/50' : 'bg-red-900/20 opacity-50'
                    }`}
                  >
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-black"
                      style={{ backgroundColor: player.oddsColor }}
                    >
                      {(playerNames[player.oddsId] || 'P')[0]}
                    </div>
                    <span className="truncate flex-1 text-sm">
                      {playerNames[player.oddsId] || 'Player'}
                    </span>
                    {!player.alive && <span className="text-red-400 text-xs">OUT</span>}
                    {player.eliminations > 0 && (
                      <span className="text-yellow-400 text-xs">⚔{player.eliminations}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Round End / Game Over */}
        {(phase === 'round-end' || phase === 'game-over') && roundResults && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center max-w-md w-full"
          >
            <h2 className="text-3xl font-bold mb-2" style={{ color: THEME_COLOR }}>
              {phase === 'game-over' ? '🏆 Game Over!' : `Round ${roundNumber} Complete`}
            </h2>

            <div className="mt-6 space-y-3">
              {(phase === 'game-over' ? roundResults.finalResults! : roundResults.rankings).map(
                (result, index) => (
                  <motion.div
                    key={result.oddsId}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className={`flex items-center justify-between p-4 rounded-lg ${
                      index === 0 ? 'bg-fuchsia-500/20 border border-fuchsia-500/50' : 'bg-gray-900'
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
                        {'totalEliminations' in result
                          ? `${result.totalEliminations} elims · ${result.wins} wins`
                          : `${result.eliminations} elims · ${result.survived ? 'Winner' : `#${result.position}`}`}
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
