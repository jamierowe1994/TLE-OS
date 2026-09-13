import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { findUserById } from "@/lib/users";
import { MailboxNotConnected, msConnectionFor, msSendMail } from "@/lib/microsoft";

/**
 * "Does my mailbox actually send?"
 *
 * Every agent in the pilot connects Microsoft on their profile, and until
 * today the only way to find out whether that connection worked was to email
 * a landlord and hope. This sends ONE fixed message from their own mailbox to
 * an address they type, so the answer arrives in an inbox they can see.
 *
 * ── Why the body is fixed ─────────────────────────────────────────────────
 *
 * The recipient is the only thing the caller chooses. Nothing here takes a
 * subject or a body, so this cannot become a way to send anything at all from
 * somebody's work address through our server - it can only ever say the same
 * sentence about a test.
 *
 * ── Why it sends as them and nobody else ──────────────────────────────────
 *
 * `msSendMail(userId)` uses the token stored for the signed-in person. There
 * is no parameter for whose mailbox to use, deliberately: an owner cannot
 * "test" from an agent's address, which would be indistinguishable from
 * impersonating them.
 *
 * The emergency brake does not reach this one. SENDING_LOCKED exists to stop
 * mail going to landlords and tenants; a message an agent sends to themselves
 * to prove their own plumbing is not that, and switching the brake on should
 * not take away the tool you use to find out why something did not send.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const userId = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!userId) return NextResponse.json({ ok: false, error: "Unauthorised" }, { status: 401 });
  const me = await findUserById(userId);
  if (!me) return NextResponse.json({ ok: false, error: "Unauthorised" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { to?: string };
  const to = (body.to ?? "").trim() || me.email;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return NextResponse.json({ ok: false, error: "That doesn't look like an email address." }, { status: 400 });
  }

  const conn = await msConnectionFor(userId);
  if (!conn.connected) {
    return NextResponse.json(
      { ok: false, error: "Your Microsoft mailbox isn't connected yet. Connect it on this page first, then try again." },
      { status: 400 }
    );
  }

  const when = new Date().toLocaleString("en-GB", { dateStyle: "full", timeStyle: "short" });
  const first = (me.name ?? "").trim().split(/\s+/)[0] || "there";

  try {
    const { bccd } = await msSendMail(userId, {
      to: { name: to, email: to },
      subject: "TLE OS - your mailbox works",
      body:
        `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#1c1614">` +
        `<p>Hello ${first},</p>` +
        `<p>This came from your own mailbox, sent by TLE OS. If you are reading it, your connection works: ` +
        `anything the OS sends on your behalf will go out as <strong>${conn.email}</strong>, land in your Sent Items, ` +
        `and replies will come back to you rather than into a black hole.</p>` +
        `<p style="color:#7a6f6b;font-size:13px">Sent ${when}. Nobody else was copied.</p>` +
        `</div>`,
      /* No REX dropbox on a test: a message about plumbing has no business on
         a contact's timeline. */
      rexUserId: null,
    });
    return NextResponse.json({
      ok: true,
      message: `Sent to ${to} from ${conn.email}. It is in your Sent Items - if it hasn't arrived in a minute or two, check junk.`,
      bccd,
    });
  } catch (e) {
    if (e instanceof MailboxNotConnected) {
      return NextResponse.json(
        { ok: false, error: "Microsoft would not give us a token for your mailbox. Disconnect and connect it again." },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "That send failed." },
      { status: 502 }
    );
  }
}
