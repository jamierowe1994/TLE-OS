"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * One person's settings, kept in their account rather than their browser.
 *
 * The rules this follows, in order of importance:
 *
 *  1. NEVER LOSE WHAT SOMEBODY ALREADY SET. The browser copy is read first
 *     and, on the first signed-in load, pushed up to the account. Nobody's
 *     dashboard is reset by the act of us moving where it lives.
 *
 *  2. INSTANT, THEN CORRECT. localStorage answers immediately so nothing
 *     flashes; the account's copy arrives a moment later and wins.
 *
 *  3. SIGNED OUT STILL WORKS. The OS is still behind the shared access code
 *     while the team gets accounts. Without a session this behaves exactly
 *     as it did before — browser-only — and simply doesn't follow you.
 */

type Prefs = Record<string, unknown>;

let serverPrefs: Prefs | null = null;
let signedIn = false;
let loading: Promise<void> | null = null;

function loadOnce(): Promise<void> {
  if (serverPrefs) return Promise.resolve();
  if (!loading) {
    loading = fetch("/api/prefs")
      .then((r) => r.json())
      .then((j) => {
        serverPrefs = (j?.prefs ?? {}) as Prefs;
        signedIn = Boolean(j?.signedIn);
      })
      .catch(() => {
        serverPrefs = {};
        signedIn = false;
      });
  }
  return loading;
}

function push(key: string, value: unknown): void {
  if (!signedIn) return;
  if (serverPrefs) serverPrefs[key] = value;
  void fetch("/api/prefs", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, value }),
  }).catch(() => {
    /* a setting that didn't sync is not worth interrupting anyone over */
  });
}

/** Old keys were written raw ("red"), newer ones as JSON. Accept both. */
function readLocal<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return undefined;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return raw as unknown as T;
    }
  } catch {
    return undefined;
  }
}

function writeLocal(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
  } catch {
    /* private mode — the account copy still holds it */
  }
}

/**
 * A setting that follows the person.
 *
 * Returns the current value and a setter. `ready` tells a caller whether the
 * account's copy has arrived yet — useful for anything that shouldn't write
 * back a default before it knows what was stored.
 */
export function usePref<T>(key: string, fallback: T): [T, (v: T) => void, boolean] {
  const [value, setValue] = useState<T>(fallback);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let gone = false;
    const local = readLocal<T>(key);
    if (local !== undefined) setValue(local);

    void loadOnce().then(() => {
      if (gone) return;
      const mine = serverPrefs?.[key];
      if (mine !== undefined && mine !== null) {
        setValue(mine as T);
        writeLocal(key, mine);
      } else if (local !== undefined && signedIn) {
        // First sign-in on a browser that already had settings: adopt them
        // rather than making somebody rebuild their board.
        push(key, local);
      }
      setReady(true);
    });

    return () => { gone = true; };
  }, [key]);

  const set = useCallback(
    (v: T) => {
      setValue(v);
      writeLocal(key, v);
      push(key, v);
    },
    [key]
  );

  return [value, set, ready];
}

/** For screens that want to say where a setting is being kept. */
export function usePrefsHome(): { signedIn: boolean; ready: boolean } {
  const [state, setState] = useState({ signedIn: false, ready: false });
  useEffect(() => {
    let gone = false;
    void loadOnce().then(() => { if (!gone) setState({ signedIn, ready: true }); });
    return () => { gone = true; };
  }, []);
  return state;
}
