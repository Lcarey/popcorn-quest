import { motion } from "framer-motion";
import type { Reward, RewardClaim } from "@popcorn/shared";

export function RewardShop({
  rewards,
  pendingClaims,
  xpBalance,
  onClaim,
}: {
  rewards: Reward[];
  pendingClaims: RewardClaim[];
  xpBalance: number;
  onClaim: (reward: Reward) => void;
}) {
  if (rewards.length === 0 && pendingClaims.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-1 px-1">
        <h2 className="font-display font-semibold text-lg text-cocoa">Reward Shop 🛍️</h2>
        <div className="chip bg-butter">
          ⭐ <span>{xpBalance} XP</span>
        </div>
      </div>

      {pendingClaims.length > 0 && (
        <div className="card bg-lilac/30 border-lilac">
          <div className="text-xs font-semibold text-cocoa/70 mb-1">
            Waiting for parent ⏳
          </div>
          <div className="space-y-1">
            {pendingClaims.map((c) => (
              <div key={c.id} className="flex items-center gap-2 text-sm">
                <span className="text-xl">{c.rewardEmoji}</span>
                <span className="flex-1 truncate">{c.rewardTitle}</span>
                <span className="text-xs font-bold text-cocoa/70">{c.cost} XP</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {rewards.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {rewards.map((r) => (
            <RewardCard
              key={r.id}
              reward={r}
              affordable={xpBalance >= r.cost}
              onClaim={() => onClaim(r)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function RewardCard({
  reward,
  affordable,
  onClaim,
}: {
  reward: Reward;
  affordable: boolean;
  onClaim: () => void;
}) {
  return (
    <motion.button
      whileTap={{ scale: affordable ? 0.95 : 1 }}
      onClick={() => affordable && onClaim()}
      disabled={!affordable}
      className={[
        "card flex flex-col items-center text-center gap-1 p-3 transition",
        affordable ? "" : "opacity-60 grayscale",
      ].join(" ")}
    >
      <div className="text-4xl">{reward.emoji}</div>
      <div className="font-display font-semibold text-sm text-cocoa leading-tight">
        {reward.title}
      </div>
      <div
        className={[
          "chip text-xs",
          affordable ? "bg-mint" : "bg-white/60",
        ].join(" ")}
      >
        {reward.cost} XP
      </div>
    </motion.button>
  );
}
