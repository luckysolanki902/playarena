'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { io, Socket } from 'socket.io-client';

interface RoomInfo {
  id: string;
  visibility: 'public' | 'private';
}

const THEME_COLOR = '#fb923c';

export default function GlitchArenaLobby() {
  const router = useRouter();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const newSocket = io(process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3001');
    setSocket(newSocket);

    newSocket.on('room:created', (room: RoomInfo) => {
      router.push(`/games/glitcharena/${room.id}`);
    });

    newSocket.on('room:joined', (room: RoomInfo) => {
      router.push(`/games/glitcharena/${room.id}`);
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
    socket.emit('room:quick-match', { gameType: 'glitcharena' });
  };

  const handleCreateRoom = (visibility: 'public' | 'private') => {
    if (!socket) return;
    setIsConnecting(true);
    setError('');
    socket.emit('room:create', { gameType: 'glitcharena', visibility });
  };

  const handleJoinByCode = () => {
    if (!socket || !joinCode.trim()) return;
    setIsConnecting(true);
    setError('');
    socket.emit('room:join', { roomId: joinCode.trim().toUpperCase() });
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Background with glitch effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full blur-3xl opacity-15"
          style={{ backgroundColor: THEME_COLOR }}
        />
        <div
          className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full blur-3xl opacity-10"
          style={{ backgroundColor: '#a855f7' }}
        />
        {/* Glitch lines */}
        <motion.div
          animate={{
            x: [0, 100, -50, 0],
            opacity: [0.1, 0.3, 0.1, 0.1],
          }}
          transition={{ duration: 3, repeat: Infinity }}
          className="absolute top-1/3 left-0 right-0 h-1"
          style={{ backgroundColor: THEME_COLOR }}
        />
        <motion.div
          animate={{
            x: [0, -80, 60, 0],
            opacity: [0.1, 0.2, 0.1, 0.1],
          }}
          transition={{ duration: 2.5, repeat: Infinity, delay: 0.5 }}
          className="absolute top-2/3 left-0 right-0 h-0.5"
          style={{ backgroundColor: '#a855f7' }}
        />
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
              ⚡
            </motion.div>
            <h1 className="text-4xl font-bold mb-2" style={{ color: THEME_COLOR }}>
              Glitch Arena
            </h1>
            <p className="text-gray-400">Chaos button madness! Click fast, avoid traps!</p>
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
              {isConnecting ? 'Connecting...' : '⚡ Quick Match'}
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
                  className="flex-1 px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-center font-mono text-lg tracking-wider focus:outline-none focus:border-orange-500"
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
                <span className="text-green-400">●</span>
                <span>Click green buttons for points</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-yellow-400">★</span>
                <span>Yellow bonus buttons give extra points</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-red-400">✖</span>
                <span>Avoid red trap buttons - they cost points!</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-400">◆</span>
                <span>Purple chaos buttons trigger glitch effects!</span>
              </li>
              <li className="flex items-start gap-2">
                <span style={{ color: THEME_COLOR }}>🔥</span>
                <span>Build combos for bonus multipliers</span>
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
