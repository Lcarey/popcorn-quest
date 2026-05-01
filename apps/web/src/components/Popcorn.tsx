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
import { forwardRef, useImperativeHandle } from "react";
import type { PetMood, PetState } from "@popcorn/shared";

export interface PopcornHandle {
  celebrate: () => Promise<void>;
}

interface PopcornProps {
  pet: PetState;
  mood: PetMood;
  onTap?: () => void;
}

const MOOD_PHOTO: Record<PetMood, string> = {
  sleepy: "/popcorn-moods/photo4.jpg",
  neutral: "/popcorn-moods/photo3.jpg",
  happy: "/popcorn-moods/photo1.jpg",
  ecstatic: "/popcorn-moods/photo2.jpg",
};

export const Popcorn = forwardRef<PopcornHandle, PopcornProps>(function Popcorn(
  { pet, mood, onTap },
  ref,
) {
  const controls = useAnimation();
  const sparkleControls = useAnimation();

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
  }));

  const hat = pet.equipped.hat;
  const collar = pet.equipped.collar ?? "collar-red";
  const scene = pet.equipped.scene ?? "scene-yard";

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

      <button
        type="button"
        onClick={async () => {
          onTap?.();
          await controls.start({
            scale: [1, 1.06, 0.98, 1],
            transition: { duration: 0.3 },
          });
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
            {hat && <HatOverlay id={hat} />}

            {/* Collar overlay */}
            <CollarOverlay id={collar} />
          </motion.div>

          {/* Sparkles burst (on completion) */}
          <motion.div
            animate={sparkleControls}
            initial={{ opacity: 0 }}
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
          >
            <Sparkles />
          </motion.div>
        </motion.div>
      </button>
    </div>
  );
});

function HatOverlay({ id }: { id: string }) {
  const wrapper = "absolute left-1/2 -translate-x-1/2 -top-3 text-5xl drop-shadow-md z-20";
  switch (id) {
    case "hat-party":
      return <div className={wrapper}>🎉</div>;
    case "hat-crown":
      return <div className={wrapper}>👑</div>;
    case "hat-graduation":
      return <div className={wrapper}>🎓</div>;
    default:
      return null;
  }
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
        <div className="absolute top-3 right-4 text-3xl">☀️</div>
        <div className="absolute bottom-2 left-3 text-2xl">🌼</div>
        <div className="absolute bottom-2 right-6 text-2xl">🌷</div>
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
