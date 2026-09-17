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
 * NOT self-hosted, despite what this comment used to say. James bought Cloud
 * Pro on the EU region on 7 Sep 2026, so the host is `api.docuseal.eu` and
 * `apiRoot()` below is what keeps the paths right. DocuSeal Cloud also keeps
 * TESTING and PRODUCTION entirely apart: a key sees only its own environment's
 * templates and webhooks, which is why the terms template had to be rebuilt in
 * production as 763089. See [[tle-os-docuseal-cloud]] in memory.
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
  /**
   * The agent's own address. They are a SUBMITTER now, not a name in a box:
   * they sign first and the landlord never sees it until they have.
   */
  agentEmail: string;
  landlordName: string;
  landlordEmail: string;
  landlordAddress: string;
  contactNumber: string;
  propertyAddress: string;
  /** "Experts Management Service" and the like, as the contract words it. */
  serviceLevel: string;
  /** Both fee boxes, already in words — see `feeWording`. */
  setUpFee: string;
  managementFee: string;
  /** Anything agreed on top. "None" rather than empty: a blank box on a
   *  signed contract is an argument waiting to happen. */
  additionalFees: string;
  /** Our own id for this appraisal, so a webhook can find its way home. */
  externalId: string;
}

/**
 * THE STANDARD FEES, from the contract itself (page 5 of the Sep 26 England
 * Terms of Business), used when the agent has not recorded their own.
 *
 * Susan's condition, 14 Sep: the fees must be filled in before it reaches the
 * landlord, because the printed schedule carries the standard ones and a
 * contract that disagrees with its own fee table is worse than no contract.
 * So this never returns an empty string.
 */
export function feeWording(
  serviceLevel: string | null,
  feePercent: number | null,
  setUpAmount: number | null
): { setUp: string; management: string } {
  const money = (n: number) => `£${n.toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  const id = (serviceLevel ?? "").toLowerCase();
  const tenantFind = id.includes("tenant");
  const standardPct = id.includes("manage") ? "14% + VAT (16.8% inc VAT)" : "12% + VAT (14.4% inc VAT)";

  const management = tenantFind
    ? "Not applicable — Tenant Find"
    : feePercent != null
      ? `${feePercent}% + VAT`
      : standardPct;

  const setUp = setUpAmount != null
    ? `${money(setUpAmount)} + VAT`
    : tenantFind
      ? "75% of the first month's rent + VAT (minimum £500 + VAT)"
      : "50% of the first month's rent + VAT (minimum £500 + VAT)";

  return { setUp, management };
}

export interface SigningSession {
  submitterId: number;
  slug: string;
  /** Where the embedded form is pointed. */
  embedSrc: string;
  status: string;
}

/** Both halves of a two-part signing, in the order they are signed. */
export interface TermsSigningPair {
  agent: SigningSession;
  landlord: SigningSession;
  submissionId: number | null;
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
/**
 * The landlord's half of a contract the agent has already started.
 *
 * THE LANDLORD NEVER MINTS A CONTRACT. Their portal used to call
 * openTermsSigning itself, which created a SECOND submission against the same
 * appraisal - two contracts for one property, both signable, and nothing on
 * either saying which one counted. Now it finds the one the agent made.
 *
 * Null when the agent has not sent the terms yet, which is a real answer and
 * not an error: the landlord is told their agent is still preparing them.
 */
/**
 * Has EVERYBODY signed, or only the person who just did?
 *
 * DocuSeal fires `form.completed` per submitter. With one signer that was the
 * same question; with two it is not, and the difference matters more than it
 * looks: the agent signs first, and storing their completion would file a
 * contract carrying one signature, tick "Terms signed" on the spine and move
 * the appraisal on to the take-on visit - before the landlord had seen it,
 * let alone agreed to it.
 *
 * Asked of DocuSeal rather than inferred from the payload, because the payload
 * does not carry the other submitters and a webhook is not a place to guess.
 * Unreachable counts as NOT complete: a contract filed late is a nuisance and
 * one filed early is a lie.
 */
export async function everybodySigned(submissionId: number | null): Promise<boolean> {
  if (!submissionId) return false;
  try {
    const sub = await ds<{ submitters?: Array<{ completed_at?: string | null }>; completed_at?: string | null }>(
      `/submissions/${submissionId}`
    );
    if (sub?.completed_at) return true;
    const all = sub?.submitters ?? [];
    return all.length > 0 && all.every((s) => Boolean(s.completed_at));
  } catch {
    return false;
  }
}

/** One side of a contract, as DocuSeal currently holds it. */
export interface TermsParty {
  role: "agent" | "landlord";
  submitterId: number;
  name: string | null;
  email: string;
  slug: string;
  embedSrc: string;
  /** "awaiting", "sent", "opened", "completed", "declined". */
  status: string;
  /** When DocuSeal emailed them. Null means it never has. */
  sentAt: string | null;
  openedAt: string | null;
  completedAt: string | null;
}

/**
 * Both sides of one appraisal's contract, read from DocuSeal rather than
 * remembered here.
 *
 * Nothing about who has signed, who has been emailed or who has opened it is
 * stored on our side, and that is deliberate: DocuSeal is the system of record
 * for a signature, and a second copy of that state is a second thing to be
 * wrong. Every one of these fields is theirs - sent_at, opened_at,
 * completed_at - so the file cannot claim a contract is signed when it is not.
 *
 * Newest first, so a contract re-sent after a correction wins over the one it
 * replaced.
 */
export async function termsParties(externalId: string): Promise<TermsParty[]> {
  const raw = await ds<{
    data?: Array<{
      id?: number;
      slug?: string;
      name?: string | null;
      email?: string;
      embed_src?: string;
      status?: string;
      role?: string;
      sent_at?: string | null;
      opened_at?: string | null;
      completed_at?: string | null;
    }>;
  }>(`/submitters?external_id=${encodeURIComponent(externalId)}&limit=20`).catch(() => null);

  const rows = [...(raw?.data ?? [])].reverse();
  const base = signingBase(baseUrl() ?? "");
  const pick = (role: "agent" | "landlord"): TermsParty | null => {
    const r = rows.find((x) => (x.role ?? "").toLowerCase() === role && x.slug);
    if (!r?.slug) return null;
    return {
      role,
      submitterId: Number(r.id),
      name: r.name ?? null,
      email: r.email ?? "",
      slug: r.slug,
      embedSrc: r.embed_src || `${base}/s/${r.slug}`,
      status: r.status ?? "awaiting",
      sentAt: r.sent_at ?? null,
      openedAt: r.opened_at ?? null,
      completedAt: r.completed_at ?? null,
    };
  };
  return [pick("agent"), pick("landlord")].filter((x): x is TermsParty => x !== null);
}

/**
 * PUT the landlord's own copy into their inbox - the send, and every reminder
 * after it.
 *
 * ── This is the line that emails a real landlord ──────────────────────────
 *
 * One primitive for both, because they ARE both: DocuSeal's
 * `PUT /submitters/:id { send_email: true }` sends the invitation if it has
 * never gone and sends it again if it has. Writing them as two things would
 * mean two places for the send lock to be got wrong.
 *
 * Today an agent who wants to chase an unsigned contract has to find somebody
 * with a DocuSeal login (James, 15 Sep 2026: "every time they need to send a
 * nudge, they have to go to someone with a DocuSign account"). This is the
 * whole of that, on the file, for the agent whose deal it is.
 *
 * Locked exactly like sendForSignature: no lock, no send. Sandbox addresses
 * are refused here as well as there, because a guarantee enforced in one
 * place is not a guarantee.
 */
export async function emailTerms(party: TermsParty): Promise<void> {
  if (!docusealConfigured()) {
    throw new DocusealBlocked("DocuSeal isn't connected on this environment.");
  }
  if (!docusealSendUnlocked()) {
    throw new DocusealBlocked(
      'Sending is locked on this environment. Set DOCUSEAL_ALLOW_SEND="yes" to unlock it — and send the first one to a colleague, not a landlord.'
    );
  }
  const email = (party.email ?? "").trim();
  if (!email.includes("@")) {
    throw new DocusealBlocked(`"${email || "(blank)"}" isn't an email address.`);
  }
  if (email.toLowerCase().endsWith(`@${SANDBOX_EMAIL_DOMAIN}`)) {
    throw new DocusealBlocked("That's a sandbox address — sandbox records can't be sent contracts.");
  }
  await ds(`/submitters/${party.submitterId}`, {
    method: "PUT",
    /* Stated, never inherited. The whole file's rule, and this is the one call
       where getting it wrong is an email nobody meant to send. */
    body: { send_email: true },
  });
}

export async function findLandlordSigning(externalId: string): Promise<SigningSession | null> {
  const raw = await ds<{ data?: Array<{ id?: number; slug?: string; embed_src?: string; status?: string; role?: string; external_id?: string }> }>(
    `/submitters?external_id=${encodeURIComponent(externalId)}&limit=20`
  ).catch(() => null);
  const rows = raw?.data ?? [];
  /* Newest first, so a contract re-sent after a correction wins over the one
     it replaced. DocuSeal returns them in creation order. */
  const landlord = [...rows].reverse().find((r) => (r.role ?? "").toLowerCase() === "landlord" && r.slug);
  if (!landlord?.slug) return null;
  const base = signingBase(baseUrl() ?? "");
  return {
    submitterId: Number(landlord.id),
    slug: landlord.slug,
    embedSrc: landlord.embed_src || `${base}/s/${landlord.slug}`,
    status: landlord.status ?? "awaiting",
  };
}

/**
 * Archive every contract opened against this appraisal - the test-file reset
 * only (lib/test-files). A reset appraisal keeps its id, so a signed contract
 * left behind was found again and the file read "signed" before anything had
 * been sent (James, 17 Sep 2026). DocuSeal's DELETE archives; nothing is lost.
 */
export async function archiveTermsFor(externalId: string): Promise<number> {
  const raw = await ds<{ data?: Array<{ submission_id?: number }> }>(
    `/submitters?external_id=${encodeURIComponent(externalId)}&limit=50`
  ).catch(() => null);
  const ids = [...new Set((raw?.data ?? []).map((r) => r.submission_id).filter((x): x is number => typeof x === "number"))];
  let n = 0;
  for (const id of ids) {
    const ok = await ds(`/submissions/${id}`, { method: "DELETE" }).then(() => true).catch(() => false);
    if (ok) n++;
  }
  return n;
}

export async function openTermsSigning(
  templateId: number,
  p: TermsPrefill
): Promise<TermsSigningPair> {
  const raw = await ds<
    Array<{ id?: number; slug?: string; embed_src?: string; status?: string; role?: string; submission_id?: number }>
  >("/submissions", {
    method: "POST",
    body: {
      template_id: templateId,
      send_email: false,
      send_sms: false,
      /* ORDER IS THE CONTRACT. James, 14 Sep 2026: "we would get the agent to
         sign before it goes off. When they're prepared to send it off, they'll
         then sign it, date and time it, and send it back to us." DocuSeal
         signs in the order the submitters are listed, so the agent is first
         and the landlord cannot open theirs until the agent is done.

         It also puts the ten detail boxes in front of the person who can tell
         whether they are right, at the moment they are committing to them. */
      submitters: [
        {
          role: "Agent",
          name: p.agentName,
          email: p.agentEmail,
          external_id: p.externalId,
          /* THE FIELD NAMES ARE THE TEMPLATE'S, CHARACTER FOR CHARACTER.
             DocuSeal drops a prefill whose name it does not recognise without
             a word of complaint, so a rename does not fail here - it arrives
             as a blank box on a contract somebody is about to sign. They are
             built by scripts/build-tob-template.mjs; change them there and
             here together or not at all. */
          values: {
            "Partner Agent": p.agentName,
            Landlord: p.landlordName,
            "Landlord Address": p.landlordAddress,
            "Contact Number": p.contactNumber,
            "Email Address": p.landlordEmail,
            "Property Address": p.propertyAddress,
            "Service Level": p.serviceLevel,
            "Set-Up / Tenant Find Fee": p.setUpFee,
            "Management / Rent Collection Fee": p.managementFee,
            "Additional Fees Agreed": p.additionalFees,
          },
        },
        {
          role: "Landlord",
          name: p.landlordName,
          email: p.landlordEmail,
          external_id: p.externalId,
        },
      ],
    },
  });

  const list = Array.isArray(raw) ? raw : [];
  const pick = (role: string) => list.find((s) => (s.role ?? "").toLowerCase() === role);
  const agent = pick("agent") ?? list[0];
  const landlord = pick("landlord") ?? list[1];
  if (!agent?.slug || !landlord?.slug) {
    throw new DocusealBlocked("DocuSeal created the contract without both signers on it.");
  }

  const base = signingBase(baseUrl() ?? "");
  /* embed_src is preferred over a URL we build: it is what DocuSeal itself
     says the form lives at, and it already carries the right region. */
  const toSession = (s: typeof agent): SigningSession => ({
    submitterId: Number(s!.id),
    slug: s!.slug!,
    embedSrc: s!.embed_src || `${base}/s/${s!.slug}`,
    status: s!.status ?? "awaiting",
  });

  return {
    agent: toSession(agent),
    landlord: toSession(landlord),
    submissionId: agent.submission_id ?? null,
  };
}
