import "server-only";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { hasDb, q } from "@/lib/db";
import { R2_BUCKET, r2Configured, withR2 } from "@/lib/r2";
import { demoMode } from "@/lib/demo/mode";
import { demoFilesOn, putDemoFile } from "@/lib/demo/files";
import { lookFor } from "@/lib/new-look-store";
import { isScottish } from "@/lib/property-flags";
import { addrOf, sameHome } from "@/lib/address-parse";
import { findHomeAddress } from "@/lib/landlord-home";
import { addFileDoc } from "@/lib/file-documents";
import { OTHER } from "@/lib/doc-types";
import { recordFact } from "@/lib/property-facts";
import { invoiceSettings } from "@/lib/invoices";
import { ResendBlocked, sendEmail } from "@/lib/resend";
import { record } from "@/lib/audit";
import { emailFor, sendFromHome, tenantsOf, type HomeContext, type Recipient, type SendDoc } from "@/lib/home-send";
import { rentIncreaseNoticePdf } from "@/lib/rent-increase-notice-pdf";
import {
  PRT_BEGAN, dayWords, fillNotice, increaseOf, isDay, isPeriod, isResponse, noticePeriod, periodOf, pounds, problems, ukToday,
  type RentReview, type RentReviewAnswers, type ReviewStatus, type TenantResponse,
} from "@/lib/rent-review-rules";
import type { OsUser } from "@/lib/users";

/**
 * THE SCOTTISH RENT REVIEW, ON THE SERVER (James and Michael Healy, 19-20 Nov 2026).
 *
 * Lianna Denholm and Sean McMahon were paying Legal for Landlords for every
 * rent-increase notice. This is the notice, filled in and sent from the home:
 *
 *   startFor        what the screen opens with: the sitting tenants, the
 *                   landlord and their address, the agent's office address,
 *                   today on the UK clock and the earliest the rent can start.
 *   sendRentReview  one press, once (the screen's own id is the row's key):
 *                   the rules checked again, the notice made as a PDF, kept in
 *                   R2 and on the home's Documents, emailed to each ticked
 *                   tenant on their own from the agent's Outlook (lib/home-send,
 *                   so it is on the home's activity and its legal record),
 *                   accounts told to amend the PayProp invoices, the last
 *                   increase kept on the home's facts. "print" does all of it
 *                   but the tenant emails, for a tenancy that never agreed to
 *                   notices by email: the agent hands it over or posts it.
 *   reviews...      Michael's Rent Reviews tab on the compliance desk, which
 *                   only records: PayProp updated, and the tenant's answer.
 *
 * Nothing here writes to REX, PayProp or Propoly. In the demo copy nothing is
 * sent: every email is made and logged as not sent ("Demo - nothing was sent").
 * The bell reads os_rent_reviews itself (lib/notifications).
 */

export const ACCOUNTS_DEFAULT = "accounts@thelettingexperts.co.uk";
/* The Edinburgh office, as the agents' own notices give it. A setting (os_settings
   "rent_review"), and changeable on each notice. */
export const AGENT_ADDRESS_DEFAULT = "Foxglove Offices, 14 Great Michael House\nLinks Place\nEdinburgh\nEH6 7EZ";
const SETTINGS_KEY = "rent_review";
const DEMO_SAID = "Demo - nothing was sent.";
export const EVIDENCE_PREFIX = (id: string) => `documents/rent-review-${id}/evidence/`;
export const isReviewId = (id: unknown): id is string => typeof id === "string" && /^[a-f0-9]{24}$/.test(id);

/** Somewhere to keep a file: R2, or on the demo copy (which has no R2) its own database (lib/demo/files). */
export const canKeepFiles = () => r2Configured || demoFilesOn();
export async function keepFile(key: string, bytes: Uint8Array, contentType: string, name: string): Promise<void> {
  if (r2Configured) {
    await withR2((c) => c.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: bytes, ContentType: contentType, Metadata: { "original-name": encodeURIComponent(name) } })));
    return;
  }
  if (demoFilesOn()) return putDemoFile(key, bytes, contentType);
  throw new Error("Storage isn't configured on this environment.");
}

/** On for this person: the switch's level (lib/new-look "scotrent"), and always in the demo copy. */
export async function rentReviewOn(actor: Pick<OsUser, "email" | "role"> | null): Promise<boolean> {
  if (demoMode()) return true;
  if (!actor) return false;
  return Boolean((await lookFor(actor).catch(() => null))?.scotrent);
}

export async function rentReviewSettings(): Promise<{ agentAddress: string }> {
  if (!hasDb()) return { agentAddress: AGENT_ADDRESS_DEFAULT };
  const rows = await q<{ value: { agentAddress?: string } | null }>(`SELECT value FROM os_settings WHERE key = $1`, [SETTINGS_KEY]).catch(() => []);
  return { agentAddress: rows[0]?.value?.agentAddress?.trim() || AGENT_ADDRESS_DEFAULT };
}

export async function saveRentReviewSettings(agentAddress: string, by: string): Promise<void> {
  await q(
    `INSERT INTO os_settings (key, value, updated_at, updated_by) VALUES ($1, $2::jsonb, NOW(), $3)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW(), updated_by = EXCLUDED.updated_by`,
    [SETTINGS_KEY, JSON.stringify({ agentAddress: agentAddress.trim().slice(0, 400) }), by]
  );
}

/** The let's address as the home's page writes it on a notice: the address, with the postcode if it isn't in it. */
export function letAddressOf(ctx: HomeContext): string {
  const p = ctx.home;
  const line = p.address || p.name;
  return [line, p.postcode && !line.toUpperCase().includes(p.postcode.toUpperCase()) ? p.postcode : ""].filter(Boolean).join(", ");
}

const homeLine = (ctx: HomeContext) => [ctx.title, ctx.home.locality].filter(Boolean).join(", ");
const isScottishHome = (ctx: HomeContext) => isScottish(ctx.home.postcode, ctx.home.address, ctx.home.town, ctx.home.locality);

/** The OS record behind the home (os_properties), whose id the home's facts are kept under. */
async function osRecordFor(ctx: HomeContext): Promise<string | null> {
  const pid = String(ctx.home.propertyId ?? "");
  if (!pid || !hasDb()) return null;
  const rows = await q<{ id: string; address: string }>(
    `SELECT id, address FROM os_properties WHERE (id = $1 OR rex_property_id = $1) ORDER BY active DESC, updated_at DESC LIMIT 12`,
    [pid]
  ).catch(() => []);
  return (rows.find((r) => sameHome(r.address, addrOf(ctx.home))) ?? rows[0])?.id ?? null;
}

/* ── what the screen opens with ─────────────────────────────────────────── */

export interface RentReviewStart {
  scottish: boolean;
  test: boolean;
  viewingAs: boolean;
  demo: boolean;
  home: string;
  tenants: { key: string; name: string; email: string | null; where: string | null }[];
  landlord: { name: string; email: string | null; address: string; addressFrom: string | null };
  letAddress: string;
  agentAddress: string;
  rent: { amount: number | null; period: "week" | "month" };
  tenancyStart: string | null;
  beforePrt: boolean;
  lastIncrease: string | null;
  lastIncreaseFrom: string | null;
  sentOn: string;
  period: ReturnType<typeof noticePeriod>;
  me: { name: string; email: string };
  canSetDefault: boolean;
}

export async function startFor(ctx: HomeContext): Promise<RentReviewStart> {
  const sentOn = ukToday();
  const landlord = ctx.all.find((p) => p.landlord)?.landlord ?? ctx.home.landlord;
  const letAddress = letAddressOf(ctx);
  const ref = landlord && /^\d+$/.test(landlord.contactId) ? `rex:${landlord.contactId}` : null;
  const found = landlord ? await findHomeAddress({ email: landlord.email, ref, name: landlord.name, propertyAddress: letAddress }).catch(() => null) : null;
  const FROM: Record<string, string> = { agent: "the landlord's record", "same-as-property": "the landlord's record", landlord: "the landlord's record", payprop: "PayProp", rex: "their contact record", "new-listing": "the landlord's record" };
  const settings = await rentReviewSettings();

  /* The last increase: a rent review sent from here before, else what the home's facts hold. */
  const before = hasDb()
    ? await q<{ effective_date: string | null }>(
        `SELECT effective_date::text AS effective_date FROM os_rent_reviews WHERE listing_id = $1 AND stage = 'done' AND effective_date IS NOT NULL ORDER BY effective_date DESC LIMIT 1`,
        [String(ctx.home.listingId)]
      ).catch(() => [])
    : [];
  const osId = await osRecordFor(ctx);
  const keys = [osId, ctx.home.propertyId].filter(Boolean) as string[];
  const fact = keys.length
    ? await q<{ value: string | null }>(`SELECT value FROM os_property_facts WHERE property_id = ANY($1::text[]) AND field = 'rent_review_last' AND value IS NOT NULL ORDER BY captured_at DESC LIMIT 1`, [keys]).catch(() => [])
    : [];
  const factDay = fact[0]?.value && isDay(fact[0].value.slice(0, 10)) ? fact[0].value.slice(0, 10) : null;
  const sentDay = before[0]?.effective_date && isDay(before[0].effective_date) ? before[0].effective_date : null;
  const lastIncrease = [sentDay, factDay].filter(Boolean).sort().reverse()[0] ?? null;

  const start = (ctx.home.moveIn ?? ctx.home.letSince ?? "").slice(0, 10) || null;
  return {
    scottish: isScottishHome(ctx),
    test: Boolean(ctx.home.test),
    viewingAs: ctx.viewingAs,
    demo: demoMode(),
    home: homeLine(ctx),
    tenants: tenantsOf(ctx).map((t) => ({ key: t.key, name: t.name, email: t.email, where: t.where })),
    landlord: { name: landlord?.name ?? "", email: landlord?.email ?? null, address: found?.address ?? "", addressFrom: found ? FROM[found.source] ?? null : null },
    letAddress,
    agentAddress: settings.agentAddress,
    rent: { amount: ctx.home.rent ?? ctx.home.rentMonthly ?? null, period: ctx.home.rent != null && ctx.home.rentPeriod === "week" ? "week" : "month" },
    tenancyStart: start && isDay(start) ? start : null,
    beforePrt: Boolean(start && isDay(start) && start < PRT_BEGAN),
    lastIncrease,
    lastIncreaseFrom: lastIncrease ? (lastIncrease === sentDay ? "the rent review sent from here" : "the home's record") : null,
    sentOn,
    period: noticePeriod(sentOn),
    me: { name: ctx.me.name || ctx.me.email, email: ctx.me.email },
    canSetDefault: ctx.office,
  };
}

/* ── the answers, read from a request ───────────────────────────────────── */

const str = (v: unknown, max = 2000) => String(v ?? "").replace(/\u0000/g, "").trim().slice(0, max);
const num = (v: unknown) => {
  const n = Number(String(v ?? "").replace(/[£,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
};

export function answersFrom(raw: unknown): RentReviewAnswers {
  const o = (raw ?? {}) as Record<string, unknown>;
  const lastIncrease = str(o.lastIncrease, 10);
  return {
    tenantNames: str(o.tenantNames, 400),
    letAddress: str(o.letAddress, 400),
    landlordName: str(o.landlordName, 200),
    landlordAddress: str(o.landlordAddress, 400),
    agentAddress: str(o.agentAddress, 400),
    prtConfirmed: o.prtConfirmed === true,
    currentRent: num(o.currentRent),
    currentPeriod: isPeriod(o.currentPeriod) ? o.currentPeriod : "month",
    newRent: num(o.newRent),
    newPeriod: isPeriod(o.newPeriod) ? o.newPeriod : "month",
    effectiveDate: str(o.effectiveDate, 10),
    lastIncrease: isDay(lastIncrease) ? lastIncrease : null,
    notIncreased: o.notIncreased === true,
    why: str(o.why, 4000),
    marketRent: num(o.marketRent),
    marketNote: str(o.marketNote, 600),
    emailAgreed: o.emailAgreed === true,
    signature: str(o.signature, 120),
  };
}

export type Evidence = RentReview["evidence"][number];

export function evidenceFrom(raw: unknown, id: string): Evidence[] {
  const list = Array.isArray(raw) ? raw.slice(0, 20) : [];
  return list
    .map((e) => (e ?? {}) as Record<string, unknown>)
    .map((e) => ({ key: str(e.key, 400), name: str(e.name, 160), size: Number(e.size) || 0, mime: str(e.mime, 100) }))
    /* Only files this notice's own upload put away. */
    .filter((e) => e.key.startsWith(EVIDENCE_PREFIX(id)) && !e.key.includes(".."));
}

/** Every rule, again, on the server. A sentence for the screen, or null. */
export function refusalFor(a: RentReviewAnswers, sentOn: string, evidence: Evidence[]): string | null {
  const p = problems(a, sentOn, evidence.length);
  const all = [...p.tenancy, ...p.rent, ...p.why, ...p.sign];
  return all.length ? all[0] : null;
}

/* ── the emails ─────────────────────────────────────────────────────────── */

function tenantMessage(ctx: HomeContext, a: RentReviewAnswers): string {
  const who = ctx.me.name || "your agent";
  return [
    `Please find attached a rent increase notice for ${a.letAddress || homeLine(ctx)}, sent on behalf of your landlord. It proposes a new rent of ${pounds(a.newRent)} ${periodOf(a.newPeriod).per} from ${dayWords(a.effectiveDate)}.`,
    "Please read the notice carefully. Part 3 of the notice is for your reply: fill it in and return it to us.",
    `If you have any questions, reply to this email or contact ${who}${ctx.me.email ? ` at ${ctx.me.email}` : ""}.`,
  ].join("\n\n");
}

const subjectFor = (ctx: HomeContext) => `Rent increase notice - ${homeLine(ctx)}`.slice(0, 200);

function noticeDoc(id: string, fileName: string, key: string, bytes: Uint8Array | null): SendDoc {
  return {
    id: `rent-review:${id}`, group: "Documents on this home", label: "Rent increase notice", name: fileName, expiry: null, sizeBytes: bytes?.length ?? null,
    room: null, where: null, blocked: null, suggested: true, forTenants: true, forLandlord: false,
    /* The bytes just made, so the email carries exactly what was kept, with no second read from storage. */
    source: bytes ? { held: Buffer.from(bytes), key } : { r2: key },
  };
}

const fileNameFor = (sentOn: string) => `Rent-increase-notice-${sentOn}.pdf`;

/** The email a tenant will get, for the screen: the first ticked tenant's, as it will go. */
export async function emailPreview(ctx: HomeContext, a: RentReviewAnswers, to: Recipient | null): Promise<{ subject: string; html: string }> {
  const sentOn = ukToday();
  const who: Recipient = to ?? { key: "preview", name: "", email: null, listingId: String(ctx.home.listingId), where: null, role: "tenant" };
  return emailFor(ctx, who, [noticeDoc("preview", fileNameFor(sentOn), "preview", null)], { subject: subjectFor(ctx), message: tenantMessage(ctx, a), heading: "Rent Increase Notice" }, ["tenant"]);
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);

function accountsEmail(ctx: HomeContext, a: RentReviewAnswers, tenants: string[], method: "email" | "print", sentOn: string): { subject: string; html: string; text: string } {
  const home = homeLine(ctx);
  const inc = increaseOf(a.currentRent, a.currentPeriod, a.newRent, a.newPeriod);
  const rows: [string, string][] = [
    ["Home", a.letAddress || home],
    ["Old rent", `${pounds(a.currentRent)} ${periodOf(a.currentPeriod).per}`],
    ["New rent", `${pounds(a.newRent)} ${periodOf(a.newPeriod).per}${inc ? ` (up ${pounds(inc.amount)}, ${inc.pct}%)` : ""}`],
    ["Takes effect", dayWords(a.effectiveDate)],
    ["Tenants", tenants.join(", ") || a.tenantNames],
    ["Agent", `${ctx.me.name || ctx.me.email}${ctx.me.email ? ` (${ctx.me.email})` : ""}`],
    ["Notice", `${method === "email" ? "Emailed to the tenants" : "Printed, to hand over or post recorded delivery"} on ${dayWords(sentOn)}`],
  ];
  const subject = `FYI: ${home} has gone in for a rent review`;
  const text = [`FYI: ${home} has gone in for a rent review.`, "", ...rows.map(([k, v]) => `${k}: ${v}`), "", `Please amend the PayProp invoices from ${dayWords(a.effectiveDate)}.`, "", "The notice is attached."].join("\n");
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f8f7f4;font-family:Inter,-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#141413">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e9e9e6;padding:28px">
<p style="margin:0 0 16px;font-size:16px;line-height:1.5"><strong>FYI: ${esc(home)} has gone in for a rent review.</strong></p>
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:14px;line-height:1.5">
${rows.map(([k, v]) => `<tr><td style="padding:7px 12px 7px 0;border-top:1px solid #e9e9e6;color:#63625b;width:120px;vertical-align:top">${esc(k)}</td><td style="padding:7px 0;border-top:1px solid #e9e9e6">${esc(v)}</td></tr>`).join("\n")}
</table>
<p style="margin:18px 0 0;font-size:15px;line-height:1.5"><strong>Please amend the PayProp invoices from ${esc(dayWords(a.effectiveDate))}.</strong></p>
<p style="margin:10px 0 0;font-size:13px;color:#63625b">The notice is attached. Sent from TLE OS.</p>
</div></body></html>`;
  return { subject, html, text };
}

/* ── one press ──────────────────────────────────────────────────────────── */

export class ReviewRefused extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export interface SendOutcome {
  review: RentReview;
  results: { name: string; email: string; sent: boolean; detail: string }[];
  accounts: { to: string; sent: boolean; detail: string };
  demo: boolean;
  again: boolean;
  pdfKey: string;
}

async function claim(id: string, ctx: HomeContext, a: RentReviewAnswers, evidence: Evidence[], method: "email" | "print", osId: string | null): Promise<"mine" | "done" | "busy"> {
  const inserted = await q<{ id: string }>(
    `INSERT INTO os_rent_reviews (id, listing_id, property_id, os_property_id, home, answers, evidence, method, current_rent, new_rent, rent_period, effective_date,
        sent_by_id, sent_by_name, sent_by_email, stage, is_demo)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'sending',$16)
     ON CONFLICT (id) DO NOTHING RETURNING id`,
    [id, String(ctx.home.listingId), ctx.home.propertyId, osId, homeLine(ctx), JSON.stringify(a), JSON.stringify(evidence), method, a.currentRent, a.newRent, a.newPeriod,
      a.effectiveDate, ctx.me.id, ctx.me.name || ctx.me.email, ctx.me.email ?? "", demoMode()]
  );
  if (inserted.length) return "mine";
  const [row] = await q<{ stage: string; listing_id: string; stale: boolean }>(
    `SELECT stage, listing_id, sent_at < NOW() - INTERVAL '5 minutes' AS stale FROM os_rent_reviews WHERE id = $1`,
    [id]
  );
  if (!row || row.listing_id !== String(ctx.home.listingId)) throw new ReviewRefused("That notice belongs to another home. Close this and start again.", 409);
  if (row.stage === "done") return "done";
  /* A press that died half way (the server restarted): after five minutes it may be pressed again. */
  if (row.stale) {
    const re = await q<{ id: string }>(`UPDATE os_rent_reviews SET sent_at = NOW() WHERE id = $1 AND stage = 'sending' AND sent_at < NOW() - INTERVAL '5 minutes' RETURNING id`, [id]);
    if (re.length) return "mine";
  }
  return "busy";
}

export async function sendRentReview(ctx: HomeContext, input: { id: string; answers: RentReviewAnswers; evidence: Evidence[]; recipients: string[]; method: "email" | "print" }): Promise<SendOutcome> {
  const { id, answers: a, evidence, method } = input;
  if (!hasDb()) throw new ReviewRefused("No database on this environment, so nothing can be kept.", 503);
  if (!isReviewId(id)) throw new ReviewRefused("Close this and start the rent review again.");
  if (!isScottishHome(ctx)) throw new ReviewRefused("This home isn't in Scotland. Use the Section 13 rent review instead.");
  if (ctx.home.test) throw new ReviewRefused("This is a test home, so nothing is sent from it.");
  if (ctx.viewingAs) throw new ReviewRefused("Stop viewing as somebody first: the notice goes out under the name of the person who presses Send.", 403);
  if (!canKeepFiles()) throw new ReviewRefused("Storage isn't configured on this environment, so the notice can't be kept.", 503);

  const sentOn = ukToday();
  const wrong = refusalFor(a, sentOn, evidence);
  if (wrong) throw new ReviewRefused(wrong);
  if (method === "email" && !a.emailAgreed) throw new ReviewRefused("Only send it by email when the tenancy agreement says notices can go by email. Otherwise use Download to Print.");

  const sitting = tenantsOf(ctx);
  const picked = sitting.filter((t) => input.recipients.includes(t.key) && t.email);
  if (method === "email" && !picked.length) throw new ReviewRefused("Tick at least one tenant with an email address.");

  const osId = await osRecordFor(ctx);
  const claimed = await claim(id, ctx, a, evidence, method, osId);
  if (claimed === "done") {
    const review = await getReview(id);
    if (!review) throw new ReviewRefused("That notice could not be read back. Refresh the page.", 500);
    return { review, results: review.recipients, accounts: { to: review.accounts.to, sent: Boolean(review.accounts.sentAt), detail: review.accounts.detail }, demo: review.demo, again: true, pdfKey: review.pdfKey ?? "" };
  }
  if (claimed === "busy") throw new ReviewRefused("That notice is still being sent. Give it a minute, then refresh the page.", 409);

  const by = ctx.me.name || ctx.me.email;
  const fail = async (message: string, status = 502): Promise<never> => {
    /* Nothing went: the row goes, so the same press can be tried again. */
    await q(`DELETE FROM os_rent_reviews WHERE id = $1 AND stage = 'sending'`, [id]).catch(() => undefined);
    throw new ReviewRefused(message, status);
  };

  /* 1. The notice, as the tenant will read it, kept with the review. */
  const fileName = fileNameFor(sentOn);
  const pdfKey = `documents/rent-review-${id}/${fileName}`;
  let bytes: Uint8Array;
  try {
    bytes = await rentIncreaseNoticePdf(fillNotice(a, sentOn), { title: `Rent increase notice - ${a.letAddress}`, author: by });
    await keepFile(pdfKey, bytes, "application/pdf", fileName);
  } catch (e) {
    console.error("[rent-reviews] the notice could not be made or kept", id, (e as Error)?.message);
    return fail("The notice couldn't be made and kept, so nothing was sent. Try again in a minute.");
  }

  /* 2. On the home's Documents, titled with the day. */
  await addFileDoc({
    home: { address: letAddressOf(ctx), propertyId: /^\d+$/.test(String(ctx.home.propertyId ?? "")) ? ctx.home.propertyId : null },
    from: { kind: "property", id: String(ctx.home.listingId) },
    type: OTHER,
    name: `Rent increase notice ${dayWords(sentOn)}`,
    fileName,
    r2Key: pdfKey,
    mime: "application/pdf",
    sizeBytes: bytes.length,
    by: { id: ctx.me.id, name: by },
    isTest: false,
  }).catch((e) => console.error("[rent-reviews] not on the home's documents", id, (e as Error)?.message));

  /* 3. Each ticked tenant their own email, from the agent, on the home's record. */
  let results: SendOutcome["results"] = [];
  let homeSendId: string | null = null;
  if (method === "email") {
    try {
      const out = await sendFromHome(ctx, [noticeDoc(id, fileName, pdfKey, bytes)], picked, { subject: subjectFor(ctx), message: tenantMessage(ctx, a), heading: "Rent Increase Notice" }, { dryRun: demoMode() ? DEMO_SAID : undefined });
      homeSendId = out.id;
      results = out.results.map((r) => ({ name: r.name, email: r.email, sent: r.sent, detail: r.detail }));
    } catch (e) {
      results = picked.map((t) => ({ name: t.name, email: t.email ?? "", sent: false, detail: e instanceof Error ? e.message : "Not sent." }));
    }
  }

  /* 4. Accounts, to amend the PayProp invoices. Internal, with the notice. */
  const settings = await invoiceSettings().catch(() => null);
  const accountsTo = settings?.accountsEmail?.trim() || ACCOUNTS_DEFAULT;
  const tenantNames = (method === "email" ? picked : sitting).map((t) => t.name);
  const mail = accountsEmail(ctx, a, tenantNames, method, sentOn);
  let accounts = { to: accountsTo, sent: false, detail: DEMO_SAID };
  if (!demoMode()) {
    try {
      await sendEmail({ to: accountsTo, subject: mail.subject, html: mail.html, text: mail.text, attachments: [{ filename: fileName, content: Buffer.from(bytes).toString("base64") }], headers: { "X-TLE-OS-Rent-Review": id } });
      accounts = { to: accountsTo, sent: true, detail: `Sent to ${accountsTo}.` };
    } catch (e) {
      accounts = { to: accountsTo, sent: false, detail: e instanceof ResendBlocked || e instanceof Error ? `Not sent: ${e.message}` : "Not sent." };
    }
  }

  /* 5. The last increase, on the home's facts, when the agent gave one. */
  if (!a.notIncreased && a.lastIncrease && (osId || ctx.home.propertyId)) {
    await recordFact({ propertyId: osId ?? String(ctx.home.propertyId), field: "rent_review_last", value: a.lastIncrease, source: "manual", sourceRef: `rent review ${id}`, by }).catch(() => undefined);
  }

  await q(
    `UPDATE os_rent_reviews SET stage = 'done', pdf_key = $2, recipients = $3, home_send_id = $4, accounts_to = $5, accounts_sent_at = $6, accounts_detail = $7,
        sent_at = NOW() WHERE id = $1`,
    [id, pdfKey, JSON.stringify(results), homeSendId, accounts.to, accounts.sent ? new Date().toISOString() : null, accounts.detail.slice(0, 500)]
  );
  await record({
    kind: "rent_review_sent",
    actorId: ctx.me.id,
    actorEmail: ctx.me.email,
    detail: `Rent-increase notice (Scotland), ${homeLine(ctx)}: ${pounds(a.currentRent)} to ${pounds(a.newRent)} ${periodOf(a.newPeriod).per} from ${a.effectiveDate}. ${method === "email" ? `${results.filter((r) => r.sent).length} of ${results.length} emailed` : "printed"}${demoMode() ? " (demo, nothing sent)" : ""}. Accounts: ${accounts.sent ? "told" : "not told"}. Review ${id}.`.slice(0, 1900),
  }).catch(() => undefined);

  const review = await getReview(id);
  if (!review) throw new ReviewRefused("The notice went, but could not be read back. Refresh the page.", 500);
  return { review, results, accounts, demo: demoMode(), again: false, pdfKey };
}

/* ── reading them back ──────────────────────────────────────────────────── */

type Row = {
  id: string; listing_id: string; property_id: string | null; os_property_id: string | null; home: string; country: string; answers: RentReviewAnswers;
  evidence: Evidence[]; pdf_key: string | null; method: string; sent_at: Date; sent_by_id: string; sent_by_name: string; sent_by_email: string;
  recipients: RentReview["recipients"]; home_send_id: string | null; accounts_to: string; accounts_sent_at: Date | null; accounts_detail: string;
  status: string; payprop_by: string | null; payprop_at: Date | null; response: string | null; response_date: string | null; response_note: string;
  response_by: string | null; is_demo: boolean; effective_date: string | null;
};

const COLS = `id, listing_id, property_id, os_property_id, home, country, answers, evidence, pdf_key, method, sent_at, sent_by_id, sent_by_name, sent_by_email,
  recipients, home_send_id, accounts_to, accounts_sent_at, accounts_detail, status, payprop_by, payprop_at, response, response_date::text AS response_date,
  response_note, response_by, is_demo, effective_date::text AS effective_date`;

/** In effect once PayProp is updated and the day has come. */
function statusOf(r: Row): ReviewStatus {
  if (r.status === "in_effect") return "in_effect";
  if (r.status === "payprop_updated") return r.effective_date && r.effective_date <= ukToday() ? "in_effect" : "payprop_updated";
  return "sent";
}

function shape(r: Row): RentReview {
  const answers = (r.answers ?? {}) as RentReviewAnswers;
  return {
    id: r.id, listingId: r.listing_id, propertyId: r.property_id, osPropertyId: r.os_property_id, home: r.home, country: "scotland",
    answers, evidence: r.evidence ?? [], pdfKey: r.pdf_key, method: r.method === "print" ? "print" : "email",
    sentAt: new Date(r.sent_at).toISOString(), sentBy: { id: r.sent_by_id, name: r.sent_by_name, email: r.sent_by_email },
    recipients: r.recipients ?? [], homeSendId: r.home_send_id,
    accounts: { to: r.accounts_to, sentAt: r.accounts_sent_at ? new Date(r.accounts_sent_at).toISOString() : null, detail: r.accounts_detail },
    status: statusOf(r), paypropBy: r.payprop_by, paypropAt: r.payprop_at ? new Date(r.payprop_at).toISOString() : null,
    response: isResponse(r.response) ? r.response : null, responseDate: r.response_date, responseNote: r.response_note ?? "", responseBy: r.response_by,
    demo: r.is_demo,
  };
}

export async function getReview(id: string): Promise<RentReview | null> {
  if (!hasDb() || !isReviewId(id)) return null;
  const [r] = await q<Row>(`SELECT ${COLS} FROM os_rent_reviews WHERE id = $1 AND stage = 'done'`, [id]);
  return r ? shape(r) : null;
}

/** Every one sent, newest first, for the desk. */
export async function allReviews(): Promise<RentReview[]> {
  if (!hasDb()) return [];
  const rows = await q<Row>(`SELECT ${COLS} FROM os_rent_reviews WHERE stage = 'done' ORDER BY sent_at DESC LIMIT 500`);
  return rows.map(shape);
}

/** The ones sent from this home, for its page. */
export async function reviewsForHome(listingIds: string[]): Promise<RentReview[]> {
  if (!hasDb() || !listingIds.length) return [];
  const rows = await q<Row>(`SELECT ${COLS} FROM os_rent_reviews WHERE stage = 'done' AND listing_id = ANY($1) ORDER BY sent_at DESC LIMIT 20`, [listingIds]);
  return rows.map(shape);
}

/** Michael's two ticks. Nothing here sends. */
export async function updateReview(id: string, change: { action: "payprop"; undo?: boolean } | { action: "response"; response: TenantResponse | null; date: string | null; note: string }, by: string): Promise<RentReview | null> {
  if (!hasDb() || !isReviewId(id)) return null;
  if (change.action === "payprop") {
    await q(
      change.undo
        ? `UPDATE os_rent_reviews SET status = 'sent', payprop_by = NULL, payprop_at = NULL WHERE id = $1 AND stage = 'done'`
        : `UPDATE os_rent_reviews SET status = 'payprop_updated', payprop_by = $2, payprop_at = NOW() WHERE id = $1 AND stage = 'done'`,
      change.undo ? [id] : [id, by]
    );
  } else {
    await q(
      `UPDATE os_rent_reviews SET response = $2, response_date = $3, response_note = $4, response_by = $5, response_at = NOW() WHERE id = $1 AND stage = 'done'`,
      [id, change.response, change.date && isDay(change.date) ? change.date : null, change.note.slice(0, 1000), change.response ? by : null]
    );
  }
  await record({ kind: "rent_review_updated", detail: `Rent review ${id}: ${change.action === "payprop" ? (change.undo ? "PayProp tick taken off" : "PayProp updated") : `tenant's response ${change.response ?? "cleared"}`} by ${by}.` }).catch(() => undefined);
  return getReview(id);
}

/** For the desk's bell: sent, and PayProp not yet updated, the last 60 days. */
export async function reviewsForBell(): Promise<{ id: string; home: string; by: string; at: string; effective: string | null }[]> {
  if (!hasDb()) return [];
  const rows = await q<{ id: string; home: string; sent_by_name: string; sent_at: Date; effective_date: string | null }>(
    `SELECT id, home, sent_by_name, sent_at, effective_date::text AS effective_date FROM os_rent_reviews
      WHERE stage = 'done' AND status = 'sent' AND sent_at > NOW() - INTERVAL '60 days' ORDER BY sent_at DESC LIMIT 30`
  ).catch(() => []);
  return rows.map((r) => ({ id: r.id, home: r.home, by: r.sent_by_name, at: new Date(r.sent_at).toISOString(), effective: r.effective_date }));
}
