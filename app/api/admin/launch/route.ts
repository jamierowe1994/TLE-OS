import { NextRequest, NextResponse } from "next/server";
import { publicError } from "@/lib/public-error";
import { requireCapability, requireOwner } from "@/lib/admin";
import { asRole } from "@/lib/roles";
import { addInvite, markInviteSent } from "@/lib/pilot";
import { findUserByEmail } from "@/lib/users";
import { dropLink, retireOtherLinks, startVerification } from "@/lib/verification";
import { launchInviteEmail } from "@/lib/email/launch-email";
import { sendEmail } from "@/lib/resend";
import { record } from "@/lib/audit";
import {
  LAUNCH_LINK_DAYS, TOUR_URL, launchBoard, launchState, markLaunchSent, markLaunched,
  removeLaunchRow, saveLaunchRow,
} from "@/lib/launch";

/**
 * Admin > Launch (James, 12 Oct 2026). See lib/launch for the why.
 *
 * Reading is `see:prelaunch`, like the Pre-launch tab beside it. Every write
 * is requireOwner: this route emails the whole company.
 *
 * The Launch button does NOT send thirty emails in one request. The page
 * calls `send` once per person, in turn, and shows the count going up. One
 * slow or refused address cannot hold the rest hostage, nothing times out,
 * and if the tab is closed half way the rest simply show "not sent yet" with
 * the button offering to finish the job.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const origin = (req: NextRequest) => process.env.OS_ORIGIN?.replace(/\/+$/, "") || req.nextUrl.origin;

export async function GET(req: NextRequest) {
  if (!(await requireCapability(req, "see:prelaunch"))) {
    return new NextResponse(null, { status: 404 });
  }

  /* The email exactly as it goes, for the preview on the page. The link in it
     goes nowhere: a real one is a credential and is only ever minted to send. */
  if (req.nextUrl.searchParams.get("preview") === "1") {
    const mail = launchInviteEmail(`${origin(req)}/join?token=preview`, {
      firstName: "Sam", tourUrl: TOUR_URL, days: LAUNCH_LINK_DAYS,
    });
    return new NextResponse(mail.html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
    });
  }

  try {
    const [board, state] = await Promise.all([launchBoard(), launchState()]);
    return NextResponse.json({
      ok: true,
      ...board,
      launchedAt: state.launchedAt,
      tourUrl: TOUR_URL,
      linkDays: LAUNCH_LINK_DAYS,
    }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const owner = await requireOwner(req);
  if (!owner) return new NextResponse(null, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as {
    action?: string; email?: string; name?: string; role?: string;
    rexId?: string | null; included?: boolean;
  };
  const email = (body.email ?? "").trim().toLowerCase();

  switch (body.action) {
    case "toggle":
      if (!email) return bad("Which person?");
      await saveLaunchRow({ email, name: body.name, excluded: body.included === false, by: owner.email });
      return NextResponse.json({ ok: true });

    case "role":
      if (!email) return bad("Which person?");
      await saveLaunchRow({ email, name: body.name, role: asRole(body.role), by: owner.email });
      return NextResponse.json({ ok: true });

    case "add": {
      if (!email.includes("@")) return bad("That doesn't look like an email address.");
      if (await findUserByEmail(email)) return bad(`${email} already has an account.`);
      await saveLaunchRow({
        email, name: body.name, role: asRole(body.role), excluded: false, custom: true, by: owner.email,
      });
      return NextResponse.json({ ok: true, message: `${body.name?.trim() || email} added to the launch list.` });
    }

    case "remove":
      if (!email) return bad("Which person?");
      await removeLaunchRow(email);
      return NextResponse.json({ ok: true });

    case "test": {
      /* The launch email to yourself, with a link that goes nowhere. */
      try {
        const mail = launchInviteEmail(`${origin(req)}/sign-in`, {
          firstName: owner.name.trim().split(/\s+/)[0], tourUrl: TOUR_URL, days: LAUNCH_LINK_DAYS,
        });
        await sendEmail({ to: owner.email, subject: `[Test] ${mail.subject}`, html: mail.html, text: mail.text });
        return NextResponse.json({ ok: true, message: `Test sent to ${owner.email}. Its button goes to sign-in, not a real invite.` });
      } catch (e) {
        return NextResponse.json({ ok: false, error: publicError(e) }, { status: 502 });
      }
    }

    case "send":
      return send(req, owner, email, body);

    default:
      return bad("Nothing to do.");
  }
}

function bad(error: string) {
  return NextResponse.json({ ok: false, error }, { status: 400 });
}

/**
 * One person's launch invite. The same order as the pilot's Reissue: the new
 * link is minted beside the old, the email goes, and only then does the old
 * link die - so a failed send never leaves anybody with nothing that works.
 */
async function send(
  req: NextRequest,
  owner: { id: string; email: string },
  email: string,
  body: { name?: string; role?: string; rexId?: string | null }
) {
  if (!email) return bad("Which person?");
  if (await findUserByEmail(email)) {
    return NextResponse.json({ ok: false, error: "Already has an account." }, { status: 409 });
  }
  const role = asRole(body.role);
  /* The invite IS the allowlist: without this row the link would be refused. */
  await addInvite({ email, name: body.name, rexUserId: body.rexId ?? null, role, by: owner.email });
  await saveLaunchRow({ email, name: body.name, role, by: owner.email });

  let token: string;
  try {
    ({ token } = await startVerification(email, "join", {
      keepOthers: true, ttlMs: LAUNCH_LINK_DAYS * 24 * 60 * 60 * 1000,
    }));
  } catch (e) {
    const error = publicError(e);
    await markLaunchSent(email, error);
    return NextResponse.json({ ok: false, error }, { status: 400 });
  }
  try {
    const mail = launchInviteEmail(`${origin(req)}/join?token=${encodeURIComponent(token)}`, {
      firstName: (body.name ?? "").trim().split(/\s+/)[0] || undefined,
      tourUrl: TOUR_URL,
      days: LAUNCH_LINK_DAYS,
    });
    await sendEmail({ to: email, subject: mail.subject, html: mail.html, text: mail.text });
    await retireOtherLinks(email, "join", token);
    await markInviteSent(email);
    await markLaunchSent(email, null);
    await markLaunched(owner.email);
    await record({
      kind: "password_reset",
      actorId: owner.id, actorEmail: owner.email, subjectEmail: email,
      detail: "launch invite sent",
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    await dropLink(token).catch(() => null);
    const error = publicError(e);
    await markLaunchSent(email, error);
    return NextResponse.json({ ok: false, error }, { status: 502 });
  }
}
