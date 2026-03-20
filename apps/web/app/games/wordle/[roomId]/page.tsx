'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import WordleBoard from '@/components/wordle/Board';
import Keyboard from '@/components/wordle/Keyboard';
import { isValidWord, getFeedback, getKeyboardState } from '@/lib/wordle';
import { useSessionStore } from '@/lib/store';
import { connectSocket, disconnectSocket } from '@/lib/socket';
import type { LetterFeedback } from '@playarena/shared';

const WORD_LENGTH = 5;
const MAX_ATTEMPTS = 6;

type Phase = 'lobby' | 'countdown' | 'playing' | 'finished';

interface Player {
  sessionId: string;
  username: string;
  isHost: boolean;
}

interface Guess {
  word: string;
  feedback: LetterFeedback[];
}

export default function MultiplayerWordlePage() {
  const params = useParams<{ roomId: string }>();
  const router = useRouter();
  const roomId = params.roomId;
  const session = useSessionStore((s) => s.session);

  const [phase, setPhase] = useState<Phase>('lobby');
  const [players, setPlayers] = useState<Player[]>([]);
  const [countdown, setCountdown] = useState(3);
  const [round, setRound] = useState(1);
  const [totalRounds, setTotalRounds] = useState(3);
  const [timeLeft, setTimeLeft] = useState(120);

  // Game state
  const [guesses, setGuesses] = useState<Guess[]>([]);
  const [currentGuess, setCurrentGuess] = useState('');
  const [shake, setShake] = useState(false);
  const [toast, setToast] = useState('');
  const [gameStatus, setGameStatus] = useState<'playing' | 'won' | 'lost'>('playing');

  // Opponent progress: sessionId → number of guesses + solved
  const [opponents, setOpponents] = useState<
    Record<string, { username: string; guessCount: number; solved: boolean }>
  >({});

  // Chat
  const [messages, setMessages] = useState<Array<{ username: string; text: string; timestamp: number }>>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatOpen, setChatOpen] = useState(false);

  const socketRef = useRef<ReturnType<typeof connectSocket> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string, ms = 1500) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), ms);
  }, []);

  // Redirect if no session
  useEffect(() => {
    if (!session) router.push('/');
  }, [session, router]);

  // Socket connection + event listeners
  useEffect(() => {
    if (!session) return;
    const socket = connectSocket();
    socketRef.current = socket;

    socket.emit('lobby:join-room', { roomId });

    socket.on('lobby:room-joined', ({ room }) => {
      setPlayers(room.players);
    });

    socket.on('lobby:player-joined', ({ player }) => {
      setPlayers((prev) => [...prev.filter((p) => p.sessionId !== player.sessionId), player]);
    });

    socket.on('lobby:player-left', ({ sessionId }) => {
      setPlayers((prev) => prev.filter((p) => p.sessionId !== sessionId));
    });

    socket.on('lobby:room-updated', ({ room }) => {
      setPlayers(room.players);
    });

    socket.on('lobby:game-starting', ({ countdown: c }) => {
      setPhase('countdown');
      setCountdown(c);
      const interval = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    });

    socket.on('wordle:round-start', ({ round: r, totalRounds: tr, timeLimit, wordLength }) => {
      setPhase('playing');
      setRound(r);
      setTotalRounds(tr);
      setTimeLeft(timeLimit);
      setGuesses([]);
      setCurrentGuess('');
      setGameStatus('playing');
      setOpponents({});

      // Start countdown timer
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            if (timerRef.current) clearInterval(timerRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    });

    socket.on('wordle:guess-result', ({ feedback }: { feedback: LetterFeedback[] }) => {
      // Server validates and returns feedback for our guess
      // This is used in multiplayer where server has the word
    });

    socket.on('wordle:opponent-progress', ({ sessionId: sid, username: uname, guessCount, solved }) => {
      setOpponents((prev) => ({ ...prev, [sid]: { username: uname, guessCount, solved } }));
    });

    socket.on('wordle:round-end', ({ results }) => {
      setPhase('finished');
      if (timerRef.current) clearInterval(timerRef.current);
    });

    socket.on('chat:message', (msg) => {
      setMessages((prev) => [...prev.slice(-49), msg]);
    });

    socket.on('lobby:error', ({ message }) => {
      showToast(message, 3000);
    });

    return () => {
      socket.emit('lobby:leave-room', { roomId });
      socket.off('lobby:room-joined');
      socket.off('lobby:player-joined');
      socket.off('lobby:player-left');
      socket.off('lobby:room-updated');
      socket.off('lobby:game-starting');
      socket.off('wordle:round-start');
      socket.off('wordle:guess-result');
      socket.off('wordle:opponent-progress');
      socket.off('wordle:round-end');
      socket.off('chat:message');
      socket.off('lobby:error');
      if (timerRef.current) clearInterval(timerRef.current);
      disconnectSocket();
    };
  }, [roomId, session, showToast]);

  const isHost = players.find((p) => p.sessionId === session?.sessionId)?.isHost ?? false;

  const startGame = () => {
    socketRef.current?.emit('lobby:start-game', { roomId });
  };

  const submitGuess = useCallback(() => {
    if (currentGuess.length !== WORD_LENGTH || gameStatus !== 'playing') return;
    if (!isValidWord(currentGuess)) {
      setShake(true);
      showToast('Not in word list');
      setTimeout(() => setShake(false), 500);
      return;
    }
    // Emit guess to server
    socketRef.current?.emit('wordle:guess', { roomId, word: currentGuess });

    // For now, also run local feedback (will be overridden by server in full impl)
    // In a full multiplayer setup the server sends back feedback
    // This allows the UI to stay responsive
    const newGuesses = [...guesses, { word: currentGuess, feedback: [] as LetterFeedback[] }];
    setGuesses(newGuesses);
    setCurrentGuess('');
  }, [currentGuess, guesses, roomId, gameStatus, showToast]);

  const handleKey = useCallback(
    (key: string) => {
      if (phase !== 'playing' || gameStatus !== 'playing') return;
      if (key === 'enter') {
        submitGuess();
      } else if (key === '⌫' || key === 'backspace') {
        setCurrentGuess((prev) => prev.slice(0, -1));
      } else if (/^[a-z]$/i.test(key) && currentGuess.length < WORD_LENGTH) {
        setCurrentGuess((prev) => prev + key.toLowerCase());
      }
    },
    [phase, gameStatus, currentGuess, submitGuess],
  );

  // Physical keyboard
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Enter') handleKey('enter');
      else if (e.key === 'Backspace') handleKey('backspace');
      else if (/^[a-z]$/i.test(e.key)) handleKey(e.key.toLowerCase());
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleKey]);

  const letterStates = getKeyboardState(guesses.filter((g) => g.feedback.length > 0));

  const sendChat = () => {
    const trimmed = chatInput.trim();
    if (!trimmed || !socketRef.current) return;
    socketRef.current.emit('chat:message', { roomId, text: trimmed });
    setChatInput('');
  };

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  if (!session) return null;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg-primary)' }}>
      {/* Header */}
      <header
        className="w-full flex items-center justify-between px-4 sm:px-6 py-3 border-b"
        style={{ borderColor: 'var(--border-default)' }}
      >
        <Link
          href="/games/wordle"
          className="text-sm font-medium hover:opacity-80 transition-opacity"
          style={{ color: 'var(--text-secondary)' }}
        >
          ← Leave
        </Link>
        <div className="text-center">
          <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>WORDLE</h1>
          {phase === 'playing' && (
            <span className="text-xs" style={{ color: timeLeft <= 30 ? 'var(--accent-red)' : 'var(--text-muted)' }}>
              Round {round}/{totalRounds} · {formatTime(timeLeft)}
            </span>
          )}
        </div>
        <button
          onClick={() => setChatOpen(!chatOpen)}
          className="text-sm px-2 py-1 rounded cursor-pointer"
          style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
        >
          💬
        </button>
      </header>

      {/* Toast */}
      <div className="relative w-full flex justify-center">
        <AnimatePresence>
          {toast && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="absolute top-4 px-4 py-2 rounded-lg text-sm font-bold z-50"
              style={{ background: 'var(--text-primary)', color: 'var(--bg-primary)' }}
            >
              {toast}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex-1 flex">
        {/* Main game area */}
        <div className="flex-1 flex flex-col items-center justify-center gap-6 px-4 py-6">
          {/* ─── Lobby Phase ─── */}
          {phase === 'lobby' && (
            <div className="flex flex-col items-center gap-6">
              <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                Waiting for players...
              </h2>
              <div className="flex flex-wrap gap-3 justify-center">
                {players.map((p) => (
                  <div
                    key={p.sessionId}
                    className="px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2"
                    style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
                  >
                    {p.username}
                    {p.isHost && (
                      <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--accent-purple)', color: '#fff' }}>
                        Host
                      </span>
                    )}
                  </div>
                ))}
              </div>
              {isHost && (
                <button
                  onClick={startGame}
                  disabled={players.length < 1}
                  className="px-6 py-3 rounded-xl font-bold text-base transition-transform hover:scale-105 cursor-pointer disabled:opacity-40"
                  style={{ background: 'var(--accent-purple)', color: '#fff' }}
                >
                  Start Game
                </button>
              )}
              {!isHost && (
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  Waiting for the host to start...
                </p>
              )}
            </div>
          )}

          {/* ─── Countdown Phase ─── */}
          {phase === 'countdown' && (
            <motion.div
              key={countdown}
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 1.5, opacity: 0 }}
              className="text-7xl font-black"
              style={{ color: 'var(--accent-purple)' }}
            >
              {countdown > 0 ? countdown : 'GO!'}
            </motion.div>
          )}

          {/* ─── Playing Phase ─── */}
          {phase === 'playing' && (
            <>
              <WordleBoard
                guesses={guesses}
                currentGuess={currentGuess}
                maxAttempts={MAX_ATTEMPTS}
                wordLength={WORD_LENGTH}
                shake={shake}
              />
              <Keyboard letterStates={letterStates} onKey={handleKey} disabled={gameStatus !== 'playing'} />
            </>
          )}

          {/* ─── Finished Phase ─── */}
          {phase === 'finished' && (
            <div className="flex flex-col items-center gap-4">
              <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Round Over!</h2>
              <div className="flex gap-3 mt-4">
                <Link
                  href="/games/wordle"
                  className="px-5 py-2.5 rounded-lg font-semibold text-sm"
                  style={{ background: 'var(--accent-purple)', color: '#fff' }}
                >
                  Back to Lobby
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Opponents sidebar (playing phase) */}
        {phase === 'playing' && Object.keys(opponents).length > 0 && (
          <aside
            className="hidden md:flex flex-col gap-3 p-4 w-52 border-l"
            style={{ borderColor: 'var(--border-default)' }}
          >
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-muted)' }}>Opponents</h3>
            {Object.entries(opponents).map(([sid, opp]) => (
              <div key={sid} className="flex items-center justify-between text-sm">
                <span style={{ color: 'var(--text-primary)' }}>{opp.username}</span>
                <span style={{ color: opp.solved ? 'var(--wordle-correct)' : 'var(--text-muted)' }}>
                  {opp.solved ? '✓' : `${opp.guessCount}/6`}
                </span>
              </div>
            ))}
          </aside>
        )}

        {/* Chat panel */}
        {chatOpen && (
          <aside
            className="flex flex-col w-64 border-l"
            style={{ borderColor: 'var(--border-default)', background: 'var(--bg-secondary)' }}
          >
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {messages.map((msg, i) => (
                <div key={i} className="text-xs">
                  <span className="font-semibold" style={{ color: 'var(--accent-purple)' }}>{msg.username}: </span>
                  <span style={{ color: 'var(--text-secondary)' }}>{msg.text}</span>
                </div>
              ))}
              {messages.length === 0 && (
                <p className="text-xs text-center" style={{ color: 'var(--text-muted)' }}>No messages yet</p>
              )}
            </div>
            <div className="flex gap-1 p-2 border-t" style={{ borderColor: 'var(--border-default)' }}>
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendChat()}
                maxLength={200}
                placeholder="Type..."
                className="flex-1 px-2 py-1.5 rounded text-xs outline-none"
                style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
              />
              <button
                onClick={sendChat}
                className="px-2 py-1.5 rounded text-xs font-semibold cursor-pointer"
                style={{ background: 'var(--accent-purple)', color: '#fff' }}
              >
                ↵
              </button>
            </div>
          </aside>
        )}
      </div>

      <footer className="py-3 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
        Built with 💜 by Dharaa Singh
      </footer>
    </div>
  );
}
