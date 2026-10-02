"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Phone alerts for the app installed from the browser (2 Oct 2026).
 *
 * The phone asks the browser's push service for a subscription, we keep it
 * (/api/push/subscribe), and lib/push sends what lands in the bell. The
 * iPhone app (ios/) has its own road through Apple, so inside it this says
 * "app" and stays out of the way. On an iPhone, Safari only offers alerts to
 * an app on the home screen - in a tab there is no Notification at all, which
 * reads here as "unsupported".
 */

export type AlertState = "loading" | "unsupported" | "app" | "off" | "on" | "blocked" | "busy";

const SW = "/sw.js";
const SCOPE = "/app";

function keyBytes(b64url: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (b64url.length % 4)) % 4);
  const raw = atob((b64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function save(sub: PushSubscription): Promise<boolean> {
  const r = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(sub.toJSON()),
  }).catch(() => null);
  return Boolean(r?.ok);
}

export function useAlerts() {
  const [state, setState] = useState<AlertState>("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (/TLEOSApp\//.test(navigator.userAgent)) return setState("app");
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || typeof Notification === "undefined") return setState("unsupported");
    if (Notification.permission === "denied") return setState("blocked");
    navigator.serviceWorker
      .register(SW, { scope: SCOPE })
      .then((reg) => reg.pushManager.getSubscription())
      .then(async (sub) => {
        if (sub && Notification.permission === "granted") {
          /* Said again on every open, so a phone handed to a colleague, or a
             row the server dropped, puts itself right. */
          await save(sub);
          setState("on");
        } else setState("off");
      })
      .catch(() => setState("unsupported"));
  }, []);

  const turnOn = useCallback(async () => {
    setError(null);
    setState("busy");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "off");
        return;
      }
      const k = (await fetch("/api/push/subscribe").then((r) => r.json())) as { ok: boolean; key?: string; error?: string };
      if (!k.ok || !k.key) throw new Error(k.error ?? "Phone alerts are not set up yet.");
      const reg = await navigator.serviceWorker.register(SW, { scope: SCOPE });
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(k.key) }));
      if (!(await save(sub))) throw new Error("That did not save. Try again in a moment.");
      setState("on");
    } catch (e) {
      setError(e instanceof Error ? e.message : "That did not work.");
      setState("off");
    }
  }, []);

  const turnOff = useCallback(async () => {
    setState("busy");
    const reg = await navigator.serviceWorker.getRegistration(SCOPE).catch(() => undefined);
    const sub = await reg?.pushManager.getSubscription().catch(() => null);
    if (sub) {
      await fetch("/api/push/subscribe", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => null);
      await sub.unsubscribe().catch(() => false);
    }
    setState("off");
  }, []);

  return { state, error, turnOn, turnOff };
}
