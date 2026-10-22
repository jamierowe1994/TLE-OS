import "server-only";
import { randomBytes } from "node:crypto";
import { hasDb, q } from "@/lib/db";
import { switchOn } from "@/lib/switches";
import { sameHome } from "@/lib/address-parse";
import { PropolyWriteBlocked } from "@/lib/business/propoly";
import { getCase } from "@/lib/plc-store";
import { checkById } from "@/lib/plc";
import { bytesOf, expiryFor, propolyTypeFor, sendToDeal } from "@/lib/plc-propoly";
import { isTestCase } from "@/lib/test-guard";
import { bytesFor, planDealDocuments } from "@/lib/deal-documents";
import { planGuarantors, sendGuarantors } from "@/lib/deal-guarantors";
import { propolyPicture, syncPerson } from "@/lib/let-propoly-sync";
import type { LetPeople } from "@/lib/let-people";

/**
 * REPUSH TO PROPOLY, FOR A LET PUSHED BEFORE THE CONNECTION WAS FINISHED
 * (owners only; the Ruskin Place call, 20 Oct 2026).
 *
 * 6 Ruskin Place went to Propoly before documents and co-owners were sent,
 * so its deal has no certificates and only one of Paul and Vicky Wilson.
 * Other early lets are the same. This puts everything the OS holds for a let
 * next to its deal and sends only what is missing, in one press:
 *   - the home's gas, EICR and EPC (lib/deal-documents: OS vault, REX, PLC pack);
 *   - the approved PLC pack's other files (landlord ID, ownership, references...);
 *   - the guarantor details (lib/deal-guarantors);
 *   - every tenant not on the deal, and every landlord not on it, found or
 *     created in Propoly and linked to the home (lib/let-propoly-sync).
 *
 * The plan is always worked out first and shown; Send takes the keys the
 * owner left ticked and sends only those still missing when it runs.
 *
 * WHAT PROPOLY ALLOWS: add, never change (probed 20 and 22 Oct 2026). It has
 * no list of a deal's documents, so a document the OS never sent is counted
 * missing, and one Propoly already holds comes back "already there" and is
 * left alone. One file per slot: two candidates for one slot, the first goes.
 * A landlord linked to the home after the deal was made joining that deal is
 * not proven - the next read of the deal says.
 *
 * Behind propoly_repush_live (arrives OFF), and each part also behind its own
 * switch. With the repush switch off, Send is a rehearsal: the same plan,
 * nothing sent, kept on the let.
 */

export type ItemState = "send" | "on-deal" | "sent-before" | "cannot";
export type ItemKind = "certificate" | "document" | "guarantors" | "tenant" | "landlord";

export interface RepushItem {
  key: string;
  kind: ItemKind;
  label: string;
  /** Where it comes from, or who it is. */
  detail: string;
  state: ItemState;
  /** Why it isn't going, for anything not "send". */
  why?: string;
  outcome?: "sent" | "already" | "would" | "failed" | "skipped";
  result?: string;
}

export interface RepushPlan {
  letRef: string;
  address: string;
  deal: { id: string; url: string; status: string } | null;
  live: boolean;
  switches: { key: string; label: string; on: boolean }[];
  items: RepushItem[];
  /** Said above the list: no deal, REX unread, and so on. */
  notes: string[];
}

const PART_SWITCHES = [
  { key: "propoly_repush_live", label: "Repush to Propoly" },
  { key: "handover_live", label: "Handover" },
  { key: "propoly_documents", label: "Propoly documents" },
  { key: "propoly_people_live", label: "People added on a let" },
  { key: "propoly_guarantors", label: "Guarantors" },
];

const CERT_PLC = new Set(["gas-safety", "eicr", "epc"]);
const COMPLIANCE_SLOTS = new Set(["DealGasSafetyAttachment", "DealEpcAttachment", "DealElectricalInstallationAttachment", "DealPortableApplianceTestAttachment", "DealLegionellaRiskAssessmentAttachment"]);
const SLOT_WORDS: Record<string, string> = {
  DealLlIdAttachment: "Landlord ID",
  DealLlProofOfAddressAttachment: "Landlord proof of address",
  DealLlProofOfOwnershipAttachment: "Proof of ownership",
  DealLandlordAmlCheckAttachment: "Landlord AML check",
  DealTtReferenceReportAttachment: "Reference report",
  DealTtRightToRentAttachment: "Right to rent",
  DealCouncilLicenseAttachment: "Council licence",
  DealLicensingRequirementsAttachment: "Licensing requirements",
  DealPortableApplianceTestAttachment: "PAT",
  DealLegionellaRiskAssessmentAttachment: "Legionella risk assessment",
  DealGeneralAttachment: "General document",
};
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" });

/** What the OS sent this deal before, by slot: certificate pushes and PLC pushes. */
async function slotsSentBefore(dealId: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!hasDb()) return out;
  const rows = await q<{ at: Date; results: Array<{ slot?: string; outcome?: string }> }>(
    `SELECT at, results FROM os_deal_document_pushes WHERE deal_id = $1 ORDER BY at`,
    [dealId]
  ).catch(() => []);
  for (const r of rows) for (const x of r.results ?? []) if (x.slot && (x.outcome === "uploaded" || x.outcome === "already")) out.set(x.slot, `Sent ${day(new Date(r.at).toISOString())}.`);
  const reps = await q<{ at: Date; items: RepushItem[] }>(
    `SELECT at, items FROM os_propoly_repushes WHERE deal_id = $1 AND mode = 'live' ORDER BY at`,
    [dealId]
  ).catch(() => []);
  for (const r of reps) for (const x of r.items ?? []) {
    const slot = x.key.startsWith("slot:") ? x.key.split(":")[1] : null;
    if (slot && (x.outcome === "sent" || x.outcome === "already")) out.set(slot, `Sent by Repush ${day(new Date(r.at).toISOString())}.`);
  }
  return out;
}

type PlcSource = { caseId: string; docKey: string };

export async function planRepush(lp: LetPeople, rentPcm: number | null): Promise<RepushPlan & { _sources: Map<string, unknown> }> {
  const address = [lp.property, lp.locality].filter(Boolean).join(", ");
  const switches = await Promise.all(PART_SWITCHES.map(async (s) => ({ ...s, on: await switchOn(s.key).catch(() => false) })));
  const live = switches[0].on;
  const sources = new Map<string, unknown>();
  const deal = lp.deal;
  if (!deal) {
    return { letRef: lp.ref, address, deal: null, live, switches, items: [], notes: ["This let has no Propoly deal the OS can see, so there is nothing to repush to. Use Push to Propoly."], _sources: sources };
  }
  const notes: string[] = [];
  const items: RepushItem[] = [];
  const before = await slotsSentBefore(deal.id);
  const taken = new Set<string>();

  /* 1. The certificates, wherever the OS can see them. */
  const docs = await planDealDocuments(deal.id).catch((e) => {
    notes.push(`The certificates couldn't be looked for: ${e instanceof Error ? e.message : "try again in a minute"}.`);
    return null;
  });
  if (docs?.rexNote) notes.push(docs.rexNote);
  for (const d of docs?.docs ?? []) {
    const key = `slot:${d.slot}`;
    if (!d.found || !d.source) {
      items.push({ key, kind: "certificate", label: d.label, detail: "Not found", state: "cannot", why: d.note });
      continue;
    }
    const detail = `${d.found.name}, from the ${d.found.where}, expires ${day(d.found.expiry)}`;
    if (before.has(d.slot)) items.push({ key, kind: "certificate", label: d.label, detail, state: "sent-before", why: before.get(d.slot) });
    else if (d.found.expired) items.push({ key, kind: "certificate", label: d.label, detail, state: "cannot", why: "The newest one on file has expired. Upload a new one first." });
    else {
      items.push({ key, kind: "certificate", label: d.label, detail, state: "send" });
      sources.set(key, { cert: d.source, slot: d.slot, name: d.found.name, expiry: d.found.expiry });
      taken.add(d.slot);
    }
  }

  /* 2. An approved PLC pack on the same home: its other files. */
  if (hasDb()) {
    const cases = await q<{ id: string; address: string }>(`SELECT id, address FROM os_plc_cases`).catch(() => []);
    for (const c of cases.filter((x) => sameHome(x.address, address))) {
      const pack = await getCase(c.id).catch(() => null);
      if (!pack || pack.state !== "approved" || isTestCase(pack)) continue;
      for (const doc of pack.documents) {
        if (CERT_PLC.has(doc.checkId) || doc.placeholder) continue;
        const slot = propolyTypeFor(doc.checkId, doc.name);
        if (!slot) continue;
        const key = `slot:${slot}:${doc.key}`;
        const label = SLOT_WORDS[slot] ?? checkById(doc.checkId)?.label ?? "Document";
        const detail = `${doc.label ?? doc.name}, from the approved PLC pack`;
        const pushedHere = pack.propolyPush?.dealId === deal.id && pack.propolyPush.results.some((r) => r.name === doc.name && (r.outcome === "uploaded" || r.outcome === "already"));
        const expiry = COMPLIANCE_SLOTS.has(slot) ? expiryFor(pack, doc) : null;
        if (pushedHere || before.has(slot)) items.push({ key, kind: "document", label, detail, state: "sent-before", why: pushedHere ? `Sent with the PLC pack ${day(pack.propolyPush!.at)}.` : before.get(slot) });
        else if (taken.has(slot)) items.push({ key, kind: "document", label, detail, state: "cannot", why: "Propoly takes one file per slot, and another file is going in this one." });
        else if (COMPLIANCE_SLOTS.has(slot) && !expiry) items.push({ key, kind: "document", label, detail, state: "cannot", why: "Propoly needs an expiry date for this and none was read off the file." });
        else {
          items.push({ key, kind: "document", label, detail, state: "send" });
          sources.set(key, { plc: { caseId: pack.id, docKey: doc.key } as PlcSource, slot, name: doc.name, label: doc.label ?? null, expiry });
          taken.add(slot);
        }
      }
    }
  }

  /* 3. The guarantors, as a document. */
  const g = await planGuarantors({ letRef: lp.ref, dealId: deal.id, address, rentPcm, tenants: lp.people.filter((x) => x.role === "tenant").map((x) => ({ name: x.name, email: x.email })) }).catch(() => null);
  if (g && g.guarantors.length) {
    const detail = g.guarantors.map((x) => `${x.name} for ${x.forName}`).join(", ");
    const sameSent = g.last && g.last.mode === "live" && g.last.outcome === "uploaded" && g.last.same;
    if (sameSent) items.push({ key: "guarantors", kind: "guarantors", label: "Guarantor details", detail, state: "sent-before", why: `Sent ${day(g.last!.at)}.` });
    else if (taken.has("DealGeneralAttachment")) items.push({ key: "guarantors", kind: "guarantors", label: "Guarantor details", detail, state: "cannot", why: "Another file is going in the General Document slot. Send guarantors on its own afterwards." });
    else {
      items.push({ key: "guarantors", kind: "guarantors", label: "Guarantor details", detail: `${detail}${g.gaps.length ? `. ${g.gaps.join(" ")}` : ""}`, state: "send" });
      sources.set("guarantors", g);
    }
  }

  /* 4. The people. */
  const picture = await propolyPicture(lp.ref, lp.people, deal).catch(() => null);
  for (const p of lp.people) {
    const c = picture?.checks[p.key];
    const kind: ItemKind = p.role;
    const label = `${p.name} (${p.role === "landlord" ? "landlord" : p.isPrimary ? "lead tenant" : "tenant"})`;
    const detail = [p.email, p.phone].filter(Boolean).join(", ") || "No email or mobile";
    const key = `person:${p.key}`;
    if (!c || c.state === "on-deal") items.push({ key, kind, label, detail, state: "on-deal", why: "On the Propoly deal." });
    else if (c.state === "differs") items.push({ key, kind, label, detail, state: "cannot", why: c.detail });
    else if (c.state === "sent") items.push({ key, kind, label, detail, state: "sent-before", why: c.detail });
    else if (!p.email) items.push({ key, kind, label, detail, state: "cannot", why: "Propoly needs an email address. Add it on the let first." });
    else if (!p.phone) items.push({ key, kind, label, detail, state: "cannot", why: "Propoly needs a mobile number. Add it on the let first." });
    else {
      items.push({ key, kind, label, detail: p.role === "landlord" ? `${detail}. Found or created in Propoly, then linked to the home` : `${detail}. Added to the deal${p.reference === false ? " with no references" : ", Propoly sends their referencing"}`, state: "send" });
      sources.set(key, p);
    }
  }
  if (picture?.extra.length) notes.push(`On the Propoly deal but not on this let: ${picture.extra.map((x) => `${x.name} (${x.role})`).join(", ")}. Nothing is taken off Propoly from here.`);
  notes.push("Propoly can't list the documents a deal already has. Anything the OS never sent is counted missing; if Propoly already has it, it answers \"already there\" and nothing changes.");

  return { letRef: lp.ref, address, deal: { id: deal.id, url: deal.url, status: deal.status }, live, switches, items, notes, _sources: sources };
}

/** Only the parts the screen needs. */
export function publicRepush(p: RepushPlan & { _sources?: unknown }): RepushPlan {
  const { _sources: _s, ...rest } = p;
  return rest;
}

/**
 * Send the ticked items that are still "send". With the repush switch off,
 * nothing is sent: each item says what it would have done.
 */
export async function runRepush(lp: LetPeople, rentPcm: number | null, keys: string[], by: string): Promise<RepushPlan> {
  const plan = await planRepush(lp, rentPcm);
  const chosen = new Set(keys);
  const deal = lp.deal;
  for (const it of plan.items) {
    if (it.state !== "send") continue;
    if (!chosen.has(it.key)) { it.outcome = "skipped"; it.result = "Left out."; continue; }
    if (!plan.live || !deal) {
      it.outcome = "would";
      it.result = it.kind === "tenant" ? "Practice: would add them to the deal." : it.kind === "landlord" ? "Practice: would find or create them in Propoly and link them to the home." : "Practice: would upload it to the deal.";
      continue;
    }
    const src = plan._sources.get(it.key) as Record<string, unknown> | undefined;
    try {
      if (it.kind === "tenant" || it.kind === "landlord") {
        const r = await syncPerson(lp.ref, src as never, deal, by, true);
        it.outcome = r.state === "sent" ? "sent" : r.state === "would" ? "would" : r.state === "on-deal" ? "already" : "failed";
        it.result = r.detail;
      } else if (it.kind === "guarantors") {
        const r = await sendGuarantors(src as never, lp.ref, by);
        it.outcome = r.outcome === "uploaded" ? "sent" : r.outcome === "already" ? "already" : r.outcome === "would" ? "would" : "failed";
        it.result = r.detail;
      } else {
        const s = src as { cert?: Parameters<typeof bytesFor>[0]; plc?: PlcSource; slot: string; name: string; label?: string | null; expiry: string | null };
        let file: { bytes: Uint8Array; mime: string };
        if (s.cert) file = await bytesFor(s.cert);
        else {
          const pack = await getCase(s.plc!.caseId);
          const doc = pack?.documents.find((d) => d.key === s.plc!.docKey);
          if (!doc) throw new Error("the PLC pack's file isn't there any more");
          const b = await bytesOf(doc);
          file = { bytes: b.bytes, mime: b.type };
        }
        const sent = await sendToDeal(deal.id, { ...file, type: s.slot, fileName: s.name, label: s.label ?? null, expiry: s.expiry });
        it.outcome = sent.outcome === "uploaded" ? "sent" : sent.outcome;
        it.result = sent.outcome === "uploaded" ? "Uploaded to the deal." : sent.note;
      }
    } catch (e) {
      it.outcome = "failed";
      it.result = e instanceof PropolyWriteBlocked ? "Its own switch is off (Admin, Switches), so it wasn't sent." : e instanceof Error ? e.message : "Propoly didn't answer.";
    }
  }
  await keepRun(plan, by);
  return publicRepush(plan);
}

/* ── the record ──────────────────────────────────────────────────────────── */

let ready: Promise<void> | null = null;
function ensure(): Promise<void> {
  ready ??= q(`CREATE TABLE IF NOT EXISTS os_propoly_repushes (
      id TEXT PRIMARY KEY,
      let_ref TEXT NOT NULL,
      deal_id TEXT NOT NULL,
      mode TEXT NOT NULL,
      by_name TEXT NOT NULL,
      at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      items JSONB NOT NULL DEFAULT '[]'
    );
    CREATE INDEX IF NOT EXISTS os_propoly_repushes_let ON os_propoly_repushes (let_ref, at DESC)`).then(() => undefined).catch((e) => {
    ready = null;
    throw e;
  });
  return ready;
}

async function keepRun(plan: RepushPlan, by: string): Promise<void> {
  if (!hasDb() || !plan.deal) return;
  await ensure();
  await q(`INSERT INTO os_propoly_repushes (id, let_ref, deal_id, mode, by_name, items) VALUES ($1,$2,$3,$4,$5,$6)`, [
    randomBytes(9).toString("base64url"), plan.letRef, plan.deal.id, plan.live ? "live" : "rehearsal", by, JSON.stringify(plan.items),
  ]).catch(() => {});
}

/** The last few repushes on this let, newest first. */
export async function repushHistory(letRef: string): Promise<{ at: string; by: string; mode: string; sent: number; would: number; failed: number }[]> {
  if (!hasDb()) return [];
  await ensure().catch(() => {});
  const rows = await q<{ at: Date; by_name: string; mode: string; items: RepushItem[] }>(
    `SELECT at, by_name, mode, items FROM os_propoly_repushes WHERE let_ref = $1 ORDER BY at DESC LIMIT 5`,
    [letRef]
  ).catch(() => []);
  return rows.map((r) => ({
    at: new Date(r.at).toISOString(),
    by: r.by_name,
    mode: r.mode,
    sent: r.items.filter((i) => i.outcome === "sent" || i.outcome === "already").length,
    would: r.items.filter((i) => i.outcome === "would").length,
    failed: r.items.filter((i) => i.outcome === "failed").length,
  }));
}
