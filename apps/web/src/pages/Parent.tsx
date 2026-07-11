import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import type { Cadence, Reward, RewardClaim, TaskTemplate, WeeklyTrack, XpLogEntry } from "@popcorn/shared";
import { todayKey } from "@popcorn/shared";
import { api } from "../api";
import { COSMETICS } from "@popcorn/shared";

export function Parent() {
  return <ParentPanel />;
}

function ParentPanel() {
  const qc = useQueryClient();
  const date = todayKey();
  const stateQuery = useQuery({
    queryKey: ["state", date],
    queryFn: () => api.state(date),
  });

  const [showCreate, setShowCreate] = useState(false);

  const createMut = useMutation({
    mutationFn: (vars: {
      title: string;
      emoji: string;
      cadence: Cadence;
      weeklyTarget: number;
      weeklyTrack?: WeeklyTrack;
      repeatable: boolean;
    }) => api.createTemplate(vars),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["state", date] });
      setShowCreate(false);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.deleteTemplate(id, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["state", date] }),
  });

  const updateMut = useMutation({
    mutationFn: ({
      id,
      title,
      emoji,
      weeklyTarget,
      repeatable,
    }: {
      id: string;
      title?: string;
      emoji?: string;
      weeklyTarget?: number;
      repeatable?: boolean;
    }) => api.updateTemplate(id, { title, emoji, weeklyTarget, repeatable }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["state", date] }),
  });

  const templates: TaskTemplate[] = stateQuery.data
    ? [...stateQuery.data.daily.map((d) => d.template), ...stateQuery.data.weekly.map((w) => w.template)]
    : [];

  const dailyTpls = templates.filter((t) => t.cadence === "daily");
  const weeklyTpls = templates.filter((t) => t.cadence === "weekly");

  return (
    <div className="space-y-4 pb-20">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-display font-bold">Parent zone</h1>
        <Link to="/" className="btn-ghost text-sm py-2 px-3">
          Back
        </Link>
      </div>

      <button onClick={() => setShowCreate(true)} className="btn-primary w-full">
        + Add recurring
      </button>

      {showCreate && (
        <CreateTemplateForm
          onCancel={() => setShowCreate(false)}
          onSubmit={(v) => createMut.mutate(v)}
        />
      )}

      <Section title="Daily">
        {dailyTpls.length === 0 ? (
          <Empty>No daily yet.</Empty>
        ) : (
          <div className="space-y-2">
            {dailyTpls.map((t) => (
              <TemplateCard
                key={t.id}
                template={t}
                onDelete={() => deleteMut.mutate(t.id)}
                onUpdate={(u) => updateMut.mutate({ id: t.id, ...u })}
              />
            ))}
          </div>
        )}
      </Section>

      <Section title="Weekly">
        {weeklyTpls.length === 0 ? (
          <Empty>No weekly yet.</Empty>
        ) : (
          <div className="space-y-2">
            {weeklyTpls.map((t) => (
              <TemplateCard
                key={t.id}
                template={t}
                onDelete={() => deleteMut.mutate(t.id)}
                onUpdate={(u) => updateMut.mutate({ id: t.id, ...u })}
              />
            ))}
          </div>
        )}
      </Section>

      {stateQuery.data && (
        <RewardsManager
          rewards={stateQuery.data.rewards}
          pendingClaims={stateQuery.data.pendingClaims}
          onChange={() => qc.invalidateQueries({ queryKey: ["state", date] })}
        />
      )}

      {stateQuery.data && (
        <CosmeticsPanel
          level={stateQuery.data.family.pet.level}
          unlocked={stateQuery.data.family.pet.unlocked}
        />
      )}

      <XpLogTable />
    </div>
  );
}

function CreateTemplateForm({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (v: {
    title: string;
    emoji: string;
    cadence: Cadence;
    weeklyTarget: number;
    weeklyTrack?: WeeklyTrack;
    repeatable: boolean;
  }) => void;
}) {
  const [title, setTitle] = useState("");
  const [emoji, setEmoji] = useState("✅");
  const [cadence, setCadence] = useState<Cadence>("daily");
  const [weeklyTrack, setWeeklyTrack] = useState<WeeklyTrack>("sessions");
  const [target, setTarget] = useState(3);
  // Default: daily chores are usually one-and-done; weekly chores usually repeat.
  const [repeatable, setRepeatable] = useState(false);
  const isCumulative = cadence === "weekly" && repeatable && weeklyTrack === "cumulative";
  const maxTarget = isCumulative ? 99999 : 7;

  function pickCadence(next: Cadence) {
    setCadence(next);
    setRepeatable(next === "weekly");
  }

  return (
    <div className="card space-y-3">
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title (e.g. Practice clarinet)"
        className="w-full px-4 py-3 rounded-2xl bg-white border-2 border-white shadow-inner font-display text-lg focus:outline-none focus:border-coral"
      />
      <div className="flex gap-2">
        <input
          value={emoji}
          onChange={(e) => setEmoji(e.target.value.slice(0, 4))}
          placeholder="Emoji"
          className="w-20 text-center px-2 py-3 rounded-2xl bg-white border-2 border-white shadow-inner text-2xl"
        />
        <div className="flex flex-1 bg-white rounded-2xl p-1">
          <button
            onClick={() => pickCadence("daily")}
            className={[
              "flex-1 py-2 rounded-xl font-display font-semibold",
              cadence === "daily" ? "bg-coral text-white" : "text-cocoa",
            ].join(" ")}
          >
            Daily
          </button>
          <button
            onClick={() => pickCadence("weekly")}
            className={[
              "flex-1 py-2 rounded-xl font-display font-semibold",
              cadence === "weekly" ? "bg-coral text-white" : "text-cocoa",
            ].join(" ")}
          >
            Weekly
          </button>
        </div>
      </div>

      <RepeatableToggle cadence={cadence} repeatable={repeatable} onChange={setRepeatable} />

      {cadence === "weekly" && repeatable && (
        <>
          <div className="flex bg-white rounded-2xl p-1">
            <button
              onClick={() => { setWeeklyTrack("sessions"); setTarget(Math.min(target, 7)); }}
              className={[
                "flex-1 py-2 rounded-xl font-display font-semibold text-sm",
                weeklyTrack === "sessions" ? "bg-lilac text-white" : "text-cocoa",
              ].join(" ")}
            >
              Times per week
            </button>
            <button
              onClick={() => setWeeklyTrack("cumulative")}
              className={[
                "flex-1 py-2 rounded-xl font-display font-semibold text-sm",
                weeklyTrack === "cumulative" ? "bg-lilac text-white" : "text-cocoa",
              ].join(" ")}
            >
              Total per week
            </button>
          </div>
          <div>
            <label className="text-sm font-semibold text-cocoa/70 block mb-1">
              {isCumulative ? "Weekly goal" : "Times per week"}
            </label>
            <input
              type="number"
              min={1}
              max={maxTarget}
              value={target}
              onChange={(e) => setTarget(Math.max(1, Math.min(maxTarget, Number(e.target.value) || 1)))}
              className="w-28 px-3 py-2 rounded-xl bg-white border-2 border-white shadow-inner text-center"
            />
            {isCumulative && (
              <span className="text-xs text-cocoa/50 ml-2">e.g. 50 jumps, 500 pucks</span>
            )}
          </div>
        </>
      )}
      <div className="flex gap-2">
        <button onClick={onCancel} className="btn-ghost flex-1">
          Cancel
        </button>
        <button
          className="btn-primary flex-1"
          disabled={!title.trim()}
          onClick={() =>
            onSubmit({
              title: title.trim(),
              emoji: emoji || (cadence === "weekly" ? "📅" : "✅"),
              cadence,
              weeklyTarget: cadence === "weekly" && repeatable ? target : 1,
              weeklyTrack: cadence === "weekly" && repeatable ? weeklyTrack : undefined,
              repeatable,
            })
          }
        >
          Save
        </button>
      </div>
    </div>
  );
}

function RepeatableToggle({
  cadence,
  repeatable,
  onChange,
}: {
  cadence: Cadence;
  repeatable: boolean;
  onChange: (v: boolean) => void;
}) {
  const hint = repeatable
    ? cadence === "daily"
      ? "1 required per day; extra reps earn bonus XP."
      : "Shows +/- so it can be logged several times a week."
    : cadence === "daily"
      ? "A single daily check."
      : "A single check, once per week.";
  return (
    <div className="bg-white rounded-2xl p-3 space-y-2">
      <label className="flex items-center justify-between gap-3 cursor-pointer">
        <span className="font-display font-semibold text-cocoa text-sm">Can be done multiple times?</span>
        <input
          type="checkbox"
          checked={repeatable}
          onChange={(e) => onChange(e.target.checked)}
          className="w-6 h-6 accent-coral"
        />
      </label>
      <p className="text-xs text-cocoa/60">{hint}</p>
    </div>
  );
}

function TemplateCard({
  template,
  onDelete,
  onUpdate,
}: {
  template: TaskTemplate;
  onDelete: () => void;
  onUpdate: (u: { title?: string; emoji?: string; weeklyTarget?: number; repeatable?: boolean }) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(template.title);
  const [emoji, setEmoji] = useState(template.emoji);
  const [target, setTarget] = useState(template.weeklyTarget);
  const [repeatable, setRepeatable] = useState(template.repeatable);
  const isCumulative = template.weeklyTrack === "cumulative";
  const maxTarget = isCumulative ? 99999 : 7;

  const meta = (() => {
    if (template.cadence === "daily") return template.repeatable ? "Daily · repeatable" : "Daily";
    if (!template.repeatable) return "Weekly · once";
    return isCumulative ? `Weekly goal · ${template.weeklyTarget}` : `Weekly · ${template.weeklyTarget}x`;
  })();

  return (
    <div className="card flex items-start gap-3">
      <div className="text-2xl">{template.emoji}</div>
      <div className="flex-1 min-w-0">
        {editing ? (
          <div className="space-y-2">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-white border-2 border-white shadow-inner font-display"
            />
            <div className="flex gap-2">
              <input
                value={emoji}
                onChange={(e) => setEmoji(e.target.value.slice(0, 4))}
                className="w-16 text-center px-2 py-2 rounded-xl bg-white border-2 border-white shadow-inner text-xl"
              />
              {template.cadence === "weekly" && repeatable && (
                <input
                  type="number"
                  min={1}
                  max={maxTarget}
                  value={target}
                  onChange={(e) => setTarget(Math.max(1, Math.min(maxTarget, Number(e.target.value) || 1)))}
                  className="w-20 px-2 py-2 rounded-xl bg-white border-2 border-white shadow-inner text-center"
                />
              )}
            </div>
            <label className="flex items-center justify-between gap-3 cursor-pointer bg-white rounded-xl px-3 py-2">
              <span className="text-sm font-semibold text-cocoa">Can be done multiple times?</span>
              <input
                type="checkbox"
                checked={repeatable}
                onChange={(e) => setRepeatable(e.target.checked)}
                className="w-5 h-5 accent-coral"
              />
            </label>
            <button
              className="btn-secondary w-full py-2"
              onClick={() => {
                onUpdate({
                  title: title.trim() || template.title,
                  emoji: emoji || template.emoji,
                  weeklyTarget: template.cadence === "weekly" && repeatable ? target : undefined,
                  repeatable,
                });
                setEditing(false);
              }}
            >
              Save
            </button>
          </div>
        ) : (
          <>
            <div className="font-display font-semibold">{template.title}</div>
            <div className="text-xs text-cocoa/70">{meta}</div>
          </>
        )}
      </div>
      {!editing && (
        <div className="flex gap-1">
          <button onClick={() => setEditing(true)} className="text-cocoa/70 px-2">
            ✎
          </button>
          <button
            onClick={() => {
              if (confirm(`Delete "${template.title}"? Past completions stay.`)) onDelete();
            }}
            className="text-coral px-2"
          >
            🗑
          </button>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-display font-semibold text-lg text-cocoa mb-2 px-1">{title}</h2>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="card text-center text-sm text-cocoa/60 py-4">{children}</div>;
}

function RewardsManager({
  rewards,
  pendingClaims,
  onChange,
}: {
  rewards: Reward[];
  pendingClaims: RewardClaim[];
  onChange: () => void;
}) {
  const [showCreate, setShowCreate] = useState(false);

  const createMut = useMutation({
    mutationFn: (vars: { title: string; emoji: string; cost: number }) =>
      api.createReward(vars),
    onSuccess: () => {
      onChange();
      setShowCreate(false);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.deleteReward(id, {}),
    onSuccess: onChange,
  });

  const resolveMut = useMutation({
    mutationFn: (vars: { id: string; approve: boolean }) =>
      api.resolveClaim(vars.id, { approve: vars.approve }),
    onSuccess: onChange,
  });

  return (
    <Section title="Rewards shop">
      {pendingClaims.length > 0 && (
        <div className="card bg-coral/10 border-coral mb-2">
          <div className="text-sm font-semibold text-cocoa mb-2">
            ⏳ Awaiting approval
          </div>
          <div className="space-y-2">
            {pendingClaims.map((c) => (
              <div key={c.id} className="flex items-center gap-2">
                <span className="text-2xl">{c.rewardEmoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-display font-semibold truncate">{c.rewardTitle}</div>
                  <div className="text-xs text-cocoa/70">{c.cost} XP</div>
                </div>
                <button
                  className="btn-secondary py-2 px-3 text-sm"
                  disabled={resolveMut.isPending}
                  onClick={() => resolveMut.mutate({ id: c.id, approve: false })}
                >
                  Deny
                </button>
                <button
                  className="btn-primary py-2 px-3 text-sm"
                  disabled={resolveMut.isPending}
                  onClick={() => resolveMut.mutate({ id: c.id, approve: true })}
                >
                  Approve
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <button onClick={() => setShowCreate(true)} className="btn-secondary w-full mb-2">
        + Add a reward
      </button>

      {showCreate && (
        <CreateRewardForm
          onCancel={() => setShowCreate(false)}
          onSubmit={(v) => createMut.mutate(v)}
        />
      )}

      {rewards.length === 0 ? (
        <Empty>No rewards yet. Try "30 min screen time" for 200 XP.</Empty>
      ) : (
        <div className="space-y-2">
          {rewards.map((r) => (
            <div key={r.id} className="card flex items-center gap-3">
              <div className="text-2xl">{r.emoji}</div>
              <div className="flex-1 min-w-0">
                <div className="font-display font-semibold truncate">{r.title}</div>
                <div className="text-xs text-cocoa/70">{r.cost} XP</div>
              </div>
              <button
                onClick={() => {
                  if (confirm(`Delete reward "${r.title}"?`)) deleteMut.mutate(r.id);
                }}
                className="text-coral px-2"
              >
                🗑
              </button>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

function CreateRewardForm({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (v: { title: string; emoji: string; cost: number }) => void;
}) {
  const [title, setTitle] = useState("");
  const [emoji, setEmoji] = useState("🎁");
  const [cost, setCost] = useState(100);
  return (
    <div className="card space-y-3 mb-2">
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder='Reward (e.g. "30 min screen time")'
        className="w-full px-4 py-3 rounded-2xl bg-white border-2 border-white shadow-inner font-display text-lg focus:outline-none focus:border-coral"
      />
      <div className="flex gap-2 items-center">
        <input
          value={emoji}
          onChange={(e) => setEmoji(e.target.value.slice(0, 4))}
          className="w-16 text-center px-2 py-3 rounded-2xl bg-white border-2 border-white shadow-inner text-2xl"
        />
        <label className="text-sm font-semibold text-cocoa/70">Cost (XP):</label>
        <input
          type="number"
          min={1}
          max={10000}
          step={10}
          value={cost}
          onChange={(e) => setCost(Math.max(1, Number(e.target.value) || 1))}
          className="w-24 px-3 py-2 rounded-xl bg-white border-2 border-white shadow-inner text-center"
        />
      </div>
      <div className="flex gap-2">
        <button onClick={onCancel} className="btn-ghost flex-1">
          Cancel
        </button>
        <button
          className="btn-primary flex-1"
          disabled={!title.trim()}
          onClick={() => onSubmit({ title: title.trim(), emoji, cost })}
        >
          Save
        </button>
      </div>
    </div>
  );
}

function CosmeticsPanel({ level, unlocked }: { level: number; unlocked: string[] }) {
  const unlockedSet = new Set(unlocked);
  return (
    <Section title={`Cosmetics unlocked (Lv ${level})`}>
      <div className="card grid grid-cols-2 gap-2">
        {COSMETICS.map((c) => {
          const isUnlocked = unlockedSet.has(c.id);
          return (
            <div
              key={c.id}
              className={[
                "rounded-xl p-2 text-sm flex items-center gap-2",
                isUnlocked ? "bg-mint/40" : "bg-white/40",
              ].join(" ")}
            >
              <span>{isUnlocked ? "✅" : "🔒"}</span>
              <span className={isUnlocked ? "font-semibold" : "text-cocoa/60"}>
                {c.name}{" "}
                <span className="text-xs text-cocoa/60">(Lv {c.unlocksAtLevel})</span>
              </span>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

function XpLogTable() {
  const logQuery = useQuery({
    queryKey: ["xp-log"],
    queryFn: () => api.xpLog(200),
  });
  const entries: XpLogEntry[] = logQuery.data?.entries ?? [];

  return (
    <Section title="XP log">
      {logQuery.isLoading ? (
        <Empty>Loading…</Empty>
      ) : entries.length === 0 ? (
        <Empty>No XP earned yet.</Empty>
      ) : (
        <div className="card p-0 overflow-hidden">
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-cream/95 backdrop-blur">
                <tr className="text-left text-cocoa/60">
                  <th className="px-3 py-2 font-semibold">Date</th>
                  <th className="px-3 py-2 font-semibold">Time</th>
                  <th className="px-3 py-2 font-semibold text-right">XP</th>
                  <th className="px-3 py-2 font-semibold">Reason</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => {
                  const d = new Date(e.at);
                  return (
                    <tr key={e.id} className="border-t border-cocoa/10 align-top">
                      <td className="px-3 py-2 whitespace-nowrap text-cocoa/80">
                        {d.toLocaleDateString()}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-cocoa/80">
                        {d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })}
                      </td>
                      <td
                        className={[
                          "px-3 py-2 whitespace-nowrap text-right font-display font-bold",
                          e.amount >= 0 ? "text-green-600" : "text-coral",
                        ].join(" ")}
                      >
                        {e.amount >= 0 ? `+${e.amount}` : e.amount}
                      </td>
                      <td className="px-3 py-2 text-cocoa">{e.reason}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Section>
  );
}
