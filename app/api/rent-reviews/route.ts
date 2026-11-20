import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { publicError } from "@/lib/public-error";
import { sameSite } from "@/lib/email/preview-origin";
import { publicOrigin } from "@/lib/origin";
import { switchOn } from "@/lib/switches";
import { msConnectionFor } from "@/lib/microsoft";
import { footerFor, footerPreviewHtml, withFooter } from "@/lib/email-footer";
import { homeContext, isRefusal, tenantsOf } from "@/lib/home-send";
import {
  ReviewRefused, answersFrom, emailPreview, evidenceFrom, isReviewId, rentReviewOn, reviewsForHome, sendRentReview, startFor,
} from "@/lib/rent-reviews";

/**
 * THE SCOTTISH RENT REVIEW (lib/rent-reviews, 20 Nov 2026).
 *
 *   GET  ?listing=<id>&listings=<id,id>   what the screen opens with
 *       &history=1                       the rent reviews sent from this home
 *   POST { mode: "preview", listing, listings, answers, recipients }
 *                                         the email the first ticked tenant will get
 *   POST { mode: "send" | "print", id, listing, listings, answers, evidence, recipients }
 *                                         once per id: the notice made, kept,
 *                                         emailed (send) or left to print, on
 *                                         Documents, accounts told
 *
 * Behind the "Scottish rent review" switch (lib/new-look "scotrent"; always
 * on in the demo copy). The home must be in the person's book, as for every
 * send from a home (lib/home-send homeContext).
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

const list = (v: unknown) => (Array.isArray(v) ? v.map(String).filter(Boolean) : String(v ?? "").split(",").map((x) => x.trim()).filter(Boolean));
const OFF = "The Scottish rent review isn't switched on for you.";

export async function GET(req: NextRequest) {
  try {
    const { actor } = await whoIs(req);
    if (!(await rentReviewOn(actor))) return NextResponse.json({ ok: false, error: OFF }, { status: 404 });
    const sp = req.nextUrl.searchParams;
    const ctx = await homeContext(req, (sp.get("listing") ?? "").trim(), list(sp.get("listings")));
    if (isRefusal(ctx)) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
    if (sp.get("history") === "1") {
      return NextResponse.json({ ok: true, reviews: await reviewsForHome([...new Set([ctx.home, ...ctx.lets].map((l) => String(l.listingId)))]) });
    }
    const [start, mailboxArmed, conn] = await Promise.all([
      startFor(ctx),
      switchOn("assistant_email"),
      msConnectionFor(ctx.me.id).catch(() => ({ connected: false })),
    ]);
    return NextResponse.json({ ok: true, ...start, via: mailboxArmed && conn.connected ? "mailbox" : "ours" });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "The home couldn't be read just now. Try again in a minute.") }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { actor } = await whoIs(req);
    if (!(await rentReviewOn(actor))) return NextResponse.json({ ok: false, error: OFF }, { status: 404 });
    const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const ctx = await homeContext(req, String(b?.listing ?? "").trim(), list(b?.listings));
    if (isRefusal(ctx)) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
    const answers = answersFrom(b?.answers);
    const recipients = list(b?.recipients);

    if (b?.mode === "preview") {
      const to = tenantsOf(ctx).find((t) => recipients.includes(t.key) && t.email) ?? null;
      const { subject, html } = await emailPreview(ctx, answers, to);
      const [mailboxArmed, conn] = await Promise.all([switchOn("assistant_email"), msConnectionFor(ctx.me.id).catch(() => ({ connected: false }))]);
      const f = mailboxArmed && conn.connected ? await footerFor(ctx.me.id).catch(() => null) : null;
      const shown = sameSite(html, publicOrigin(req));
      return NextResponse.json({ ok: true, subject, to: to?.email ?? "", name: to?.name ?? "", html: f ? withFooter(shown, { ...f, html: footerPreviewHtml(f) }) : shown });
    }

    const method = b?.mode === "print" ? "print" : b?.mode === "send" ? "email" : null;
    if (!method) return NextResponse.json({ ok: false, error: "Send or print?" }, { status: 400 });
    const id = String(b?.id ?? "");
    if (!isReviewId(id)) return NextResponse.json({ ok: false, error: "Close this and start the rent review again." }, { status: 400 });
    const out = await sendRentReview(ctx, { id, answers, evidence: evidenceFrom(b?.evidence, id), recipients, method });
    return NextResponse.json({
      ok: true,
      review: out.review,
      results: out.results,
      accounts: out.accounts,
      demo: out.demo,
      again: out.again,
      pdf: `/api/r2/file?key=${encodeURIComponent(out.pdfKey)}`,
      download: `/api/r2/file?key=${encodeURIComponent(out.pdfKey)}&save=1`,
    });
  } catch (e) {
    if (e instanceof ReviewRefused) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    return NextResponse.json({ ok: false, error: publicError(e, "That couldn't be sent just now. Try again in a minute.") }, { status: 500 });
  }
}
