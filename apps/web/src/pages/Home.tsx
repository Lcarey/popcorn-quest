import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  moodFromProgress,
  todayKey,
  XP_PER,
  type CompleteResponse,
  type Cosmetic,
  type Reward,
  type TodayState,
  type CalendarEventsResponse,
} from "@popcorn/shared";
import { api } from "../api";
import { Popcorn, type PopcornHandle } from "../components/Popcorn";
import { TaskRow } from "../components/TaskRow";
import { WeeklyRow } from "../components/WeeklyRow";
import { CumulativeWeeklyRow } from "../components/CumulativeWeeklyRow";
import { RepeatableDailyRow } from "../components/RepeatableDailyRow";
import { AddQuestSheet } from "../components/AddQuestSheet";
import { CelebrateToast } from "../components/CelebrateToast";
import { FullDayCelebration } from "../components/FullDayCelebration";
import { HistoryHeatmap } from "../components/HistoryHeatmap";
import { RewardShop } from "../components/RewardShop";
import { StreakBadge } from "../components/StreakBadge";
import { UpcomingCalendar } from "../components/UpcomingCalendar";
import { WardrobeSheet } from "../components/WardrobeSheet";
import { questIdeaForToday } from "../lib/sideQuestIdeas";
import {
  playCheck,
  playClaim,
  playFanfare,
  playLevelUp,
  playUncheck,
  vibrate,
} from "../lib/feedback";

export function Home() {
  const date = todayKey();
  const qc = useQueryClient();
  const popcornRef = useRef<PopcornHandle>(null);

  const stateQuery = useQuery({
    queryKey: ["state", date],
    queryFn: () => api.state(date, true),
  });

  const weatherQuery = useQuery({
    queryKey: ["weather"],
    queryFn: () => api.weather(),
    staleTime: 5 * 60 * 1000,
  });

  const calendarQuery = useQuery<CalendarEventsResponse>({
    queryKey: ["calendar-events"],
    queryFn: () => api.calendarEvents(),
    staleTime: 10 * 60 * 1000,
  });

  const [celebrate, setCelebrate] = useState<CompleteResponse | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [wardrobeOpen, setWardrobeOpen] = useState(false);
  // Streak count to show in the full-day takeover; null = hidden.
  const [fullDayStreak, setFullDayStreak] = useState<number | null>(null);

  // Optimistic completion. Flip the targeted task's checkbox immediately and
  // fire feedback; the server response 100-300ms later overwrites the rest
  // (XP, level, progress, history, etc.).
  const completeMut = useMutation({
    mutationFn: (vars: { templateId?: string; adhocId?: string; amount?: number; delta?: number }) =>
      api.complete({ date, ...vars }),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: ["state", date] });
      const prev = qc.getQueryData<TodayState>(["state", date]);
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
          if (weekly.template.weeklyTrack === "cumulative" && vars.amount !== undefined) {
            const oldAmount = weekly.amountToday ?? 0;
            const newAmount = vars.amount;
            weekly.doneThisWeek += newAmount - oldAmount;
            weekly.amountToday = newAmount;
            weekly.completedToday = newAmount > 0;
            willComplete = newAmount > 0 && oldAmount === 0;
          } else {
            const delta = vars.delta ?? 0;
            weekly.doneThisWeek = Math.max(0, weekly.doneThisWeek + delta);
            weekly.amountToday = Math.max(0, (weekly.amountToday ?? 0) + delta);
            weekly.completedToday = (weekly.amountToday ?? 0) > 0;
            willComplete = delta > 0;
          }
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

      qc.setQueryData(["state", date], next);
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(["state", date], ctx.prev);
    },
    onSuccess: (resp, _vars, ctx) => {
      qc.setQueryData(["state", date], resp.state);
      // Full-day finish: the server just credited today's streak. This is the
      // biggest moment of the day — takeover celebration instead of the toast.
      const becameFullDay =
        resp.state.family.lastStreakDate === date &&
        ctx?.prev?.family.lastStreakDate !== date;
      if (becameFullDay) {
        playFanfare();
        vibrate([40, 60, 40, 60, 80]);
        popcornRef.current?.bigCelebrate();
        setFullDayStreak(resp.state.family.streak);
        setTimeout(() => setFullDayStreak(null), 3200);
        return;
      }
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
      api.adhoc({ title: vars.title, emoji: vars.emoji, date }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["state", date] });
    },
  });

  const claimMut = useMutation({
    mutationFn: (reward: Reward) =>
      api.claimReward({ rewardId: reward.id }),
    onSuccess: async () => {
      playClaim();
      vibrate(40);
      await qc.invalidateQueries({ queryKey: ["state", date] });
    },
  });

  // Wardrobe equip — optimistic so the outfit changes under the kid's finger.
  const equipMut = useMutation({
    mutationFn: (vars: { slot: Cosmetic["slot"]; cosmeticId: string | null }) =>
      api.equip(vars),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: ["state", date] });
      const prev = qc.getQueryData<TodayState>(["state", date]);
      if (!prev) return { prev };
      const next = structuredClone(prev) as TodayState;
      if (vars.cosmeticId) next.family.pet.equipped[vars.slot] = vars.cosmeticId;
      else delete next.family.pet.equipped[vars.slot];
      qc.setQueryData(["state", date], next);
      playCheck();
      vibrate(15);
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(["state", date], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["state", date] }),
  });

  const shieldMut = useMutation({
    mutationFn: () => api.buyShield(),
    onSuccess: async () => {
      playClaim();
      vibrate(40);
      await qc.invalidateQueries({ queryKey: ["state", date] });
    },
  });

  useEffect(() => {
    const onVis = () => qc.invalidateQueries({ queryKey: ["state", date] });
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [qc, date]);

  const state = stateQuery.data;
  const mood = state ? moodFromProgress(state.todayProgress) : "neutral";
  const xpBalance = state?.family.pet.spendableXp ?? 0;
  const questIdea = questIdeaForToday(date);

  // Rough XP a normal full day earns — used by the shop to say "≈ N days".
  const estDailyXp = state
    ? Math.max(
        1,
        Math.round(
          state.daily.reduce((sum, d) => sum + taskXp(d.template), 0) +
            XP_PER.fullDayBonus +
            state.weekly.reduce((sum, w) => {
              const perWeek =
                w.template.weeklyTrack === "cumulative" ? 7 : Math.min(w.target, 7);
              return sum + (perWeek * taskXp(w.template)) / 7;
            }, 0),
        ),
      )
    : 1;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <div className="text-xs font-semibold text-cocoa/60 uppercase tracking-wide">
          {new Date().toLocaleDateString(undefined, { weekday: "long" })}
        </div>
        <h1 className="text-3xl font-display font-bold">Popcorn Quest</h1>
      </div>

      {/* Popcorn + streak */}
      <div className="card p-3">
        <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
          <StreakBadge
            streak={state?.family.streak ?? 0}
            shields={state?.family.streakShields ?? 0}
          />
          <div className="chip">
            🐾 <span>Mood: {mood}</span>
          </div>
        </div>
        {state && (
          <Popcorn
            ref={popcornRef}
            pet={state.family.pet}
            mood={mood}
            weather={weatherQuery.data}
          />
        )}
        <button
          type="button"
          onClick={() => setWardrobeOpen(true)}
          className="btn-secondary w-full mt-2 text-base py-2"
        >
          👗 Dress {state?.family.pet.name ?? "Popcorn"}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_minmax(0,22rem)] gap-6 lg:items-start">
        <div className="space-y-4 min-w-0">
          {/* Daily tasks */}
          {state && state.daily.length > 0 && (
            <Section title="Today">
              <div className="space-y-2">
                {state.daily.map((d) =>
                  d.template.repeatable ? (
                    <RepeatableDailyRow
                      key={d.template.id}
                      emoji={d.template.emoji}
                      title={d.template.title}
                      count={d.amountToday ?? 0}
                      onAdd={() => completeMut.mutate({ templateId: d.template.id, delta: 1 })}
                      onRemove={() => completeMut.mutate({ templateId: d.template.id, delta: -1 })}
                    />
                  ) : (
                    <TaskRow
                      key={d.template.id}
                      emoji={d.template.emoji}
                      title={d.template.title}
                      done={d.completedToday}
                      subtitle={taskSubtitle(d.template)}
                      onToggle={() => completeMut.mutate({ templateId: d.template.id })}
                    />
                  ),
                )}
              </div>
            </Section>
          )}

          {/* Weekly tasks */}
          {state && state.weekly.length > 0 && (
            <Section title="This week">
              <div className="space-y-2">
                {state.weekly.map((w) =>
                  w.template.weeklyTrack === "cumulative" ? (
                    <CumulativeWeeklyRow
                      key={w.template.id}
                      emoji={w.template.emoji}
                      title={w.template.title}
                      doneCount={w.doneThisWeek}
                      target={w.target}
                      amountToday={w.amountToday ?? 0}
                      onSetAmount={(amount) => completeMut.mutate({ templateId: w.template.id, amount })}
                    />
                  ) : w.template.repeatable ? (
                    <WeeklyRow
                      key={w.template.id}
                      emoji={w.template.emoji}
                      title={w.template.title}
                      doneCount={w.doneThisWeek}
                      target={w.target}
                      done={w.completedToday}
                      onAdd={() => completeMut.mutate({ templateId: w.template.id, delta: 1 })}
                      onRemove={() => completeMut.mutate({ templateId: w.template.id, delta: -1 })}
                    />
                  ) : (
                    <TaskRow
                      key={w.template.id}
                      emoji={w.template.emoji}
                      title={w.template.title}
                      done={w.doneThisWeek >= 1}
                      subtitle="Once this week"
                      onToggle={() => completeMut.mutate({ templateId: w.template.id })}
                    />
                  ),
                )}
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
              <div className="card text-center text-sm py-4 space-y-2">
                <div className="text-cocoa/70">
                  <span className="font-bold text-cocoa">Popcorn's idea:</span>{" "}
                  {questIdea.emoji} "{questIdea.title}"
                </div>
                <button
                  type="button"
                  className="btn-secondary text-sm px-4 py-2"
                  onClick={() => adhocMut.mutate({ title: questIdea.title, emoji: questIdea.emoji })}
                  disabled={adhocMut.isPending}
                >
                  {adhocMut.isPending ? "Adding…" : "Add it! 🐶"}
                </button>
                <div className="text-xs text-cocoa/50">
                  or tap <span className="text-coral font-bold">+ Add</span> to make up your own
                </div>
              </div>
            )}
          </Section>
        </div>

        <aside className="min-w-0 lg:sticky lg:top-6 lg:self-start">
          <UpcomingCalendar
            events={calendarQuery.data?.events ?? []}
            loading={calendarQuery.isPending}
            error={calendarQuery.error}
          />
        </aside>
      </div>

      {/* Rewards (always shown — the streak shield lives here too) */}
      {state && (
        <RewardShop
          rewards={state.rewards}
          pendingClaims={state.pendingClaims}
          xpBalance={xpBalance}
          totalXp={state.family.pet.xp}
          estDailyXp={estDailyXp}
          shields={state.family.streakShields ?? 0}
          onClaim={(r) => claimMut.mutate(r)}
          onBuyShield={() => shieldMut.mutate()}
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

      <FullDayCelebration
        show={fullDayStreak !== null}
        streak={fullDayStreak ?? 0}
        onDone={() => setFullDayStreak(null)}
      />

      {state && (
        <WardrobeSheet
          open={wardrobeOpen}
          onClose={() => setWardrobeOpen(false)}
          pet={state.family.pet}
          onEquip={(slot, cosmeticId) => equipMut.mutate({ slot, cosmeticId })}
        />
      )}

      <div className="pt-6 pb-2 text-center space-y-1">
        <div>
          <Link to="/parent" className="text-xs text-cocoa/35 hover:text-cocoa/50 font-medium">
            Parent
          </Link>
        </div>
        <div className="text-xs font-medium text-black">
          Last updated {formatBuildTime(__BUILD_TIME__)}
        </div>
      </div>
    </div>
  );
}

function formatBuildTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function taskXp(template: { cadence: "daily" | "weekly"; xp?: number }): number {
  return template.xp ?? (template.cadence === "daily" ? XP_PER.daily : XP_PER.weekly);
}

function taskSubtitle(template: { cadence: "daily" | "weekly"; description?: string; xp?: number }): string {
  const xp = `+${taskXp(template)} XP`;
  return template.description ? `${template.description} • ${xp}` : xp;
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
