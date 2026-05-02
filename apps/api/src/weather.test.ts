import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { fetchWeatherToday } from "./weather.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function jsonResponse(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("fetchWeatherToday", () => {
  it("returns all null when current weather HTTP is not OK", async () => {
    globalThis.fetch = async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("/weather?")) return jsonResponse({ message: "Invalid API key" }, 401);
      return jsonResponse({ list: [] }, 200);
    };
    const out = await fetchWeatherToday("bad-key", "02474,US");
    assert.equal(out.currentTempF, null);
    assert.equal(out.condition, null);
  });

  it("returns all null when forecast HTTP is not OK", async () => {
    globalThis.fetch = async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("/forecast?")) return jsonResponse({ message: "nope" }, 403);
      return jsonResponse(
        {
          main: { temp: 70 },
          weather: [{ id: 800 }],
          wind: { speed: 5 },
        },
        200,
      );
    };
    const out = await fetchWeatherToday("key", "02474,US");
    assert.equal(out.currentTempF, null);
  });

  it("parses current temp, POP, and condition when both calls succeed", async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    globalThis.fetch = async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("/weather?")) {
        return jsonResponse({
          main: { temp: 72.4, temp_min: 65, temp_max: 78 },
          weather: [{ id: 800 }],
          wind: { speed: 5 },
        });
      }
      if (url.includes("/forecast?")) {
        return jsonResponse({
          list: [
            {
              dt: nowSec,
              main: { temp: 71, temp_min: 70, temp_max: 73 },
              pop: 0.35,
            },
          ],
        });
      }
      return jsonResponse({}, 404);
    };

    const out = await fetchWeatherToday("key", "02474,US");
    assert.equal(out.currentTempF, 72.4);
    assert.ok(out.minTempF !== null && out.maxTempF !== null);
    assert.ok(out.minTempF! <= out.maxTempF!);
    assert.equal(out.rainPopPercent, 35);
    assert.equal(out.condition, "sunny");
  });
});
