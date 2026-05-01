import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  moodFromProgress,
  todayKey,
  type CompleteResponse,
  type Reward,
  type TodayState,
} from "@popcorn/shared";
import { api } from "../api";
import { useApp } from "../store";
import { Popcorn, type PopcornHandle } from "../components/Popcorn";
import { XpBar } from "../components/XpBar";
import { TaskRow } from "../components/TaskRow";
import { WeeklyRow } from "../components/WeeklyRow";
import { AddQuestSheet } from "../components/AddQuestSheet";
import { CelebrateToast } from "../components/CelebrateToast";
import { HistoryHeatmap } from "../components/HistoryHeatmap";
import { RewardShop } from "../components/RewardShop";
import {
  playCheck,
  playClaim,
  playLevelUp,
  playUncheck,
  vibrate,
} from "../lib/feedback";

export function Home() {
  const { familyId } = useApp();
  const date = todayKey();
  const qc = useQueryClient();
  const popcornRef = useRef<PopcornHandle>(null);

  const stateQuery = useQuery({
    queryKey: ["state", familyId, date],
    queryFn: () => api.state(familyId!, date, true),
    enabled: !!familyId,
  });

  const [celebrate, setCelebrate] = useState<CompleteResponse | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  // Optimistic completion. Flip the targeted task's checkbox immediately and
  // fire feedback; the server response 100-300ms later overwrites the rest
  // (XP, level, progress, history, etc.).
  const completeMut = useMutation({
    mutationFn: (vars: { templateId?: string; adhocId?: string }) =>
      api.complete({ familyId: familyId!, date, ...vars }),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: ["state", familyId, date] });
      const prev = qc.getQueryData<TodayState>(["state", familyId, date]);
      if (!prev) return { prev };

      const next = structuredClone(prev) as TodayState;
      let willComplete = false;

      if (vars.templateId) {
        const daily = next.daily.find((d) => d.template.id === vars.templateId);
        const weekly = next.weekly.find((w) => w.template.id === vars.templateId);
        if (daily) {
          willComplete = !daily.completedToday;
          daily.completedToday = willComplete;
        } else if (weekly) {
          willComplete = !weekly.completedToday;
          weekly.completedToday = willComplete;
          weekly.doneThisWeek += willComplete ? 1 : -1;
        }
      } else if (vars.adhocId) {
        const a = next.adhoc.find((x) => x.id === vars.adhocId);
        if (a) {
          willComplete = !a.done;
          a.done = willComplete;
        }
      }

      if (willComplete) {
        playCheck();
        vibrate(20);
        popcornRef.current?.celebrate();
      } else {
        playUncheck();
      }

      qc.setQueryData(["state", familyId, date], next);
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(["state", familyId, date], ctx.prev);
    },
    onSuccess: (resp) => {
      qc.setQueryData(["state", familyId, date], resp.state);
      if (resp.leveledUp) {
        playLevelUp();
        vibrate([30, 60, 30]);
      }
      if (resp.xpDelta !== 0 || resp.leveledUp) {
        setCelebrate(resp);
        setTimeout(() => setCelebrate(null), 2400);
      }
    },
  });

  const adhocMut = useMutation({
    mutationFn: (vars: { title: string; emoji: string }) =>
      api.adhoc({ familyId: familyId!, title: vars.title, emoji: vars.emoji, date }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["state", familyId, date] });
    },
  });

  const claimMut = useMutation({
    mutationFn: (reward: Reward) =>
      api.claimReward({ familyId: familyId!, rewardId: reward.id }),
    onSuccess: async () => {
      playClaim();
      vibrate(40);
      await qc.invalidateQueries({ queryKey: ["state", familyId, date] });
    },
  });

  useEffect(() => {
    const onVis = () => qc.invalidateQueries({ queryKey: ["state", familyId, date] });
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [qc, familyId, date]);

  if (!familyId) return null;

  const state = stateQuery.data;
  const mood = state ? moodFromProgress(state.todayProgress) : "neutral";
  const xpBalance = state?.family.pet.xp ?? 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-semibold text-cocoa/60 uppercase tracking-wide">
            {new Date().toLocaleDateString(undefined, { weekday: "long" })}
          </div>
          <h1 className="text-3xl font-display font-bold">Chore Quest</h1>
        </div>
        <Link to="/parent" className="btn-ghost text-sm py-2 px-3">
          Parent
        </Link>
      </div>

      {/* Popcorn + streak */}
      <div className="card p-3">
        <div className="flex justify-end gap-2 mb-2">
          <div className="chip bg-butter">
            🔥 <span>Streak: {state?.family.streak ?? 0}</span>
          </div>
          <div className="chip">
            🐾 <span>Mood: {mood}</span>
          </div>
        </div>
        {state && <Popcorn ref={popcornRef} pet={state.family.pet} mood={mood} />}
      </div>

      {/* XP bar */}
      {state && <XpBar pet={state.family.pet} />}

      {/* Daily tasks */}
      {state && state.daily.length > 0 && (
        <Section title="Today">
          <div className="space-y-2">
            {state.daily.map((d) => (
              <TaskRow
                key={d.template.id}
                emoji={d.template.emoji}
                title={d.template.title}
                done={d.completedToday}
                onToggle={() => completeMut.mutate({ templateId: d.template.id })}
              />
            ))}
          </div>
        </Section>
      )}

      {/* Weekly tasks */}
      {state && state.weekly.length > 0 && (
        <Section title="This week">
          <div className="space-y-2">
            {state.weekly.map((w) => (
              <WeeklyRow
                key={w.template.id}
                emoji={w.template.emoji}
                title={w.template.title}
                doneCount={w.doneThisWeek}
                target={w.target}
                done={w.completedToday}
                onTick={() => completeMut.mutate({ templateId: w.template.id })}
              />
            ))}
          </div>
        </Section>
      )}

      {/* Ad-hoc */}
      <Section
        title="Side quests"
        action={
          <button onClick={() => setAddOpen(true)} className="text-sm font-semibold text-coral">
            + Add
          </button>
        }
      >
        {state && state.adhoc.length > 0 ? (
          <div className="space-y-2">
            {state.adhoc.map((a) => (
              <TaskRow
                key={a.id}
                emoji={a.emoji}
                title={a.title}
                done={a.done}
                subtitle="Side quest"
                onToggle={() => completeMut.mutate({ adhocId: a.id })}
              />
            ))}
          </div>
        ) : (
          <div className="card text-center text-cocoa/60 text-sm py-4">
            Nothing here yet. Tap <span className="text-coral font-bold">+ Add</span> to make one up!
          </div>
        )}
      </Section>

      {/* Rewards */}
      {state && (state.rewards.length > 0 || state.pendingClaims.length > 0) && (
        <RewardShop
          rewards={state.rewards}
          pendingClaims={state.pendingClaims}
          xpBalance={xpBalance}
          onClaim={(r) => claimMut.mutate(r)}
        />
      )}

      {/* History */}
      {state?.history && (
        <Section title="Streak history">
          <HistoryHeatmap history={state.history} />
        </Section>
      )}

      {/* Floating add button */}
      <button
        type="button"
        onClick={() => setAddOpen(true)}
        className="fixed bottom-5 right-1/2 translate-x-1/2 sm:translate-x-44 sm:right-1/2 z-30 btn-primary text-lg px-6 py-4 shadow-chunky"
      >
        + Add a quest
      </button>

      <AddQuestSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onAdd={async (title, emoji) => {
          await adhocMut.mutateAsync({ title, emoji });
        }}
      />

      <CelebrateToast
        show={!!celebrate}
        xpDelta={celebrate?.xpDelta ?? 0}
        leveledUp={celebrate?.leveledUp ?? false}
        unlocked={celebrate?.unlocked}
        onDone={() => setCelebrate(null)}
      />
    </div>
  );
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-center justify-between mb-2 px-1">
        <h2 className="font-display font-semibold text-lg text-cocoa">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
