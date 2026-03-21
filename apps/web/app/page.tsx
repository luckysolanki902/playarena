'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { validateUsername } from '@playarena/shared';
import { useSessionStore } from '@/lib/store';

const GAMES = [
  {
    id: 'wordle',
    name: 'Wordle',
    description: '5 letters, 6 guesses, real-time duels',
    emoji: '🔤',
    color: 'from-green-500 to-emerald-600',
    ready: true,
  },
  {
    id: 'scribble',
    name: 'Scribble',
    description: 'Draw, guess, and laugh together',
    emoji: '🎨',
    color: 'from-purple-500 to-pink-500',
    ready: false,
  },
  {
    id: 'typeracer',
    name: 'TypeRacer',
    description: 'Race to type the fastest',
    emoji: '⌨️',
    color: 'from-blue-500 to-cyan-500',
    ready: false,
  },
  {
    id: 'trivia',
    name: 'Trivia',
    description: 'Test your knowledge against others',
    emoji: '🧠',
    color: 'from-yellow-500 to-orange-500',
    ready: false,
  },
];

export default function Home() {
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const { session, createSession } = useSessionStore();

  const handlePlay = async () => {
    const result = validateUsername(username);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError('');
    await createSession(username.trim());
  };

  return (
    <main className="min-h-screen flex flex-col">
      {/* Navbar */}
      <nav className="fixed top-0 w-full z-50 border-b backdrop-blur-md"
        style={{ borderColor: 'var(--border-default)', background: 'rgba(10,10,15,0.8)' }}>
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <span className="text-xl font-bold tracking-tight" style={{ fontFamily: "'Space Grotesk', system-ui" }}>
            🎮 PlayArena
          </span>
          {session && (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
                style={{ background: 'var(--accent-purple)' }}>
                {session.username[0].toUpperCase()}
              </div>
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                {session.username}
              </span>
            </div>
          )}
        </div>
      </nav>

      {/* Hero */}
      <section className="flex-1 flex flex-col items-center justify-center px-4 pt-24 pb-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center max-w-2xl"
        >
          <h1
            className="text-5xl md:text-6xl font-bold tracking-tight mb-4"
            style={{ fontFamily: "'Space Grotesk', system-ui" }}
          >
            <span className="bg-gradient-to-r from-purple-500 to-blue-500 bg-clip-text text-transparent">
              PlayArena
            </span>
          </h1>
          <p className="text-lg md:text-xl mb-8" style={{ color: 'var(--text-secondary)' }}>
            Real-time multiplayer games. No sign-up. Just play.
          </p>

          {/* Username Entry */}
          {!session ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="flex flex-col sm:flex-row gap-3 justify-center items-center max-w-md mx-auto"
            >
              <input
                type="text"
                value={username}
                onChange={(e) => { setUsername(e.target.value); setError(''); }}
                onKeyDown={(e) => e.key === 'Enter' && handlePlay()}
                placeholder="Pick a username..."
                maxLength={16}
                className="w-full sm:w-64 h-12 px-4 rounded-xl text-base outline-none transition-all"
                style={{
                  background: 'var(--bg-tertiary)',
                  border: `1px solid ${error ? 'var(--accent-red)' : 'var(--border-default)'}`,
                  color: 'var(--text-primary)',
                }}
              />
              <button
                onClick={handlePlay}
                className="w-full sm:w-auto h-12 px-8 rounded-xl font-semibold text-white transition-all hover:brightness-110 active:scale-[0.97] cursor-pointer"
                style={{ background: 'var(--accent-purple)' }}
              >
                Play Now →
              </button>
            </motion.div>
          ) : (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-lg font-medium"
              style={{ color: 'var(--accent-green)' }}
            >
              Welcome, {session.username}! Pick a game below.
            </motion.p>
          )}
          {error && (
            <p className="mt-2 text-sm" style={{ color: 'var(--accent-red)' }}>{error}</p>
          )}
        </motion.div>

        {/* Game Grid */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.5 }}
          className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-12 max-w-2xl w-full px-4"
        >
          {GAMES.map((game, i) => (
            <motion.div
              key={game.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 + i * 0.1 }}
              whileHover={game.ready && session ? { scale: 1.02, y: -2 } : {}}
              className={`relative rounded-2xl p-6 border transition-all ${
                game.ready && session
                  ? 'cursor-pointer hover:border-purple-500/50'
                  : 'opacity-60'
              }`}
              style={{
                background: 'var(--bg-secondary)',
                borderColor: 'var(--border-default)',
              }}
              onClick={() => {
                if (game.ready && session) {
                  window.location.href = `/games/${game.id}`;
                }
              }}
            >
              <div className="flex items-start gap-4">
                <div
                  className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl bg-gradient-to-br ${game.color}`}
                >
                  {game.emoji}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold">{game.name}</h3>
                    {!game.ready && (
                      <span
                        className="text-xs px-2 py-0.5 rounded-md font-medium"
                        style={{ background: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}
                      >
                        Soon
                      </span>
                    )}
                  </div>
                  <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                    {game.description}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </section>

    </main>
  );
}
