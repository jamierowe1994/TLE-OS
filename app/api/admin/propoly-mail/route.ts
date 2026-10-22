import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/admin";
import { publicError } from "@/lib/public-error";
import { discoverSenders, fileMail, GO_LIVE, mailSettings, recentMail, saveMailSettings, scanPropolyMail, SettingRefused } from "@/lib/propoly-mail";
import { DealDocsRefused, planDealDocuments, resolveDeal, publicPlan, pushDealDocuments, recentPushes, type DocKind } from "@/lib/deal-documents";

/**
 * Owner only: Propoly's emails read from Outlook, and a let's certificates
 * pushed into its Propoly deal (Admin, Propoly).
 *
 *   GET                                   the setting, every mailbox's read, the latest kept, pushes made
 *   POST { action: "settings", senders, moveInWords }
 *        { action: "discover" }           who Propoly's mail comes from, across the mailboxes (nothing kept)
 *        { action: "scan", backfill? }    read every mailbox now; backfill re-reads from go-live
 *        { action: "file", id, deal }     put an unplaced email on a deal
 *        { action: "docs-check", deal }   what would go into the deal (writes nothing); deal = a deal or property link, or the address
 *        { action: "docs-push", deal, kinds?, includeExpired? }   send it
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  if (!(await requireOwner(req))) return NextResponse.json({ ok: false, error: "Owners only." }, { status: 403 });
  try {
    const [settings, mail, pushes] = await Promise.all([mailSettings(), recentMail(), recentPushes()]);
    return NextResponse.json({ ok: true, goLive: GO_LIVE, settings, ...mail, pushes });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "That couldn't be read just now.") }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const me = await requireOwner(req);
  if (!me) return NextResponse.json({ ok: false, error: "Owners only." }, { status: 403 });
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const action = String(b?.action ?? "");
  const by = me.email;
  try {
    if (action === "settings") {
      const senders = Array.isArray(b?.senders) ? b.senders.map(String) : String(b?.senders ?? "").split(/[\s,;]+/);
      return NextResponse.json({ ok: true, settings: await saveMailSettings({ senders, moveInWords: typeof b?.moveInWords === "string" ? b.moveInWords : undefined }, by) });
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
