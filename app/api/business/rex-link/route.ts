import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/admin";
import { findById, linkUser, toAdmin } from "@/lib/business/users-store";
import { rexConfigured, rexFindUser } from "@/lib/business/rex";

/**
 * One click: find a partner's REX user id by probing REX for their email, and
 * record it against their portal account.
 *
 * POST { userId } → { linked: true, rexUserId, matchedBy, matchedEmail, user }
 *                 | { linked: false, reason }
 *
 * ── Why this route was worth restoring ────────────────────────────────────
 *
 * The Agents tab has called `/api/business/rex-link` since the port and the
 * route had never existed, so the button 404'd in silence — the client reads
 * `data.reason ?? data.error` off a Next.js 404 page, finds neither, and says
 * "Couldn't find them in REX." Which is a sentence about REX, for a failure
 * that has nothing to do with REX.
 *
 * That matters more than one dead button. An unlinked `rex_user_id` is not a
 * cosmetic gap: it is why a partner's listings, leads and appraisals go
 * missing from Susan's roll-up. The fallback for anyone signup could not link
 * automatically — typically someone added to REX after they signed up — was
 * this button, and it has never once worked.
 *
 * ── The write ─────────────────────────────────────────────────────────────
 *
 * Through `linkUser`, not `updateUser`. `users` belongs to the portal and the
 * OS may only touch its business-mapping columns; see lib/business/db.ts and
 * linkUser's own note. A name-only match is reported as such rather than
 * quietly accepted, because two partners share a first and last name often
 * enough that a silent guess would attach one person's whole book to another.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!(await requireCapability(req, "see:business"))) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  if (!rexConfigured()) {
    /* 200, not an error status: this is a true answer to the question asked,
       and the client renders `reason` rather than a failure. */
    return NextResponse.json({
      linked: false,
      reason: "REX isn't connected on this environment, so there's nothing to look them up in.",
    });
  }

  const body = (await req.json().catch(() => null)) as { userId?: unknown } | null;
  const userId = String(body?.userId ?? "").trim();
  if (!userId) {
    return NextResponse.json({ error: "userId is required." }, { status: 400 });
  }

  const target = await findById(userId);
  if (!target) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  const hit = await rexFindUser(target.email, target.name).catch(() => null);
  if (!hit) {
    return NextResponse.json({
      linked: false,
      reason: `No REX user matched ${target.email} or the name "${target.name}". Check they're in REX, then try again — or paste their AccountUsers id.`,
    });
  }

  const updated = await linkUser(userId, { rexUserId: hit.id });
  return NextResponse.json({
    linked: true,
    rexUserId: hit.id,
    matchedBy: hit.matchedBy,
    matchedEmail: hit.email,
    user: updated ? toAdmin(updated) : null,
  });
}
