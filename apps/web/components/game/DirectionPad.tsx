"use client";

type Direction = "up" | "down" | "left" | "right";

interface Props {
  accentColor: string;
  activeDirection?: Direction | null;
  title?: string;
  hint?: string;
  className?: string;
  onDirectionTap?: (direction: Direction) => void;
  onDirectionStart?: (direction: Direction) => void;
  onDirectionEnd?: (direction: Direction) => void;
}

const BUTTONS: Array<{ direction: Direction; label: string; className: string }> = [
  { direction: "up", label: "↑", className: "col-start-2 row-start-1" },
  { direction: "left", label: "←", className: "col-start-1 row-start-2" },
  { direction: "down", label: "↓", className: "col-start-2 row-start-2" },
  { direction: "right", label: "→", className: "col-start-3 row-start-2" },
];

export default function DirectionPad({
  accentColor,
  activeDirection = null,
  title,
  hint,
  className = "",
  onDirectionTap,
  onDirectionStart,
  onDirectionEnd,
}: Props) {
  const holdMode = Boolean(onDirectionStart || onDirectionEnd);

  const handlePointerDown = (direction: Direction) => (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (holdMode) {
      onDirectionStart?.(direction);
      return;
    }
    onDirectionTap?.(direction);
  };

  const handlePointerUp = (direction: Direction) => (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (holdMode) onDirectionEnd?.(direction);
  };

  return (
    <div className={`w-full max-w-[240px] rounded-3xl p-3 ${className}`}
      style={{ background: "rgba(15,23,42,0.78)", border: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(12px)" }}>
      {(title || hint) && (
        <div className="mb-3 text-center">
          {title && (
            <p className="text-[11px] font-black uppercase tracking-[0.22em]" style={{ color: accentColor }}>
              {title}
            </p>
          )}
          {hint && (
            <p className="mt-1 text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>
              {hint}
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        {BUTTONS.map((button) => {
          const active = activeDirection === button.direction;
          return (
            <button
              key={button.direction}
              type="button"
              onPointerDown={handlePointerDown(button.direction)}
              onPointerUp={handlePointerUp(button.direction)}
              onPointerLeave={handlePointerUp(button.direction)}
              onPointerCancel={handlePointerUp(button.direction)}
              className={`h-14 rounded-2xl text-2xl font-black transition-transform active:scale-95 ${button.className}`}
              style={{
                background: active ? accentColor : "rgba(255,255,255,0.06)",
                color: active ? "var(--bg-primary)" : "var(--text-primary)",
                boxShadow: active ? `0 10px 30px ${accentColor}55` : "none",
                touchAction: "none",
              }}
              aria-label={`Move ${button.direction}`}
            >
              {button.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
