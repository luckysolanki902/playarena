"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSessionStore } from "@/lib/store";
import { sfx } from "@/lib/sounds";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export default function ScribbleLobby() {
  const router = useRouter();
  const { session, token } = useSessionStore();
  const [joinCode, setJoinCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [matching, setMatching] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [error, setError] = useState("");

  const createRoom = async () => {
    if (!token) return;
    setCreating(true); setError(""); sfx.click();
    try {
      const res = await fetch(`${API}/rooms`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ game: "scribble", name: `${session?.username}'s room`, visibility: "private", maxPlayers: 8 }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.message || "Could not create room"); sfx.fail(); return; }
      sfx.go();
      router.push(`/games/scribble/${data.id}`);
    } catch { setError("Connection error."); sfx.fail(); }
    finally { setCreating(false); }
  };

  const quickMatch = async () => {
    if (!token) return;
    setMatching(true); setError(""); sfx.click();
    try {
      const listRes = await fetch(`${API}/rooms?game=scribble`, { headers: { Authorization: `Bearer ${token}` } });
      if (listRes.ok) {
        const listData = await listRes.json();
        type R = { id: string; status: string; players: number; maxPlayers: number };
        const avail = (listData.rooms as R[])
          .filter((r) => r.status === "waiting" && r.players >= 1 && r.players < Math.min(r.maxPlayers, 7))
          .sort((a, b) => b.players - a.players);
        if (avail.length > 0) { sfx.go(); router.push(`/games/scribble/${avail[0].id}`); return; }
      }
      const res = await fetch(`${API}/rooms`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ game: "scribble", name: `${session?.username}'s game`, visibility: "public", maxPlayers: 8 }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.message || "Could not find a match"); sfx.fail(); return; }
      sfx.go();
      router.push(`/games/scribble/${data.id}`);
    } catch { setError("Connection error."); sfx.fail(); }
    finally { setMatching(false); }
  };

  const joinByCode = () => {
    if (joinCode.length < 4) return;
    sfx.click();
    router.push(`/games/scribble/${encodeURIComponent(joinCode)}`);
  };

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center stars-bg">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center text-3xl font-black"
            style={{ background: "rgba(255,209,102,0.15)", color: "var(--accent-warm)" }}>🎨</div>
          <p className="text-sm font-semibold mb-4" style={{ color: "var(--text-secondary)" }}>Pick a name first to play!</p>
          <Link href="/" className="btn-game inline-block px-6 py-3 rounded-2xl text-sm font-bold"
            style={{ background: "var(--accent-warm)", color: "var(--bg-primary)" }}>Go to home</Link>
        </motion.div>
      </div>
    );
  }

  return (
    <main className="min-h-screen flex flex-col relative stars-bg">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="blob w-80 h-80 top-[-10%] right-[-5%] opacity-20" style={{ background: "rgba(255,209,102,0.4)" }} />
        <div className="blob w-60 h-60 bottom-[10%] left-[-5%] opacity-15" style={{ background: "rgba(78,205,196,0.4)" }} />
      </div>

      {/* Header */}
      <nav className="relative z-10 w-full px-6 py-4 border-b" style={{ borderColor: "var(--border-subtle)" }}>
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity" onClick={() => sfx.click()}>
            <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm font-black"
              style={{ background: "var(--accent-warm)", color: "var(--bg-primary)" }}>P</div>
            <span className="text-sm font-bold" style={{ color: "var(--text-muted)" }}>Home</span>
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
              style={{ background: "rgba(255,209,102,0.15)", color: "var(--accent-warm)" }}>🎨</div>
            <span className="text-lg font-extrabold" style={{ color: "var(--text-primary)" }}>Scribble</span>
          </div>
          <div className="flex items-center gap-2 px-2.5 py-1 rounded-full"
            style={{ background: "var(--bg-tertiary)", border: "1px solid var(--border-default)" }}>
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold"
              style={{ background: "var(--accent-warm)", color: "var(--bg-primary)" }}>
              {session.username[0].toUpperCase()}
            </div>
          </div>
        </div>
      </nav>

      <div className="relative z-10 flex-1 flex flex-col items-center px-6 py-10">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }} className="w-full max-w-sm">
          <div className="text-center mb-8">
            <h2 className="text-2xl sm:text-3xl font-extrabold mb-2" style={{ color: "var(--text-primary)" }}>Draw &amp; Guess!</h2>
            <p className="text-sm font-medium" style={{ color: "var(--text-muted)" }}>One draws, everyone guesses 🖌️</p>
          </div>

          <div className="flex flex-col gap-3">
            {/* Quick Match */}
            <button onClick={quickMatch} disabled={matching} onMouseEnter={() => sfx.hover()}
              className="game-card group flex items-center gap-4 p-4 rounded-2xl border text-left cursor-pointer disabled:cursor-wait"
              style={{ background: "var(--bg-card)", borderColor: "var(--border-default)" }}>
              <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: "rgba(255,209,102,0.12)" }}>
                {matching ? <div className="loading-spinner" style={{ borderTopColor: "var(--accent-warm)" }} /> : <span className="text-2xl">⚡</span>}
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
                  {matching ? "Finding a room..." : "Quick Match"}
                </p>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>Jump into a game instantly</p>
              </div>
              {!matching && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>}
            </button>

            {/* Create Room */}
            <button onClick={createRoom} disabled={creating} onMouseEnter={() => sfx.hover()}
              className="game-card group flex items-center gap-4 p-4 rounded-2xl border text-left cursor-pointer disabled:cursor-wait"
              style={{ background: "var(--bg-card)", borderColor: "var(--border-default)" }}>
              <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: "rgba(167,139,250,0.12)" }}>
                {creating ? <div className="loading-spinner" style={{ borderTopColor: "var(--accent-soft)" }} /> : <span className="text-2xl">🏠</span>}
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
                  {creating ? "Creating room..." : "Create Private Room"}
                </p>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>Invite friends with a code</p>
              </div>
              {!creating && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>}
            </button>

            {/* Join by Code */}
            <button onClick={() => { setShowJoin(!showJoin); sfx.click(); }} onMouseEnter={() => sfx.hover()}
              className="game-card group flex items-center gap-4 p-4 rounded-2xl border text-left cursor-pointer"
              style={{ background: "var(--bg-card)", borderColor: showJoin ? "var(--accent-info)" : "var(--border-default)" }}>
              <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: "rgba(116,185,255,0.12)" }}>
                <span className="text-2xl">🔑</span>
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>Join with Code</p>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>Enter a friend's room code</p>
              </div>
              <motion.svg animate={{ rotate: showJoin ? 90 : 0 }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></motion.svg>
            </button>
          </div>

          <AnimatePresence>
            {showJoin && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                <div className="flex gap-2 mt-3 px-1">
                  <input type="text" value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    placeholder="Room code" maxLength={8} autoFocus
                    className="flex-1 h-12 px-4 rounded-xl text-sm font-bold outline-none uppercase tracking-[0.15em] text-center"
                    style={{ background: "var(--bg-tertiary)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
                    onKeyDown={(e) => e.key === "Enter" && joinByCode()} />
                  <button onClick={joinByCode} disabled={joinCode.length < 4}
                    className="btn-game h-12 px-5 rounded-xl text-sm font-bold cursor-pointer disabled:opacity-30"
                    style={{ background: "var(--accent-info)", color: "var(--bg-primary)" }}>Join</button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {error && (
              <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="mt-4 p-3 rounded-xl text-center text-sm font-medium"
                style={{ background: "rgba(239,100,97,0.1)", color: "var(--accent-error)", border: "1px solid rgba(239,100,97,0.2)" }}>
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          {/* How to play hint */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}
            className="mt-8 p-4 rounded-2xl text-sm" style={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)" }}>
            <p className="font-bold mb-2" style={{ color: "var(--text-secondary)" }}>How to play</p>
            <ul className="space-y-1 text-xs" style={{ color: "var(--text-muted)" }}>
              <li>🖌️ The drawer picks a secret word and draws it</li>
              <li>💬 Others type guesses in the chat</li>
              <li>⚡ Faster guesses = more points</li>
              <li>🤏 Close guesses get a hint nudge</li>
              <li>🔄 Everyone gets a turn to draw</li>
            </ul>
          </motion.div>
        </motion.div>
      </div>

      <footer className="relative z-10 py-4 text-center">
        <p className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
          Made with care by <span style={{ color: "var(--accent-warm)" }}>Dharaa Singh</span>
        </p>
      </footer>
    </main>
  );
}
