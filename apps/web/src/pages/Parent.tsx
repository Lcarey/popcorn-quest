import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { Cadence, Reward, RewardClaim, TaskTemplate, WeeklyTrack } from "@popcorn/shared";
import { todayKey } from "@popcorn/shared";
import { api } from "../api";
import { useApp } from "../store";
import { COSMETICS } from "@popcorn/shared";

export function Parent() {
  const { parentPin } = useApp();
  const nav = useNavigate();
  if (!parentPin) return <PinGate />;
  return <ParentPanel />;
}

function PinGate() {
  const { setParentPin } = useApp();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-display font-bold">Parent zone</h1>
        <Link to="/" className="btn-ghost text-sm py-2 px-3">
          Back
        </Link>
      </div>
      <div className="card space-y-3">
        <p className="text-cocoa/80">Enter the parent PIN to manage chores.</p>
        <input
          type="password"
          inputMode="numeric"
          autoFocus
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
          placeholder="••••"
          className="w-full px-4 py-3 rounded-2xl bg-white border-2 border-white shadow-inner text-center font-display text-3xl tracking-widest focus:outline-none focus:border-coral"
        />
        {error && <div className="text-coral font-semibold text-sm">{error}</div>}
        <button
          className="btn-primary w-full"
          disabled={pin.length < 4 || submitting}
          onClick={async () => {
            setSubmitting(true);
            setError(null);
            try {
              await api.verifyPin(pin);
              setParentPin(pin);
            } catch (e) {
              setError("That PIN didn't work. Try again.");
            } finally {
              setSubmitting(false);
            }
          }}
        >
          Unlock
        </button>
      </div>
    </div>
  );
}

function ParentPanel() {
  const { parentPin, setParentPin } = useApp();
  const qc = useQueryClient();
  const date = todayKey();
  const stateQuery = useQuery({
    queryKey: ["state", date],
    queryFn: () => api.state(date),
  });

  const [showCreate, setShowCreate] = useState(false);

  const createMut = useMutation({
    mutationFn: (vars: { title: string; emoji: string; cadence: Cadence; weeklyTarget: number; weeklyTrack?: WeeklyTrack }) =>
      api.createTemplate({ pin: parentPin!, ...vars }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["state", date] });
      setShowCreate(false);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) =>
      api.deleteTemplate(id, { pin: parentPin! }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["state", date] }),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, title, emoji, weeklyTarget }: { id: string; title?: string; emoji?: string; weeklyTarget?: number }) =>
      api.updateTemplate(id, { pin: parentPin!, title, emoji, weeklyTarget }),
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
        <div className="flex gap-2">
          <button onClick={() => setParentPin(null)} className="btn-ghost text-sm py-2 px-3">
            Lock
          </button>
          <Link to="/" className="btn-ghost text-sm py-2 px-3">
            Back
          </Link>
        </div>
      </div>

      <button onClick={() => setShowCreate(true)} className="btn-primary w-full">
        + Add a recurring chore
      </button>

      {showCreate && (
        <CreateTemplateForm
          onCancel={() => setShowCreate(false)}
          onSubmit={(v) => createMut.mutate(v)}
        />
      )}

      <Section title="Daily chores">
        {dailyTpls.length === 0 ? (
          <Empty>No daily chores yet.</Empty>
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

      <Section title="Weekly chores">
        {weeklyTpls.length === 0 ? (
          <Empty>No weekly chores yet.</Empty>
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
          pin={parentPin!}
          onChange={() => qc.invalidateQueries({ queryKey: ["state", date] })}
        />
      )}

      {stateQuery.data && (
        <CosmeticsPanel
          level={stateQuery.data.family.pet.level}
          unlocked={stateQuery.data.family.pet.unlocked}
        />
      )}
    </div>
  );
}

function CreateTemplateForm({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (v: { title: string; emoji: string; cadence: Cadence; weeklyTarget: number; weeklyTrack?: WeeklyTrack }) => void;
}) {
  const [title, setTitle] = useState("");
  const [emoji, setEmoji] = useState("✅");
  const [cadence, setCadence] = useState<Cadence>("daily");
  const [weeklyTrack, setWeeklyTrack] = useState<WeeklyTrack>("sessions");
  const [target, setTarget] = useState(3);
  const isCumulative = cadence === "weekly" && weeklyTrack === "cumulative";
  const maxTarget = isCumulative ? 99999 : 7;

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
            onClick={() => setCadence("daily")}
            className={[
              "flex-1 py-2 rounded-xl font-display font-semibold",
              cadence === "daily" ? "bg-coral text-white" : "text-cocoa",
            ].join(" ")}
          >
            Daily
          </button>
          <button
            onClick={() => setCadence("weekly")}
            className={[
              "flex-1 py-2 rounded-xl font-display font-semibold",
              cadence === "weekly" ? "bg-coral text-white" : "text-cocoa",
            ].join(" ")}
          >
            Weekly
          </button>
        </div>
      </div>
      {cadence === "weekly" && (
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
              weeklyTarget: cadence === "weekly" ? target : 1,
              weeklyTrack: cadence === "weekly" ? weeklyTrack : undefined,
            })
          }
        >
          Save
        </button>
      </div>
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
  onUpdate: (u: { title?: string; emoji?: string; weeklyTarget?: number }) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(template.title);
  const [emoji, setEmoji] = useState(template.emoji);
  const [target, setTarget] = useState(template.weeklyTarget);
  const isCumulative = template.weeklyTrack === "cumulative";
  const maxTarget = isCumulative ? 99999 : 7;

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
              {template.cadence === "weekly" && (
                <input
                  type="number"
                  min={1}
                  max={maxTarget}
                  value={target}
                  onChange={(e) => setTarget(Math.max(1, Math.min(maxTarget, Number(e.target.value) || 1)))}
                  className="w-20 px-2 py-2 rounded-xl bg-white border-2 border-white shadow-inner text-center"
                />
              )}
              <button
                className="btn-secondary flex-1 py-2"
                onClick={() => {
                  onUpdate({
                    title: title.trim() || template.title,
                    emoji: emoji || template.emoji,
                    weeklyTarget: template.cadence === "weekly" ? target : undefined,
                  });
                  setEditing(false);
                }}
              >
                Save
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="font-display font-semibold">{template.title}</div>
            <div className="text-xs text-cocoa/70">
              {template.cadence === "daily"
                ? "Daily"
                : isCumulative
                  ? `Weekly goal · ${template.weeklyTarget}`
                  : `Weekly · ${template.weeklyTarget}x`}
            </div>
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
  pin,
  onChange,
}: {
  rewards: Reward[];
  pendingClaims: RewardClaim[];
  pin: string;
  onChange: () => void;
}) {
  const [showCreate, setShowCreate] = useState(false);

  const createMut = useMutation({
    mutationFn: (vars: { title: string; emoji: string; cost: number }) =>
      api.createReward({ pin, ...vars }),
    onSuccess: () => {
      onChange();
      setShowCreate(false);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.deleteReward(id, { pin }),
    onSuccess: onChange,
  });

  const resolveMut = useMutation({
    mutationFn: (vars: { id: string; approve: boolean }) =>
      api.resolveClaim(vars.id, { pin, approve: vars.approve }),
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
