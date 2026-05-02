import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import app from "./app.js";

const originalFetch = globalThis.fetch;
const originalKey = process.env.OPENWEATHER_API_KEY;
const originalZip = process.env.WEATHER_ZIP;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.OPENWEATHER_API_KEY;
  else process.env.OPENWEATHER_API_KEY = originalKey;
  if (originalZip === undefined) delete process.env.WEATHER_ZIP;
  else process.env.WEATHER_ZIP = originalZip;
});

describe("GET /weather", () => {
  it("returns all null when OPENWEATHER_API_KEY is unset", async () => {
    delete process.env.OPENWEATHER_API_KEY;
    const res = await app.request("http://test/weather");
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      currentTempF: null | number;
      rainPopPercent: null | number;
      condition: null | string;
    };
    assert.equal(body.currentTempF, null);
    assert.equal(body.rainPopPercent, null);
    assert.equal(body.condition, null);
  });

  it("returns JSON with temps when env key is set and OpenWeather succeeds", async () => {
    process.env.OPENWEATHER_API_KEY = "unit-test-key";
    process.env.WEATHER_ZIP = "02474,US";

    const nowSec = Math.floor(Date.now() / 1000);
    globalThis.fetch = async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("/data/2.5/weather")) {
        return new Response(
          JSON.stringify({
            main: { temp: 55, temp_min: 50, temp_max: 60 },
            weather: [{ id: 801 }],
            wind: { speed: 4 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.includes("/data/2.5/forecast")) {
        return new Response(
          JSON.stringify({
            list: [{ dt: nowSec, main: { temp: 54 }, pop: 0.1 }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response("not found", { status: 404 });
    };

    const res = await app.request("http://test/weather");
    assert.equal(res.status, 200);
    const body = (await res.json()) as { currentTempF: number | null; condition: string | null };
    assert.equal(body.currentTempF, 55);
    assert.equal(body.condition, "cloudy");
  });
});
