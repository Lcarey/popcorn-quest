// =============================================================================
// Sound + haptic feedback. Uses the Web Audio API to synthesize tones on the
// fly so we don't ship audio asset bytes.
// =============================================================================

let ctx: AudioContext | null = null;
function audioCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (ctx) return ctx;
  const Ctor = window.AudioContext || (window as any).webkitAudioContext;
  if (!Ctor) return null;
  ctx = new Ctor();
  return ctx;
}

function tone(opts: {
  freq: number;
  duration: number;
  type?: OscillatorType;
  attack?: number;
  release?: number;
  gain?: number;
  startAt?: number;
  freqEnd?: number;
}) {
  const ac = audioCtx();
  if (!ac) return;
  if (ac.state === "suspended") ac.resume().catch(() => {});

  const startAt = (opts.startAt ?? 0) + ac.currentTime;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = opts.type ?? "sine";
  osc.frequency.setValueAtTime(opts.freq, startAt);
  if (opts.freqEnd != null) {
    osc.frequency.exponentialRampToValueAtTime(opts.freqEnd, startAt + opts.duration);
  }

  const peak = opts.gain ?? 0.18;
  const attack = opts.attack ?? 0.01;
  const release = opts.release ?? 0.08;
  g.gain.setValueAtTime(0, startAt);
  g.gain.linearRampToValueAtTime(peak, startAt + attack);
  g.gain.linearRampToValueAtTime(0, startAt + opts.duration + release);

  osc.connect(g).connect(ac.destination);
  osc.start(startAt);
  osc.stop(startAt + opts.duration + release + 0.05);
}

export function playCheck() {
  // soft "boop" — short rising tone
  tone({ freq: 520, freqEnd: 880, duration: 0.08, type: "sine", gain: 0.18 });
}

export function playUncheck() {
  // descending blip when un-checking
  tone({ freq: 440, freqEnd: 280, duration: 0.08, type: "sine", gain: 0.15 });
}

export function playLevelUp() {
  // C–E–G arpeggio
  tone({ freq: 523.25, duration: 0.12, type: "triangle", gain: 0.2, startAt: 0 });
  tone({ freq: 659.25, duration: 0.12, type: "triangle", gain: 0.2, startAt: 0.12 });
  tone({ freq: 783.99, duration: 0.22, type: "triangle", gain: 0.22, startAt: 0.24 });
}

export function playClaim() {
  // descending chime "spend XP"
  tone({ freq: 880, duration: 0.08, type: "triangle", gain: 0.2, startAt: 0 });
  tone({ freq: 660, duration: 0.12, type: "triangle", gain: 0.2, startAt: 0.08 });
}

export function playBark() {
  // two quick "woof"s — low sawtooth chirps falling in pitch
  tone({ freq: 220, freqEnd: 130, duration: 0.09, type: "sawtooth", gain: 0.16 });
  tone({ freq: 240, freqEnd: 140, duration: 0.1, type: "sawtooth", gain: 0.16, startAt: 0.14 });
}

export function playFanfare() {
  // full-day fanfare: C–E–G–C ascending with a sparkle on top
  tone({ freq: 523.25, duration: 0.12, type: "triangle", gain: 0.2, startAt: 0 });
  tone({ freq: 659.25, duration: 0.12, type: "triangle", gain: 0.2, startAt: 0.12 });
  tone({ freq: 783.99, duration: 0.12, type: "triangle", gain: 0.22, startAt: 0.24 });
  tone({ freq: 1046.5, duration: 0.3, type: "triangle", gain: 0.24, startAt: 0.36 });
  tone({ freq: 1568, duration: 0.25, type: "sine", gain: 0.12, startAt: 0.44 });
}

export function vibrate(pattern: number | number[]) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch {
      /* ignore */
    }
  }
}
