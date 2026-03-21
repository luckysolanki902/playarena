'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useParams, useRouter } from 'next/navigation';
import type { Socket } from 'socket.io-client';
import { connectSocket, disconnectSocket } from '@/lib/socket';
import { useSessionStore } from '@/lib/store';
import {
  GlitchArenaPlayer,
  GlitchButton,
  GlitchEffect,
  GlitchArenaTickEvent,
  GlitchArenaRoundStartEvent,
  GlitchArenaButtonSpawnEvent,
  GlitchArenaButtonHitEvent,
  GlitchArenaRoundEndEvent,
  GlitchArenaSettings,
  DEFAULT_GLITCH_ARENA_SETTINGS,
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

const THEME_COLOR = '#fb923c';

type GamePhase = 'lobby' | 'countdown' | 'playing' | 'round-end' | 'game-over';

interface HitEffect {
  id: string;
  position: { x: number; y: number };
  points: number;
  color: string;
}

export default function GlitchArenaRoom() {
  const params = useParams();
  const router = useRouter();
  const roomId = params.roomId as string;
  const session = useSessionStore((s) => s.session);

  const [socket, setSocket] = useState<Socket | null>(null);
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [phase, setPhase] = useState<GamePhase>('lobby');
  const [countdown, setCountdown] = useState(3);
  const [roundNumber, setRoundNumber] = useState(0);
  const [players, setPlayers] = useState<Record<string, GlitchArenaPlayer>>({});
  const [settings, setSettings] = useState<GlitchArenaSettings>(DEFAULT_GLITCH_ARENA_SETTINGS);
  const [buttons, setButtons] = useState<GlitchButton[]>([]);
  const [activeEffects, setActiveEffects] = useState<GlitchEffect[]>([]);
  const [timeRemaining, setTimeRemaining] = useState(45);
  const [hitEffects, setHitEffects] = useState<HitEffect[]>([]);
  const [roundResults, setRoundResults] = useState<GlitchArenaRoundEndEvent | null>(null);
  const [playerNames, setPlayerNames] = useState<Record<string, string>>({});
  const [autoStartTimer, setAutoStartTimer] = useState<number | null>(null);
  const [screenShake, setScreenShake] = useState(false);
  const [screenInvert, setScreenInvert] = useState(false);
  const [screenBlur, setScreenBlur] = useState(false);

  const arenaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!session) {
      router.push('/games/glitcharena');
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

    newSocket.on('glitcharena:round-start', (data: GlitchArenaRoundStartEvent) => {
      setRoundNumber(data.roundNumber);
      setPlayers(data.players);
      setSettings(data.settings);
      setButtons([]);
      setActiveEffects([]);
      setTimeRemaining(data.roundDuration);
      setHitEffects([]);
      setPhase('playing');
    });

    newSocket.on('glitcharena:tick', (data: GlitchArenaTickEvent) => {
      setPlayers(data.players);
      setButtons(data.buttons.filter((b) => !b.hitBy));
      setActiveEffects(data.activeEffects);
      setTimeRemaining(data.timeRemaining);

      // Handle glitch effects
      data.activeEffects.forEach((effect) => {
        if (effect.type === 'shake') setScreenShake(true);
        if (effect.type === 'invert') setScreenInvert(true);
        if (effect.type === 'blur') setScreenBlur(true);
      });

      // Clear effects when not active
      if (!data.activeEffects.find((e) => e.type === 'shake')) setScreenShake(false);
      if (!data.activeEffects.find((e) => e.type === 'invert')) setScreenInvert(false);
      if (!data.activeEffects.find((e) => e.type === 'blur')) setScreenBlur(false);
    });

    newSocket.on('glitcharena:button-spawn', (data: GlitchArenaButtonSpawnEvent) => {
      setButtons((prev) => [...prev, data.button]);
    });

    newSocket.on('glitcharena:button-hit', (data: GlitchArenaButtonHitEvent) => {
      // Remove button from display
      setButtons((prev) => prev.filter((b) => b.id !== data.buttonId));

      // Add hit effect
      const hitButton = buttons.find((b) => b.id === data.buttonId);
      if (hitButton) {
        const effect: HitEffect = {
          id: data.buttonId,
          position: hitButton.position,
          points: data.points + data.comboBonus,
          color: data.points < 0 ? '#ef4444' : THEME_COLOR,
        };
        setHitEffects((prev) => [...prev, effect]);

        setTimeout(() => {
          setHitEffects((prev) => prev.filter((e) => e.id !== effect.id));
        }, 800);
      }
    });

    newSocket.on('glitcharena:button-expired', ({ buttonId }: { buttonId: string }) => {
      setButtons((prev) => prev.filter((b) => b.id !== buttonId));
    });

    newSocket.on('glitcharena:glitch', ({ effect }: { effect: GlitchEffect }) => {
      if (effect.type === 'shake') {
        setScreenShake(true);
        setTimeout(() => setScreenShake(false), effect.duration);
      }
      if (effect.type === 'invert') {
        setScreenInvert(true);
        setTimeout(() => setScreenInvert(false), effect.duration);
      }
      if (effect.type === 'blur') {
        setScreenBlur(true);
        setTimeout(() => setScreenBlur(false), effect.duration);
      }
      if (effect.type === 'flash') {
        // Flash effect handled via CSS animation
      }
    });

    newSocket.on('glitcharena:round-end', (data: GlitchArenaRoundEndEvent) => {
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

  const handleButtonClick = useCallback(
    (buttonId: string) => {
      if (!socket || phase !== 'playing') return;
      socket.emit('glitcharena:click', { roomId, buttonId });
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
    router.push('/games/glitcharena');
  };

  const myPlayer = session?.sessionId ? players[session.sessionId] : null;
  const isHost = session?.sessionId && room?.hostSessionId === session.sessionId;

  // Arena classes for glitch effects
  const arenaClasses = [
    'relative rounded-lg overflow-hidden',
    screenShake ? 'animate-shake' : '',
    screenInvert ? 'invert' : '',
    screenBlur ? 'blur-sm' : '',
  ].join(' ');

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* Shake animation style */}
      <style jsx global>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
          20%, 40%, 60%, 80% { transform: translateX(5px); }
        }
        .animate-shake {
          animation: shake 0.5s ease-in-out;
        }
      `}</style>

      {/* Header */}
      <div className="p-4 border-b border-gray-800 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <span className="text-2xl">⚡</span>
          <span className="font-bold text-lg" style={{ color: THEME_COLOR }}>
            Glitch Arena
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
              Time <span className="text-white font-bold">{timeRemaining}s</span>
            </span>
            {myPlayer && (
              <>
                <span className="text-gray-400">
                  Score <span style={{ color: THEME_COLOR }} className="font-bold">{myPlayer.oddsScore}</span>
                </span>
                {myPlayer.comboCount > 1 && (
                  <span className="text-yellow-400 font-bold">
                    {myPlayer.comboCount}x COMBO!
                  </span>
                )}
              </>
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
                    <span className="text-xs text-orange-500">Host</span>
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
          <div className="flex gap-6">
            {/* Game Arena */}
            <div
              ref={arenaRef}
              className={arenaClasses}
              style={{
                width: settings.arenaWidth,
                height: settings.arenaHeight,
                backgroundColor: '#0a0a0f',
                border: `2px solid ${THEME_COLOR}`,
              }}
            >
              {/* Grid pattern */}
              <div
                className="absolute inset-0 opacity-10"
                style={{
                  backgroundImage: `
                    linear-gradient(to right, ${THEME_COLOR} 1px, transparent 1px),
                    linear-gradient(to bottom, ${THEME_COLOR} 1px, transparent 1px)
                  `,
                  backgroundSize: '50px 50px',
                }}
              />

              {/* Buttons */}
              <AnimatePresence>
                {buttons.map((button) => (
                  <motion.button
                    key={button.id}
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => handleButtonClick(button.id)}
                    className="absolute rounded-full flex items-center justify-center font-bold text-2xl shadow-lg transition-all cursor-pointer"
                    style={{
                      left: button.position.x - button.size,
                      top: button.position.y - button.size,
                      width: button.size * 2,
                      height: button.size * 2,
                      backgroundColor: button.color,
                      boxShadow: `0 0 20px ${button.color}50`,
                    }}
                  >
                    {button.symbol}
                  </motion.button>
                ))}
              </AnimatePresence>

              {/* Hit effects */}
              <AnimatePresence>
                {hitEffects.map((effect) => (
                  <motion.div
                    key={effect.id}
                    initial={{ opacity: 1, y: 0, scale: 1 }}
                    animate={{ opacity: 0, y: -40, scale: 1.5 }}
                    exit={{ opacity: 0 }}
                    className="absolute pointer-events-none font-bold text-2xl"
                    style={{
                      left: effect.position.x,
                      top: effect.position.y,
                      color: effect.color,
                    }}
                  >
                    {effect.points > 0 ? '+' : ''}{effect.points}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            {/* Scoreboard */}
            <div className="bg-gray-900/80 rounded-lg p-4 min-w-[200px]">
              <h3 className="font-bold mb-4 text-center" style={{ color: THEME_COLOR }}>
                Scores
              </h3>
              <div className="space-y-3">
                {Object.values(players)
                  .sort((a, b) => b.oddsScore - a.oddsScore)
                  .map((player, i) => (
                    <div
                      key={player.oddsId}
                      className="flex justify-between items-center gap-4 p-2 rounded bg-gray-800/50"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : ''}</span>
                        <div
                          className="w-6 h-6 rounded-full"
                          style={{ backgroundColor: player.oddsColor }}
                        />
                        <span className="truncate max-w-[80px]">
                          {playerNames[player.oddsId] || 'Player'}
                        </span>
                      </div>
                      <div className="text-right">
                        <div className="font-bold" style={{ color: player.oddsColor }}>
                          {player.oddsScore}
                        </div>
                        <div className="text-xs text-gray-500">
                          {player.hits} hits
                        </div>
                      </div>
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
              {(phase === 'game-over' ? roundResults.finalResults! : roundResults.results).map(
                (result, index) => (
                  <motion.div
                    key={result.oddsId}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className={`flex items-center justify-between p-4 rounded-lg ${
                      index === 0 ? 'bg-orange-500/20 border border-orange-500/50' : 'bg-gray-900'
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
                          ? `${result.totalHits} hits · ${result.bestCombo}x combo`
                          : `${result.hits} hits · ${result.maxCombo}x combo`}
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
