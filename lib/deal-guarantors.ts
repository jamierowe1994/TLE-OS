import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { hasDb, q } from "@/lib/db";
import { switchOn } from "@/lib/switches";
import { PropolyWriteBlocked } from "@/lib/business/propoly";
import { getAllPropolyDeals } from "@/lib/business/propoly-deals";
import { sendToDeal } from "@/lib/plc-propoly";
import { guarantorsFor, type Guarantor } from "@/lib/guarantors";

/**
 * A LET'S GUARANTORS, INTO ITS PROPOLY DEAL (Kirstie Mulholland, 22 Oct 2026).
 *
 * "Deals are transferring over properly but guarantors aren't attached."
 * The guarantors are kept in the OS (lib/guarantors), and Push to Propoly
 * never sent them, because Propoly's API has nowhere to send them.
 *
 * PROBED LIVE 22 Oct 2026 (the server's own token, nil ids and broken bodies,
 * nothing could be made): /guarantors, /deals/{id}/guarantors,
 * /tenants/{id}/guarantors, PATCH or PUT on deals and tenants - all answer
 * API Gateway's "no such route". Guarantors only come back on a deal READ
 * (guarantors_details, filled in by Propoly once the tenant names one).
 * Propoly's own spec does list `guarantor_required` on POST /tenants: a
 * tenant told they need a guarantor. What Propoly then does with it (asks
 * the tenant for one, emails them) is NOT proven.
 *
 * So two things, both behind propoly_guarantors (arrives OFF):
 *   - a "Guarantor details" PDF on the deal, as a General Document: each
 *     guarantor's name, email, mobile, address, how they know the applicant,
 *     whose guarantor they are, and the rent. Kirstie keys them in from it.
 *   - guarantor_required on each tenant who has one, when a tenant is added
 *     to the deal (lib/handover, lib/let-propoly-sync).
 * With the switch off the same thing is rehearsed: built and shown, never
 * sent. The upload also needs the Propoly documents switch, like every file.
 *
 * Sent again only when what it says has changed (a hash of the content):
 * Propoly can't replace a document, so a second press on the same details
 * is answered "already sent", and a changed guarantor goes as a new file.
 */

export const GUARANTOR_SLOT = "DealGeneralAttachment";

export interface GuarantorLine {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  relationship: string;
  /** Whose guarantor they are. */
  forName: string;
  forEmail: string | null;
}

export interface GuarantorPlan {
  dealId: string | null;
  address: string;
  rentPcm: number | null;
  guarantors: GuarantorLine[];
  /** What Propoly's deal already lists as guarantors (its read, from the saved copy). */
  onDeal: Array<{ name: string | null; email: string | null }>;
  /** True when a send goes to Propoly; false = practice. */
  live: boolean;
  /** The last time this let's guarantors went to this deal, in words. */
  last: { at: string; by: string; mode: string; outcome: string; detail: string; same: boolean } | null;
  /** Null when it can go; else why not. */
  blocked: string | null;
  /** Missing parts that don't stop it, said on the screen (no email, say). */
  gaps: string[];
}

const pounds = (n: number | null) => (n == null ? "not known" : `£${n.toLocaleString("en-GB", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`);

export async function propolyGuarantorsLive(): Promise<boolean> {
  return switchOn("propoly_guarantors").catch(() => false);
}

/** Every guarantor for the let's tenants, with whose guarantor they are. */
export async function guarantorLines(letRef: string, tenants: Array<{ name: string; email: string | null }>): Promise<GuarantorLine[]> {
  const list = await guarantorsFor({ emails: tenants.map((t) => t.email), letRef }).catch(() => [] as Guarantor[]);
  return list.map((g) => {
    const t = tenants.find((x) => x.email && g.applicantEmail && x.email.toLowerCase() === g.applicantEmail.toLowerCase())
      ?? tenants.find((x) => x.name.trim().toLowerCase() === g.applicantName.trim().toLowerCase());
    return {
      id: g.id,
      name: g.name,
      email: g.email,
      phone: g.phone,
      address: g.address,
      relationship: g.relationship,
      forName: t?.name ?? g.applicantName,
      forEmail: t?.email ?? g.applicantEmail,
    };
  });
}

/** The emails of tenants who have a guarantor, lower case: guarantor_required on them. */
export function guaranteedEmails(lines: GuarantorLine[]): Set<string> {
  return new Set(lines.map((g) => (g.forEmail ?? "").trim().toLowerCase()).filter(Boolean));
}

function hashOf(lines: GuarantorLine[], rentPcm: number | null): string {
  const flat = lines
    .map((g) => [g.name, g.email, g.phone, g.address, g.relationship, g.forName].map((x) => (x ?? "").trim().toLowerCase()).join("|"))
    .sort()
    .join("\n");
  return createHash("sha256").update(`${flat}\n${rentPcm ?? ""}`).digest("hex").slice(0, 16);
}

export async function planGuarantors(p: {
  letRef: string;
  dealId: string | null;
  address: string;
  rentPcm: number | null;
  tenants: Array<{ name: string; email: string | null }>;
}): Promise<GuarantorPlan> {
  const [lines, live] = await Promise.all([guarantorLines(p.letRef, p.tenants), propolyGuarantorsLive()]);
  const deals = p.dealId ? await getAllPropolyDeals().catch(() => null) : null;
  const deal = deals?.find((d) => d.app.id === p.dealId) ?? null;
  const onDeal = (deal?.app.propoly?.guarantors ?? []).map((g) => ({ name: g.name, email: g.email }));
  const rentPcm = p.rentPcm ?? deal?.app.offer ?? null;
  const hash = hashOf(lines, rentPcm);
  const lastRow = p.dealId ? await lastPush(p.dealId) : null;
  const gaps: string[] = [];
  for (const g of lines) {
    if (!g.email) gaps.push(`${g.name} has no email address.`);
    if (!g.phone) gaps.push(`${g.name} has no mobile number.`);
    if (!g.address) gaps.push(`${g.name} has no home address.`);
  }
  return {
    dealId: p.dealId,
    address: p.address,
    rentPcm,
    guarantors: lines,
    onDeal,
    live,
    last: lastRow ? { at: lastRow.at, by: lastRow.by_name, mode: lastRow.mode, outcome: lastRow.outcome, detail: lastRow.detail, same: lastRow.hash === hash } : null,
    blocked: !p.dealId
      ? "This let has no Propoly deal yet. The guarantors go with Push to Propoly."
      : !lines.length
        ? "No guarantor is held for anyone on this let. Add one under Guarantors first."
        : null,
    gaps,
  };
}

/* ── the document ────────────────────────────────────────────────────────── */

/** "Guarantor details" as a one or two page PDF, plain enough to key from. */
export async function guarantorPdf(plan: Pick<GuarantorPlan, "address" | "rentPcm" | "guarantors">): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle("Guarantor details");
  doc.setAuthor("The Letting Experts");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.12, 0.12, 0.14);
  const muted = rgb(0.42, 0.42, 0.46);
  const W = 595.28;
  const H = 841.89;
  let page = doc.addPage([W, H]);
  let y = H - 64;
  /* Helvetica in pdf-lib is WinAnsi: anything outside it (a long dash, a
     Polish name) would throw, so it is folded to plain letters first. */
  const safe = (s: string) => s.replace(/[‐-―−]/g, "-").normalize("NFKD").replace(/[^\x20-\x7E£]/g, "");
  const line = (text: string, o: { size?: number; f?: typeof font; color?: typeof ink; gap?: number } = {}) => {
    const size = o.size ?? 11;
    if (y < 72) { page = doc.addPage([W, H]); y = H - 64; }
    page.drawText(safe(text), { x: 56, y, size, font: o.f ?? font, color: o.color ?? ink, maxWidth: W - 112 });
    y -= o.gap ?? size + 7;
  };
  line("Guarantor Details", { size: 20, f: bold, gap: 30 });
  line(plan.address || "The property", { size: 12, f: bold });
  line(`Rent: ${pounds(plan.rentPcm)} a month`, { color: muted });
  line(`From TLE OS, ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" })}`, { color: muted, gap: 30 });
  plan.guarantors.forEach((g, i) => {
    if (y < 200) { page = doc.addPage([W, H]); y = H - 64; }
    line(`Guarantor ${i + 1}: ${g.name}`, { size: 13, f: bold, gap: 22 });
    const rows: [string, string][] = [
      ["Guarantor for", g.forName + (g.forEmail ? ` (${g.forEmail})` : "")],
      ["Relationship", g.relationship || "Not given"],
      ["Email", g.email || "Not given"],
      ["Mobile", g.phone || "Not given"],
      ["Home address", g.address || "Not given"],
    ];
    for (const [k, v] of rows) {
      if (y < 72) { page = doc.addPage([W, H]); y = H - 64; }
      page.drawText(k, { x: 56, y, size: 10.5, font: bold, color: muted });
      page.drawText(safe(v), { x: 170, y, size: 10.5, font, color: ink, maxWidth: W - 226 });
      y -= 18;
    }
    y -= 16;
  });
  line("Entered in TLE OS by the letting agent. Key these into the deal's guarantors in Propoly.", { size: 9, color: muted });
  return doc.save();
}

/* ── the send ────────────────────────────────────────────────────────────── */

export interface GuarantorSend {
  outcome: "uploaded" | "already" | "failed" | "would" | "skipped";
  detail: string;
}

/**
 * The Guarantor details document onto the deal. Never twice with the same
 * content: a live upload is held by a row first, so two presses can't both go.
 */
export async function sendGuarantors(plan: GuarantorPlan, letRef: string, by: string): Promise<GuarantorSend> {
  if (plan.blocked || !plan.dealId) return { outcome: "skipped", detail: plan.blocked ?? "No deal." };
  const hash = hashOf(plan.guarantors, plan.rentPcm);
  const names = plan.guarantors.map((g) => `${g.name} for ${g.forName.split(/\s+/)[0]}`).join(", ");
  if (!plan.live) {
    const detail = `Practice mode: would put "Guarantor details" (${names}) on the Propoly deal as a General Document.`;
    await keep({ dealId: plan.dealId, letRef, hash, mode: "rehearsal", outcome: "would", detail, by });
    return { outcome: "would", detail };
  }
  const held = await claim({ dealId: plan.dealId, letRef, hash, by });
  if (!held) return { outcome: "already", detail: "These guarantor details were already sent to this deal." };
  try {
    const bytes = await guarantorPdf(plan);
    const sent = await sendToDeal(plan.dealId, { bytes, mime: "application/pdf", type: GUARANTOR_SLOT, fileName: "Guarantor details.pdf", label: "Guarantor details", expiry: null });
    const detail = sent.outcome === "uploaded"
      ? `"Guarantor details" (${names}) is on the deal under General Documents. Key them into the deal's guarantors in Propoly.`
      : sent.outcome === "already"
        ? "Propoly says the deal's General Document slot is already filled, so the guarantor details couldn't go there. Upload them in Propoly by hand."
        : sent.outcome === "skipped"
          ? sent.note
          : `Propoly said no: ${sent.note}`;
    await finish(held, sent.outcome === "uploaded" ? "uploaded" : sent.outcome, detail);
    return { outcome: sent.outcome, detail };
  } catch (e) {
    const detail = e instanceof PropolyWriteBlocked ? "Pushing documents into Propoly is switched off (Admin, Switches)." : `Not sent: ${e instanceof Error ? e.message : "Propoly didn't answer"}.`;
    await finish(held, "failed", detail);
    return { outcome: "failed", detail };
  }
}

/* ── the record ──────────────────────────────────────────────────────────── */

let ready: Promise<void> | null = null;
async function gq<T extends Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  ready ??= q(`CREATE TABLE IF NOT EXISTS os_deal_guarantor_pushes (
      id TEXT PRIMARY KEY,
      deal_id TEXT NOT NULL,
      let_ref TEXT NOT NULL,
      hash TEXT NOT NULL,
      mode TEXT NOT NULL,
      outcome TEXT NOT NULL,
      detail TEXT NOT NULL DEFAULT '',
      by_name TEXT NOT NULL,
      at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`)
    .then(() => q(`CREATE INDEX IF NOT EXISTS os_deal_guarantor_pushes_deal ON os_deal_guarantor_pushes (deal_id, at DESC)`))
    /* One live send per content per deal, held before the call is made. */
    .then(() => q(`CREATE UNIQUE INDEX IF NOT EXISTS os_deal_guarantor_pushes_once ON os_deal_guarantor_pushes (deal_id, hash) WHERE mode = 'live' AND outcome IN ('pending', 'uploaded')`))
    .then(() => undefined)
    .catch((e) => { ready = null; throw e; });
  await ready;
  return q<T>(text, params);
}

const newId = () => randomBytes(9).toString("base64url");

async function lastPush(dealId: string): Promise<{ at: string; by_name: string; mode: string; outcome: string; detail: string; hash: string } | null> {
  if (!hasDb()) return null;
  const rows = await gq<{ at: Date; by_name: string; mode: string; outcome: string; detail: string; hash: string }>(
    `SELECT at, by_name, mode, outcome, detail, hash FROM os_deal_guarantor_pushes WHERE deal_id = $1 ORDER BY (mode = 'live') DESC, at DESC LIMIT 1`,
    [dealId]
  ).catch(() => []);
  return rows[0] ? { ...rows[0], at: new Date(rows[0].at).toISOString() } : null;
}

async function keep(r: { dealId: string; letRef: string; hash: string; mode: string; outcome: string; detail: string; by: string }): Promise<void> {
  if (!hasDb()) return;
  await gq(`INSERT INTO os_deal_guarantor_pushes (id, deal_id, let_ref, hash, mode, outcome, detail, by_name) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [
    newId(), r.dealId, r.letRef, r.hash, r.mode, r.outcome, r.detail, r.by,
  ]).catch(() => {});
}

async function claim(r: { dealId: string; letRef: string; hash: string; by: string }): Promise<string | null> {
  if (!hasDb()) return null;
  /* A send that never finished stops holding after ten minutes. */
  await gq(`UPDATE os_deal_guarantor_pushes SET outcome = 'failed', detail = 'The send didn''t finish. Check the deal in Propoly before sending again.' WHERE deal_id = $1 AND hash = $2 AND mode = 'live' AND outcome = 'pending' AND at < NOW() - INTERVAL '10 minutes'`, [r.dealId, r.hash]);
  const rows = await gq<{ id: string }>(
    `INSERT INTO os_deal_guarantor_pushes (id, deal_id, let_ref, hash, mode, outcome, detail, by_name) VALUES ($1,$2,$3,$4,'live','pending','Sending to Propoly.',$5) ON CONFLICT DO NOTHING RETURNING id`,
    [newId(), r.dealId, r.letRef, r.hash, r.by]
  );
  return rows[0]?.id ?? null;
}

async function finish(id: string, outcome: string, detail: string): Promise<void> {
  await gq(`UPDATE os_deal_guarantor_pushes SET outcome = $2, detail = $3 WHERE id = $1`, [id, outcome, detail]).catch(() => {});
}
