import { NextRequest, NextResponse } from "next/server";
import { publicError } from "@/lib/public-error";
import { switchOn } from "@/lib/switches";
import { msConnectionFor } from "@/lib/microsoft";
import { footerFor, footerPreviewHtml, withFooter } from "@/lib/email-footer";
import { sameSite } from "@/lib/email/preview-origin";
import { publicOrigin } from "@/lib/origin";
import { docsForTenant, emailFor, forScreen, homeContext, isRefusal, sendableDocs, sendsFor, sendToTenants, tenantsOf } from "@/lib/home-send";

/**
 * Send to tenants (Josel Banagua, 20 Oct 2026; lib/home-send).
 *
 *   GET  ?listing=<id>&listings=<id,id>   the documents that may be sent, the
 *                                         sitting tenants, how it would go,
 *                                         and what has gone before
 *       &history=1                       only what has gone before
 *   POST { listing, listings, documents: [id], tenants: [key], note, mode }
 *        mode "preview" + previewFor: the email that tenant would get
 *        mode "send": one email each, documents attached
 *
 * The home must be in the person's book (the office's is the whole business).
 * Nothing goes while viewing as somebody, or from a test home.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

const list = (v: unknown) => (Array.isArray(v) ? v.map(String).filter(Boolean) : String(v ?? "").split(",").map((x) => x.trim()).filter(Boolean));

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const ctx = await homeContext(req, (sp.get("listing") ?? "").trim(), list(sp.get("listings")));
    if (isRefusal(ctx)) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
    /* ?history=1: only what has gone before, for the home's activity. */
    if (sp.get("history") === "1") return NextResponse.json({ ok: true, sends: await sendsFor(ctx) });
    const [docs, sends, customerEmail, mailboxArmed, conn] = await Promise.all([
      sendableDocs(ctx),
      sendsFor(ctx).catch(() => []),
      switchOn("customer_email"),
      switchOn("assistant_email"),
      msConnectionFor(ctx.me.id).catch(() => ({ connected: false })),
    ]);
    return NextResponse.json({
      ok: true,
      title: ctx.title,
      documents: docs.map(forScreen),
      tenants: tenantsOf(ctx),
      sends,
      customerEmail,
      office: ctx.office,
      viewingAs: ctx.viewingAs,
      test: Boolean(ctx.home.test),
      via: mailboxArmed && conn.connected ? "mailbox" : "ours",
      sender: ctx.me.name || ctx.me.email,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "The documents couldn't be read just now. Try again in a minute.") }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const ctx = await homeContext(req, String(b?.listing ?? "").trim(), list(b?.listings));
    if (isRefusal(ctx)) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
    const mode = b?.mode === "send" ? "send" : "preview";
    if (mode === "send" && ctx.viewingAs) return NextResponse.json({ ok: false, error: "Stop viewing as somebody first: the email goes out under the name of the person who presses Send." }, { status: 403 });
    if (mode === "send" && ctx.home.test) return NextResponse.json({ ok: false, error: "This is a test home, so nothing is sent from it." }, { status: 400 });

    /* Everything is re-read here: the browser only says which. */
    const wantDocs = new Set(list(b?.documents));
    const wantTenants = new Set(list(b?.tenants));
    const docs = (await sendableDocs(ctx)).filter((d) => wantDocs.has(d.id));
    const tenants = tenantsOf(ctx).filter((t) => wantTenants.has(t.key));
    const note = String(b?.note ?? "").slice(0, 2000);
    if (!docs.length) return NextResponse.json({ ok: false, error: "Tick at least one document." }, { status: 400 });
    if (docs.every((d) => d.blocked)) return NextResponse.json({ ok: false, error: docs[0].blocked ?? "None of those can be sent." }, { status: 400 });
    if (!tenants.length) return NextResponse.json({ ok: false, error: "Tick at least one tenant." }, { status: 400 });

    if (mode === "preview") {
      const who = tenants.find((t) => t.key === String(b?.previewFor ?? "")) ?? tenants[0];
      const mine = docsForTenant(docs, who);
      const { subject, html } = await emailFor(ctx, who, mine.length ? mine : docs.filter((d) => !d.blocked), note);
      const [mailboxArmed, conn] = await Promise.all([switchOn("assistant_email"), msConnectionFor(ctx.me.id).catch(() => ({ connected: false }))]);
      const f = mailboxArmed && conn.connected ? await footerFor(ctx.me.id).catch(() => null) : null;
      const shown = sameSite(html, publicOrigin(req));
      return NextResponse.json({
        ok: true,
        subject,
        to: who.email ?? "",
        name: who.name,
        html: f ? withFooter(shown, { ...f, html: footerPreviewHtml(f) }) : shown,
        attachments: mine.map((d) => ({ label: d.label, name: d.name, sizeBytes: d.sizeBytes })),
        perTenant: tenants.map((t) => ({ key: t.key, name: t.name, email: t.email, where: t.where, documents: docsForTenant(docs, t).map((d) => d.label) })),
      });
    }

    const { results } = await sendToTenants(ctx, docs, tenants, note);
    return NextResponse.json({ ok: true, sent: results.filter((r) => r.sent).length, results });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "That couldn't be sent just now. Try again in a minute.") }, { status: 500 });
  }
}
