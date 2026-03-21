// Tiny sound effect system using Web Audio API — no external files needed
const ctx = typeof window !== 'undefined' ? new (window.AudioContext || (window as any).webkitAudioContext)() : null;

function ensureCtx() {
  if (ctx && ctx.state === 'suspended') ctx.resume();
}

function play(freq: number, type: OscillatorType, duration: number, vol = 0.12) {
  if (!ctx) return;
  ensureCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(vol, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + duration);
}

function playSeq(notes: Array<{ f: number; d: number; delay: number }>, type: OscillatorType = 'sine', vol = 0.1) {
  notes.forEach(({ f, d, delay }) => {
    setTimeout(() => play(f, type, d, vol), delay * 1000);
  });
}

export const sfx = {
  /** Soft click — button press, key tap */
  click: () => play(800, 'sine', 0.08, 0.06),

  /** Pop — tile placed */
  pop: () => play(520, 'sine', 0.12, 0.08),

  /** Correct — green tile */
  correct: () => playSeq([
    { f: 523, d: 0.15, delay: 0 },
    { f: 659, d: 0.2, delay: 0.1 },
  ], 'sine', 0.1),

  /** Win — all correct */
  win: () => playSeq([
    { f: 523, d: 0.15, delay: 0 },
    { f: 659, d: 0.15, delay: 0.1 },
    { f: 784, d: 0.15, delay: 0.2 },
    { f: 1047, d: 0.3, delay: 0.3 },
  ], 'sine', 0.12),

  /** Fail — wrong guess shake */
  fail: () => play(200, 'triangle', 0.2, 0.08),

  /** Flip — tile revealing */
  flip: () => play(440, 'sine', 0.06, 0.04),

  /** Join — player entered */
  join: () => playSeq([
    { f: 440, d: 0.1, delay: 0 },
    { f: 554, d: 0.15, delay: 0.08 },
  ], 'sine', 0.08),

  /** Countdown tick */
  tick: () => play(600, 'sine', 0.1, 0.06),

  /** Go — game start */
  go: () => playSeq([
    { f: 523, d: 0.12, delay: 0 },
    { f: 784, d: 0.2, delay: 0.08 },
  ], 'triangle', 0.1),

  /** Send — chat message */
  send: () => play(700, 'sine', 0.06, 0.04),

  /** Hover — subtle */
  hover: () => play(900, 'sine', 0.04, 0.02),
};
