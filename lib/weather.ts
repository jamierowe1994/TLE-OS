"use client";

import { useEffect, useState } from "react";

/**
 * The forecast for the booking calendar.
 *
 * Open-Meteo: free, keyless, CORS-open, 16 days ahead — which happens to be
 * exactly the horizon anybody books an appraisal in. Coordinates are
 * Manchester, the book's home base (same as the dashboard's sun); when leads
 * carry real geocodes this takes the lead's own coordinates instead.
 *
 * Weather is decoration on a decision, never a gatekeeper of one: every
 * failure path resolves to "no forecast shown" and the calendar carries on.
 */

export type DayWeather = {
  /** Emoji glyph for the day. */
  glyph: string;
  /** One word for the tooltip. */
  word: string;
  /** Daily max, rounded, °C. */
  temp: number;
};

/** WMO weather codes, collapsed to what a glance can use. */
function decode(code: number): { glyph: string; word: string } {
  if (code === 0) return { glyph: "☀️", word: "Sunny" };
  if (code <= 2) return { glyph: "🌤️", word: "Bright" };
  if (code === 3) return { glyph: "☁️", word: "Overcast" };
  if (code <= 48) return { glyph: "🌫️", word: "Foggy" };
  if (code <= 57) return { glyph: "🌦️", word: "Drizzle" };
  if (code <= 67) return { glyph: "🌧️", word: "Rain" };
  if (code <= 77) return { glyph: "🌨️", word: "Snow" };
  if (code <= 82) return { glyph: "🌧️", word: "Showers" };
  if (code <= 86) return { glyph: "🌨️", word: "Snow" };
  return { glyph: "⛈️", word: "Stormy" };
}

const URL =
  "https://api.open-meteo.com/v1/forecast" +
  "?latitude=53.4808&longitude=-2.2426" +
  "&daily=weather_code,temperature_2m_max" +
  "&forecast_days=16&timezone=Europe%2FLondon";

/** One fetch per page load is plenty — the sky doesn't change that fast. */
let cache: Record<string, DayWeather> | null = null;

export function useForecast(enabled: boolean): Record<string, DayWeather> {
  const [days, setDays] = useState<Record<string, DayWeather>>(cache ?? {});

  useEffect(() => {
    if (!enabled || cache) return;
    let dead = false;
    (async () => {
      try {
        const r = await fetch(URL);
        if (!r.ok) return;
        const j = await r.json();
        const out: Record<string, DayWeather> = {};
        (j?.daily?.time ?? []).forEach((iso: string, i: number) => {
          const code = j.daily.weather_code?.[i];
          const temp = j.daily.temperature_2m_max?.[i];
          if (code == null || temp == null) return;
          out[iso] = { ...decode(code), temp: Math.round(temp) };
        });
        if (Object.keys(out).length) {
          cache = out;
          if (!dead) setDays(out);
        }
      } catch {
        /* no forecast is a fine forecast */
      }
    })();
    return () => { dead = true; };
  }, [enabled]);

  return days;
}

/** Local YYYY-MM-DD, matching Open-Meteo's daily keys. */
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}
