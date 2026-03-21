"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DrawPoint, DrawStroke } from "@playarena/shared";

const COLORS = [
  "#1a1a2e", "#ffffff", "#ef4444", "#f97316", "#eab308",
  "#22c55e", "#3b82f6", "#8b5cf6", "#ec4899", "#06b6d4",
  "#a3e635", "#f472b6",
];

const WIDTHS = [
  { label: "S", value: 4 },
  { label: "M", value: 10 },
  { label: "L", value: 20 },
];

interface Props {
  isDrawer: boolean;
  /** Batched incoming draw points from the server (for non-drawers) */
  remotePoints: DrawPoint[];
  /** Full stroke history from server (for late joiners / replay) */
  strokes: DrawStroke[];
  /** Emit batched points */
  onDraw: (points: DrawPoint[]) => void;
  /** Emit clear */
  onClear: () => void;
  /** True while drawing phase is active */
  active: boolean;
}

export default function ScribbleCanvas({ isDrawer, remotePoints, strokes, onDraw, onClear, active }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [color, setColor] = useState("#1a1a2e");
  const [width, setWidth] = useState(10);
  const [isEraser, setIsEraser] = useState(false);

  const isDrawing = useRef(false);
  const pendingPoints = useRef<DrawPoint[]>([]);
  const flushTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  const effectiveColor = isEraser ? "#1a1a2e" : color;
  const effectiveWidth = isEraser ? 28 : width;

  // Normalize canvas coords to 0-1
  const normalize = useCallback((e: { clientX: number; clientY: number }): { x: number; y: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    };
  }, []);

  // Draw a segment on the canvas
  const drawSegment = useCallback(
    (ctx: CanvasRenderingContext2D, from: { x: number; y: number }, to: { x: number; y: number }, c: string, w: number) => {
      const W = ctx.canvas.width, H = ctx.canvas.height;
      ctx.beginPath();
      ctx.strokeStyle = c;
      ctx.lineWidth = w;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.moveTo(from.x * W, from.y * H);
      ctx.lineTo(to.x * W, to.y * H);
      ctx.stroke();
    },
    [],
  );

  // Draw a dot (for single click)
  const drawDot = useCallback((ctx: CanvasRenderingContext2D, x: number, y: number, c: string, w: number) => {
    const W = ctx.canvas.width, H = ctx.canvas.height;
    ctx.beginPath();
    ctx.fillStyle = c;
    ctx.arc(x * W, y * H, w / 2, 0, Math.PI * 2);
    ctx.fill();
  }, []);

  // Replay all strokes (used when strokes prop changes)
  const replayStrokes = useCallback(
    (stks: DrawStroke[]) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#f8f5f0";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      for (const stroke of stks) {
        let prev: DrawPoint | null = null;
        for (const pt of stroke.points) {
          if (pt.type === "start") {
            drawDot(ctx, pt.x, pt.y, pt.color, pt.width);
          } else if (pt.type === "draw" && prev) {
            drawSegment(ctx, prev, pt, pt.color, pt.width);
          }
          prev = pt;
        }
      }
    },
    [drawSegment, drawDot],
  );

  // Init canvas with white background
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const resize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      // Only resize if needed to avoid clearing
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        replayStrokes(strokes);
      }
    };

    resize();
    const obs = new ResizeObserver(resize);
    obs.observe(container);
    return () => obs.disconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Replay when strokes change (late join or clear)
  useEffect(() => {
    replayStrokes(strokes);
  }, [strokes, replayStrokes]);

  // Render incoming remote points in real-time
  useEffect(() => {
    if (!remotePoints.length) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let prev: DrawPoint | null = null;
    for (const pt of remotePoints) {
      if (pt.type === "start") {
        drawDot(ctx, pt.x, pt.y, pt.color, pt.width);
      } else if (pt.type === "draw" && prev) {
        drawSegment(ctx, prev, pt, pt.color, pt.width);
      } else if (pt.type === "end" && prev) {
        drawSegment(ctx, prev, pt, pt.color, pt.width);
      }
      prev = pt;
    }
  }, [remotePoints, drawSegment, drawDot]);

  // Flush queued points to server every 40ms
  useEffect(() => {
    if (!isDrawer) return;
    flushTimer.current = setInterval(() => {
      if (pendingPoints.current.length > 0) {
        onDraw([...pendingPoints.current]);
        pendingPoints.current = [];
      }
    }, 40);
    return () => { if (flushTimer.current) clearInterval(flushTimer.current); };
  }, [isDrawer, onDraw]);

  // Mouse events (drawer only)
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!isDrawer || !active) return;
      isDrawing.current = true;
      const pos = normalize(e.nativeEvent);
      if (!pos) return;
      lastPos.current = pos;
      const pt: DrawPoint = { ...pos, type: "start", color: effectiveColor, width: effectiveWidth };
      pendingPoints.current.push(pt);

      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (ctx) drawDot(ctx, pos.x, pos.y, effectiveColor, effectiveWidth);
    },
    [isDrawer, active, normalize, effectiveColor, effectiveWidth, drawDot],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDrawer || !active || !isDrawing.current) return;
      const pos = normalize(e.nativeEvent);
      if (!pos || !lastPos.current) return;
      const pt: DrawPoint = { ...pos, type: "draw", color: effectiveColor, width: effectiveWidth };
      pendingPoints.current.push(pt);

      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (ctx) drawSegment(ctx, lastPos.current, pos, effectiveColor, effectiveWidth);
      lastPos.current = pos;
    },
    [isDrawer, active, normalize, effectiveColor, effectiveWidth, drawSegment],
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent) => {
      if (!isDrawer || !isDrawing.current) return;
      isDrawing.current = false;
      const pos = normalize(e.nativeEvent);
      if (pos) {
        const pt: DrawPoint = { ...pos, type: "end", color: effectiveColor, width: effectiveWidth };
        pendingPoints.current.push(pt);
      }
      lastPos.current = null;
    },
    [isDrawer, normalize, effectiveColor, effectiveWidth],
  );

  // Touch events
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!isDrawer || !active) return;
      e.preventDefault();
      isDrawing.current = true;
      const pos = normalize(e.touches[0]);
      if (!pos) return;
      lastPos.current = pos;
      const pt: DrawPoint = { ...pos, type: "start", color: effectiveColor, width: effectiveWidth };
      pendingPoints.current.push(pt);
      const ctx = canvasRef.current?.getContext("2d");
      if (ctx) drawDot(ctx, pos.x, pos.y, effectiveColor, effectiveWidth);
    },
    [isDrawer, active, normalize, effectiveColor, effectiveWidth, drawDot],
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!isDrawer || !active || !isDrawing.current) return;
      e.preventDefault();
      const pos = normalize(e.touches[0]);
      if (!pos || !lastPos.current) return;
      const pt: DrawPoint = { ...pos, type: "draw", color: effectiveColor, width: effectiveWidth };
      pendingPoints.current.push(pt);
      const ctx = canvasRef.current?.getContext("2d");
      if (ctx) drawSegment(ctx, lastPos.current, pos, effectiveColor, effectiveWidth);
      lastPos.current = pos;
    },
    [isDrawer, active, normalize, effectiveColor, effectiveWidth, drawSegment],
  );

  const handleTouchEnd = useCallback(() => {
    if (!isDrawer || !isDrawing.current) return;
    isDrawing.current = false;
    const pt: DrawPoint = { x: lastPos.current?.x ?? 0, y: lastPos.current?.y ?? 0, type: "end", color: effectiveColor, width: effectiveWidth };
    pendingPoints.current.push(pt);
    lastPos.current = null;
  }, [isDrawer, effectiveColor, effectiveWidth]);

  const handleClear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#f8f5f0";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    onClear();
  };

  return (
    <div className="flex flex-col gap-2 w-full h-full">
      {/* Canvas */}
      <div ref={containerRef}
        className="relative flex-1 rounded-2xl overflow-hidden"
        style={{
          background: "#f8f5f0",
          border: isDrawer && active ? "2px solid var(--accent-warm)" : "2px solid var(--border-subtle)",
          boxShadow: isDrawer && active ? "0 0 0 4px rgba(255,209,102,0.1)" : "none",
          cursor: isDrawer && active ? (isEraser ? "cell" : "crosshair") : "default",
          minHeight: 340,
        }}>
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full touch-none"
          style={{ display: "block" }}
          onMouseDown={handleMouseDown} onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
          onTouchStart={handleTouchStart} onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd} />
        {!active && (
          <div className="absolute inset-0 flex items-center justify-center"
            style={{ background: "rgba(248,245,240,0.7)", backdropFilter: "blur(2px)" }}>
            <p className="text-sm font-bold" style={{ color: "var(--text-muted)" }}>Waiting for drawer...</p>
          </div>
        )}
      </div>

      {/* Toolbar (drawer only) */}
      {isDrawer && (
        <div className="flex flex-wrap items-center gap-2 px-1">
          {/* Color palette */}
          <div className="flex flex-wrap gap-1.5">
            {COLORS.map((c) => (
              <button key={c} onClick={() => { setColor(c); setIsEraser(false); }}
                className="w-6 h-6 rounded-full transition-transform hover:scale-110 cursor-pointer"
                style={{
                  background: c,
                  border: !isEraser && color === c ? "2px solid var(--accent-primary)" : "2px solid rgba(0,0,0,0.15)",
                  transform: !isEraser && color === c ? "scale(1.2)" : undefined,
                  boxShadow: c === "#ffffff" ? "inset 0 0 0 1px rgba(0,0,0,0.1)" : undefined,
                }} />
            ))}
          </div>

          {/* Divider */}
          <div className="w-px h-5 rounded" style={{ background: "var(--border-default)" }} />

          {/* Brush sizes */}
          <div className="flex gap-1">
            {WIDTHS.map((w) => (
              <button key={w.label} onClick={() => { setWidth(w.value); setIsEraser(false); }}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold cursor-pointer transition-all"
                style={{
                  background: !isEraser && width === w.value ? "var(--accent-primary)" : "var(--bg-tertiary)",
                  color: !isEraser && width === w.value ? "var(--bg-primary)" : "var(--text-muted)",
                }}>{w.label}</button>
            ))}
          </div>

          {/* Eraser */}
          <button onClick={() => setIsEraser(!isEraser)}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-sm cursor-pointer transition-all"
            style={{
              background: isEraser ? "var(--accent-warm)" : "var(--bg-tertiary)",
              color: isEraser ? "var(--bg-primary)" : "var(--text-muted)",
            }}
            title="Eraser">⌫</button>

          {/* Clear */}
          <button onClick={handleClear}
            className="h-7 px-2.5 rounded-lg text-[11px] font-bold cursor-pointer transition-all flex items-center gap-1 ml-auto"
            style={{ background: "rgba(239,100,97,0.1)", color: "var(--accent-error)" }}
            title="Clear canvas">🗑 Clear</button>
        </div>
      )}
    </div>
  );
}
