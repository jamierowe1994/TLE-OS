import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { hasDb, q } from "@/lib/db";
import { record } from "@/lib/audit";

/* ==========================================================================
   WHEN CLAUDE SAYS NO (22 Oct 2026).

   On 20 Oct the Anthropic account ran out of credit. Every PLC file came back
   with the API's own words under it - "400 {"type":"error",...credit balance
   is too low...}" - on every document Kirstie opened, and nobody was told
   once, in one place, that the reader was off.

   So a refusal from the API is turned into one plain sentence here, by what
   kind of refusal it is, and the API's own words (with the request id) go to
   the server log, where whoever fixes it will look:

     credit   the balance or a spend limit ran out          offline
     key      the key is missing, wrong or not allowed      offline
     busy     overloaded, rate limited, a 5xx, no answer    try again shortly
     refused  anything else the API turned down             this one, by hand

   Offline is the one an owner has to act on, so it is written down once per
   outage (os_settings "ai_outage") with one line in the audit trail that the
   owners' bell reads. The first call that is answered afterwards closes it.
   ========================================================================== */

export type AiFailKind = "credit" | "key" | "busy" | "refused";

/** Who is speaking when a feature is off, so the sentence names the right thing. */
export type AiVoice = "reader" | "writer" | "steve" | "bond";

/** The sentence a person sees. No JSON, no request id, no status code. */
export function aiFailText(kind: AiFailKind, voice: AiVoice): string {
  if (voice === "reader") {
    if (kind === "credit" || kind === "key") return "The document reader is offline just now. Check this one by hand, or try again later.";
    if (kind === "busy") return "The reader is busy. Try again in a minute.";
    return "The reader couldn't read this one. Check it by hand.";
  }
  const who = voice === "steve" ? "Steve" : voice === "bond" ? "Bond" : "The writer";
  if (kind === "credit" || kind === "key") return `${who} is offline just now. Try again later.`;
  if (kind === "busy") return `${who} is busy. Try again in a minute.`;
  return `${who} couldn't answer that one. Try again, or do it by hand.`;
}

/**
 * The same, for a file that will be read again on its own (the PLC pack): the
 * promise is only made where something keeps it (lib/plc-reread).
 */
export function aiWaitingText(kind: AiFailKind): string {
  return kind === "busy"
    ? "The reader is busy. It will try again shortly."
    : "The document reader is offline just now. Check this one by hand, or it will read itself when it's back.";
}

/**
 * A call the API refused, carrying the plain sentence as its message.
 *
 * Every caller that already shows `e.message` (or passes it through
 * publicError) now shows the sentence rather than the JSON, without being
 * changed. The original error is the `cause`.
 */
export class AiUnavailable extends Error {
  readonly kind: AiFailKind;
  constructor(kind: AiFailKind, voice: AiVoice, cause: unknown) {
    super(aiFailText(kind, voice), { cause });
    this.name = "AiUnavailable";
    this.kind = kind;
  }
}

/** The API's error body, whichever shape the SDK left it in. */
function bodyType(e: InstanceType<typeof Anthropic.APIError>): string {
  const b = e.error as { type?: unknown; error?: { type?: unknown } } | undefined;
  return String(b?.error?.type ?? b?.type ?? "");
}

/** What kind of refusal this was, or null when it is not the API refusing (our own bug). */
export function aiFailOf(e: unknown): AiFailKind | null {
  if (e instanceof AiUnavailable) return e.kind;
  /* Timeouts are a subclass of the connection error. */
  if (e instanceof Anthropic.APIConnectionError) return "busy";
  if (e instanceof Anthropic.APIError) {
    const status = e.status ?? 0;
    const type = bodyType(e);
    /* The credit message has been a 400 invalid_request_error ("Your credit
       balance is too low to access the Anthropic API"); a spend limit is a
       400 too ("You have reached your specified API usage limits"). Matched on
       the words as well as the type, since the type is the generic one. */
    if (status === 402 || type === "billing_error" || /credit balance|purchase credits|plans? (&|and) billing|usage limits?|spend(ing)? limit/i.test(e.message)) {
      return "credit";
    }
    if (status === 401 || status === 403 || type === "authentication_error" || type === "permission_error") return "key";
    if (status === 429 || status === 529 || status >= 500 || type === "overloaded_error" || type === "rate_limit_error") return "busy";
    return "refused";
  }
  /* No key at all: the SDK refuses to build a client. */
  if (e instanceof Anthropic.AnthropicError && /api[_ ]?key/i.test(e.message)) return "key";
  return null;
}

/** For the log: what the API said, its status and request id. Never for a screen. */
function detailOf(e: unknown): string {
  if (e instanceof Anthropic.APIError) {
    return [e.status, e.requestID ? `request ${e.requestID}` : "", e.message].filter(Boolean).join(" · ");
  }
  return e instanceof Error ? e.message : String(e);
}

/**
 * The one catch every model call passes through (lib/ai send). Logs the
 * detail, notes an outage, and hands back what the caller should throw.
 */
export function aiFailure(feature: string, voice: AiVoice, e: unknown): unknown {
  const kind = aiFailOf(e);
  if (!kind) return e;
  console.error(`[ai] ${feature} ${kind}:`, detailOf(e));
  if (kind !== "refused") void noteFailure(kind, feature, e);
  return new AiUnavailable(kind, voice, e);
}

/* ── The state ────────────────────────────────────────────────────────────── */

const KEY = "ai_outage";

export interface AiOutage {
  /** Set while the account is refusing (credit or key); null once a call is answered. */
  since: string | null;
  kind: AiFailKind | null;
  /** The first feature refused, for the owners' line. */
  feature: string | null;
  /** The API's words, kept for the owners (the bell, not the screens). */
  detail: string | null;
  /** The last refusal of any kind, offline or busy, and when the first answer came back. */
  lastFailAt: string | null;
  lastFailKind: AiFailKind | null;
  backAt: string | null;
}

/**
 * How long a re-read waits after the API last refused. Busy clears in
 * seconds; a spent balance needs a person, so it is asked again only every
 * few minutes (each ask is a refusal, which is free, but it is noise in the
 * log). Any call answered in the meantime, anywhere in the OS, ends the wait.
 */
export const REST_MS: Record<AiFailKind, number> = {
  busy: 60_000,
  credit: 5 * 60_000,
  key: 5 * 60_000,
  refused: 0,
};

/** This process's view, so an answered call costs a query only when an outage was open. */
const mem: { offline: boolean | null; lastFail: { kind: AiFailKind; at: number } | null } = {
  offline: null,
  lastFail: null,
};

async function noteFailure(kind: AiFailKind, feature: string, e: unknown): Promise<void> {
  mem.lastFail = { kind, at: Date.now() };
  const offline = kind === "credit" || kind === "key";
  if (offline) mem.offline = true;
  if (!hasDb()) return;
  const now = new Date().toISOString();
  const opened: AiOutage = {
    since: now,
    kind,
    feature,
    detail: detailOf(e).slice(0, 400),
    lastFailAt: now,
    lastFailKind: kind,
    backAt: null,
  };
  try {
    /* One statement, so two files refused together cannot both open the
       outage: the second finds `since` already set and only moves the last
       failure on. Whoever's `since` comes back is the one that opened it. */
    const rows = await q<{ value: AiOutage }>(
      `INSERT INTO os_settings (key, value, updated_at, updated_by)
         VALUES ($1, $2::jsonb, NOW(), 'ai')
       ON CONFLICT (key) DO UPDATE SET
         value = CASE
           WHEN $3::boolean AND (os_settings.value->>'since') IS NULL THEN EXCLUDED.value
           ELSE os_settings.value || jsonb_build_object('lastFailAt', $4::text, 'lastFailKind', $5::text)
         END,
         updated_at = NOW()
       RETURNING value`,
      [KEY, JSON.stringify(offline ? opened : { ...opened, since: null, kind: null, feature: null, detail: null }), offline, now, kind]
    );
    if (offline && rows[0]?.value?.since === now) {
      await record({
        kind: "ai_offline",
        actorEmail: "",
        detail: `${feature}: ${kind === "credit" ? "the Anthropic account is out of credit or over its spend limit" : "the Anthropic key was refused"} (${opened.detail})`,
      });
    }
  } catch (err) {
    console.error("[ai outage] could not record", err instanceof Error ? err.message : err);
  }
}

/** A call was answered. Closes an open outage; costs nothing when none was open. */
export async function noteAnswered(): Promise<void> {
  mem.lastFail = null;
  if (mem.offline === false) return;
  mem.offline = false;
  if (!hasDb()) return;
  try {
    await q(
      `UPDATE os_settings
          SET value = value || jsonb_build_object('since', null, 'backAt', $2::text), updated_at = NOW()
        WHERE key = $1 AND (value->>'since') IS NOT NULL`,
      [KEY, new Date().toISOString()]
    );
  } catch (err) {
    mem.offline = null;
    console.error("[ai outage] could not close", err instanceof Error ? err.message : err);
  }
}

export async function aiOutage(): Promise<AiOutage | null> {
  if (!hasDb()) return null;
  const rows = await q<{ value: AiOutage }>(`SELECT value FROM os_settings WHERE key = $1`, [KEY]).catch(() => []);
  return rows[0]?.value ?? null;
}

/**
 * Whether a re-read should hold off: the API refused something recently
 * enough that asking again now would only be refused again. Read from the
 * database as well as memory, so a restart does not forget a spent balance.
 */
export async function aiResting(): Promise<boolean> {
  const recent = (kind: AiFailKind | null, at: number | null) => kind !== null && at !== null && Date.now() - at < REST_MS[kind];
  if (mem.lastFail && recent(mem.lastFail.kind, mem.lastFail.at)) return true;
  const o = await aiOutage();
  if (!o?.lastFailAt) return false;
  /* Answered since the last refusal: nothing to rest from. */
  if (o.backAt && o.backAt > o.lastFailAt) return false;
  return recent(o.lastFailKind, Date.parse(o.lastFailAt));
}
