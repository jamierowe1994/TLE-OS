import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { findUserById } from "@/lib/users";
import { rexTokenFor } from "@/lib/rex-user";
import { isExpiredToken, rexConfigured, RexWriteBlocked } from "@/lib/rex";
import { agentByEmail } from "@/lib/rex-agents";
import { esignTemplates, sendForSignature } from "@/lib/rex-esign";
import { hasDb, q } from "@/lib/db";

/**
 * Send the terms of business for signature.
 *
 * Through REX's own DocuSign connection, so the envelope lands on the REX
 * record and the next person to open that landlord can see it. Sent AS THE
 * AGENT — their REX token, so the request carries their name rather than the
 * office API account's, same rule as the mail merge.
 *
 * Locked. Nothing here has ever fired: `EsignRequests/create` has to be named
 * in REX_ALLOW_WRITES first, and the first send should go to a colleague and
 * be watched, not to a landlord.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!rexConfigured()) {
    return NextResponse.json({ ok: false, error: "REX isn't connected on this environment." }, { status: 503 });
  }

  let body: {
    listingId?: number | string;
    contactId?: number | string;
    templateId?: number;
    subject?: string;
    body?: string;
    ref?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Expected JSON." }, { status: 400 });
  }

  const listingId = Number(body.listingId);
  const contactId = Number(body.contactId);
  const templateId = Number(body.templateId);
  if (!listingId || !contactId || !templateId) {
    return NextResponse.json(
      { ok: false, error: "A listing, a landlord contact and a template are all needed." },
      { status: 400 }
    );
  }

  const userId = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  const me = userId ? await findUserById(userId) : null;
  if (!me) {
    return NextResponse.json(
      { ok: false, error: "Sign in first — terms go out in a named agent's name, never the office's." },
      { status: 401 }
    );
  }

  /* The template names its own signing roles, and one of them is a REX USER.
     So the sender has to exist in REX, not just in the OS. */
  const rexAgent = await agentByEmail(me.email).catch(() => null);
  if (!rexAgent?.id) {
    return NextResponse.json(
      {
        ok: false,
        error: `REX has no user for ${me.email}, so there is nobody to put in the Agent role on the contract.`,
      },
      { status: 400 }
    );
  }

  const template = (await esignTemplates()).find((t) => t.id === templateId);
  if (!template) {
    return NextResponse.json({ ok: false, error: "That isn't one of TLE's templates." }, { status: 400 });
  }

  const connectionId = Number(process.env.REX_ESIGN_CONNECTION_ID ?? 0);
  if (!connectionId) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "REX_ESIGN_CONNECTION_ID isn't set. It is the DocuSign connection on the REX account — TLE's is 2103.",
      },
      { status: 503 }
    );
  }

  try {
    const actor = await rexTokenFor(userId);
    const res = await sendForSignature(
      {
        connectionId,
        templateId,
        listingId,
        landlordContactId: contactId,
        agentUserId: Number(rexAgent.id),
        subject: (body.subject ?? `Your terms of business — The Letting Experts`).trim(),
        body: (body.body ?? "").trim(),
      },
      actor
    );

    if (!res.ok) {
      if (actor && isExpiredToken(res)) {
        return NextResponse.json(
          { ok: false, error: "Your REX sign-in has lapsed — reconnect it in your profile.", reconnect: true },
          { status: 401 }
        );
      }
      return NextResponse.json(
        { ok: false, error: res.error ?? `REX refused it (${res.status}).` },
        { status: 502 }
      );
    }

    const rexId = Number(
      typeof res.result === "object" ? (res.result as { id?: number })?.id : res.result
    );

    /* Start watching it. REX has no e-sign webhook, so completion is noticed
       by polling — and a poll can only say "this just completed" if something
       remembers what it looked like before. */
    if (hasDb() && rexId) {
      await q(
        `INSERT INTO os_esign_watch (rex_id, listing_id, ref, template_name, sent_by, sent_by_id, last_status)
         VALUES ($1,$2,$3,$4,$5,$6,'incomplete')
         ON CONFLICT (rex_id) DO NOTHING`,
        [rexId, listingId, (body.ref ?? "").trim(), template.name, me.name, me.id]
      ).catch(() => []);
    }

    return NextResponse.json({ ok: true, id: rexId, template: template.name });
  } catch (e) {
    if (e instanceof RexWriteBlocked) {
      return NextResponse.json(
        {
          ok: false,
          locked: true,
          error:
            'Sending contracts is locked here. Set REX_ALLOW_WRITES="EsignRequests/create" to unlock it — and send the first one to a colleague, not a landlord.',
        },
        { status: 423 }
      );
    }
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Send failed." },
      { status: 500 }
    );
  }
}
