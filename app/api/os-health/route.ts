import { NextResponse } from "next/server";
import { hasDb, q } from "@/lib/db";
import { resendConfigured, resendSendUnlocked, fromAddress } from "@/lib/resend";
import { docusealConfigured, docusealSendUnlocked } from "@/lib/docuseal";
import { rexConfigured, rexWritesLocked } from "@/lib/rex";
import { internalDomains, FOUNDING_OWNERS } from "@/lib/email-policy";
import { findUserByEmail } from "@/lib/users";

/**
 * What is actually switched on.
 *
 * ── Why this had to exist ─────────────────────────────────────────────────
 *
 * James set the Resend variables on Railway, went to /join, pressed the
 * button, and nothing arrived. Neither of us could say why, because /start
 * gives every caller the same answer on purpose — that is right for a
 * stranger and useless for the person who owns the system.
 *
 * The diagnosis took a round trip and a guess. It should have taken a page.
 *
 * ── What it says, and what it must never say ──────────────────────────────
 *
 * Booleans and names ONLY. Never a key, never a token, never a connection
 * string, not even a masked one — a masked secret is still a length and a
 * prefix, and this endpoint's whole job is to be safe to look at while
 * somebody is on the phone.
 *
 * `from` is included because it is the visible From line of an email, which
 * is public by definition, and getting it wrong is the single most likely
 * cause of a 403 at send time.
 *
 * ── Behind the office code, deliberately ──────────────────────────────────
 *
 * NOT exempted in middleware. It needs the access code, which is the right
 * bar: it tells you what is armed, which is exactly the map you would want if
 * you were poking at the place. It cannot require a signed-in session,
 * because the reason you are reading it is usually that nobody can sign in.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function foundingState(): Promise<Array<{ email: string; registered: boolean }>> {
  if (!hasDb()) return FOUNDING_OWNERS.map((email) => ({ email, registered: false }));
  const out = [];
  for (const email of FOUNDING_OWNERS) {
    out.push({ email, registered: Boolean(await findUserByEmail(email)) });
  }
  return out;
}

export async function GET() {
  let db: { connected: boolean; verificationsPending: number | null; users: number | null } = {
    connected: false,
    verificationsPending: null,
    users: null,
  };
  if (hasDb()) {
    try {
      const u = await q<{ n: string }>(`select count(*)::text as n from os_users`);
      const v = await q<{ n: string }>(
        `select count(*)::text as n from os_email_verifications where expires_at > now()`
      );
      db = {
        connected: true,
        users: Number(u[0]?.n ?? 0),
        verificationsPending: Number(v[0]?.n ?? 0),
      };
    } catch (e) {
      return NextResponse.json({
        db: { connected: false, error: (e as Error).message.slice(0, 200) },
      });
    }
  }

  const resendOn = resendConfigured();
  const canSend = resendSendUnlocked();

  return NextResponse.json({
    db,
    resend: {
      configured: resendOn,
      canSend,
      from: fromAddress(),
      /* The exact sentence for the exact state, so nobody has to interpret
         two booleans while a colleague waits for a link. */
      verdict: !resendOn
        ? "Not connected — RESEND_API_KEY and RESEND_FROM are both needed."
        : !canSend
          ? 'Connected, but SENDING IS LOCKED. No email will leave. Set RESEND_ALLOW_SEND="yes" to unlock.'
          : "Connected and unlocked — email will send.",
    },
    emailPolicy: {
      internalDomains: internalDomains(),
      /* Whether each founding address already has an account — because
         "users: 1" tells you somebody registered and not who, and /join
         silently refuses an address that already exists. Without this, an
         owner who cannot get a link has no way to tell "sending is locked"
         from "you already have an account, go and sign in". Two very
         different problems with the same symptom.

         Booleans against two addresses James supplied himself. No names, no
         hashes, no third party. */
      founding: await foundingState(),
      note: "This domain emails colleagues only. Client email needs the public sending domain.",
    },
    rex: { configured: rexConfigured(), writesLocked: rexWritesLocked() },
    docuseal: { configured: docusealConfigured(), canSend: docusealSendUnlocked() },
  });
}
