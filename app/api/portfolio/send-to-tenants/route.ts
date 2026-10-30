import { NextRequest, NextResponse } from "next/server";
import { publicError } from "@/lib/public-error";
import { switchOn } from "@/lib/switches";
import { msConnectionFor } from "@/lib/microsoft";
import { footerFor, footerPreviewHtml, withFooter } from "@/lib/email-footer";
import { sameSite } from "@/lib/email/preview-origin";
import { publicOrigin } from "@/lib/origin";
import { AlreadySending, defaultsFor, docsFor, emailFor, forScreen, homeContext, isRefusal, NothingToSay, recipientsOf, sendableDocs, sendFromHome, sendRecord, sendsFor, uploadsFrom } from "@/lib/home-send";

/**
 * Send to tenants (Josel Banagua, 20 Oct 2026; lib/home-send).
 *
 *   GET  ?listing=<id>&listings=<id,id>   the documents that may be sent, the
 *                                         sitting tenants, how it would go,
 *                                         and what has gone before
 *       &history=1                       only what has gone before
 *   GET  ?record=<send id>               the legal record of one send: every
 *                                         email exactly as it went, each file's
 *                                         SHA-256, the provider's id. Only for
 *                                         somebody whose book holds the home.
 *   POST { listing, listings, documents: [id], tenants: [key], uploads, subject, message, mode }
 *        tenants         anybody from `tenants` in the GET: since Email Docs
 *                        (29 Oct 2026) the landlord side as well, by role
 *        uploads         files from the sender's computer: [{ name, size }]
 *                        for a preview, [{ name, data (base64) }] to send
 *        mode "preview" + previewFor: the email that person would get, and
 *                        the default subject and words when none are given
 *        mode "send": one email each, what is theirs attached, written down
 *                        as it goes. No documents is fine when there are words.
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
    const recordId = (sp.get("record") ?? "").trim();
    if (recordId) {
      const rec = await sendRecord(recordId);
      if (!rec) return NextResponse.json({ ok: false, error: "That record isn't here." }, { status: 404 });
      /* The same gate as the home's page: the home must be in your book. */
      const gate = await homeContext(req, rec.listingId, []);
      if (isRefusal(gate)) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
      return NextResponse.json({ ok: true, record: rec });
    }
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
      tenants: await recipientsOf(ctx),
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
    const uploads = uploadsFrom(b?.uploads, mode === "send");
    if (isRefusal(uploads)) return NextResponse.json({ ok: false, error: uploads.error }, { status: uploads.status });
    const docs = [...(await sendableDocs(ctx)).filter((d) => wantDocs.has(d.id)), ...uploads];
    const tenants = (await recipientsOf(ctx)).filter((t) => wantTenants.has(t.key));
    const edit = { subject: typeof b?.subject === "string" ? b.subject : null, message: typeof b?.message === "string" ? b.message : null };
    const roles = [...new Set(tenants.map((t) => t.role))];
    if (docs.length && docs.every((d) => d.blocked)) return NextResponse.json({ ok: false, error: docs[0].blocked ?? "None of those can be sent." }, { status: 400 });
    if (!tenants.length) return NextResponse.json({ ok: false, error: "Tick at least one person to send it to." }, { status: 400 });

    if (mode === "preview") {
      const who = tenants.find((t) => t.key === String(b?.previewFor ?? "")) ?? tenants[0];
      const mine = docsFor(docs, who);
      const { subject, html } = await emailFor(ctx, who, mine, edit, roles);
      const [mailboxArmed, conn] = await Promise.all([switchOn("assistant_email"), msConnectionFor(ctx.me.id).catch(() => ({ connected: false }))]);
      const f = mailboxArmed && conn.connected ? await footerFor(ctx.me.id).catch(() => null) : null;
      const shown = sameSite(html, publicOrigin(req));
      return NextResponse.json({
        ok: true,
        subject,
        defaults: defaultsFor(ctx, docs, roles),
        to: who.email ?? "",
        name: who.name,
        html: f ? withFooter(shown, { ...f, html: footerPreviewHtml(f) }) : shown,
        attachments: mine.map((d) => ({ label: d.label, name: d.name, sizeBytes: d.sizeBytes })),
        perTenant: tenants.map((t) => ({ key: t.key, name: t.name, email: t.email, where: t.where, role: t.role, documents: docsFor(docs, t).map((d) => d.label) })),
      });
    }

    const { results, id } = await sendFromHome(ctx, docs, tenants, edit);
    return NextResponse.json({ ok: true, sent: results.filter((r) => r.sent).length, results, record: id });
  } catch (e) {
    if (e instanceof AlreadySending) return NextResponse.json({ ok: false, error: e.message }, { status: 409 });
    if (e instanceof NothingToSay) return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    return NextResponse.json({ ok: false, error: publicError(e, "That couldn't be sent just now. Try again in a minute.") }, { status: 500 });
  }
}
