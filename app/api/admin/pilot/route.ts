import { NextRequest, NextResponse } from "next/server";
import { publicError } from "@/lib/public-error";
import { requireCapability, requireOwner } from "@/lib/admin";
import { asRole } from "@/lib/roles";
import { addInvite, invites, markInviteSent, removeInvite, tabUsage, bugs } from "@/lib/pilot";
import { lettingsAgents } from "@/lib/rex-agents";
import { accountsByEmail, findUserByEmail } from "@/lib/users";
import { dropLink, latestJoinLinks, retireOtherLinks, startVerification } from "@/lib/verification";
import { pilotInviteEmail } from "@/lib/email/pilot-email";
import { sendEmail } from "@/lib/resend";
import { record } from "@/lib/audit";

/** The pre-launch area: who's invited, what they use, what's broken. */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  /* READING is `see:prelaunch`, which Susan holds from 4 Sep - the whole point
     of her Pre-launch tab is knowing what is and is not ready for 14 October,
     and a tab that renders an empty page is worse than no tab.

     WRITING stays requireOwner below. The POST invites a pilot agent and the
     DELETE removes one, and neither is a thing to hand over as a side effect
     of showing somebody a readiness report. */
  if (!(await requireCapability(req, "see:prelaunch"))) {
    return new NextResponse(null, { status: 404 });
  }

  const roster = (await lettingsAgents().catch(() => [])).map((a) => ({
    rexId: a.id, name: a.name, email: a.email,
  }));
  const invited = await invites();
  const byEmail = new Map(invited.map((i) => [i.email.toLowerCase(), i]));

  /* One query for the whole roster, not one per person: this was 28 awaits on
     a page that already waits on REX. */
  const accounts = await accountsByEmail(roster.map((r) => r.email));

  /* Whether each person's join link is still alive - see latestJoinLinks. */
  const links = await latestJoinLinks([...roster.map((r) => r.email), ...invited.map((i) => i.email)]);

  const candidates = roster.map((r) => {
    const inv = byEmail.get(r.email.toLowerCase());
    const acct = accounts.get(r.email.toLowerCase());
    return {
      ...r,
      invited: Boolean(inv),
      sentAt: inv?.sentAt ?? null,
      linkExpiresAt: links.get(r.email.toLowerCase()) ?? null,
      /* THE ACCOUNT FIRST, the invite only as a fallback.
         This read `inv?.role` alone, so it showed what somebody was invited AS
         rather than what they ARE. Francesca was invited as an agent on 4 Sep
         and made marketing afterwards, and her row on the People screen said
         Agent - which is precisely the silent demotion the comment here was
         written to prevent, one press away. The invite still answers for
         anybody who has not joined yet, because that is all there is. */
      role: acct?.role ?? inv?.role ?? null,
      hasAccount: Boolean(acct),
      /* WAS HARDCODED NULL. The People screen sorts by "last in" and by
         "longest since", shows a last-seen column, and every one of those was
         reading a constant. See touchSeen for the other half: the timestamp
         behind it only moved on a password sign-in, so it answered a question
         nobody was asking. */
      lastSeenAt: acct?.lastSeenAt ?? null,
    };
  });

  /* Anyone invited who is NOT on the REX roster — marketing, ops, head
     office. Without this they vanish the moment they are added: the list is
     built from lettings agents, so an off-roster invite would be recorded,
     emailed, and then invisible on the screen that sent it. */
  const rosterEmails = new Set(roster.map((r) => r.email.toLowerCase()));
  const offRoster = await Promise.all(
    invited
      .filter((i) => !rosterEmails.has(i.email.toLowerCase()))
      .map(async (i) => ({
        rexId: "",
        name: i.name || i.email.split("@")[0],
        email: i.email,
        invited: true,
        sentAt: i.sentAt,
        linkExpiresAt: links.get(i.email.toLowerCase()) ?? null,
        role: i.role,
        hasAccount: Boolean(await findUserByEmail(i.email)),
        lastSeenAt: (await accountsByEmail([i.email])).get(i.email.toLowerCase())?.lastSeenAt ?? null,
      }))
  );

  return NextResponse.json({
    candidates: [...candidates, ...offRoster],
    usage: await tabUsage(),
    bugs: (await bugs(50)).filter((b) => b.state === "open" || b.state === "ack"),
  });
}

export async function POST(req: NextRequest) {
  const owner = await requireOwner(req);
  if (!owner) return new NextResponse(null, { status: 404 });

  const { email, name, rexUserId, role, send, link } = (await req.json().catch(() => ({}))) as {
    email?: string; name?: string; rexUserId?: string; role?: string;
    send?: boolean; link?: boolean;
  };
  if (!email) return NextResponse.json({ ok: false, error: "Which person?" }, { status: 400 });

  /* Recorded on the invite so it applies the moment they redeem, rather than
     being something somebody has to remember to set afterwards — which is what
     went wrong for Susan: she joined as an "agent", a role with no
     capabilities, and could not open a single business screen.

     Safe to accept here because this whole route is requireOwner, and only an
     owner may hand out roles anyway. `asRole` narrows anything unrecognised to
     "agent", so a typo cannot mint a permission. */
  await addInvite({ email, name, rexUserId, role: role ? asRole(role) : null, by: owner.email });

  /* ── The link, without the email ──────────────────────────────────────────
     Our own mail is landing in Microsoft quarantine, so the invite arrives
     nowhere and the person cannot be told why. This mints exactly the same
     one-time token the email would have carried and hands it back to be
     delivered by whatever DOES reach them - a text, a WhatsApp, a phone call
     reading it out.

     Deliberately NOT marked as sent: nothing was sent. The roster's "sent"
     column means the OS emailed somebody, and a hand-delivered link that
     never arrives would otherwise look identical to one that did.

     The URL is a CREDENTIAL for 24 hours. It is returned to the owner who
     asked for it and never logged, never emailed and never stored anywhere
     but the browser that requested it. */
  if (link) {
    try {
      const { token } = await startVerification(email, "join");
      const origin = process.env.OS_ORIGIN?.replace(/\/+$/, "") || req.nextUrl.origin;
      await record({
        kind: "password_reset",
        actorId: owner.id, actorEmail: owner.email, subjectEmail: email,
        detail: "magic link generated, to be delivered by hand",
      });
      return NextResponse.json({
        ok: true,
        url: `${origin}/join?token=${encodeURIComponent(token)}`,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      });
    } catch (e) {
      return NextResponse.json({ ok: false, error: publicError(e) }, { status: 400 });
    }
  }

  if (!send) return NextResponse.json({ ok: true, message: `${email} added to the pilot.` });

  /* Sending is a separate act from inviting, so a list can be built up over a
     week and fired in one go — and so a mis-click adds a row rather than an
     email somebody has to be told to ignore. */
  /* Sent before? Then this is a reissue: the fresh link replaces the old one
     once it has gone (retireOtherLinks below), and the message says so. */
  const reissue = Boolean((await invites()).find((i) => i.email.toLowerCase() === email.trim().toLowerCase())?.sentAt);
  /* The old link survives until the new one has actually been sent - see
     retireOtherLinks. Minting normally kills it on the spot, and a send that
     then failed left the person with nothing that worked. */
  let token: string;
  try {
    ({ token } = await startVerification(email, "join", { keepOthers: true }));
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e) }, { status: 400 });
  }
  try {
    const origin = process.env.OS_ORIGIN?.replace(/\/+$/, "") || req.nextUrl.origin;
    /* The PILOT invitation, not the account-verification email.
     
       This screen has always minted a join token and then sent the generic
       "Set up your TLE OS account" — so the email actually written for the
       pilot, the one that says "You're in", had never been sent by anything.
       Its own catalogue entry admitted it: "NOT WIRED YET".
     
       Same token, same link, same one-time 24 hours. Only the words and the
       picture differ, and they are the ones written for this moment. */
    const mail = pilotInviteEmail(
      `${origin}/join?token=${encodeURIComponent(token)}`,
      (name ?? "").trim().split(/\s+/)[0] || undefined
    );
    await sendEmail({ to: email, subject: mail.subject, html: mail.html, text: mail.text });
    await retireOtherLinks(email, "join", token);
    await markInviteSent(email);
    await record({
      kind: "password_reset",
      actorId: owner.id, actorEmail: owner.email, subjectEmail: email,
      detail: reissue ? "pilot invite reissued with a fresh link" : "pilot invite sent",
    });
  } catch (e) {
    /* Not sent, so the new link goes and the old one - untouched - still works. */
    await dropLink(token).catch(() => null);
    return NextResponse.json({ ok: false, error: publicError(e) }, { status: 502 });
  }
  return NextResponse.json({
    ok: true,
    message: reissue
      ? `New link sent to ${email}. It works once and lasts 24 hours; the old one no longer works.`
      : `Invite sent to ${email}.`,
  });
}

export async function DELETE(req: NextRequest) {
  if (!(await requireOwner(req))) return new NextResponse(null, { status: 404 });
  const { email } = (await req.json().catch(() => ({}))) as { email?: string };
  if (email) await removeInvite(email);
  return NextResponse.json({ ok: true });
}
