import assert from "node:assert/strict";
import { describe, it } from "node:test";
import app from "./app.js";

async function rpc(method: string, params: unknown = {}) {
  const res = await app.request("http://test/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  assert.equal(res.status, 200);
  return (await res.json()) as { result: any };
}

describe("POST /mcp", () => {
  it("initializes with instructions", async () => {
    const { result } = await rpc("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "test", version: "0" },
    });
    assert.equal(result.serverInfo.name, "popcorn-quest");
    assert.match(result.instructions, /get_day_summary/);
  });

  it("lists read and write tools with annotations", async () => {
    const { result } = await rpc("tools/list");
    const byName = new Map(result.tools.map((t: any) => [t.name, t]));
    for (const name of ["get_day_summary", "get_xp_log", "get_status", "list_tasks", "get_history"]) {
      assert.equal((byName.get(name) as any)?.annotations?.readOnlyHint, true, name);
    }
    for (const name of ["complete_task", "undo_task", "add_side_quest"]) {
      assert.equal((byName.get(name) as any)?.annotations?.readOnlyHint, false, name);
    }
  });
});

describe("GET /llms.txt", () => {
  it("documents the summary endpoint", async () => {
    const res = await app.request("http://test/llms.txt");
    assert.equal(res.status, 200);
    assert.match(await res.text(), /\/api\/summary/);
  });
});
