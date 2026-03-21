'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { io, Socket } from 'socket.io-client';

interface RoomInfo {
  id: string;
  visibility: 'public' | 'private';
}

const THEME_COLOR = '#e879f9';

export default function OrbitBrawlLobby() {
  const router = useRouter();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const newSocket = io(process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3001');
    setSocket(newSocket);

    newSocket.on('room:created', (room: RoomInfo) => {
      router.push(`/games/orbitbrawl/${room.id}`);
    });

    newSocket.on('room:joined', (room: RoomInfo) => {
      router.push(`/games/orbitbrawl/${room.id}`);
    });

    newSocket.on('error', (message: string) => {
      setError(message);
      setIsConnecting(false);
    });

    return () => {
      newSocket.disconnect();
    };
  }, [router]);

  const handleQuickMatch = () => {
    if (!socket) return;
    setIsConnecting(true);
    setError('');
    socket.emit('room:quick-match', { gameType: 'orbitbrawl' });
  };

  const handleCreateRoom = (visibility: 'public' | 'private') => {
    if (!socket) return;
    setIsConnecting(true);
    setError('');
    socket.emit('room:create', { gameType: 'orbitbrawl', visibility });
  };

  const handleJoinByCode = () => {
    if (!socket || !joinCode.trim()) return;
    setIsConnecting(true);
    setError('');
    socket.emit('room:join', { roomId: joinCode.trim().toUpperCase() });
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Background with orbital effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full opacity-10"
          style={{ 
            backgroundColor: THEME_COLOR,
            boxShadow: `0 0 100px 50px ${THEME_COLOR}50`,
          }}
        />
        {/* Orbiting circles */}
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px]"
        >
          <div
            className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full opacity-30"
            style={{ backgroundColor: THEME_COLOR }}
          />
        </motion.div>
        <motion.div
          animate={{ rotate: -360 }}
          transition={{ duration: 15, repeat: Infinity, ease: 'linear' }}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[350px] h-[350px]"
        >
          <div
            className="absolute top-0 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full opacity-20"
            style={{ backgroundColor: '#8b5cf6' }}
          />
        </motion.div>
      </div>

      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen p-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          {/* Header */}
          <div className="text-center mb-10">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="text-6xl mb-4"
            >
              🌀
            </motion.div>
            <h1 className="text-4xl font-bold mb-2" style={{ color: THEME_COLOR }}>
              Orbit Brawl
            </h1>
            <p className="text-gray-400">Push opponents off the arena with magnetic force!</p>
          </div>

          {/* Error display */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6 p-4 bg-red-500/20 border border-red-500/50 rounded-lg text-red-200 text-center"
            >
              {error}
            </motion.div>
          )}

          {/* Actions */}
          <div className="space-y-4">
            {/* Quick Match */}
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleQuickMatch}
              disabled={isConnecting}
              className="w-full py-4 rounded-xl font-bold text-lg text-black transition-all disabled:opacity-50"
              style={{ backgroundColor: THEME_COLOR }}
            >
              {isConnecting ? 'Connecting...' : '🌀 Quick Match'}
            </motion.button>

            <div className="flex gap-3">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => handleCreateRoom('public')}
                disabled={isConnecting}
                className="flex-1 py-3 rounded-xl font-semibold border-2 transition-all disabled:opacity-50"
                style={{ borderColor: THEME_COLOR, color: THEME_COLOR }}
              >
                Public Room
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => handleCreateRoom('private')}
                disabled={isConnecting}
                className="flex-1 py-3 rounded-xl font-semibold border-2 transition-all disabled:opacity-50"
                style={{ borderColor: THEME_COLOR, color: THEME_COLOR }}
              >
                Private Room
              </motion.button>
            </div>

            {/* Join by Code */}
            <div className="pt-4 border-t border-gray-800">
              <p className="text-sm text-gray-500 mb-3 text-center">Or join with a code</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="ROOM CODE"
                  maxLength={6}
                  className="flex-1 px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-center font-mono text-lg tracking-wider focus:outline-none focus:border-fuchsia-500"
                />
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleJoinByCode}
                  disabled={isConnecting || !joinCode.trim()}
                  className="px-6 py-3 rounded-lg font-semibold transition-all disabled:opacity-50"
                  style={{ backgroundColor: THEME_COLOR, color: 'black' }}
                >
                  Join
                </motion.button>
              </div>
            </div>
          </div>

          {/* How to Play */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="mt-10 p-5 bg-gray-900/50 rounded-xl border border-gray-800"
          >
            <h3 className="font-bold mb-3" style={{ color: THEME_COLOR }}>How to Play</h3>
            <ul className="text-sm text-gray-400 space-y-2">
              <li className="flex items-start gap-2">
                <span style={{ color: THEME_COLOR }}>🔵</span>
                <span>Hold left-click to charge PUSH force</span>
              </li>
              <li className="flex items-start gap-2">
                <span style={{ color: THEME_COLOR }}>🟣</span>
                <span>Hold right-click to charge PULL force</span>
              </li>
              <li className="flex items-start gap-2">
                <span style={{ color: THEME_COLOR }}>💨</span>
                <span>Release to unleash magnetic wave</span>
              </li>
              <li className="flex items-start gap-2">
                <span style={{ color: THEME_COLOR }}>⚡</span>
                <span>Longer charge = stronger force</span>
              </li>
              <li className="flex items-start gap-2">
                <span style={{ color: THEME_COLOR }}>🏆</span>
                <span>Last player in the arena wins!</span>
              </li>
            </ul>
          </motion.div>

          {/* Back to Home */}
          <motion.button
            whileHover={{ scale: 1.02 }}
            onClick={() => router.push('/')}
            className="w-full mt-6 py-3 text-gray-500 hover:text-gray-300 transition-colors"
          >
            ← Back to Games
          </motion.button>
        </motion.div>
      </div>
    </div>
  );
}
