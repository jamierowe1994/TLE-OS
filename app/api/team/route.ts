import { NextRequest, NextResponse } from "next/server";
import { publicError } from "@/lib/public-error";
import { hasDb, q } from "@/lib/db";
import { assertNotViewingAs, ViewingAsRefused, VIEW_AS_COOKIE } from "@/lib/view-as";
import { requireTeamAdmin } from "@/lib/team-admins";
import { ROLE_BLURB, ROLE_LABEL, TEAM_ROLES, asRole, type Role } from "@/lib/roles";
import { addInvite, invites, markInviteSent } from "@/lib/pilot";
import { findUserByEmail, findUserById } from "@/lib/users";
import { dropLink, retireOtherLinks, startVerification } from "@/lib/verification";
import { launchInviteEmail } from "@/lib/email/launch-email";
import { resetEmailFor } from "@/lib/verify-email";
import { sendEmail } from "@/lib/resend";
import { record } from "@/lib/audit";
import { LAUNCH_LINK_DAYS, TOUR_URL, markLaunchSent, saveLaunchRow } from "@/lib/launch";

/**
 * The team, for a team admin (lib/team-admins): Kirstie's People page.
 *
 * Four things and no more (James, 23 Oct 2026): see everybody with an
 * account, send one of them a password reset, set their role, and add a new
 * person. Never a file, never "view as" - those stay on the owner's People
 * screen. Roles are TEAM_ROLES only, and anybody who already holds a role
 * outside it (an owner, Susan, a developer) can't be changed from here. Nor
 * can a team admin change their own role.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const origin = (req: NextRequest) => process.env.OS_ORIGIN?.replace(/\/+$/, "") || req.nextUrl.origin;
const teamRole = (r: string | null | undefined): r is Role => TEAM_ROLES.includes(asRole(r)) && asRole(r) === r;
const bad = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status });

export async function GET(req: NextRequest) {
  const me = await requireTeamAdmin(req);
  if (!me) return new NextResponse(null, { status: 404 });
  if (!hasDb()) return bad("No database on this environment.", 503);
  const rows = await q<{ id: string; email: string; name: string; role: string; created_at: Date; last_seen_at: Date | null; locked_at: Date | null }>(
    `select id, email, name, role, created_at, last_seen_at, locked_at from os_users order by lower(name), email`
  );
  const accounts = new Set(rows.map((r) => r.email.toLowerCase()));
  const waiting = (await invites().catch(() => [])).filter((i) => !i.acceptedAt && !accounts.has(i.email.toLowerCase()));
  return NextResponse.json({
    ok: true,
    me: me.id,
    roles: TEAM_ROLES.map((r) => ({ id: r, label: ROLE_LABEL[r], blurb: ROLE_BLURB[r] })),
    people: rows.map((r) => ({
      id: r.id,
      name: r.name || r.email.split("@")[0],
      email: r.email,
      role: asRole(r.role),
      roleLabel: ROLE_LABEL[asRole(r.role)],
      /* Owners, Susan and developers are set by James only. */
      editable: teamRole(r.role) && r.id !== me.id,
      joinedAt: new Date(r.created_at).toISOString(),
      lastSeenAt: r.last_seen_at ? new Date(r.last_seen_at).toISOString() : null,
      locked: Boolean(r.locked_at),
    })),
    invited: waiting.map((i) => ({
      email: i.email,
      name: i.name || i.email.split("@")[0],
      role: asRole(i.role),
      roleLabel: ROLE_LABEL[asRole(i.role)],
      sentAt: i.sentAt,
    })),
  });
}

export async function POST(req: NextRequest) {
  try {
    assertNotViewingAs(req.cookies.get(VIEW_AS_COOKIE)?.value);
  } catch (e) {
    if (e instanceof ViewingAsRefused) return bad(e.message, 423);
    throw e;
  }
  const me = await requireTeamAdmin(req);
  if (!me) return new NextResponse(null, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { action?: string; userId?: string; role?: string; name?: string; email?: string };

  switch (body.action) {
    case "reset": {
      const who = body.userId ? await findUserById(body.userId) : null;
      if (!who) return bad("No such person.", 404);
      if (!teamRole(who.role) && who.id !== me.id) return bad("Only James can reset that account.", 403);
      try {
        const { token } = await startVerification(who.email, "reset");
        const mail = resetEmailFor(`${origin(req)}/reset?token=${encodeURIComponent(token)}`);
        await sendEmail({ to: who.email, subject: mail.subject, html: mail.html, text: mail.text });
      } catch (e) {
        return bad(publicError(e), 502);
      }
      await record({ kind: "password_reset", actorId: me.id, actorEmail: me.email, subjectId: who.id, subjectEmail: who.email, detail: "reset link sent from the team page" });
      return NextResponse.json({ ok: true, message: `A reset link is on its way to ${who.email}.` });
    }

    case "role": {
      const who = body.userId ? await findUserById(body.userId) : null;
      if (!who) return bad("No such person.", 404);
      if (who.id === me.id) return bad("You can't change your own role. Ask James.", 403);
      if (!teamRole(who.role)) return bad("Only James can change that person's role.", 403);
      if (!teamRole(body.role)) return bad("That role can't be given from here.");
      if (who.role === body.role) return NextResponse.json({ ok: true, message: "No change." });
      await q(`update os_users set role = $1 where id = $2`, [body.role, who.id]);
      await record({ kind: "password_reset", actorId: me.id, actorEmail: me.email, subjectId: who.id, subjectEmail: who.email, detail: `role changed ${who.role} → ${body.role} (team page)` });
      return NextResponse.json({ ok: true, message: `${who.name || who.email} is now ${ROLE_LABEL[asRole(body.role)]}.` });
    }

    case "add":
    case "resend": {
      const email = (body.email ?? "").trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email)) return bad("That doesn't look like an email address.");
      if (await findUserByEmail(email)) return bad(`${email} already has an account. Send them a password reset instead.`, 409);
      const role = body.action === "add" ? body.role : (await invites().catch(() => [])).find((i) => i.email.toLowerCase() === email)?.role ?? "agent";
      if (!teamRole(role)) return bad("That role can't be given from here.");
      const name = (body.name ?? "").trim();
      if (body.action === "add" && name.length < 2) return bad("Add their name.");
      /* The invite IS the allowlist: without this row the link is refused. */
      await addInvite({ email, name: name || undefined, role, by: me.email });
      await saveLaunchRow({ email, name: name || undefined, role, by: me.email });
      let token: string;
      try {
        ({ token } = await startVerification(email, "join", { keepOthers: true, ttlMs: LAUNCH_LINK_DAYS * 24 * 60 * 60 * 1000 }));
      } catch (e) {
        const error = publicError(e);
        await markLaunchSent(email, error);
        return bad(error);
      }
      try {
        const mail = launchInviteEmail(`${origin(req)}/join?token=${encodeURIComponent(token)}`, {
          firstName: name.split(/\s+/)[0] || undefined,
          tourUrl: TOUR_URL,
          days: LAUNCH_LINK_DAYS,
        });
        await sendEmail({ to: email, subject: mail.subject, html: mail.html, text: mail.text });
        await retireOtherLinks(email, "join", token);
        await markInviteSent(email);
        await markLaunchSent(email, null);
      } catch (e) {
        await dropLink(token).catch(() => null);
        const error = publicError(e);
        await markLaunchSent(email, error);
        return bad(error, 502);
      }
      await record({ kind: "password_reset", actorId: me.id, actorEmail: me.email, subjectEmail: email, detail: `${body.action === "add" ? "invited" : "invite sent again"} as ${role} from the team page` });
      return NextResponse.json({ ok: true, message: `Invite sent to ${email}. Their link lasts ${LAUNCH_LINK_DAYS} days.` });
    }

    default:
      return bad("Nothing to do.");
  }
}
