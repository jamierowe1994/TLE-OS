/**
 * THE FLATFAIR DEMO - Sophie's let on Flatfair instead of a cash deposit, from
 * the PLC passing to the Deposit stage done, on the real screens with nothing
 * sent to Flatfair.
 *
 * James, 21 Oct 2026: "can you make one" (a Flatfair demo). The same book as
 * the pre-tenancy walkthrough (lib/showroom/demo-pretenancy), with Sophie's
 * deal carrying Propoly's Flatfair clause and her PLC pack approved. On top
 * of it, the agent's hand-off screen (components/FlatfairHandoff) is answered
 * here: the facts, Send to Flatfair as a draft, and Done in Flatfair.
 *
 * ── What it copies, and keeps in step with ──────────────────────────────
 *
 * app/api/pretenancy/flatfair (the facts, the draft, the tick and the words
 * of its activity lines), lib/business/propoly-stages recordTicks (an active
 * flatbond ticks Deposit registered with Flatfair beside it) and
 * lib/business/deal-stage (either one moves the let past Deposit).
 *
 * ── Nothing leaves ──────────────────────────────────────────────────────
 *
 * In the product the draft goes to Flatfair's API and Flatfair emails the
 * tenant. Here the draft is a number on the page and nobody hears anything.
 */

import type { DealNote } from "@/lib/business/types";
import { CAST } from "@/lib/showroom/demo-world";
import type { DemoReply } from "@/lib/showroom/demo-api";
import { answerPretenancy, pretenancyBook, DESK, SOPHIE_DEAL, SOPHIE_PLC, type PretenancyBook } from "@/lib/showroom/demo-pretenancy";

/** Kept in step with MOMENTS.flatfair in lib/showroom/demo-world. */
export const FLATFAIR_MOMENTS = ["approved", "drafted", "keyed", "active"] as const;

const MIN = 60_000;
const H = 60 * MIN;
const iso = (t: number) => new Date(t).toISOString();
const ymd = (t: number) => new Date(t).toLocaleDateString("en-CA", { timeZone: "Europe/London" });

const ok = (json: Record<string, unknown>, did?: string): DemoReply => ({ status: 200, json: { ok: true, ...json }, sent: [], did });
const no = (error: string, status = 400): DemoReply => ({ status, json: { ok: false, error }, sent: [] });

const SAM_ID = "u-sam";
const sysNote = (book: PretenancyBook, text: string, at: number): DealNote => ({
  id: `n-${SOPHIE_DEAL}-ff-${book.seq++}`, dealId: SOPHIE_DEAL, authorId: SAM_ID, authorName: CAST.agent.name, authorRole: "agent", kind: "system", text, createdAt: iso(at),
});

/** Everything on the board at moment `at` of the Flatfair walkthrough. */
export function flatfairBook(at: number, now = Date.now()): PretenancyBook {
  /* The pre-tenancy book with Sophie's references back and her pack checked; approved here. */
  const book = pretenancyBook(2, now);
  const sophie = book.deals.find((d) => d.id === SOPHIE_DEAL)!;
  sophie.propoly = { ...sophie.propoly, depositReplacement: true };
  const pack = book.cases.find((c) => c.id === SOPHIE_PLC);
  if (pack) Object.assign(pack, { state: "approved", decidedAt: iso(now - 3 * H), decidedBy: DESK.name, decisionNote: "" });
  const notes = (book.notes[SOPHIE_DEAL] ??= []);

  if (at >= 1) {
    book.flatfairDraft = { draftId: 48213, by: CAST.agent.name, at: iso(now - 40 * MIN), test: false };
    notes.push(sysNote(book, "sent the deal to Flatfair as draft 48213", now - 40 * MIN));
  }
  /* Keyed: Sam submitted it in Flatfair and pressed Done in Flatfair. Flatfair now waits on Sophie. */
  if (at === 2) {
    book.meta[SOPHIE_DEAL].checklist.deposit_registered = { done: true, by: CAST.agent.name, at: iso(now - 15 * MIN) };
    notes.push(sysNote(book, "set the deal up in Flatfair", now - 15 * MIN));
    book.flatbonds = { [SOPHIE_DEAL]: { id: 90412, status: "pending_tenant_action", product: "flatbond", provider: null, registrationNumber: null, startDate: ymd(sophie.moveIn), tenants: 1, tenantsPaid: 0, done: false } };
  }
  /* Active: nobody pressed Done in Flatfair, and the half-hourly read of Flatfair found Sophie's plan active. */
  if (at >= 3) {
    book.flatbonds = { [SOPHIE_DEAL]: { id: 90412, status: "active", product: "flatbond", provider: null, registrationNumber: null, startDate: ymd(sophie.moveIn), tenants: 1, tenantsPaid: 1, done: true } };
  }
  return book;
}

/** The hand-off screen's calls, then everything the board and the PLC queue ask. */
export function answerFlatfair(book: PretenancyBook, method: string, url: URL, body: unknown): DemoReply | null {
  if (url.pathname !== "/api/pretenancy/flatfair") return answerPretenancy(book, method, url, body);
  const b = (body && typeof body === "object" && !(body instanceof FormData) ? body : {}) as Record<string, unknown>;
  const id = method === "GET" ? url.searchParams.get("deal") : String(b.deal ?? "");
  if (!id) return no("Which deal?");
  const d = book.deals.find((x) => x.id === id);
  if (!d) return no("No such deal.", 404);
  const meta = book.meta[d.id];
  const tick = meta?.checklist?.deposit_registered;
  const done = () => (meta?.checklist?.deposit_registered?.done ? { by: meta.checklist.deposit_registered.by, at: meta.checklist.deposit_registered.at } : null);
  const now = Date.now();

  if (method === "GET") {
    const p = d.propoly as { deposit?: number; depositReplacement?: boolean; landlord?: { name: string; email: string; phone: string } };
    return ok({
      url: "https://app.flatfair.co.uk",
      deal: {
        id: d.id,
        property: [d.address, d.locality].filter(Boolean).join(", "),
        rentPcm: d.offer,
        depositCap: p.deposit ?? null,
        moveIn: ymd(d.moveIn),
        service: "Fully managed",
        standingOrderRef: null,
        flatfairClause: Boolean(p.depositReplacement),
        tenants: [{ name: CAST.tenant.name, email: CAST.tenant.email, phone: CAST.tenant.phone }],
        guarantors: [],
        landlord: { name: CAST.landlord.name, email: CAST.landlord.email, phone: CAST.landlord.phone },
        agent: d.agent,
      },
      done: tick?.done ? done() : null,
      draftSend: { available: true, env: "live", sent: book.flatfairDraft ?? null },
    });
  }

  if (b.action === "draft") {
    if (!book.flatfairDraft) {
      book.flatfairDraft = { draftId: 48213, by: CAST.agent.name, at: iso(now), test: false };
      (book.notes[d.id] ??= []).push(sysNote(book, "sent the deal to Flatfair as draft 48213", now));
    }
    return ok({ draft: book.flatfairDraft }, "flatfair_draft");
  }
  const on = b.done !== false;
  if (on) meta.checklist.deposit_registered = { done: true, by: CAST.agent.name, at: iso(now) };
  else delete meta.checklist.deposit_registered;
  (book.notes[d.id] ??= []).push(sysNote(book, on ? "set the deal up in Flatfair" : "unticked the Flatfair set-up", now));
  return ok({ done: done() }, on ? "flatfair_done" : "flatfair_undone");
}
