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

const CANVAS_BG = "#f8f5f0";
type Tool = 'pen' | 'eraser' | 'line' | 'rect' | 'circle' | 'triangle' | 'fill';

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
  const [tool, setTool] = useState<Tool>('pen');

  const isDrawing = useRef(false);
  const pendingPoints = useRef<DrawPoint[]>([]);
  const flushTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastPos = useRef<{ x: number; y: number } | null>(null);
  const lastRemotePoint = useRef<DrawPoint | null>(null);
  const shapeStartPos = useRef<{ x: number; y: number } | null>(null);
  const canvasSnapshot = useRef<ImageData | null>(null);

  const effectiveColor = tool === 'eraser' ? CANVAS_BG : color;
  const effectiveWidth = tool === 'eraser' ? 28 : width;

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

  const drawShape = useCallback((ctx: CanvasRenderingContext2D, pt: DrawPoint) => {
    if (!pt.shape || pt.x2 === undefined || pt.y2 === undefined) return;
    const W = ctx.canvas.width, H = ctx.canvas.height;
    const x1 = pt.x * W, y1 = pt.y * H, x2 = pt.x2 * W, y2 = pt.y2 * H;
    ctx.beginPath();
    ctx.strokeStyle = pt.color;
    ctx.lineWidth = pt.width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (pt.shape === 'line') {
      ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    } else if (pt.shape === 'rect') {
      ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
    } else if (pt.shape === 'circle') {
      const rx = Math.abs(x2 - x1) / 2, ry = Math.abs(y2 - y1) / 2;
      const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
      ctx.ellipse(cx, cy, Math.max(rx, 1), Math.max(ry, 1), 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (pt.shape === 'triangle') {
      const midX = (x1 + x2) / 2;
      ctx.moveTo(midX, y1);
      ctx.lineTo(x2, y2);
      ctx.lineTo(x1, y2);
      ctx.closePath();
      ctx.stroke();
    }
  }, []);

  // Flood fill (bucket tool)
  const floodFill = useCallback((ctx: CanvasRenderingContext2D, startX: number, startY: number, fillColor: string) => {
    const canvas = ctx.canvas;
    const W = canvas.width, H = canvas.height;
    const px = Math.round(startX * W), py = Math.round(startY * H);
    if (px < 0 || px >= W || py < 0 || py >= H) return;

    const imageData = ctx.getImageData(0, 0, W, H);
    const data = imageData.data;

    // Parse fill color
    const tmp = document.createElement('canvas');
    tmp.width = tmp.height = 1;
    const tmpCtx = tmp.getContext('2d')!;
    tmpCtx.fillStyle = fillColor;
    tmpCtx.fillRect(0, 0, 1, 1);
    const [fr, fg, fb] = tmpCtx.getImageData(0, 0, 1, 1).data;

    const idx = (py * W + px) * 4;
    const tr = data[idx], tg = data[idx + 1], tb = data[idx + 2], ta = data[idx + 3];

    // Don't fill if target === fill color
    if (tr === fr && tg === fg && tb === fb) return;

    const tolerance = 32;
    const match = (i: number) =>
      Math.abs(data[i] - tr) <= tolerance &&
      Math.abs(data[i + 1] - tg) <= tolerance &&
      Math.abs(data[i + 2] - tb) <= tolerance &&
      Math.abs(data[i + 3] - ta) <= tolerance;

    const stack = [px, py];
    const visited = new Uint8Array(W * H);

    while (stack.length > 0) {
      const cy = stack.pop()!;
      const cx = stack.pop()!;
      const ci = (cy * W + cx) * 4;
      if (cx < 0 || cx >= W || cy < 0 || cy >= H) continue;
      if (visited[cy * W + cx]) continue;
      if (!match(ci)) continue;

      visited[cy * W + cx] = 1;
      data[ci] = fr;
      data[ci + 1] = fg;
      data[ci + 2] = fb;
      data[ci + 3] = 255;

      stack.push(cx + 1, cy);
      stack.push(cx - 1, cy);
      stack.push(cx, cy + 1);
      stack.push(cx, cy - 1);
    }

    ctx.putImageData(imageData, 0, 0);
  }, []);

  // Replay all strokes (used when strokes prop changes)
  const replayStrokes = useCallback(
    (stks: DrawStroke[]) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = CANVAS_BG;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      for (const stroke of stks) {
        let prev: DrawPoint | null = null;
        for (const pt of stroke.points) {
          if (pt.type === "fill") {
            floodFill(ctx, pt.x, pt.y, pt.color);
          } else if (pt.type === "shape") {
            drawShape(ctx, pt);
          } else if (pt.type === "start") {
            drawDot(ctx, pt.x, pt.y, pt.color, pt.width);
          } else if (pt.type === "draw" && prev && prev.type !== "shape") {
            drawSegment(ctx, prev, pt, pt.color, pt.width);
          }
          prev = pt;
        }
      }
    },
    [drawSegment, drawDot, drawShape, floodFill],
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

  // Replay when strokes change (late join or clear) — also reset lastRemotePoint
  useEffect(() => {
    lastRemotePoint.current = null;
    replayStrokes(strokes);
  }, [strokes, replayStrokes]);

  // Render incoming remote points — persists prev across batches to avoid gaps
  useEffect(() => {
    if (!remotePoints.length) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let prev: DrawPoint | null = lastRemotePoint.current;
    for (const pt of remotePoints) {
      if (pt.type === "fill") {
        floodFill(ctx, pt.x, pt.y, pt.color);
      } else if (pt.type === "shape") {
        drawShape(ctx, pt);
      } else if (pt.type === "start") {
        drawDot(ctx, pt.x, pt.y, pt.color, pt.width);
      } else if ((pt.type === "draw" || pt.type === "end") && prev && prev.type !== "end" && prev.type !== "shape") {
        drawSegment(ctx, prev, pt, pt.color, pt.width);
      }
      prev = pt;
    }
    lastRemotePoint.current = prev;
  }, [remotePoints, drawSegment, drawDot, drawShape, floodFill]);

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
      if (tool === 'pen' || tool === 'eraser') {
        const pt: DrawPoint = { ...pos, type: "start", color: effectiveColor, width: effectiveWidth };
        pendingPoints.current.push(pt);
        const ctx = canvasRef.current?.getContext("2d");
        if (ctx) drawDot(ctx, pos.x, pos.y, effectiveColor, effectiveWidth);
      } else {
        shapeStartPos.current = pos;
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (canvas && ctx) canvasSnapshot.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
      }
    },
    [isDrawer, active, normalize, effectiveColor, effectiveWidth, drawDot, tool],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDrawer || !active || !isDrawing.current) return;
      const pos = normalize(e.nativeEvent);
      if (!pos) return;
      if (tool === 'pen' || tool === 'eraser') {
        if (!lastPos.current) return;
        const pt: DrawPoint = { ...pos, type: "draw", color: effectiveColor, width: effectiveWidth };
        pendingPoints.current.push(pt);
        const ctx = canvasRef.current?.getContext("2d");
        if (ctx) drawSegment(ctx, lastPos.current, pos, effectiveColor, effectiveWidth);
        lastPos.current = pos;
      } else {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx || !shapeStartPos.current || !canvasSnapshot.current) return;
        ctx.putImageData(canvasSnapshot.current, 0, 0);
        drawShape(ctx, { x: shapeStartPos.current.x, y: shapeStartPos.current.y, x2: pos.x, y2: pos.y, type: "shape", color: effectiveColor, width: effectiveWidth, shape: tool as 'line' | 'rect' | 'circle' | 'triangle' });
      }
    },
    [isDrawer, active, normalize, effectiveColor, effectiveWidth, drawSegment, drawShape, tool],
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent) => {
      if (!isDrawer || !isDrawing.current) return;
      isDrawing.current = false;
      const pos = normalize(e.nativeEvent);
      if (tool === 'pen' || tool === 'eraser') {
        if (pos) pendingPoints.current.push({ ...pos, type: "end", color: effectiveColor, width: effectiveWidth });
      } else if (pos && shapeStartPos.current) {
        const shapePt: DrawPoint = { x: shapeStartPos.current.x, y: shapeStartPos.current.y, x2: pos.x, y2: pos.y, type: "shape", color: effectiveColor, width: effectiveWidth, shape: tool as 'line' | 'rect' | 'circle' | 'triangle' };
        const ctx = canvasRef.current?.getContext("2d");
        if (ctx) { if (canvasSnapshot.current) ctx.putImageData(canvasSnapshot.current, 0, 0); drawShape(ctx, shapePt); }
        onDraw([shapePt]);
        shapeStartPos.current = null; canvasSnapshot.current = null;
      }
      lastPos.current = null;
    },
    [isDrawer, normalize, effectiveColor, effectiveWidth, tool, drawShape, onDraw],
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
      if (tool === 'fill') {
        const ctx = canvasRef.current?.getContext("2d");
        if (ctx) {
          floodFill(ctx, pos.x, pos.y, effectiveColor);
          const fillPt: DrawPoint = { x: pos.x, y: pos.y, type: "fill", color: effectiveColor, width: effectiveWidth };
          onDraw([fillPt]);
        }
        isDrawing.current = false;
      } else if (tool === 'pen' || tool === 'eraser') {
        const pt: DrawPoint = { ...pos, type: "start", color: effectiveColor, width: effectiveWidth };
        pendingPoints.current.push(pt);
        const ctx = canvasRef.current?.getContext("2d");
        if (ctx) drawDot(ctx, pos.x, pos.y, effectiveColor, effectiveWidth);
      } else {
        shapeStartPos.current = pos;
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (canvas && ctx) canvasSnapshot.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
      }
    },
    [isDrawer, active, normalize, effectiveColor, effectiveWidth, drawDot, tool, floodFill, onDraw],
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!isDrawer || !active || !isDrawing.current) return;
      e.preventDefault();
      const pos = normalize(e.touches[0]);
      if (!pos) return;
      if (tool === 'pen' || tool === 'eraser') {
        if (!lastPos.current) return;
        const pt: DrawPoint = { ...pos, type: "draw", color: effectiveColor, width: effectiveWidth };
        pendingPoints.current.push(pt);
        const ctx = canvasRef.current?.getContext("2d");
        if (ctx) drawSegment(ctx, lastPos.current, pos, effectiveColor, effectiveWidth);
        lastPos.current = pos;
      } else {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx || !shapeStartPos.current || !canvasSnapshot.current) return;
        ctx.putImageData(canvasSnapshot.current, 0, 0);
        drawShape(ctx, { x: shapeStartPos.current.x, y: shapeStartPos.current.y, x2: pos.x, y2: pos.y, type: "shape", color: effectiveColor, width: effectiveWidth, shape: tool as 'line' | 'rect' | 'circle' | 'triangle' });
      }
    },
    [isDrawer, active, normalize, effectiveColor, effectiveWidth, drawSegment, drawShape, tool],
  );

  const handleTouchEnd = useCallback(() => {
    if (!isDrawer || !isDrawing.current) return;
    isDrawing.current = false;
    if (tool === 'pen' || tool === 'eraser') {
      if (lastPos.current) pendingPoints.current.push({ x: lastPos.current.x, y: lastPos.current.y, type: "end", color: effectiveColor, width: effectiveWidth });
    } else if (lastPos.current && shapeStartPos.current) {
      const shapePt: DrawPoint = { x: shapeStartPos.current.x, y: shapeStartPos.current.y, x2: lastPos.current.x, y2: lastPos.current.y, type: "shape", color: effectiveColor, width: effectiveWidth, shape: tool as 'line' | 'rect' | 'circle' | 'triangle' };
      const ctx = canvasRef.current?.getContext("2d");
      if (ctx) { if (canvasSnapshot.current) ctx.putImageData(canvasSnapshot.current, 0, 0); drawShape(ctx, shapePt); }
      onDraw([shapePt]);
      shapeStartPos.current = null; canvasSnapshot.current = null;
    }
    lastPos.current = null;
  }, [isDrawer, effectiveColor, effectiveWidth, tool, drawShape, onDraw]);

  const handleClear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = CANVAS_BG;
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
          cursor: isDrawer && active ? (tool === 'eraser' ? "cell" : tool === 'fill' ? "crosshair" : "crosshair") : "default",
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
          {/* Tool selector */}
          <div className="flex gap-1">
            {([
              { id: 'pen' as Tool, icon: '✏️', title: 'Pen' },
              { id: 'line' as Tool, icon: '╱', title: 'Line' },
              { id: 'rect' as Tool, icon: '▭', title: 'Rectangle' },
              { id: 'circle' as Tool, icon: '◯', title: 'Circle' },
              { id: 'triangle' as Tool, icon: '△', title: 'Triangle' },
              { id: 'fill' as Tool, icon: '🪣', title: 'Fill Bucket' },
            ]).map((t) => (
              <button key={t.id} onClick={() => setTool(t.id)}
                className="w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer transition-all"
                style={{
                  background: tool === t.id ? "var(--accent-primary)" : "var(--bg-tertiary)",
                  color: tool === t.id ? "var(--bg-primary)" : "var(--text-muted)",
                  fontSize: t.id === 'pen' ? 13 : 15,
                }}
                title={t.title}>{t.icon}</button>
            ))}
          </div>

          {/* Divider */}
          <div className="w-px h-5 rounded" style={{ background: "var(--border-default)" }} />

          {/* Color palette */}
          <div className="flex flex-wrap gap-1.5">
            {COLORS.map((c) => (
              <button key={c} onClick={() => { setColor(c); if (tool === 'eraser') setTool('pen'); }}
                className="w-6 h-6 rounded-full transition-transform hover:scale-110 cursor-pointer"
                style={{
                  background: c,
                  border: tool !== 'eraser' && color === c ? "2px solid var(--accent-primary)" : "2px solid rgba(0,0,0,0.15)",
                  transform: tool !== 'eraser' && color === c ? "scale(1.2)" : undefined,
                  boxShadow: c === "#ffffff" ? "inset 0 0 0 1px rgba(0,0,0,0.1)" : undefined,
                }} />
            ))}
          </div>

          {/* Divider */}
          <div className="w-px h-5 rounded" style={{ background: "var(--border-default)" }} />

          {/* Brush sizes */}
          <div className="flex gap-1">
            {WIDTHS.map((w) => (
              <button key={w.label} onClick={() => { setWidth(w.value); if (tool === 'eraser') setTool('pen'); }}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold cursor-pointer transition-all"
                style={{
                  background: tool !== 'eraser' && width === w.value ? "var(--accent-primary)" : "var(--bg-tertiary)",
                  color: tool !== 'eraser' && width === w.value ? "var(--bg-primary)" : "var(--text-muted)",
                }}>{w.label}</button>
            ))}
          </div>

          {/* Eraser */}
          <button onClick={() => setTool(tool === 'eraser' ? 'pen' : 'eraser')}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-sm cursor-pointer transition-all"
            style={{
              background: tool === 'eraser' ? "var(--accent-warm)" : "var(--bg-tertiary)",
              color: tool === 'eraser' ? "var(--bg-primary)" : "var(--text-muted)",
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
