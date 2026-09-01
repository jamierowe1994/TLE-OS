/**
 * DocuSeal — our own e-signature, self-hosted.
 *
 * ── Why this exists alongside the REX/DocuSign route ──────────────────────
 *
 * We already send terms through REX's own DocuSign connection (app/api/esign/*),
 * which needs no key of ours and lands the envelope on the REX record. James
 * chose on 27 Aug 2026 to make DocuSeal the PRIMARY path and keep that one as a
 * fallback, so terms can still go out if one provider is down.
 *
 * DocuSeal is `jamierowe1994/docuseal` — our fork, our instance, no per-envelope
 * cost, and the same choice Fine & Country made.
 *
 * ── The send lock, and why it is not optional ─────────────────────────────
 *
 * DocuSeal's `POST /api/submissions` defaults `send_email` to **true**. That is
 * a live email to a real landlord as the immediate consequence of a request
 * reaching this file — no staging, no preview, no undo. Read the API controller
 * if you doubt it: `params[:send_email] = true unless params.key?(:send_email)`.
 *
 * So sending is locked by default, exactly like REX writes are:
 *
 *   - `DOCUSEAL_URL` and `DOCUSEAL_API_KEY` unset  → the integration is inert
 *   - set, but `DOCUSEAL_ALLOW_SEND` unset          → reads work, sends refuse
 *   - `DOCUSEAL_ALLOW_SEND="yes"`                   → sends fire
 *
 * Three states rather than two, because "connected" and "allowed to email a
 * landlord" are different questions and collapsing them is how the first
 * careful test becomes an accident. We can build templates, list them and
 * render the panel long before anything is permitted to leave the building.
 *
 * `send_email` is ALWAYS sent explicitly. Never rely on the server default:
 * the safe value is the one we state, and a future DocuSeal upgrade changing
 * its own default must not change what we do.
 *
 * ── Sandbox records can never sign ────────────────────────────────────────
 *
 * Anything whose id or email carries the sandbox marks is refused before a
 * request is built. See lib/sandbox.
 */

import { SANDBOX_EMAIL_DOMAIN, SANDBOX_PREFIX } from "@/lib/sandbox";

export interface DocusealTemplate {
  id: number;
  name: string;
  slug: string;
  /** Roles the template expects — "Landlord", "Agent". Drives who we collect. */
  roles: string[];
  updatedAt: string | null;
}

export interface DocusealSubmitter {
  id: number;
  email: string;
  role: string | null;
  status: string | null;
  completedAt: string | null;
  /** The signing link, when DocuSeal gives us one. */
  url: string | null;
}

export interface DocusealSubmission {
  id: number;
  templateId: number | null;
  createdAt: string | null;
  submitters: DocusealSubmitter[];
}

/** Why a call cannot proceed — surfaced to the UI verbatim, never swallowed. */
export class DocusealBlocked extends Error {}

export function docusealConfigured(): boolean {
  return Boolean(baseUrl() && process.env.DOCUSEAL_API_KEY);
}

/** Is sending unlocked on this environment? Reads do not need this. */
export function docusealSendUnlocked(): boolean {
  return (process.env.DOCUSEAL_ALLOW_SEND ?? "").trim().toLowerCase() === "yes";
}

function baseUrl(): string | null {
  const raw = (process.env.DOCUSEAL_URL ?? "").trim();
  return raw ? raw.replace(/\/+$/, "") : null;
}

/**
 * THE API ROOT, whichever host was configured — and this cost a real failure.
 *
 * This file was written for a SELF-HOSTED instance, where the API hangs off
 * `/api` on your own domain. TLE went to Cloud instead, where the API host IS
 * `api.docuseal.eu` and there is no `/api` segment. So `${base}/api/submissions`
 * became `https://api.docuseal.eu/api/submissions` and DocuSeal answered
 * **404 with an empty body** — no message, nothing naming the problem, on the
 * one screen where an agent is sitting in front of a landlord.
 *
 * Measured, both shapes work:
 *   https://api.docuseal.eu/templates       → 200
 *   https://docuseal.eu/api/templates       → 200
 *   https://api.docuseal.eu/api/templates   → 404   ← what we were sending
 *
 * So the host decides. An `api.` host is already the API root; anything else
 * needs `/api` appending. Telling James to set the variable a particular way
 * would have worked once and broken the next time somebody set the obvious
 * value, and the error it produces names nothing.
 */
function apiRoot(base: string): string {
  return /^https?:\/\/api\./i.test(base) ? base : `${base}/api`;
}

/**
 * WHERE A HUMAN SIGNS — never the API host.
 *
 * The same confusion one level down: signing forms live at
 * `https://docuseal.eu/s/<slug>`, not on `api.docuseal.eu`. Built from the API
 * host it produces a link that looks right, is wrong, and would be discovered
 * by a landlord rather than by us. Derived by dropping the leading `api.` so
 * the two can never drift to different regions.
 */
function signingBase(base: string): string {
  return base.replace("://api.", "://");
}

async function ds<T>(
  path: string,
  init?: { method?: string; body?: unknown }
): Promise<T> {
  const base = baseUrl();
  const key = process.env.DOCUSEAL_API_KEY;
  if (!base || !key) {
    throw new DocusealBlocked(
      "DocuSeal isn't connected on this environment. DOCUSEAL_URL and DOCUSEAL_API_KEY are both needed."
    );
  }
  const res = await fetch(`${apiRoot(base)}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      "X-Auth-Token": key,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });

  const text = await res.text();
  if (!res.ok) {
    /* DocuSeal answers errors as JSON with an `error` key. Surfacing its own
       words beats "request failed": "Template does not contain fields" tells
       an agent exactly what to go and fix. */
    let detail = text.slice(0, 300);
    try {
      const j = JSON.parse(text) as { error?: string };
      if (j.error) detail = j.error;
    } catch {
      /* not JSON — the raw body is still the most useful thing we have */
    }
    throw new DocusealBlocked(`DocuSeal said ${res.status}: ${detail}`);
  }
  return (text ? JSON.parse(text) : null) as T;
}

/* ── reads ────────────────────────────────────────────────────────────────── */

interface RawTemplate {
  id: number;
  name?: string;
  slug?: string;
  updated_at?: string;
  submitters?: Array<{ name?: string }>;
  fields?: Array<{ submitter_uuid?: string }>;
}

export async function templates(): Promise<DocusealTemplate[]> {
  const raw = await ds<{ data?: RawTemplate[] } | RawTemplate[]>("/templates?limit=100");
  const rows = Array.isArray(raw) ? raw : (raw?.data ?? []);
  return rows.map((t) => ({
    id: t.id,
    name: t.name ?? `Template ${t.id}`,
    slug: t.slug ?? "",
    roles: (t.submitters ?? []).map((s) => s.name ?? "").filter(Boolean),
    updatedAt: t.updated_at ?? null,
  }));
}

interface RawSubmission {
  id: number;
  template?: { id?: number };
  template_id?: number;
  created_at?: string;
  submitters?: Array<{
    id: number;
    email?: string;
    role?: string;
    status?: string;
    completed_at?: string | null;
    embed_src?: string;
    slug?: string;
  }>;
}

function shapeSubmission(s: RawSubmission): DocusealSubmission {
  const base = baseUrl();
  return {
    id: s.id,
    templateId: s.template?.id ?? s.template_id ?? null,
    createdAt: s.created_at ?? null,
    submitters: (s.submitters ?? []).map((x) => ({
      id: x.id,
      email: x.email ?? "",
      role: x.role ?? null,
      status: x.status ?? null,
      completedAt: x.completed_at ?? null,
      /* A signing link an agent can read down the phone. `embed_src` when
         DocuSeal gives one, otherwise the public /s/<slug> form. */
      url: x.embed_src ?? (x.slug && base ? `${signingBase(base)}/s/${x.slug}` : null),
    })),
  };
}

export async function submission(id: number): Promise<DocusealSubmission> {
  return shapeSubmission(await ds<RawSubmission>(`/submissions/${id}`));
}

/* ── the one write ────────────────────────────────────────────────────────── */

export interface SendRequest {
  templateId: number;
  /** Who signs, in the template's own role names. */
  signers: Array<{ email: string; name?: string; role?: string }>;
  /** Our own reference, so a webhook can find the file it belongs to. */
  ref?: string;
}

/**
 * Send a document for signature.
 *
 * Refuses rather than degrades. Every refusal here is a case where sending
 * anyway would put a real email in front of a real person: no lock, a sandbox
 * record, or an address we cannot vouch for.
 */
export async function sendForSignature(req: SendRequest): Promise<DocusealSubmission> {
  if (!docusealConfigured()) {
    throw new DocusealBlocked("DocuSeal isn't connected on this environment.");
  }
  if (!docusealSendUnlocked()) {
    throw new DocusealBlocked(
      'Sending is locked on this environment. Set DOCUSEAL_ALLOW_SEND="yes" to unlock it — and send the first one to a colleague, not a landlord.'
    );
  }
  if (!req.signers.length) {
    throw new DocusealBlocked("Nobody to send it to.");
  }

  for (const s of req.signers) {
    const email = (s.email ?? "").trim();
    if (!email.includes("@")) {
      throw new DocusealBlocked(`"${email || "(blank)"}" isn't an email address.`);
    }
    /* The sandbox guarantee, enforced at the send path rather than trusted to
       the caller. Two independent marks, either one is enough to refuse. */
    if (email.toLowerCase().endsWith(`@${SANDBOX_EMAIL_DOMAIN}`)) {
      throw new DocusealBlocked("That's a sandbox address — sandbox records can't be sent contracts.");
    }
  }
  if (req.ref?.startsWith(SANDBOX_PREFIX)) {
    throw new DocusealBlocked("That's a sandbox record — sandbox records can't be sent contracts.");
  }

  const raw = await ds<RawSubmission[] | RawSubmission>("/submissions", {
    method: "POST",
    body: {
      template_id: req.templateId,
      // Stated, never inherited — see the header. This is the line that emails
      // a landlord, and it should be readable as such.
      send_email: true,
      send_sms: false,
      submitters: req.signers.map((s) => ({
        email: s.email.trim(),
        name: s.name,
        role: s.role,
        ...(req.ref ? { metadata: { ref: req.ref } } : {}),
      })),
    },
  });

  /* DocuSeal returns an ARRAY from create — one submission per email. We ask
     for one and take the first; returning the array would push a shape nobody
     downstream wants to unwrap. */
  const first = Array.isArray(raw) ? raw[0] : raw;
  if (!first) throw new DocusealBlocked("DocuSeal accepted the request but returned nothing.");
  return shapeSubmission(first);
}

/** The events worth subscribing a webhook to, in the order they happen. */
export const WEBHOOK_EVENTS = [
  "form.viewed",
  "form.started",
  "form.completed",
  "form.declined",
  "submission.completed",
] as const;

/* ── embedded signing ─────────────────────────────────────────────────────── */

/**
 * THE TERMS, PREFILLED FROM WHAT THE APPRAISAL ALREADY KNOWS.
 *
 * ── Why this is the whole point ───────────────────────────────────────────
 *
 * The landlord agreed a rent and a fee in their own kitchen. Every one of
 * those numbers is already on the appraisal record — so asking them to type
 * their own name, address and the fee they just negotiated is the difference
 * between a contract that gets signed on the spot and one that gets "sent
 * over" and read next week, if at all.
 *
 * Measured on the real document (31 Aug 2026): six of the detail boxes and
 * both fee cells can be filled before the landlord opens it. They touch a
 * signature and a date.
 *
 * ── The field-count ceiling, which is real ────────────────────────────────
 *
 * The England terms carry ~45 fillable boxes across 14 pages. Fine & Country
 * handed DocuSeal a shorter list than that and their seller was served a form
 * with NOTHING on it — no fields, not even a signature box. So this template
 * deliberately carries TEN fields, and bank details and the property
 * information page are collected in the OS afterwards rather than in the
 * contract. Growing this list is the one change most likely to break signing.
 *
 * ── Field names are load-bearing ──────────────────────────────────────────
 *
 * DocuSeal matches prefills on the EXACT string and silently drops anything
 * that does not match — a renamed field does not error, it just arrives blank
 * in front of a landlord. These strings must equal the template's field names
 * character for character.
 */
export interface TermsPrefill {
  /** Who the landlord is dealing with — the agent named on the appraisal. */
  agentName: string;
  landlordName: string;
  landlordEmail: string;
  landlordAddress: string;
  contactNumber: string;
  propertyAddress: string;
  /** Set-up fee, £. Rendered into the service row that was agreed. */
  feeAmount: number | null;
  /** Management fee, percent of rent. */
  feePercent: number | null;
  /** Our own id for this appraisal, so a webhook can find its way home. */
  externalId: string;
}

export interface SigningSession {
  submitterId: number;
  slug: string;
  /** Where the embedded form is pointed. */
  embedSrc: string;
  status: string;
}

/**
 * Open a signing session and hand back the embed URL.
 *
 * `send_email` is stated EXPLICITLY as false and must stay that way. DocuSeal
 * defaults it to true — `params[:send_email] = true unless params.key?(...)` —
 * so omitting it emails a real landlord as the immediate consequence of this
 * function running. The whole point of embedding is that the landlord signs on
 * our screen, in front of the agent, so nothing should be emailed at all.
 */
export async function openTermsSigning(
  templateId: number,
  p: TermsPrefill
): Promise<SigningSession> {
  const raw = await ds<
    Array<{ id?: number; slug?: string; embed_src?: string; status?: string }>
  >("/submissions", {
    method: "POST",
    body: {
      template_id: templateId,
      send_email: false,
      send_sms: false,
      submitters: [
        {
          role: "Landlord",
          name: p.landlordName,
          email: p.landlordEmail,
          /* Ours, not theirs. The webhook uses this to find the appraisal
             again — see the note on document URLs expiring in 40 minutes. */
          external_id: p.externalId,
          values: {
            "Partner Agent": p.agentName,
            "Landlord Name": p.landlordName,
            "Landlord Address": p.landlordAddress,
            "Contact Number": p.contactNumber,
            "Email Address": p.landlordEmail,
            "Property Address": p.propertyAddress,
            "Management Fee Amount": p.feeAmount != null ? p.feeAmount.toFixed(2) : "",
            "Management Fee Percent": p.feePercent != null ? String(p.feePercent) : "",
          },
        },
      ],
    },
  });

  const s = Array.isArray(raw) ? raw[0] : null;
  if (!s?.slug) throw new DocusealBlocked("DocuSeal created no submitter to sign.");

  /* embed_src is preferred over a URL we build: it is what DocuSeal itself
     says the form lives at, and it already carries the right region. */
  const base = signingBase(baseUrl() ?? "");
  return {
    submitterId: Number(s.id),
    slug: s.slug,
    embedSrc: s.embed_src || `${base}/s/${s.slug}`,
    status: s.status ?? "awaiting",
  };
}
