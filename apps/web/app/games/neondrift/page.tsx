"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import Link from "next/link";
import { useSessionStore } from "@/lib/store";
import { sfx } from "@/lib/sounds";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const GAME_COLOR = "#f472b6";

export default function NeonDriftLobbyPage() {
  const router = useRouter();
  const { session, token } = useSessionStore();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleQuickMatch() {
    if (!session || !token) return;
    setLoading(true); setError("");
    try {
      const listRes = await fetch(`${API}/rooms?game=neondrift`, { headers: { Authorization: `Bearer ${token}` } });
      if (listRes.ok) {
        const listData = await listRes.json();
        type Room = { id: string; status: string; players: number; maxPlayers: number };
        const available = (listData.rooms as Room[]).filter((r) => r.status === "waiting" && r.players < Math.min(r.maxPlayers, 5)).sort((a, b) => b.players - a.players);
        if (available.length > 0) { sfx.go(); router.push(`/games/neondrift/${available[0].id}`); return; }
      }
      const res = await fetch(`${API}/rooms`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ game: "neondrift", visibility: "public", maxPlayers: 6 }) });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      sfx.go(); router.push(`/games/neondrift/${data.id}`);
    } catch { setError("Could not find a match"); }
    setLoading(false);
  }

  async function handleCreateRoom() {
    if (!session || !token) return;
    setLoading(true); setError("");
    try {
      const res = await fetch(`${API}/rooms`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ game: "neondrift", visibility: "private", maxPlayers: 6 }),
      });
      if (!res.ok) throw new Error("Failed to create room");
      const data = await res.json();
      sfx.click();
      router.push(`/games/neondrift/${data.id}`);
    } catch { setError("Could not create room"); }
    setLoading(false);
  }

  async function handleJoinByCode() {
    if (!session || !token || !code.trim()) return;
    setLoading(true); setError("");
    try {
      const res = await fetch(`${API}/rooms/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code: code.trim().toUpperCase() }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || "Room not found"); }
      const { room } = await res.json();
      sfx.click();
      router.push(`/games/neondrift/${room.id}`);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Could not join room"); }
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex flex-col relative stars-bg">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="blob w-64 h-64 top-[-5%] left-[-5%] opacity-15" style={{ background: `${GAME_COLOR}33` }} />
        <div className="blob w-48 h-48 bottom-[5%] right-[-3%] opacity-10" style={{ background: "var(--glow-warm)" }} />
      </div>

      <header className="relative z-10 w-full flex items-center justify-between px-4 sm:px-6 py-3 border-b" style={{ borderColor: "var(--border-subtle)" }}>
        <Link href="/" className="flex items-center gap-1.5 hover:opacity-80 transition-opacity" onClick={() => sfx.click()}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          <span className="text-sm font-bold" style={{ color: "var(--text-muted)" }}>Back</span>
        </Link>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md flex items-center justify-center text-xs font-black" style={{ background: `${GAME_COLOR}22`, color: GAME_COLOR }}>N</div>
          <span className="text-base font-extrabold" style={{ color: "var(--text-primary)" }}>Neon Drift</span>
        </div>
        <div className="w-16" />
      </header>

      <main className="relative z-10 flex-1 flex flex-col items-center justify-center gap-6 px-4 py-8">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center gap-4 text-center">
          <div className="w-20 h-20 rounded-2xl flex items-center justify-center text-4xl font-black animate-float"
            style={{ background: `${GAME_COLOR}15`, color: GAME_COLOR, boxShadow: `0 8px 32px ${GAME_COLOR}22` }}>
            N
          </div>
          <h1 className="text-2xl font-extrabold" style={{ color: "var(--text-primary)" }}>Neon Drift</h1>
          <p className="text-sm max-w-xs" style={{ color: "var(--text-muted)" }}>
            Tron-style light trail game. Don&apos;t crash into walls or trails!
          </p>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="flex flex-col gap-3 w-full max-w-xs">
          <button onClick={handleQuickMatch} disabled={!session || loading}
            className="btn-game px-6 py-4 rounded-2xl font-bold text-base cursor-pointer disabled:opacity-40"
            style={{ background: GAME_COLOR, color: "var(--bg-primary)" }}>
            {loading ? "Finding match..." : "⚡ Quick Match"}
          </button>
          <button onClick={handleCreateRoom} disabled={!session || loading}
            className="btn-game px-6 py-4 rounded-2xl font-bold text-base cursor-pointer disabled:opacity-40"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}>
            Create Private Room
          </button>
          <div className="flex gap-2">
            <input type="text" placeholder="Room Code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())}
              className="flex-1 px-4 py-3 rounded-xl text-sm font-medium focus:outline-none"
              style={{ background: "var(--bg-card)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
              maxLength={6}
            />
            <button onClick={handleJoinByCode} disabled={!session || !code.trim() || loading}
              className="px-5 py-3 rounded-xl font-bold text-sm cursor-pointer disabled:opacity-40"
              style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}>
              Join
            </button>
          </div>
          {error && <p className="text-xs text-center" style={{ color: "var(--accent-error)" }}>{error}</p>}
        </motion.div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
          className="mt-6 text-xs text-center max-w-xs" style={{ color: "var(--text-muted)" }}>
          <p className="font-bold mb-1">How to Play</p>
          <p>Use arrow keys or WASD to steer. Avoid walls and trails. Last one alive wins!</p>
        </motion.div>
      </main>
    </div>
  );
}
