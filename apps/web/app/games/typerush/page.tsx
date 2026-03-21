"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSessionStore } from "@/lib/store";
import { sfx } from "@/lib/sounds";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export default function TypeRushLobby() {
  const router = useRouter();
  const { session, token } = useSessionStore();
  const [joinCode, setJoinCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [matching, setMatching] = useState(false);
  const [showJoinInput, setShowJoinInput] = useState(false);
  const [error, setError] = useState("");

  const createRoom = async () => {
    if (!token) return;
    setCreating(true);
    setError("");
    sfx.click();
    try {
      const res = await fetch(`${API}/rooms`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          game: "typerush",
          name: `${session?.username}'s race`,
          visibility: "private",
          maxPlayers: 6,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.message || "Could not create room");
        sfx.fail();
        return;
      }
      const data = await res.json();
      sfx.go();
      router.push(`/games/typerush/${data.id}`);
    } catch {
      setError("Connection error. Is the server running?");
      sfx.fail();
    } finally {
      setCreating(false);
    }
  };

  const playRandom = async () => {
    if (!token) return;
    setMatching(true);
    setError("");
    sfx.click();
    try {
      const listRes = await fetch(`${API}/rooms?game=typerush`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (listRes.ok) {
        const listData = await listRes.json();
        type RoomItem = { id: string; status: string; players: number; maxPlayers: number };
        const available = (listData.rooms as RoomItem[])
          .filter((r) => r.status === "waiting" && r.players >= 1 && r.players < Math.min(r.maxPlayers, 6))
          .sort((a, b) => b.players - a.players);
        if (available.length > 0) {
          sfx.go();
          router.push(`/games/typerush/${available[0].id}`);
          return;
        }
      }
      const res = await fetch(`${API}/rooms`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          game: "typerush",
          name: `${session?.username}'s race`,
          visibility: "public",
          maxPlayers: 6,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.message || "Could not find a match");
        sfx.fail();
        return;
      }
      const data = await res.json();
      sfx.go();
      router.push(`/games/typerush/${data.id}`);
    } catch {
      setError("Connection error. Is the server running?");
      sfx.fail();
    } finally {
      setMatching(false);
    }
  };

  const joinByCode = () => {
    if (joinCode.length < 4) return;
    sfx.click();
    router.push(`/games/typerush/${encodeURIComponent(joinCode)}`);
  };

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center stars-bg">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center"
        >
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center text-3xl font-black"
            style={{ background: "rgba(167,139,250,0.15)", color: "#a78bfa" }}>
            T
          </div>
          <p className="text-base font-semibold mb-4" style={{ color: "var(--text-secondary)" }}>
            Pick a name first to play!
          </p>
          <Link
            href="/"
            className="btn-game inline-block px-6 py-3 rounded-2xl text-sm font-bold"
            style={{ background: "#a78bfa", color: "var(--bg-primary)" }}
          >
            Go to home
          </Link>
        </motion.div>
      </div>
    );
  }

  return (
    <main className="min-h-screen flex flex-col relative stars-bg">
      {/* Background blobs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="blob w-80 h-80 top-[-10%] right-[-5%] opacity-25" style={{ background: "rgba(167,139,250,0.4)" }} />
        <div className="blob w-60 h-60 bottom-[10%] left-[-5%] opacity-20" style={{ background: "var(--glow-warm)" }} />
      </div>

      {/* Header */}
      <nav className="relative z-10 w-full px-6 py-4 border-b" style={{ borderColor: "var(--border-subtle)" }}>
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
            onClick={() => sfx.click()}
          >
            <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm font-black"
              style={{ background: "var(--accent-primary)", color: "var(--bg-primary)" }}>
              S
            </div>
            <span className="text-sm font-bold" style={{ color: "var(--text-muted)" }}>Home</span>
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg font-black"
              style={{ background: "rgba(167,139,250,0.15)", color: "#a78bfa" }}>
              T
            </div>
            <span className="text-lg font-extrabold" style={{ color: "var(--text-primary)" }}>TypeRush</span>
          </div>
          <div
            className="flex items-center gap-2 px-2.5 py-1 rounded-full"
            style={{ background: "var(--bg-tertiary)", border: "1px solid var(--border-default)" }}
          >
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold"
              style={{ background: "#a78bfa", color: "var(--bg-primary)" }}>
              {session.username[0].toUpperCase()}
            </div>
          </div>
        </div>
      </nav>

      <div className="relative z-10 flex-1 flex flex-col items-center px-6 py-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-sm"
        >
          <div className="text-center mb-8">
            <h2 className="text-2xl sm:text-3xl font-extrabold mb-2" style={{ color: "var(--text-primary)" }}>
              Ready to race?
            </h2>
            <p className="text-sm font-medium" style={{ color: "var(--text-muted)" }}>
              Type fast. Beat them all.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            {/* Play Quick Match */}
            <button
              onClick={playRandom}
              disabled={matching}
              onMouseEnter={() => sfx.hover()}
              className="game-card group flex items-center gap-4 p-4 rounded-2xl border text-left cursor-pointer disabled:cursor-wait"
              style={{ background: "var(--bg-card)", borderColor: "var(--border-default)" }}
            >
              <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: "rgba(255,209,102,0.12)" }}>
                {matching ? (
                  <div className="loading-spinner" style={{ borderTopColor: "var(--accent-warm)" }} />
                ) : (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent-warm)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                  </svg>
                )}
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
                  {matching ? "Finding racers..." : "Quick Match"}
                </p>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>Race against random players</p>
              </div>
              {!matching && (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              )}
            </button>

            {/* Create Private Room */}
            <button
              onClick={createRoom}
              disabled={creating}
              onMouseEnter={() => sfx.hover()}
              className="game-card group flex items-center gap-4 p-4 rounded-2xl border text-left cursor-pointer disabled:cursor-wait"
              style={{ background: "var(--bg-card)", borderColor: "var(--border-default)" }}
            >
              <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: "rgba(167,139,250,0.12)" }}>
                {creating ? (
                  <div className="loading-spinner" style={{ borderTopColor: "#a78bfa" }} />
                ) : (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                )}
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
                  {creating ? "Creating race..." : "Create Room"}
                </p>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>Race your friends privately</p>
              </div>
              {!creating && (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              )}
            </button>

            {/* Join with Code */}
            <button
              onClick={() => { setShowJoinInput(!showJoinInput); sfx.click(); }}
              onMouseEnter={() => sfx.hover()}
              className="game-card group flex items-center gap-4 p-4 rounded-2xl border text-left cursor-pointer"
              style={{
                background: "var(--bg-card)",
                borderColor: showJoinInput ? "var(--accent-info)" : "var(--border-default)",
              }}
            >
              <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: "rgba(116,185,255,0.12)" }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent-info)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/>
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>Join Room</p>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>Enter a friend's room code</p>
              </div>
              <motion.svg
                animate={{ rotate: showJoinInput ? 90 : 0 }}
                width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6"/>
              </motion.svg>
            </button>
          </div>

          {/* Join Code Input */}
          <AnimatePresence>
            {showJoinInput && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="flex gap-2 mt-3 px-1">
                  <input
                    type="text"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    placeholder="Room code"
                    maxLength={8}
                    className="flex-1 h-12 px-4 rounded-xl text-sm font-bold outline-none uppercase tracking-[0.15em] text-center"
                    style={{
                      background: "var(--bg-tertiary)",
                      border: "1px solid var(--border-default)",
                      color: "var(--text-primary)",
                    }}
                    autoFocus
                    onKeyDown={(e) => e.key === "Enter" && joinByCode()}
                  />
                  <button
                    onClick={joinByCode}
                    disabled={joinCode.length < 4}
                    className="btn-game h-12 px-5 rounded-xl text-sm font-bold cursor-pointer disabled:opacity-30"
                    style={{ background: "var(--accent-info)", color: "var(--bg-primary)" }}
                  >
                    Join
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mt-4 p-3 rounded-xl text-center text-sm font-medium"
                style={{ background: "rgba(239,100,97,0.1)", color: "var(--accent-error)", border: "1px solid rgba(239,100,97,0.2)" }}
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>
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
