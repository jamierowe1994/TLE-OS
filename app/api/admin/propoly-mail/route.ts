import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { can } from "@/lib/roles";
import { publicError } from "@/lib/public-error";
import { discoverSenders, fileMail, GO_LIVE, mailSettings, recentMail, rematchUnfiled, saveMailSettings, scanPropolyMail, SettingRefused } from "@/lib/propoly-mail";
import { DealDocsRefused, planDealDocuments, resolveDeal, publicPlan, pushDealDocuments, recentPushes, type DocKind } from "@/lib/deal-documents";

/**
 * Propoly's emails read from Outlook, and a let's certificates pushed into its
 * Propoly deal (Admin, Propoly). Owners do everything; the office (pre-tenancy
 * and compliance, see:pretenancy) can read the page and put an unplaced email
 * on its deal (22 Oct 2026).
 *
 *   GET                                   the setting, every mailbox's read, the latest kept, gaps, pushes made
 *   POST { action: "settings", senders, moveInWords, alwaysWatch }
 *        { action: "rematch" }            try every unplaced email against today's deal books
 *        { action: "discover" }           who Propoly's mail comes from, across the mailboxes (nothing kept)
 *        { action: "scan", backfill? }    read every mailbox now; backfill re-reads from go-live
 *        { action: "file", id, deal }     put an unplaced email on a deal
 *        { action: "docs-check", deal }   what would go into the deal (writes nothing); deal = a deal or property link, or the address
 *        { action: "docs-push", deal, kinds?, includeExpired? }   send it
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

async function who(req: NextRequest) {
  const me = (await whoIs(req).catch(() => null))?.actor ?? null;
  return { me, owner: me?.role === "owner", office: Boolean(me && (me.role === "owner" || can(me.role, "see:pretenancy"))) };
}

export async function GET(req: NextRequest) {
  const w = await who(req);
  if (!w.office) return NextResponse.json({ ok: false, error: "This page is for owners and the office." }, { status: 403 });
  try {
    const [settings, mail, pushes] = await Promise.all([mailSettings(), recentMail(), w.owner ? recentPushes() : Promise.resolve([])]);
    return NextResponse.json({ ok: true, owner: w.owner, goLive: GO_LIVE, settings, ...mail, pushes });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "That couldn't be read just now.") }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const w = await who(req);
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const action = String(b?.action ?? "");
  const officeMay = action === "file" || action === "rematch";
  if (!w.me || !(w.owner || (officeMay && w.office))) return NextResponse.json({ ok: false, error: "Owners only." }, { status: 403 });
  const by = w.me.email;
  try {
    if (action === "rematch") {
      const placed = await rematchUnfiled();
      return NextResponse.json({ ok: true, placed, ...(await recentMail()) });
    }
    if (action === "settings") {
      const senders = Array.isArray(b?.senders) ? b.senders.map(String) : String(b?.senders ?? "").split(/[\s,;]+/);
      const list = (v: unknown) => (Array.isArray(v) ? v.map(String) : String(v ?? "").split(/[\s,;]+/));
      return NextResponse.json({ ok: true, settings: await saveMailSettings({ senders, moveInWords: typeof b?.moveInWords === "string" ? b.moveInWords : undefined, alwaysWatch: list(b?.alwaysWatch) }, by) });
    }
    if (action === "discover") return NextResponse.json({ ok: true, ...(await discoverSenders({ budgetMs: 240_000 })) });
    if (action === "scan") {
      const run = await scanPropolyMail({ force: true, from: b?.backfill ? GO_LIVE : undefined, budgetMs: 270_000 });
      return NextResponse.json({ ok: true, run, ...(await recentMail()) });
    }
    if (action === "file") {
      return NextResponse.json({ ok: true, mail: await fileMail(String(b?.id ?? ""), await resolveDeal(String(b?.deal ?? "")), by) });
    }
    if (action === "docs-check" || action === "docs-push") {
      const deal = await resolveDeal(String(b?.deal ?? ""));
      if (action === "docs-check") return NextResponse.json({ ok: true, plan: publicPlan(await planDealDocuments(deal)) });
      const kinds = Array.isArray(b?.kinds) ? (b.kinds.map(String).filter((k) => ["gas", "eicr", "epc"].includes(k)) as DocKind[]) : undefined;
      const plan = await pushDealDocuments(deal, by, { kinds, includeExpired: Boolean(b?.includeExpired) });
      return NextResponse.json({ ok: true, plan: publicPlan(plan), pushes: await recentPushes() });
    }
    return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
  } catch (e) {
    if (e instanceof SettingRefused || e instanceof DealDocsRefused) return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    return NextResponse.json({ ok: false, error: publicError(e, "That didn't work just now. Try again in a minute.") }, { status: 500 });
  }
}
