import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/admin";
import { allAgents } from "@/lib/rex-agents";
import { rexAccountId, rexCall, rexConfigured } from "@/lib/rex";

/**
 * "What does REX actually hold for this person?"
 *
 * GET /api/admin/rex-user?email=someone@…
 *
 * Built 19 Oct 2026, after Rovena Buci and Ed Westwood both spent a morning
 * being refused by the OS with credentials that sign them in to REX's own
 * website. REX answers every refusal with the same sentence - "Username or
 * password not valid." - whether the password is wrong, the username is not
 * one it knows, or the user is not allowed into the account we ask for, so
 * the refusal itself cannot tell the three apart. This can: it asks REX, as
 * the office account, what it holds for that address.
 *
 * What the answer means:
 *   found: false            REX has no user with that address ON THE ACCOUNT
 *                           we log in to. Their sign-in is a different
 *                           address, or a different account.
 *   found, active: false    The user exists and is switched off. A correct
 *                           password is refused, by design.
 *   found, active: true     REX knows them and they are live, so the refusal
 *                           is the password - or our own account_id, which is
 *                           why `accountId` and `accounts` are reported too.
 *
 * Read-only, and owner-gated by the same capability as the rest of the
 * business reads: this names real people and which account they are on.
 * Never takes or returns a password.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!(await requireCapability(req, "see:business"))) {
    return NextResponse.json({ ok: false, error: "Unauthorised" }, { status: 401 });
  }
  if (!rexConfigured()) {
    return NextResponse.json({ ok: false, error: "REX isn't configured on this environment." }, { status: 503 });
  }

  const email = (req.nextUrl.searchParams.get("email") ?? "").trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ ok: false, error: "Pass ?email= the address they are typing." }, { status: 400 });
  }

  /* The office account's own view of the world, so the answer carries the
     account we pin every login to and every account that login can reach.
     getAccessibleAccounts works without an account_id, which is what makes it
     usable as a check on the one we chose. */
  const reachable = await rexCall("UserProfile", "getAccessibleAccounts", {}).catch(() => null);
  const accounts = Array.isArray(reachable?.result)
    ? (reachable!.result as Array<Record<string, unknown>>).map((a) => ({
        id: String(a.id ?? a.account_id ?? a.value ?? ""),
        name: (a.name as string) ?? (a.account_name as string) ?? null,
      }))
    : [];

  /* allAgents walks AccountUsers in pages of 100 - REX returns zero rows for
     a limit above that rather than an error - and is cached for half an hour,
     which is fine here: a user's status does not change while somebody is on
     the phone about it. */
  const everyone = await allAgents();
  const found = everyone.find((a) => a.email === email) ?? null;

  /* Near misses are the point of this route as much as the hit is: the two
     domains are the reason this keeps happening, so a same-name user on the
     other one is the likely answer and is shown rather than left to be
     guessed at. */
  const localPart = email.split("@")[0] ?? "";
  const surname = localPart.split(/[._-]/).pop() ?? "";
  const nearby = everyone
    .filter((a) => a.email !== email && surname.length > 2 && (a.email.includes(surname) || a.name.toLowerCase().includes(surname)))
    .map((a) => ({ name: a.name, email: a.email, active: a.active }));

  /* ?raw=1: the whole AccountUsers row for that person.
     Both of them came back found and active on the right account, which rules
     out everything the fields above can rule out and leaves "the password the
     website takes is not one the API will take" - two-factor, or a sign-in
     button rather than a password. Whatever REX records about that is on the
     row, and guessing field names from the outside is slower than reading it. */
  let raw: unknown = undefined;
  if (req.nextUrl.searchParams.get("raw") === "1" && found) {
    const one = await rexCall("AccountUsers", "search", {
      criteria: [{ name: "id", value: Number(found.id) }],
      limit: 1,
    }).catch(() => null);
    const rows = Array.isArray(one?.result)
      ? one!.result
      : ((one?.result as { rows?: unknown[] } | undefined)?.rows ?? []);
    raw = Array.isArray(rows) ? rows[0] ?? null : null;
  }

  return NextResponse.json(
    {
      ok: true,
      email,
      ...(raw === undefined ? {} : { raw }),
      accountId: rexAccountId(),
      accounts,
      usersOnAccount: everyone.length,
      found: found ? { id: found.id, name: found.name, email: found.email, active: found.active, title: found.title } : null,
      nearby,
    },
    { headers: { "cache-control": "private, no-store" } }
  );
}
