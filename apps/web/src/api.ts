// =============================================================================
// API client. Talks to /api/* on the same origin (CloudFront proxies to
// API Gateway in prod; vite dev server proxies to localhost:8787 in dev).
// =============================================================================

import type {
  AdhocRequest,
  AdhocTask,
  ClaimRewardRequest,
  CompleteRequest,
  CompleteResponse,
  CreateRewardRequest,
  CreateTemplateRequest,
  DeleteRewardRequest,
  DeleteTemplateRequest,
  ResolveClaimRequest,
  Reward,
  RewardClaim,
  SetupRequest,
  SetupResponse,
  TaskTemplate,
  TodayState,
  UpdateTemplateRequest,
} from "@popcorn/shared";

const BASE = (import.meta.env.VITE_API_BASE as string | undefined) || "/api";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    let msg = `${res.status}`;
    try {
      const data = await res.json();
      if (data?.error) msg = data.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export const api = {
  setup: (body: SetupRequest) =>
    req<SetupResponse>("/setup", { method: "POST", body: JSON.stringify(body) }),
  state: (date?: string, history = false) => {
    const q = new URLSearchParams();
    if (date) q.set("date", date);
    if (history) q.set("history", "1");
    return req<TodayState>(`/state?${q.toString()}`);
  },
  complete: (body: CompleteRequest) =>
    req<CompleteResponse>("/complete", { method: "POST", body: JSON.stringify(body) }),
  adhoc: (body: AdhocRequest) =>
    req<AdhocTask>("/adhoc", { method: "POST", body: JSON.stringify(body) }),
  createTemplate: (body: CreateTemplateRequest) =>
    req<TaskTemplate>("/templates", { method: "POST", body: JSON.stringify(body) }),
  updateTemplate: (id: string, body: UpdateTemplateRequest) =>
    req<TaskTemplate>(`/templates/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteTemplate: (id: string, body: DeleteTemplateRequest) =>
    req<{ ok: true }>(`/templates/${id}`, { method: "DELETE", body: JSON.stringify(body) }),
  verifyPin: (pin: string) =>
    req<{ ok: true }>("/verify-pin", {
      method: "POST",
      body: JSON.stringify({ pin }),
    }),
  // Rewards
  createReward: (body: CreateRewardRequest) =>
    req<Reward>("/rewards", { method: "POST", body: JSON.stringify(body) }),
  deleteReward: (id: string, body: DeleteRewardRequest) =>
    req<{ ok: true }>(`/rewards/${id}`, { method: "DELETE", body: JSON.stringify(body) }),
  claimReward: (body: ClaimRewardRequest) =>
    req<RewardClaim>("/claims", { method: "POST", body: JSON.stringify(body) }),
  resolveClaim: (id: string, body: ResolveClaimRequest) =>
    req<RewardClaim>(`/claims/${id}/resolve`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
};
