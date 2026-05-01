import { motion } from "framer-motion";
import { levelFromXp, type PetState } from "@popcorn/shared";

export function XpBar({ pet }: { pet: PetState }) {
  const { level, intoLevel, nextLevelXp } = levelFromXp(pet.xp);
  const pct = nextLevelXp > 0 ? Math.min(1, intoLevel / nextLevelXp) : 0;
  return (
    <div className="card flex items-center gap-3">
      <div className="flex flex-col items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-butter to-peach shadow-chunky-sm">
        <div className="text-xs font-display font-semibold text-cocoa/70 leading-none">LV</div>
        <div className="text-2xl font-display font-bold text-cocoa leading-none">{level}</div>
      </div>
      <div className="flex-1">
        <div className="flex items-baseline justify-between">
          <div className="font-display font-semibold text-cocoa">{pet.name}</div>
          <div className="text-xs text-cocoa/70 font-semibold">
            {intoLevel} / {nextLevelXp} XP
          </div>
        </div>
        <div className="mt-1 h-3 bg-white rounded-full overflow-hidden border-2 border-white shadow-inner">
          <motion.div
            className="h-full bg-gradient-to-r from-coral via-peach to-butter rounded-full"
            initial={false}
            animate={{ width: `${pct * 100}%` }}
            transition={{ type: "spring", stiffness: 120, damping: 18 }}
          />
        </div>
      </div>
    </div>
  );
}
