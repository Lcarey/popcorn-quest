import { AnimatePresence, motion } from "framer-motion";
import { COSMETICS } from "@popcorn/shared";

export function CelebrateToast({
  show,
  xpDelta,
  leveledUp,
  unlocked,
  onDone,
}: {
  show: boolean;
  xpDelta: number;
  leveledUp: boolean;
  unlocked?: string;
  onDone: () => void;
}) {
  const cosmetic = unlocked ? COSMETICS.find((c) => c.id === unlocked) : undefined;
  return (
    <AnimatePresence onExitComplete={onDone}>
      {show && (
        <motion.div
          className="fixed left-1/2 top-24 -translate-x-1/2 z-50 pointer-events-none"
          initial={{ y: -20, opacity: 0, scale: 0.9 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: -20, opacity: 0 }}
          transition={{ type: "spring", stiffness: 220, damping: 22 }}
        >
          <div
            className={[
              "px-5 py-3 rounded-2xl shadow-chunky border-2 border-white font-display font-bold text-lg flex items-center gap-2",
              leveledUp ? "bg-gradient-to-r from-butter to-coral text-white" : "bg-white text-cocoa",
            ].join(" ")}
          >
            <span className="text-2xl">{leveledUp ? "🎉" : xpDelta > 0 ? "✨" : "↩️"}</span>
            <span>
              {leveledUp
                ? `Level up! +${xpDelta} XP`
                : xpDelta > 0
                ? `+${xpDelta} XP`
                : `${xpDelta} XP`}
            </span>
          </div>
          {cosmetic && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="mt-2 px-4 py-2 rounded-2xl bg-white shadow-chunky-sm border-2 border-white text-sm font-semibold text-cocoa text-center"
            >
              Unlocked: <span className="text-coral">{cosmetic.name}</span>
            </motion.div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
