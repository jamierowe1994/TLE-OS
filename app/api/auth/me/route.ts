import { NextRequest, NextResponse } from "next/server";
import { countUsers } from "@/lib/users";
import { hasDb } from "@/lib/db";
import { whoIs } from "@/lib/admin";
import { can } from "@/lib/roles";
import { readViewAs, VIEW_AS_COOKIE } from "@/lib/view-as";

/**
 * Who is this?
 *
 * Returns the SUBJECT as `user` — whoever's data the OS is currently
 * rendering — so every screen that asks "who am I" keeps working unchanged
 * while an owner is viewing as somebody else. That is the point of view-as:
 * the app should not need to know.
 *
 * `actor` and `viewingAs` are carried alongside for the two things that DO
 * need the truth: the red banner, and the admin bar. Admin permission is
 * decided on the actor and never on the subject — see lib/admin.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!hasDb()) {
    return NextResponse.json(
      { ok: true, user: null, anyUsers: false, hasDb: false },
      { headers: { "cache-control": "private, no-store, max-age=0, must-revalidate" } }
    );
  }

  const { actor, subject, viewingAs } = await whoIs(req);
  /* A view-as can target somebody with no OS account, so the banner's name
     comes off the token rather than out of os_users. */
  /* Measured on the live site 29 Aug: this endpoint answered 200 with NO
     cache-control header at all. Cloudflare was not caching it (DYNAMIC), so
     nothing had gone wrong — but the only thing standing between one person's
     identity and another's browser was a CDN's default behaviour, which is not
     a guarantee anybody wrote down. Said explicitly now. */
  const noStore = { "cache-control": "private, no-store, max-age=0, must-revalidate" };
  const va = readViewAs(req.cookies.get(VIEW_AS_COOKIE)?.value);
  /* Only claim it when there is genuinely somebody to be. This used to be
     driven by the cookie alone, so the red banner announced "viewing as
     Kayleigh Wright" while whoIs had quietly fallen back to the owner and
     every figure on the page was his own. A banner that can be wrong about
     whose screen you are looking at is worse than no banner. */
  const impersonating = Boolean(
    actor?.role === "owner" && va && va.ownerId === actor.id && subject
  );
  return NextResponse.json({
    ok: true,
    /* Never null while somebody is signed in. A subject that cannot be
       resolved (REX unreachable, and they have no account) must not read as
       "signed out" and bounce an owner to the sign-in page. They see their own
       screen, as themselves, with no banner claiming otherwise. */
    user: subject ?? actor,
    actor: actor ? { id: actor.id, name: actor.name, email: actor.email, role: actor.role } : null,
    /* Both halves require a resolved subject, so this can never be true while
       the page is showing the owner's own data. */
    viewingAs: Boolean(subject) && (viewingAs || impersonating),
    subject: impersonating
      ? { name: va!.label || subject?.name || "", email: subject?.email ?? "" }
      : viewingAs && subject
        ? { name: subject.name, email: subject.email }
        : null,
    isOwner: actor?.role === "owner",
    /* What the sidebar actually needs: may they open admin at all. Roles beyond
       owner now hold that too — support and developer among them. */
    canAdmin: can(actor?.role, "admin:open"),
    role: actor?.role ?? null,
    anyUsers: (await countUsers()) > 0,
    hasDb: true,
  }, { headers: noStore });
}
