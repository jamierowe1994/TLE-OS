import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { hasDb } from "@/lib/db";
import { scopeForWho } from "@/lib/scope";
import { managedBookFor } from "@/lib/managed-book-cache";
import { loginRows, loginVars, sendLogins } from "@/lib/tenant-logins";
import { renderTleEmailLive } from "@/lib/email/tle-emails";
import { footerFor, footerPreviewHtml, withFooter } from "@/lib/email-footer";
import { sameSite } from "@/lib/email/preview-origin";
import { publicOrigin } from "@/lib/origin";
import { switchOn } from "@/lib/switches";
import { msConnectionFor } from "@/lib/microsoft";
import { record } from "@/lib/audit";
import { publicError } from "@/lib/public-error";

/**
 * Send out logins (Sean McMahon, agent call, 16 Oct 2026; lib/tenant-logins).
 *
 *   GET  ?listing=<id>[,<id>]   the sitting tenants on those homes, or on the
 *                               whole book without it, with when each was last
 *                               sent a login, and how a send would go
 *   POST { picks: [{ listingId, email }] }   send them, one by one
 *
 * Only ever the signed-in person's own book. Never while viewing as somebody:
 * the email goes from the person pressing, under their name.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function setup(req: NextRequest) {
  const who = hasDb() ? await whoIs(req).catch(() => null) : null;
  if (!who?.actor) return { error: NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 }) };
  const scope = await scopeForWho(req, who);
  if (scope.unlinked) return { error: NextResponse.json({ ok: false, error: "We can't tell which agent you are, so there's no book to send for." }, { status: 403 }) };
  const { book } = await managedBookFor(scope.rexUserId);
  return { who, book };
}

export async function GET(req: NextRequest) {
  try {
    const s = await setup(req);
    if (s.error) return s.error;
    /* ?preview=<listingId>&email=<address>: the email that tenant would get,
       with the sender's own footer when it would go from their Outlook. The
       button goes nowhere: no link is minted for a look. */
    const preview = (req.nextUrl.searchParams.get("preview") ?? "").trim();
    if (preview) {
      const home = s.book.properties.find((p) => String(p.listingId) === preview);
      if (!home) return NextResponse.json({ ok: false, error: "That home isn't in your book." }, { status: 404 });
      const email = (req.nextUrl.searchParams.get("email") ?? "").trim().toLowerCase();
      const tenant = home.tenants.find((t) => (t.email ?? "").trim().toLowerCase() === email) ?? home.tenants[0];
      const actor = s.who.actor!;
      const { subject, html } = await renderTleEmailLive("tenant-portal-login", await loginVars(actor, home, tenant?.name ?? "", "#preview"));
      const [mailboxArmed, conn] = await Promise.all([switchOn("assistant_email"), msConnectionFor(actor.id).catch(() => ({ connected: false }))]);
      const f = mailboxArmed && conn.connected ? await footerFor(actor.id).catch(() => null) : null;
      const shown = sameSite(html, publicOrigin(req));
      return NextResponse.json({ ok: true, subject, to: tenant?.email ?? "", html: f ? withFooter(shown, { ...f, html: footerPreviewHtml(f) }) : shown, footer: Boolean(f) });
    }
    const only = (req.nextUrl.searchParams.get("listing") ?? "").split(",").map((x) => x.trim()).filter(Boolean);
    const homes = only.length ? s.book.properties.filter((p) => only.includes(String(p.listingId))) : s.book.properties;
    const agentOf = new Map(s.book.properties.map((p) => [String(p.listingId), p.agent?.name ?? ""]));
    const rows = (await loginRows(homes)).map((r) => ({ ...r, agent: agentOf.get(r.listingId) ?? "" }));
    const actor = s.who.actor!;
    const [customerEmail, mailboxArmed, conn] = await Promise.all([
      switchOn("customer_email"),
      switchOn("assistant_email"),
      msConnectionFor(actor.id).catch(() => ({ connected: false })),
    ]);
    return NextResponse.json({
      ok: true,
      rows,
      customerEmail,
      viewingAs: s.who.viewingAs,
      /* How it would go: their own Outlook with their footer, or our sender. */
      via: mailboxArmed && conn.connected ? "mailbox" : "ours",
      sender: actor.name || actor.email,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "The tenants couldn't be read just now. Try again in a minute.") }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const s = await setup(req);
    if (s.error) return s.error;
    if (s.who.viewingAs) return NextResponse.json({ ok: false, error: "Stop viewing as somebody first: logins go out under the name of the person who presses send." }, { status: 403 });
    const b = (await req.json().catch(() => null)) as { picks?: unknown } | null;
    const picks = Array.isArray(b?.picks)
      ? (b.picks as { listingId?: unknown; email?: unknown }[]).map((x) => ({ listingId: String(x?.listingId ?? ""), email: String(x?.email ?? "") })).filter((x) => x.listingId && x.email)
      : [];
    if (!picks.length) return NextResponse.json({ ok: false, error: "Tick at least one tenant." }, { status: 400 });
    if (picks.length > 300) return NextResponse.json({ ok: false, error: "That's more than 300 at once. Send them in two goes." }, { status: 400 });
    const actor = s.who.actor!;
    const results = await sendLogins({ me: actor, homes: s.book.properties, picks });
    const sent = results.filter((r) => r.sent).length;
    await record({
      kind: "tenant_logins_sent",
      actorId: actor.id,
      actorEmail: actor.email,
      detail: `Send out logins: ${sent} of ${results.length} sent. ${results.map((r) => `${r.email} (${r.listingId}) ${r.sent ? "sent" : "not sent"}`).join("; ").slice(0, 1800)}`,
    }).catch(() => undefined);
    return NextResponse.json({ ok: true, sent, results });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "The logins couldn't be sent just now. Try again in a minute.") }, { status: 500 });
  }
}
