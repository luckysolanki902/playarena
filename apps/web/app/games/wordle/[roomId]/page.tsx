'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import WordleBoard from '@/components/wordle/Board';
import Keyboard from '@/components/wordle/Keyboard';
import { isValidWord, getKeyboardState } from '@/lib/wordle';
import { useSessionStore } from '@/lib/store';
import { connectSocket, disconnectSocket } from '@/lib/socket';
import type { LetterFeedback } from '@playarena/shared';

const WORD_LENGTH = 5;
const MAX_ATTEMPTS = 6;

type Phase = 'lobby' | 'countdown' | 'playing' | 'round-end' | 'game-end';

interface Player {
  sessionId: string;
  username: string;
  isHost: boolean;
}

interface Guess {
  word: string;
  feedback: LetterFeedback[];
}

interface RoundResult {
  word: string;
  rankings: Array<{ sessionId: string; username: string; score: number }>;
  nextRoundIn: number;
}

interface FinalRanking {
  sessionId: string;
  username: string;
  totalScore: number;
  rating: number;
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
  const [pendingWord, setPendingWord] = useState<string | null>(null);
  const [currentGuess, setCurrentGuess] = useState('');
  const [shake, setShake] = useState(false);
  const [toast, setToast] = useState('');
  const [solved, setSolved] = useState(false);

  // Round/game results
  const [roundResult, setRoundResult] = useState<RoundResult | null>(null);
  const [finalRankings, setFinalRankings] = useState<FinalRanking[]>([]);

  // Opponent progress
  const [opponents, setOpponents] = useState<
    Record<string, { username: string; guessCount: number; solved: boolean; feedbacks: LetterFeedback[][] }>
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

  useEffect(() => {
    if (!session) router.push('/');
  }, [session, router]);

  // Socket connection
  useEffect(() => {
    if (!session) return;
    const socket = connectSocket();
    socketRef.current = socket;

    socket.emit('lobby:join-room', { roomId });

    // ─── Lobby ───
    socket.on('lobby:room-joined', ({ room }) => setPlayers(room.players));
    socket.on('lobby:player-joined', ({ player }) => {
      setPlayers((prev) => [...prev.filter((p) => p.sessionId !== player.sessionId), player]);
    });
    socket.on('lobby:player-left', ({ sessionId: sid }) => {
      setPlayers((prev) => prev.filter((p) => p.sessionId !== sid));
    });
    socket.on('lobby:room-updated', ({ room }) => setPlayers(room.players));

    socket.on('lobby:game-starting', ({ countdown: c }) => {
      setPhase('countdown');
      setCountdown(c);
      const interval = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) { clearInterval(interval); return 0; }
          return prev - 1;
        });
      }, 1000);
    });

    // ─── Round lifecycle ───
    socket.on('wordle:round-start', ({ round: r, totalRounds: tr, timeLimit }) => {
      setPhase('playing');
      setRound(r);
      setTotalRounds(tr);
      setTimeLeft(timeLimit);
      setGuesses([]);
      setPendingWord(null);
      setCurrentGuess('');
      setSolved(false);
      setOpponents({});
      setRoundResult(null);

      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) { if (timerRef.current) clearInterval(timerRef.current); return 0; }
          return prev - 1;
        });
      }, 1000);
    });

    // ─── Our guess result from server ───
    socket.on('wordle:guess-result', ({ word, feedback, attempt }: { word: string; feedback: LetterFeedback[]; attempt: number }) => {
      setGuesses((prev) => {
        // Replace pending placeholder or append
        const existing = prev.find((g) => g.word === word && g.feedback.length === 0);
        if (existing) {
          return prev.map((g) => (g === existing ? { word, feedback } : g));
        }
        return [...prev, { word, feedback }];
      });
      setPendingWord(null);
    });

    // ─── Opponent updates ───
    socket.on('wordle:opponent-guess', ({ sessionId: sid, attempt, feedback }) => {
      setOpponents((prev) => {
        const opp = prev[sid] || { username: '', guessCount: 0, solved: false, feedbacks: [] };
        return {
          ...prev,
          [sid]: {
            ...opp,
            guessCount: attempt,
            feedbacks: [...opp.feedbacks, feedback],
          },
        };
      });
    });

    socket.on('wordle:player-solved', ({ sessionId: sid, username: uname, attempt }) => {
      if (sid === session.sessionId) {
        setSolved(true);
        const msgs = ['Genius!', 'Magnificent!', 'Impressive!', 'Splendid!', 'Great!', 'Phew!'];
        showToast(msgs[attempt - 1] ?? 'Solved!', 2000);
      } else {
        showToast(`${uname} solved it in ${attempt}!`, 2000);
      }
      setOpponents((prev) => {
        const opp = prev[sid] || { username: uname, guessCount: attempt, solved: false, feedbacks: [] };
        return { ...prev, [sid]: { ...opp, username: uname, solved: true } };
      });
    });

    // ─── Round end ───
    socket.on('wordle:round-end', (result: RoundResult) => {
      setPhase('round-end');
      setRoundResult(result);
      if (timerRef.current) clearInterval(timerRef.current);
    });

    // ─── Game end ───
    socket.on('wordle:game-end', ({ finalRankings: fr }) => {
      setPhase('game-end');
      setFinalRankings(fr);
    });

    // ─── Hints ───
    socket.on('wordle:hint', ({ suggestions, reasoning, penalty }) => {
      showToast(`💡 ${suggestions[0] ?? reasoning} ${penalty > 0 ? `(-${penalty}pts)` : '(free)'}`, 3000);
    });

    // ─── Errors ───
    socket.on('wordle:error', ({ message }) => {
      showToast(message, 2000);
      // If word was invalid, remove the pending placeholder
      setPendingWord(null);
      setGuesses((prev) => prev.filter((g) => g.feedback.length > 0));
    });

    socket.on('lobby:error', ({ message }) => showToast(message, 3000));

    // ─── Chat ───
    socket.on('chat:message', (msg) => setMessages((prev) => [...prev.slice(-49), msg]));

    return () => {
      socket.emit('lobby:leave-room', { roomId });
      socket.removeAllListeners();
      if (timerRef.current) clearInterval(timerRef.current);
      disconnectSocket();
    };
  }, [roomId, session, showToast]);

  const isHost = players.find((p) => p.sessionId === session?.sessionId)?.isHost ?? false;

  const startGame = () => socketRef.current?.emit('lobby:start-game', { roomId });

  const submitGuess = useCallback(() => {
    if (currentGuess.length !== WORD_LENGTH || solved || pendingWord) return;
    if (guesses.length >= MAX_ATTEMPTS) return;
    if (!isValidWord(currentGuess)) {
      setShake(true);
      showToast('Not in word list');
      setTimeout(() => setShake(false), 500);
      return;
    }
    // Send to server and add a placeholder
    socketRef.current?.emit('wordle:guess', { roomId, word: currentGuess });
    setPendingWord(currentGuess);
    setGuesses((prev) => [...prev, { word: currentGuess, feedback: [] }]);
    setCurrentGuess('');
  }, [currentGuess, guesses, roomId, solved, pendingWord, showToast]);

  const handleKey = useCallback(
    (key: string) => {
      if (phase !== 'playing' || solved || pendingWord) return;
      if (key === 'enter') {
        submitGuess();
      } else if (key === '⌫' || key === 'backspace') {
        setCurrentGuess((prev) => prev.slice(0, -1));
      } else if (/^[a-z]$/i.test(key) && currentGuess.length < WORD_LENGTH) {
        setCurrentGuess((prev) => prev + key.toLowerCase());
      }
    },
    [phase, solved, pendingWord, currentGuess, submitGuess],
  );

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

  const requestHint = () => socketRef.current?.emit('wordle:request-hint', { roomId });

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
      <header className="w-full flex items-center justify-between px-4 sm:px-6 py-3 border-b" style={{ borderColor: 'var(--border-default)' }}>
        <Link href="/games/wordle" className="text-sm font-medium hover:opacity-80 transition-opacity" style={{ color: 'var(--text-secondary)' }}>
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
        <button onClick={() => setChatOpen(!chatOpen)} className="text-sm px-2 py-1 rounded cursor-pointer" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
          💬{messages.length > 0 && <span className="ml-1 text-xs" style={{ color: 'var(--accent-purple)' }}>{messages.length}</span>}
        </button>
      </header>

      {/* Toast */}
      <div className="relative w-full flex justify-center">
        <AnimatePresence>
          {toast && (
            <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="absolute top-4 px-4 py-2 rounded-lg text-sm font-bold z-50" style={{ background: 'var(--text-primary)', color: 'var(--bg-primary)' }}>
              {toast}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex-1 flex">
        {/* Main game area */}
        <div className="flex-1 flex flex-col items-center justify-center gap-6 px-4 py-6">

          {/* ─── Lobby ─── */}
          {phase === 'lobby' && (
            <div className="flex flex-col items-center gap-6">
              <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Waiting for players...</h2>
              <div className="flex flex-wrap gap-3 justify-center">
                {players.map((p) => (
                  <div key={p.sessionId} className="px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}>
                    {p.username}
                    {p.isHost && <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--accent-purple)', color: '#fff' }}>Host</span>}
                  </div>
                ))}
              </div>
              {isHost ? (
                <button onClick={startGame} disabled={players.length < 1} className="px-6 py-3 rounded-xl font-bold text-base transition-transform hover:scale-105 cursor-pointer disabled:opacity-40" style={{ background: 'var(--accent-purple)', color: '#fff' }}>
                  Start Game
                </button>
              ) : (
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Waiting for the host to start...</p>
              )}
            </div>
          )}

          {/* ─── Countdown ─── */}
          {phase === 'countdown' && (
            <motion.div key={countdown} initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-7xl font-black" style={{ color: 'var(--accent-purple)' }}>
              {countdown > 0 ? countdown : 'GO!'}
            </motion.div>
          )}

          {/* ─── Playing ─── */}
          {phase === 'playing' && (
            <>
              <WordleBoard guesses={guesses} currentGuess={currentGuess} maxAttempts={MAX_ATTEMPTS} wordLength={WORD_LENGTH} shake={shake} />

              {solved && (
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-lg font-bold" style={{ color: 'var(--wordle-correct)' }}>
                  🎉 Solved! Waiting for others...
                </motion.p>
              )}

              <div className="flex items-center gap-3">
                <Keyboard letterStates={letterStates} onKey={handleKey} disabled={solved || !!pendingWord} />
              </div>

              {/* Hint button */}
              <button onClick={requestHint} disabled={solved} className="text-xs px-3 py-1.5 rounded-lg cursor-pointer disabled:opacity-30 transition-opacity" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
                🤖 Ask Bot
              </button>
            </>
          )}

          {/* ─── Round End ─── */}
          {phase === 'round-end' && roundResult && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center gap-5">
              <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Round Over!</h2>
              <p className="text-lg font-semibold" style={{ color: 'var(--wordle-correct)' }}>
                The word was <span className="uppercase tracking-wider">{roundResult.word}</span>
              </p>
              <div className="flex flex-col gap-2 w-64">
                {roundResult.rankings.map((r, i) => (
                  <div key={r.sessionId} className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ background: 'var(--bg-tertiary)' }}>
                    <span className="flex items-center gap-2">
                      <span className="text-sm font-bold" style={{ color: i === 0 ? 'var(--accent-yellow)' : 'var(--text-muted)' }}>
                        {i === 0 ? '🏆' : `#${i + 1}`}
                      </span>
                      <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{r.username}</span>
                    </span>
                    <span className="text-sm font-bold" style={{ color: 'var(--accent-purple)' }}>{r.score}pts</span>
                  </div>
                ))}
              </div>
              {roundResult.nextRoundIn > 0 && (
                <p className="text-sm animate-pulse" style={{ color: 'var(--text-muted)' }}>Next round starting...</p>
              )}
            </motion.div>
          )}

          {/* ─── Game End ─── */}
          {phase === 'game-end' && (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center gap-6">
              <h2 className="text-3xl font-black" style={{ color: 'var(--accent-yellow)' }}>🏆 Final Results</h2>
              <div className="flex flex-col gap-2 w-72">
                {finalRankings.map((r, i) => (
                  <div key={r.sessionId} className="flex items-center justify-between px-4 py-3 rounded-lg" style={{ background: i === 0 ? 'var(--bg-hover)' : 'var(--bg-tertiary)', border: i === 0 ? '1px solid var(--accent-yellow)' : 'none' }}>
                    <span className="flex items-center gap-2">
                      <span className="text-lg font-black" style={{ color: i === 0 ? 'var(--accent-yellow)' : i === 1 ? 'var(--text-secondary)' : 'var(--text-muted)' }}>
                        {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                      </span>
                      <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{r.username}</span>
                    </span>
                    <span className="font-bold text-lg" style={{ color: 'var(--accent-purple)' }}>{r.totalScore}</span>
                  </div>
                ))}
              </div>
              <div className="flex gap-3 mt-2">
                <Link href="/games/wordle" className="px-5 py-2.5 rounded-lg font-semibold text-sm transition-transform hover:scale-105" style={{ background: 'var(--accent-purple)', color: '#fff' }}>
                  Back to Lobby
                </Link>
              </div>
            </motion.div>
          )}
        </div>

        {/* Opponents sidebar */}
        {(phase === 'playing' || phase === 'round-end') && Object.keys(opponents).length > 0 && (
          <aside className="hidden md:flex flex-col gap-3 p-4 w-56 border-l" style={{ borderColor: 'var(--border-default)' }}>
            <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Opponents</h3>
            {Object.entries(opponents).map(([sid, opp]) => (
              <div key={sid} className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{opp.username || 'Player'}</span>
                  <span style={{ color: opp.solved ? 'var(--wordle-correct)' : 'var(--text-muted)' }}>
                    {opp.solved ? '✓ Solved' : `${opp.guessCount}/${MAX_ATTEMPTS}`}
                  </span>
                </div>
                {/* Mini feedback rows (colored tiles only, no letters) */}
                <div className="flex flex-col gap-0.5">
                  {opp.feedbacks.map((fb, i) => (
                    <div key={i} className="flex gap-0.5">
                      {fb.map((f, j) => (
                        <div
                          key={j}
                          className="w-3 h-3 rounded-sm"
                          style={{
                            background: f === 'correct' ? 'var(--wordle-correct)' : f === 'present' ? 'var(--wordle-present)' : 'var(--wordle-absent)',
                          }}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </aside>
        )}

        {/* Chat panel */}
        {chatOpen && (
          <aside className="flex flex-col w-64 border-l" style={{ borderColor: 'var(--border-default)', background: 'var(--bg-secondary)' }}>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {messages.length === 0 && <p className="text-xs text-center" style={{ color: 'var(--text-muted)' }}>No messages yet</p>}
              {messages.map((msg, i) => (
                <div key={i} className="text-xs">
                  <span className="font-semibold" style={{ color: 'var(--accent-purple)' }}>{msg.username}: </span>
                  <span style={{ color: 'var(--text-secondary)' }}>{msg.text}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-1 p-2 border-t" style={{ borderColor: 'var(--border-default)' }}>
              <input value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendChat()} maxLength={200} placeholder="Type..." className="flex-1 px-2 py-1.5 rounded text-xs outline-none" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }} />
              <button onClick={sendChat} className="px-2 py-1.5 rounded text-xs font-semibold cursor-pointer" style={{ background: 'var(--accent-purple)', color: '#fff' }}>
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
