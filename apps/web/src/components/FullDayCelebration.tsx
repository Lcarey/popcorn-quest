// Full-screen celebration for finishing every daily quest — deliberately much
// bigger than the per-task toast: confetti rain, streak flame, bonus callout.

import { AnimatePresence, motion } from "framer-motion";
import { useMemo } from "react";

const CONFETTI_COLORS = ["#fb7185", "#fde68a", "#86efac", "#7dd3fc", "#c4b5fd", "#fdba74"];

export function FullDayCelebration({
  show,
  streak,
  onDone,
}: {
  show: boolean;
  streak: number;
  onDone: () => void;
}) {
  return (
    <AnimatePresence onExitComplete={onDone}>
      {show && (
        <motion.div
          className="fixed inset-0 z-[60] pointer-events-none overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <Confetti />
          <div className="absolute inset-0 flex items-center justify-center">
            <motion.div
              initial={{ scale: 0.5, y: 30, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 18 }}
              className="bg-white/95 rounded-3xl shadow-chunky border-4 border-butter px-8 py-6 text-center mx-6"
            >
              <motion.div
                className="text-6xl mb-2"
                animate={{ rotate: [0, -10, 10, -6, 6, 0], scale: [1, 1.2, 1] }}
                transition={{ duration: 0.8, delay: 0.2 }}
              >
                🎉
              </motion.div>
              <div className="font-display font-bold text-2xl text-cocoa">
                All done today!
              </div>
              <motion.div
                className="mt-2 font-display font-bold text-xl text-coral flex items-center justify-center gap-2"
                initial={{ scale: 0 }}
                animate={{ scale: [0, 1.3, 1] }}
                transition={{ delay: 0.4, duration: 0.5 }}
              >
                <span className="text-3xl">🔥</span> Streak: {streak}
              </motion.div>
              <div className="mt-1 text-sm font-semibold text-cocoa/70">
                +bonus XP for the full day!
              </div>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Confetti() {
  // Random layout per mount; regenerating on each celebration is the point.
  const pieces = useMemo(
    () =>
      Array.from({ length: 50 }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.6,
        duration: 1.6 + Math.random() * 1.2,
        size: 8 + Math.random() * 8,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        rotate: Math.random() * 720 - 360,
        round: Math.random() > 0.5,
      })),
    [],
  );
  return (
    <>
      {pieces.map((p, i) => (
        <motion.div
          key={i}
          className="absolute top-0"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size * (p.round ? 1 : 0.6),
            background: p.color,
            borderRadius: p.round ? "50%" : 2,
          }}
          initial={{ y: -30, opacity: 1, rotate: 0 }}
          animate={{ y: "110vh", opacity: [1, 1, 0.8], rotate: p.rotate }}
          transition={{ duration: p.duration, delay: p.delay, ease: "easeIn" }}
        />
      ))}
    </>
  );
}
