import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { findUserById } from "@/lib/users";
import { rexCall } from "@/lib/rex";

/**
 * Find a property in REX by address, so a person can pick the right one.
 *
 * ── Why REX's own autocomplete and not a search we build ──────────────────
 *
 * `Properties/search` refuses `adr_postcode` and `system_search_key` outright
 * — "not a permissible or valid search field for Properties" — so there is no
 * criteria-based address search to write. What REX does have is
 * `Properties/autocomplete`, described in its own API as "optimized for auto
 * complete based on address of a property", returning the address and its id.
 *
 * That is better than anything we would have built. The matching is REX's, on
 * REX's data, and what comes back carries the status too — whether the
 * property is already listed, already leased — which is exactly what an agent
 * needs to see before choosing.
 *
 * ── This is a READ, and it stays one ──────────────────────────────────────
 *
 * Nothing here writes. Picking a property only records an id against our own
 * appraisal; REX is untouched until terms are signed, and that write is gated
 * separately.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Hit {
  id?: string;
  address?: string;
  image?: { url?: string } | null;
  status?: {
    primary_status?: { type_text?: string } | null;
    is_current_listing?: boolean;
    has_been_leased?: boolean;
  } | null;
  category?: { text?: string } | null;
}

export async function GET(req: NextRequest) {
  const userId = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  const me = userId ? await findUserById(userId) : null;
  if (!me) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  /* Three characters is where autocomplete stops being a guess. Below it REX
     returns half its book and the agent scrolls a list nobody can choose from. */
  if (q.length < 3) return NextResponse.json({ ok: true, results: [] });

  const res = await rexCall("Properties", "autocomplete", { search_string: q, limit: 8 });
  if (!res.ok) {
    return NextResponse.json({ error: "REX could not be reached." }, { status: 502 });
  }

  /* A no-match comes back as a null result rather than an empty array — an
     empty list is the honest rendering of it, not an error. */
  const rows = (Array.isArray(res.result) ? res.result : []) as Hit[];

  return NextResponse.json({
    ok: true,
    results: rows
      .filter((r) => r.id && r.address)
      .map((r) => ({
        id: String(r.id),
        address: String(r.address),
        image: r.image?.url ? `https:${String(r.image.url).replace(/^https?:/, "")}` : null,
        /* Said plainly, because "already listed" is the thing that should stop
           an agent picking it by accident. */
        status: r.status?.primary_status?.type_text ?? null,
        alreadyListed: Boolean(r.status?.is_current_listing),
        category: r.category?.text ?? null,
      })),
  });
}
