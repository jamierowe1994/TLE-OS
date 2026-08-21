import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Flow — record-and-embed video, unbranded.
 *
 * James's own product, integrated here so an agent can record a short welcome
 * straight into the landlord's pre-appraisal page. No file ever touches this
 * app: we hold a recording id, Flow holds the media.
 *
 * ── READ THIS BEFORE TRUSTING IT ──────────────────────────────────────────
 *
 * The Flow Integration API is BUILT BUT NEVER EXERCISED. Its own documentation
 * says so plainly: no recording has been created through it, no webhook has
 * been delivered to a real endpoint, and the recorder route has never run in a
 * browser. We are the first integration, so we will be the ones who find
 * whatever is wrong.
 *
 * Three consequences shape this file:
 *
 *  1. EVERY FAILURE IS SOFT. A pre-appraisal page without a welcome video is a
 *     good page; a booking flow that breaks because a video service is down is
 *     a lost appointment. Nothing here throws into the booking path.
 *
 *  2. WE POLL AS WELL AS LISTEN. The webhook is documented as authoritative
 *     and it has never fired in anger. `recording.transcript_ready` is
 *     explicitly not implemented at all. So the OS polls the recording's
 *     status too, and whichever arrives first wins.
 *
 *  3. RETENTION IS SET EXPLICITLY. This is the one place the documented
 *     default is wrong for us. Flow's own recordings expire after 90 days, but
 *     recordings created through the API default to `permanent` — so a welcome
 *     video for a visit in August would still be sitting on Flow's disk in
 *     2030. James asked for three months. We pass `days:90` on every create,
 *     and it must never be dropped.
 *
 * ── ONE THING WORTH RAISING WITH FLOW ─────────────────────────────────────
 *
 * Section 12 of the docs: domain allow-listing on the embed is NOT enforced
 * yet. The docs describe the player refusing to render on unregistered
 * origins, which is what makes a leaked embed URL useless. Until that lands,
 * an embed URL works anywhere it is pasted. For a welcome video addressed to a
 * named landlord about a named address, that is a small but real exposure —
 * the same shape as the CDN problem in [[rex-esign-and-cdn-exposure]]. It does
 * not block this build; it is worth closing before anyone outside TLE gets a key.
 */

const DEFAULT_BASE = "https://flow-video.co.uk";

/** Ninety days. James's words: "held for three months, then deleted". */
export const RETENTION = "days:90";

function base(): string {
  return (process.env.FLOW_API_BASE ?? DEFAULT_BASE).replace(/\/$/, "");
}

export function flowConfigured(): boolean {
  return Boolean((process.env.FLOW_API_KEY ?? "").trim());
}

/** The origin the recorder and player are served from — used for the iframe's
 *  postMessage origin check, which must never be a wildcard. */
export function flowOrigin(): string {
  return base();
}

export type RecordingStatus =
  | "awaiting_recording"
  | "uploading"
  | "processing"
  | "ready"
  | "failed";

export interface Recording {
  recordingId: string;
  reference?: string | null;
  status: RecordingStatus;
  title?: string | null;
  durationSecs?: number | null;
  embedUrl?: string | null;
  thumbnailUrl?: string | null;
  recorderUrl?: string | null;
  expiresAt?: string | null;
  error?: string | null;
}

async function call(
  path: string,
  init: { method: string; body?: unknown }
): Promise<{ ok: boolean; status: number; data: unknown; error: string | null }> {
  const key = (process.env.FLOW_API_KEY ?? "").trim();
  if (!key) return { ok: false, status: 0, data: null, error: "Flow isn't connected here." };

  const controller = new AbortController();
  // Short. This sits in front of an agent pressing a button, and a service
  // that is thinking about it is indistinguishable from one that is down.
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${base()}/api/integration/v1${path}`, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
      signal: controller.signal,
    });
    const data = await res.json().catch(() => null);
    // Flow's errors are { error: { code, message } } — surface the message,
    // since "validation_failed" alone tells an agent nothing.
    const err = (data as { error?: { message?: string; code?: string } } | null)?.error;
    return {
      ok: res.ok,
      status: res.status,
      data,
      error: res.ok ? null : (err?.message ?? err?.code ?? `Flow returned ${res.status}`),
    };
  } catch (e) {
    const aborted = (e as Error).name === "AbortError";
    return {
      ok: false,
      status: 0,
      data: null,
      error: aborted ? "Flow didn't answer in time." : (e as Error).message,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Reserve a slot and get a recorder URL.
 *
 * `reference` is what comes back on every webhook, so it is how we find our
 * way home without storing a mapping. It is deliberately NOT the presentation
 * token: that token is the only thing standing between a stranger and the
 * landlord's page, and a bearer credential does not belong in a third party's
 * metadata field — even a friendly third party's.
 */
export async function createRecording(opts: {
  reference: string;
  title: string;
  /** Seconds. A welcome video is short by design. */
  maxDurationSecs?: number;
  metadata?: Record<string, unknown>;
}): Promise<{ recording: Recording | null; error: string | null }> {
  const res = await call("/recordings", {
    method: "POST",
    body: {
      reference: opts.reference,
      title: opts.title,
      // Never omit. The API default is `permanent`; see the header note.
      retention: RETENTION,
      recorder: {
        camera: true,
        microphone: true,
        // Screen sharing is offered — an agent may want to walk through the
        // comparables rather than just talk to camera.
        screen: true,
        maxDurationSecs: opts.maxDurationSecs ?? 150,
      },
      metadata: opts.metadata ?? {},
    },
  });
  if (!res.ok) return { recording: null, error: res.error };
  return { recording: res.data as Recording, error: null };
}

export async function getRecording(
  recordingId: string
): Promise<{ recording: Recording | null; error: string | null }> {
  const res = await call(`/recordings/${encodeURIComponent(recordingId)}`, { method: "GET" });
  if (!res.ok) return { recording: null, error: res.error };
  return { recording: res.data as Recording, error: null };
}

/** Irreversible, and the media outlives us if we don't call it. */
export async function deleteRecording(recordingId: string): Promise<boolean> {
  const res = await call(`/recordings/${encodeURIComponent(recordingId)}`, { method: "DELETE" });
  return res.ok;
}

/* ── webhooks ─────────────────────────────────────────────────────────────── */

/**
 * Verify `Flow-Signature: t=<unix>,v1=<hex>` over the RAW body.
 *
 * Raw, before any JSON parsing — re-serialising changes the bytes and the
 * signature can never match. The five-minute window is what stops a captured
 * delivery being replayed tomorrow.
 */
export function verifyWebhook(rawBody: string, header: string | null, secret: string): boolean {
  if (!header || !secret) return false;
  const parts: Record<string, string> = {};
  for (const p of header.split(",")) {
    const i = p.indexOf("=");
    if (i > 0) parts[p.slice(0, i).trim()] = p.slice(i + 1).trim();
  }
  const t = Number(parts.t);
  if (!Number.isFinite(t)) return false;
  if (Math.abs(Date.now() / 1000 - t) > 300) return false;

  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(parts.v1 ?? "");
  // timingSafeEqual throws on a length mismatch, so check first.
  return a.length === b.length && timingSafeEqual(a, b);
}

export function webhookSecret(): string {
  return (process.env.FLOW_WEBHOOK_SECRET ?? "").trim();
}
