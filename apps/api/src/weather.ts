// =============================================================================
// OpenWeatherMap 2.5 — current + 3h forecast for today’s min/max and rain POP.
// ZIP defaults to Arlington, MA (02474) via WEATHER_ZIP env on Lambda.
// =============================================================================

import type { WeatherCondition, WeatherToday } from "@popcorn/shared";

const TZ = "America/New_York";

function dateKeyInZone(ms: number, timeZone: string): string {
  return new Date(ms).toLocaleDateString("en-CA", { timeZone });
}

function roundTemp(n: number): number {
  return Math.round(n * 10) / 10;
}

function mapCondition(id: number, windMph: number, pop: number): WeatherCondition {
  const snow = id >= 600 && id <= 622;
  const strongRain =
    (id >= 200 && id < 300) ||
    (id >= 300 && id < 400) ||
    (id >= 500 && id < 600) ||
    pop >= 0.45;
  if (snow) return "snow";
  if (strongRain) return "rain";
  if (id === 800) return windMph >= 22 ? "windy" : "sunny";
  if (id === 801 || id === 802) return "cloudy";
  if (id >= 803 && id <= 804) return "cloudy";
  if (windMph >= 22) return "windy";
  return "cloudy";
}

interface OwCurrent {
  main?: {
    temp?: number;
    temp_min?: number;
    temp_max?: number;
  };
  wind?: { speed?: number };
  weather?: { id?: number }[];
}

interface OwForecastItem {
  dt: number;
  main?: { temp?: number; temp_min?: number; temp_max?: number };
  pop?: number;
}

interface OwForecast {
  list?: OwForecastItem[];
}

export async function fetchWeatherToday(apiKey: string, zip: string): Promise<WeatherToday> {
  const base = "https://api.openweathermap.org/data/2.5";
  const q = new URLSearchParams({
    zip,
    appid: apiKey,
    units: "imperial",
  });

  const [curRes, fcRes] = await Promise.all([
    fetch(`${base}/weather?${q}`),
    fetch(`${base}/forecast?${q}`),
  ]);

  if (!curRes.ok || !fcRes.ok) {
    const empty: WeatherToday = {
      currentTempF: null,
      minTempF: null,
      maxTempF: null,
      rainPopPercent: null,
      condition: null,
    };
    return empty;
  }

  const current = (await curRes.json()) as OwCurrent;
  const forecast = (await fcRes.json()) as OwForecast;

  const todayKey = dateKeyInZone(Date.now(), TZ);
  const temps: number[] = [];
  let maxPop = 0;

  if (typeof current.main?.temp === "number") temps.push(current.main.temp);
  if (typeof current.main?.temp_min === "number") temps.push(current.main.temp_min);
  if (typeof current.main?.temp_max === "number") temps.push(current.main.temp_max);

  const windMph = typeof current.wind?.speed === "number" ? current.wind.speed : 0;
  const wid = current.weather?.[0]?.id ?? 800;

  for (const item of forecast.list ?? []) {
    const key = dateKeyInZone(item.dt * 1000, TZ);
    if (key !== todayKey) continue;
    if (typeof item.main?.temp === "number") temps.push(item.main.temp);
    if (typeof item.main?.temp_min === "number") temps.push(item.main.temp_min);
    if (typeof item.main?.temp_max === "number") temps.push(item.main.temp_max);
    if (typeof item.pop === "number") maxPop = Math.max(maxPop, item.pop);
  }

  const currentTempF =
    typeof current.main?.temp === "number" ? roundTemp(current.main.temp) : null;
  let minTempF = temps.length ? roundTemp(Math.min(...temps)) : currentTempF;
  let maxTempF = temps.length ? roundTemp(Math.max(...temps)) : currentTempF;
  if (minTempF === null && currentTempF !== null) minTempF = currentTempF;
  if (maxTempF === null && currentTempF !== null) maxTempF = currentTempF;

  const rainPopPercent = Math.round(maxPop * 100);
  const condition = mapCondition(wid, windMph, maxPop);

  return {
    currentTempF,
    minTempF,
    maxTempF,
    rainPopPercent,
    condition,
  };
}
