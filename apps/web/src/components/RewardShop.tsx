import { motion } from "framer-motion";
import { STREAK_SHIELD, type Reward, type RewardClaim } from "@popcorn/shared";

export function RewardShop({
  rewards,
  pendingClaims,
  xpBalance,
  estDailyXp,
  shields,
  onClaim,
  onBuyShield,
}: {
  rewards: Reward[];
  pendingClaims: RewardClaim[];
  xpBalance: number;
  /** Rough XP a normal full day earns; used to translate cost into days. */
  estDailyXp: number;
  shields: number;
  onClaim: (reward: Reward) => void;
  onBuyShield: () => void;
}) {
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

      <div className="grid grid-cols-2 gap-2">
        <ShieldCard
          xpBalance={xpBalance}
          shields={shields}
          onBuy={onBuyShield}
        />
        {rewards.map((r) => (
          <RewardCard
            key={r.id}
            reward={r}
            affordable={xpBalance >= r.cost}
            estDailyXp={estDailyXp}
            xpBalance={xpBalance}
            onClaim={() => onClaim(r)}
          />
        ))}
      </div>
    </div>
  );
}

/** "≈ N more days" — kids reason in days of quests, not XP math. */
function daysAway(cost: number, xpBalance: number, estDailyXp: number): number {
  if (estDailyXp <= 0) return 0;
  return Math.ceil((cost - xpBalance) / estDailyXp);
}

function RewardCard({
  reward,
  affordable,
  estDailyXp,
  xpBalance,
  onClaim,
}: {
  reward: Reward;
  affordable: boolean;
  estDailyXp: number;
  xpBalance: number;
  onClaim: () => void;
}) {
  const days = affordable ? 0 : daysAway(reward.cost, xpBalance, estDailyXp);
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
      {!affordable && days > 0 && (
        <div className="text-[11px] font-semibold text-cocoa/60">
          ≈ {days} more {days === 1 ? "day" : "days"} of quests
        </div>
      )}
    </motion.button>
  );
}

function ShieldCard({
  xpBalance,
  shields,
  onBuy,
}: {
  xpBalance: number;
  shields: number;
  onBuy: () => void;
}) {
  const full = shields >= STREAK_SHIELD.max;
  const affordable = xpBalance >= STREAK_SHIELD.cost && !full;
  return (
    <motion.button
      whileTap={{ scale: affordable ? 0.95 : 1 }}
      onClick={() => affordable && onBuy()}
      disabled={!affordable}
      className={[
        "card flex flex-col items-center text-center gap-1 p-3 transition bg-sky/20 border-sky/60",
        affordable ? "" : "opacity-60",
      ].join(" ")}
    >
      <div className="text-4xl">🛡️</div>
      <div className="font-display font-semibold text-sm text-cocoa leading-tight">
        Streak Shield
      </div>
      <div className="text-[11px] font-semibold text-cocoa/60 leading-tight">
        Saves your 🔥 streak if you miss a day
      </div>
      <div className={["chip text-xs", affordable ? "bg-mint" : "bg-white/60"].join(" ")}>
        {full ? `Max ${STREAK_SHIELD.max} ✓` : `${STREAK_SHIELD.cost} XP`}
      </div>
      {shields > 0 && !full && (
        <div className="text-[11px] font-semibold text-cocoa/60">
          You have {"🛡️".repeat(shields)}
        </div>
      )}
    </motion.button>
  );
}
