'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useSessionStore } from '@/lib/store';
import Link from 'next/link';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface PublicRoom {
  id: string;
  name: string;
  hostUsername: string;
  status: string;
  players: number;
  maxPlayers: number;
}

export default function WordleLobby() {
  const { session, token } = useSessionStore();
  const [rooms, setRooms] = useState<PublicRoom[]>([]);
  const [roomName, setRoomName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [error, setError] = useState('');

  const fetchRooms = async () => {
    try {
      const res = await fetch(`${API}/rooms?game=wordle`);
      const data = await res.json();
      setRooms(data.rooms || []);
    } catch {
      // ignore
    }
  };

  // Fetch rooms on mount
  useState(() => { fetchRooms(); });

  const createRoom = async (visibility: 'public' | 'private') => {
    if (!token) return;
    setCreating(true);
    setError('');
    try {
      const res = await fetch(`${API}/rooms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          game: 'wordle',
          name: roomName || `${session?.username}'s room`,
          visibility,
          maxPlayers: 4,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.message || 'Failed to create room');
        return;
      }
      const data = await res.json();
      window.location.href = `/games/wordle/${data.id}`;
    } catch {
      setError('Network error');
    } finally {
      setCreating(false);
    }
  };

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-primary)' }}>
        <div className="text-center">
          <p className="text-lg mb-4" style={{ color: 'var(--text-secondary)' }}>
            You need a username to play.
          </p>
          <Link
            href="/"
            className="inline-block px-6 py-3 rounded-xl font-semibold text-white"
            style={{ background: 'var(--accent-purple)' }}
          >
            ← Go back & pick a name
          </Link>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen" style={{ background: 'var(--bg-primary)' }}>
      {/* Header */}
      <nav className="fixed top-0 w-full z-50 border-b backdrop-blur-md"
        style={{ borderColor: 'var(--border-default)', background: 'rgba(10,10,15,0.8)' }}>
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-sm" style={{ color: 'var(--text-muted)' }}>
              ← Home
            </Link>
            <span style={{ color: 'var(--text-muted)' }}>/</span>
            <span className="text-lg font-bold" style={{ fontFamily: "'Space Grotesk', system-ui" }}>
              🔤 Wordle
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
              style={{ background: 'var(--accent-purple)' }}>
              {session.username[0].toUpperCase()}
            </div>
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              {session.username}
            </span>
          </div>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-4 pt-24 pb-12">
        {/* Actions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8"
        >
          <button
            onClick={() => createRoom('public')}
            disabled={creating}
            className="h-14 rounded-xl font-semibold text-white transition-all hover:brightness-110 active:scale-[0.97] cursor-pointer disabled:opacity-50"
            style={{ background: 'var(--accent-purple)' }}
          >
            ⚡ Quick Match
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="h-14 rounded-xl font-semibold transition-all hover:brightness-110 active:scale-[0.97] cursor-pointer"
            style={{
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-default)',
              color: 'var(--text-primary)',
            }}
          >
            + Create Room
          </button>
          <button
            onClick={() => setShowJoin(true)}
            className="h-14 rounded-xl font-semibold transition-all hover:brightness-110 active:scale-[0.97] cursor-pointer"
            style={{
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-default)',
              color: 'var(--text-primary)',
            }}
          >
            🔗 Join Room
          </button>
        </motion.div>

        {error && (
          <p className="text-sm mb-4 text-center" style={{ color: 'var(--accent-red)' }}>{error}</p>
        )}

        {/* Create Room Modal */}
        {showCreate && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mb-6 p-6 rounded-2xl border"
            style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-default)' }}
          >
            <h3 className="text-lg font-semibold mb-4">Create a Room</h3>
            <input
              type="text"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              placeholder="Room name (optional)"
              maxLength={32}
              className="w-full h-11 px-4 rounded-xl text-base outline-none mb-3"
              style={{
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-default)',
                color: 'var(--text-primary)',
              }}
            />
            <div className="flex gap-3">
              <button
                onClick={() => createRoom('public')}
                disabled={creating}
                className="flex-1 h-11 rounded-xl font-semibold text-white cursor-pointer"
                style={{ background: 'var(--accent-purple)' }}
              >
                Public Room
              </button>
              <button
                onClick={() => createRoom('private')}
                disabled={creating}
                className="flex-1 h-11 rounded-xl font-semibold text-white cursor-pointer"
                style={{ background: 'var(--accent-blue)' }}
              >
                Private Room
              </button>
              <button
                onClick={() => setShowCreate(false)}
                className="h-11 px-4 rounded-xl cursor-pointer"
                style={{ color: 'var(--text-muted)' }}
              >
                Cancel
              </button>
            </div>
          </motion.div>
        )}

        {/* Join Room Modal */}
        {showJoin && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mb-6 p-6 rounded-2xl border"
            style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-default)' }}
          >
            <h3 className="text-lg font-semibold mb-4">Join with Code</h3>
            <div className="flex gap-3">
              <input
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="Enter room code..."
                maxLength={6}
                className="flex-1 h-11 px-4 rounded-xl text-base outline-none uppercase tracking-widest text-center font-mono"
                style={{
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-default)',
                  color: 'var(--text-primary)',
                }}
              />
              <button
                onClick={() => {
                  if (joinCode.length === 6) {
                    window.location.href = `/games/wordle/join?code=${joinCode}`;
                  }
                }}
                className="h-11 px-6 rounded-xl font-semibold text-white cursor-pointer"
                style={{ background: 'var(--accent-green)' }}
              >
                Join
              </button>
              <button
                onClick={() => setShowJoin(false)}
                className="h-11 px-4 rounded-xl cursor-pointer"
                style={{ color: 'var(--text-muted)' }}
              >
                Cancel
              </button>
            </div>
          </motion.div>
        )}

        {/* Solo Play */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-8 p-6 rounded-2xl border"
          style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-default)' }}
        >
          <h3 className="text-lg font-semibold mb-2">🎯 Solo Play</h3>
          <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
            Practice on your own or challenge the bot.
          </p>
          <div className="flex gap-3">
            <Link
              href="/games/wordle/solo"
              className="flex-1 h-11 rounded-xl font-semibold text-white flex items-center justify-center transition-all hover:brightness-110"
              style={{ background: 'var(--accent-green)' }}
            >
              Play Solo
            </Link>
          </div>
        </motion.div>

        {/* Public Rooms */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">🌐 Public Rooms</h3>
            <button
              onClick={fetchRooms}
              className="text-sm px-3 py-1 rounded-lg cursor-pointer"
              style={{ color: 'var(--accent-purple)', background: 'var(--bg-tertiary)' }}
            >
              Refresh
            </button>
          </div>
          {rooms.length === 0 ? (
            <div
              className="text-center py-12 rounded-2xl border"
              style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-default)' }}
            >
              <p className="text-3xl mb-3">🎮</p>
              <p style={{ color: 'var(--text-muted)' }}>No public rooms yet. Create one!</p>
            </div>
          ) : (
            <div className="space-y-2">
              {rooms.map((room) => (
                <div
                  key={room.id}
                  className="flex items-center justify-between p-4 rounded-xl border transition-all hover:border-purple-500/30 cursor-pointer"
                  style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-default)' }}
                  onClick={() => { window.location.href = `/games/wordle/${room.id}`; }}
                >
                  <div>
                    <p className="font-medium">{room.name}</p>
                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                      Host: {room.hostUsername}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm px-2 py-1 rounded-lg"
                      style={{
                        background: room.status === 'waiting' ? 'rgba(34,197,94,0.15)' : 'rgba(234,179,8,0.15)',
                        color: room.status === 'waiting' ? 'var(--accent-green)' : 'var(--accent-yellow)',
                      }}>
                      {room.status === 'waiting' ? 'Waiting' : 'In Game'}
                    </span>
                    <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                      {room.players}/{room.maxPlayers}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </main>
  );
}
