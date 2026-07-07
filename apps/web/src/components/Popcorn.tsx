// =============================================================================
// Popcorn the dog — uses real photos that swap based on mood.
//
//   sleepy    → tired/looking-down photo
//   neutral   → standing alert
//   happy     → smiling/tongue-out
//   ecstatic  → action shot in snow
//
// On completion, fire `celebrate()` via ref to play a bounce + sparkle burst.
// =============================================================================

import { AnimatePresence, motion, useAnimation } from "framer-motion";
import { forwardRef, useImperativeHandle, useState } from "react";
import {
  levelFromXp,
  nextCosmeticUnlock,
  type PetMood,
  type PetState,
  type WeatherCondition,
  type WeatherToday,
} from "@popcorn/shared";
import { playBark, vibrate } from "../lib/feedback";
import { HatArt } from "./CosmeticArt";

export interface PopcornHandle {
  celebrate: () => Promise<void>;
  /** Full-day finish: backflip + big burst. */
  bigCelebrate: () => Promise<void>;
}

// Random reaction when the kid taps Popcorn — she's a dog, not a button.
const TAP_REACTIONS = [
  { y: [0, -24, 0, -8, 0], transition: { duration: 0.6 } }, // jump
  { rotate: [0, -12, 12, -8, 8, 0], transition: { duration: 0.5 } }, // wiggle
  { scale: [1, 1.15, 0.95, 1], rotate: [0, 6, -6, 0], transition: { duration: 0.5 } }, // bounce
  { rotate: [0, 360], transition: { duration: 0.6 } }, // spin
];

const TAP_EMOJIS = ["💖", "🐾", "⭐", "🦴", "🎾", "💕"];

interface PopcornProps {
  pet: PetState;
  mood: PetMood;
  onTap?: () => void;
  /** From GET /weather; omitted or all-null shows placeholders. */
  weather?: WeatherToday | null;
}

const MOOD_PHOTO: Record<PetMood, string> = {
  sleepy: "/popcorn-moods/photo4.jpg",
  neutral: "/popcorn-moods/photo3.jpg",
  happy: "/popcorn-moods/photo1.jpg",
  ecstatic: "/popcorn-moods/photo2.jpg",
};

// Where the crown of Popcorn's head sits in each mood photo, as % of the
// square object-cover frame (measured against center-cropped photos), plus
// how tilted her head is. Keeps hats on her head instead of floating in the
// frame corner.
const HEAD_ANCHOR: Record<PetMood, { x: number; y: number; angle: number }> = {
  sleepy: { x: 32, y: 42, angle: -28 }, // photo4: looking down-left
  neutral: { x: 56, y: 38, angle: -5 }, // photo3
  happy: { x: 51, y: 41, angle: -4 }, // photo1
  ecstatic: { x: 47, y: 25, angle: -5 }, // photo2
};

export const Popcorn = forwardRef<PopcornHandle, PopcornProps>(function Popcorn(
  { pet, mood, onTap, weather },
  ref,
) {
  const controls = useAnimation();
  const sparkleControls = useAnimation();
  const [burst, setBurst] = useState<{ id: number; emoji: string } | null>(null);

  useImperativeHandle(ref, () => ({
    async celebrate() {
      await Promise.all([
        controls.start({
          y: [0, -28, 0, -10, 0],
          rotate: [0, -6, 6, -3, 0],
          transition: { duration: 0.7 },
        }),
        sparkleControls.start({
          opacity: [0, 1, 0],
          scale: [0.6, 1.4, 0.4],
          transition: { duration: 0.7 },
        }),
      ]);
    },
    async bigCelebrate() {
      await Promise.all([
        controls.start({
          y: [0, -40, 0, -16, 0],
          rotate: [0, -360],
          transition: { duration: 1.1 },
        }),
        sparkleControls.start({
          opacity: [0, 1, 1, 0],
          scale: [0.6, 1.6, 1.3, 0.4],
          transition: { duration: 1.1 },
        }),
      ]);
    },
  }));

  const hat = pet.equipped.hat;
  const collar = pet.equipped.collar ?? "collar-red";
  const scene = pet.equipped.scene ?? "scene-yard";
  const { level, intoLevel, nextLevelXp } = levelFromXp(pet.xp);
  const nextUnlock = nextCosmeticUnlock(level);

  const idle: { y: number[]; rotate?: number[]; duration: number } = (() => {
    switch (mood) {
      case "sleepy":
        return { y: [0, -2, 0], duration: 3 };
      case "neutral":
        return { y: [0, -3, 0], duration: 2.4 };
      case "happy":
        return { y: [0, -5, 0], rotate: [-1, 1, -1], duration: 1.8 };
      case "ecstatic":
        return { y: [0, -8, 0], rotate: [-2, 2, -2], duration: 1.0 };
    }
  })();

  return (
    <div className="relative select-none">
      <SceneBackground scene={scene} />
      <CornerOverlays weather={weather} />

      <button
        type="button"
        onClick={async () => {
          onTap?.();
          playBark();
          vibrate(15);
          setBurst({
            id: Date.now(),
            emoji: TAP_EMOJIS[Math.floor(Math.random() * TAP_EMOJIS.length)],
          });
          const reaction = TAP_REACTIONS[Math.floor(Math.random() * TAP_REACTIONS.length)];
          await controls.start(reaction);
        }}
        className="relative w-full flex items-center justify-center pt-2 pb-2 cursor-pointer"
        aria-label={`${pet.name} the dog, mood ${mood}`}
      >
        <motion.div animate={controls} className="relative w-56 h-56 sm:w-64 sm:h-64">
          {/* Idle motion wrapper */}
          <motion.div
            animate={{ y: idle.y, rotate: idle.rotate }}
            transition={{
              duration: idle.duration,
              repeat: Infinity,
              ease: "easeInOut",
            }}
            className="relative w-full h-full"
          >
            {/* Soft drop shadow */}
            <div
              className="absolute left-1/2 -translate-x-1/2 bottom-0 w-44 h-4 rounded-full bg-cocoa/30 blur-md"
              aria-hidden="true"
            />

            {/* Mood badges */}
            {mood === "sleepy" && (
              <motion.div
                className="absolute top-2 right-3 text-2xl text-cocoa/60 font-display font-bold z-10"
                animate={{ y: [-2, -8, -2], opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                z z Z
              </motion.div>
            )}
            {mood === "ecstatic" && (
              <>
                <motion.div
                  className="absolute -top-1 left-2 text-2xl z-10"
                  animate={{ y: [-2, -10, -2], scale: [0.9, 1.1, 0.9] }}
                  transition={{ duration: 1, repeat: Infinity }}
                >
                  💖
                </motion.div>
                <motion.div
                  className="absolute top-2 right-2 text-xl z-10"
                  animate={{ y: [-2, -8, -2], scale: [0.8, 1.05, 0.8] }}
                  transition={{ duration: 1.2, repeat: Infinity, delay: 0.3 }}
                >
                  ✨
                </motion.div>
              </>
            )}
            {mood === "happy" && (
              <motion.div
                className="absolute top-2 right-2 text-xl z-10"
                animate={{ y: [-2, -6, -2], scale: [0.9, 1.05, 0.9] }}
                transition={{ duration: 1.6, repeat: Infinity }}
              >
                😊
              </motion.div>
            )}

            {/* Photo crossfade */}
            <div className="relative w-full h-full rounded-full overflow-hidden border-4 border-white shadow-chunky bg-cream">
              <AnimatePresence>
                <motion.img
                  key={mood}
                  src={MOOD_PHOTO[mood]}
                  alt={`Popcorn, ${mood}`}
                  initial={{ opacity: 0, scale: 1.05 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.5 }}
                  className="absolute inset-0 w-full h-full object-cover"
                  draggable={false}
                />
              </AnimatePresence>
            </div>

            {/* Hat overlay */}
            {hat && <HatOverlay id={hat} mood={mood} />}

            {/* Collar overlay */}
            <CollarOverlay id={collar} />

            {/* Treat overlay */}
            {pet.equipped.treat && <TreatOverlay id={pet.equipped.treat} />}
          </motion.div>

          {/* Sparkles burst (on completion) */}
          <motion.div
            animate={sparkleControls}
            initial={{ opacity: 0 }}
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
          >
            <Sparkles />
          </motion.div>

          {/* Tap reaction burst */}
          <AnimatePresence>
            {burst && (
              <motion.div
                key={burst.id}
                initial={{ opacity: 1, y: 0, scale: 0.6 }}
                animate={{ opacity: 0, y: -70, scale: 1.4 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.9, ease: "easeOut" }}
                onAnimationComplete={() => setBurst(null)}
                className="pointer-events-none absolute left-1/2 top-6 -translate-x-1/2 text-4xl z-30"
              >
                {burst.emoji}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </button>

      <XpBar level={level} intoLevel={intoLevel} nextLevelXp={nextLevelXp} nextUnlock={nextUnlock} />
    </div>
  );
});

function XpBar({
  level,
  intoLevel,
  nextLevelXp,
  nextUnlock,
}: {
  level: number;
  intoLevel: number;
  nextLevelXp: number;
  nextUnlock: ReturnType<typeof nextCosmeticUnlock>;
}) {
  const pct = nextLevelXp > 0 ? Math.min(1, intoLevel / nextLevelXp) : 1;
  const remaining = Math.max(0, nextLevelXp - intoLevel);
  return (
    <div className="px-2 pb-1">
      <div className="flex items-baseline justify-between mb-1">
        <div className="font-display font-bold text-sm text-cocoa">Level {level}</div>
        <div className="text-xs font-semibold text-cocoa/70">
          {remaining} XP to Level {level + 1}
        </div>
      </div>
      <div className="h-3.5 bg-white/80 rounded-full overflow-hidden border-2 border-white shadow-inner">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-butter via-peach to-coral"
          initial={false}
          animate={{ width: `${Math.round(pct * 100)}%` }}
          transition={{ type: "spring", stiffness: 120, damping: 20 }}
        />
      </div>
      {nextUnlock && (
        <div className="mt-1.5 text-xs font-semibold text-cocoa/80 text-center">
          Level {nextUnlock.unlocksAtLevel} unlocks{" "}
          <span className="text-coral font-bold">
            {nextUnlock.emoji} {nextUnlock.name}
          </span>
          !
        </div>
      )}
    </div>
  );
}

// Anchors the hat to Popcorn's head in the current mood photo and springs to
// the new spot when the photo crossfades.
function HatOverlay({ id, mood }: { id: string; mood: PetMood }) {
  const a = HEAD_ANCHOR[mood];
  return (
    <motion.div
      className="absolute z-20 pointer-events-none"
      initial={false}
      animate={{ left: `${a.x}%`, top: `${a.y}%` }}
      transition={{ type: "spring", stiffness: 170, damping: 20 }}
    >
      {/* Base of the hat sits just onto the crown of her head. */}
      <div style={{ transform: "translate(-50%, -88%)" }}>
        <motion.div
          initial={false}
          animate={{ rotate: a.angle }}
          transition={{ type: "spring", stiffness: 170, damping: 20 }}
          style={{ transformOrigin: "50% 100%" }}
          className="drop-shadow-md"
        >
          <HatArt id={id} className="w-12 sm:w-14" />
        </motion.div>
      </div>
    </motion.div>
  );
}

// Her treat rests by her paws at the bottom edge of the portrait, gently
// wagging so the kid notices it's there.
function TreatOverlay({ id }: { id: string }) {
  if (id !== "treat-bone") return null;
  return (
    <motion.div
      className="absolute bottom-1 -right-1 z-20 pointer-events-none text-3xl drop-shadow-md"
      animate={{ rotate: [-14, -26, -14], y: [0, -2, 0] }}
      transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
    >
      🦴
    </motion.div>
  );
}

function conditionEmoji(c: WeatherCondition | null | undefined): string {
  switch (c) {
    case "sunny":
      return "☀️";
    case "cloudy":
      return "☁️";
    case "rain":
      return "🌧️";
    case "snow":
      return "❄️";
    case "windy":
      return "💨";
    default:
      return "";
  }
}

// Tapping the weather corners on mobile launches the OS weather app; on desktop
// it opens a weather page for Arlington, MA in a new tab. Apple's Weather app
// has no public scheme, but `weather://` reliably foregrounds it (location
// can't be passed). Android has no universal weather scheme — the Google
// search URL surfaces a weather card in Chrome/Google app.
function arlingtonWeatherHref(): string {
  if (typeof navigator === "undefined") {
    return "https://weather.com/weather/today/l/Arlington+MA";
  }
  const ua = navigator.userAgent ?? "";
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && (navigator.maxTouchPoints ?? 0) > 1);
  if (isIOS) return "weather://";
  if (/Android/.test(ua)) return "https://www.google.com/search?q=weather+arlington+ma";
  return "https://weather.com/weather/today/l/Arlington+MA";
}

function CornerOverlays({ weather }: { weather: WeatherToday | null | undefined }) {
  const w = weather ?? undefined;
  const icon = conditionEmoji(w?.condition ?? null);
  const weatherHref = arlingtonWeatherHref();

  return (
    <div className="pointer-events-none absolute inset-0 z-[5] overflow-hidden rounded-3xl">
      <a
        href={weatherHref}
        target="_blank"
        rel="noopener noreferrer"
        title="Weather in Arlington, MA"
        aria-label="Open weather for Arlington, MA"
        className="pointer-events-auto absolute top-2 left-2 text-left leading-tight drop-shadow-[0_1px_1px_rgba(255,255,255,0.85)] no-underline text-inherit cursor-pointer"
      >
        {w?.currentTempF != null ? (
          <>
            <div className="text-sm font-bold text-cocoa">{Math.round(w.currentTempF)}°</div>
            {w.minTempF != null && w.maxTempF != null && (
              <div className="text-[10px] font-semibold text-cocoa/80">
                ↓{Math.round(w.minTempF)}° ↑{Math.round(w.maxTempF)}°
              </div>
            )}
          </>
        ) : (
          <div className="text-xs font-semibold text-cocoa/45">—</div>
        )}
      </a>
      <a
        href={weatherHref}
        target="_blank"
        rel="noopener noreferrer"
        title="Weather in Arlington, MA"
        aria-label="Open weather for Arlington, MA"
        className="pointer-events-auto absolute top-2 right-2 flex flex-col items-end gap-0.5 drop-shadow-[0_1px_1px_rgba(255,255,255,0.85)] no-underline text-inherit cursor-pointer"
      >
        {w?.rainPopPercent != null ? (
          <div className="text-[10px] font-semibold text-cocoa/90">{w.rainPopPercent}% rain</div>
        ) : (
          <div className="text-[10px] font-semibold text-cocoa/45">—</div>
        )}
        <div className="text-xl leading-none" aria-hidden>
          {icon ? (
            <span className="text-2xl leading-none">{icon}</span>
          ) : (
            <span className="text-sm font-semibold text-cocoa/40">—</span>
          )}
        </div>
      </a>
    </div>
  );
}

function CollarOverlay({ id }: { id: string }) {
  const palette: Record<string, string[]> = {
    "collar-red": ["#ef4444", "#fbbf24"],
    "collar-rainbow": ["#fb7185", "#fbbf24", "#86efac", "#7dd3fc", "#c4b5fd"],
  };
  const colors = palette[id];
  if (!colors) return null;
  const isRainbow = id === "collar-rainbow";
  return (
    <div className="absolute left-1/2 -translate-x-1/2 -bottom-1 z-20">
      {isRainbow ? (
        <div className="flex h-3 rounded-full overflow-hidden border-2 border-white shadow-chunky-sm">
          {colors.map((c, i) => (
            <div key={i} style={{ background: c, width: 12, height: "100%" }} />
          ))}
        </div>
      ) : (
        <div
          className="h-3 w-16 rounded-full border-2 border-white shadow-chunky-sm relative flex items-center justify-center"
          style={{ background: colors[0] }}
        >
          <div
            className="absolute w-3 h-3 rounded-full border-2 border-white"
            style={{ background: colors[1] }}
          />
        </div>
      )}
    </div>
  );
}

function SceneBackground({ scene }: { scene: string }) {
  const variants: Record<string, JSX.Element> = {
    "scene-yard": (
      <div className="absolute inset-0 -z-10 rounded-3xl overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-sky/40 to-mint/40" />
        <div className="absolute bottom-0 left-0 right-0 h-1/3 bg-mint/60 rounded-t-[40%]" />
      </div>
    ),
    "scene-park": (
      <div className="absolute inset-0 -z-10 rounded-3xl overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-sky/60 to-mint/50" />
        <div className="absolute bottom-0 left-0 right-0 h-2/5 bg-mint/70 rounded-t-[40%]" />
        <div className="absolute top-2 right-2 text-3xl">☁️</div>
        <div className="absolute top-6 left-3 text-3xl">🌳</div>
        <div className="absolute top-4 right-10 text-3xl">🌳</div>
        <div className="absolute bottom-1 left-1/2 -translate-x-1/2 text-2xl">🦴</div>
      </div>
    ),
    "scene-beach": (
      <div className="absolute inset-0 -z-10 rounded-3xl overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-sky to-butter/80" />
        <div className="absolute bottom-0 left-0 right-0 h-1/3 bg-butter rounded-t-[60%]" />
        <div className="absolute top-3 right-4 text-3xl">🌞</div>
        <div className="absolute top-10 left-2 text-3xl">🌴</div>
        <div className="absolute bottom-2 right-4 text-2xl">🐚</div>
      </div>
    ),
    "scene-space": (
      <div className="absolute inset-0 -z-10 rounded-3xl overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-[#1e1b4b] to-[#312e81]" />
        <div className="absolute top-3 right-4 text-3xl">🌙</div>
        <div className="absolute top-6 left-4 text-2xl">⭐</div>
        <div className="absolute top-12 right-12 text-xl">✨</div>
        <div className="absolute bottom-6 left-8 text-2xl">🪐</div>
      </div>
    ),
  };
  return variants[scene] ?? variants["scene-yard"];
}

function Sparkles() {
  return (
    <div className="relative w-full h-full">
      {[
        { x: 20, y: 30, d: 0 },
        { x: 80, y: 20, d: 0.1 },
        { x: 70, y: 80, d: 0.2 },
        { x: 30, y: 70, d: 0.15 },
        { x: 50, y: 10, d: 0.05 },
      ].map((s, i) => (
        <span
          key={i}
          className="absolute animate-sparkle text-2xl"
          style={{
            left: `${s.x}%`,
            top: `${s.y}%`,
            animationDelay: `${s.d}s`,
          }}
        >
          ✨
        </span>
      ))}
    </div>
  );
}
