import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { scopeFor } from "@/lib/scope";
import { bookFor } from "@/lib/listings-cache";
import { rexCall, rexConfigured, rexRows } from "@/lib/rex";
import { rexContactUrl } from "@/lib/business/rex-links";

/**
 * GET /api/search/rex?q=… → properties REX has and the OS does not.
 *
 * ── Why this is separate from /api/search ─────────────────────────────────
 *
 * The search bar answers from our own copies and never walks REX on a
 * keystroke, which is what makes it instant. This is the second half, and it
 * is asked for BY A BUTTON rather than by typing, because it costs a REX
 * round trip.
 *
 * James, 15 Sep 2026: rather than copying REX wholesale, let somebody search
 * it, and pull a record in when they click one. The data then arrives a
 * record at a time, driven by what people actually look for.
 *
 * ── Property is quick, people are slow, and that is a screen problem ──────
 *
 * Measured against the live account, 15 Sep 2026: REX answers a listing
 * search in 221-426ms and a contact search in 2.8s for "rowe" and 6.0s for
 * "smith" - slower the commoner the name.
 *
 * James, 15 Sep, on what to do about it: "it's not necessarily the length,
 * it's the information, so it feels like it's stuck. If we say checking,
 * pulling records from REX, and then give a spinning icon, people will be
 * more than happy to wait." So both are asked for together and the screen
 * says what it is waiting on. The two run in parallel: the listings answer
 * first and are not held up by the contacts.
 *
 * A person is returned to be READ, with a link into REX. What a pulled person
 * should BECOME in the OS - a lead, a tenant, a landlord - is a decision
 * nobody has made, and inventing one here would put half-formed records on
 * the leads board. A property has an obvious answer and does get a button.
 *
 * ── The scoping trap, and why there are two calls ─────────────────────────
 *
 * REX's Listings.autocomplete takes search_string, listing_states, limit and
 * return_viewstate. There is NO agent filter, so it answers for the whole
 * agency - and a search box that quietly returns another agent's stock is a
 * way round scoping, not a feature.
 *
 * So the shortlist it returns is handed straight back to REX in a second
 * call, this time WITH the agent criterion, and only what survives that is
 * shown. The filtering is REX's own, on REX's side, rather than us trusting a
 * field in an autocomplete row. One extra call, about 300ms, and it cannot be
 * got wrong by reading the wrong property off a row.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export interface RexHit {
  /** REX's listing id. */
  id: string;
  address: string;
  /** current / leased / withdrawn - REX's own word. */
  state: string;
  /** Why it is not in the OS already, in words an agent can read. */
  why: string;
}

export interface RexPerson {
  id: string;
  name: string;
  /** Whatever REX holds to reach them by - email, then phone. */
  reach: string;
  /** Where to open them in REX itself. */
  href: string;
}

/** Enough to be worth a round trip, few enough to verify in one second call. */
const LIMIT = 12;

/** What REX's state means for a book that holds current and withdrawn rentals. */
function why(state: string): string {
  if (state === "leased") return "Let - the OS book holds what is on the market";
  if (state === "withdrawn") return "Withdrawn in REX";
  if (state === "archived") return "Archived in REX";
  return "Not pulled into the OS yet";
}

export async function GET(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  if (!rexConfigured()) {
    return NextResponse.json({ ok: true, hits: [], note: "REX is not connected on this environment." });
  }

  const needle = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (needle.length < 2) return NextResponse.json({ ok: true, hits: [] });

  const scope = await scopeFor(req);
  /* An agent searches their own book. Somebody with no REX account of their
     own has no book to search at REX, and must not be handed the agency's:
     they get nothing here and their own screens still work. */
  const mine = scope.rexUserId ?? null;
  if (!scope.everything && !mine) {
    return NextResponse.json({ ok: true, hits: [], note: "Link your REX account on Profile to search REX." });
  }

  /* People, started FIRST and read last: it is the slow one (2.8s for a
     common surname, 6.0s for a very common one), so it runs while the
     listings are being found and verified rather than after them. */
  const peopleWork = rexCall("Contacts", "autocomplete", { search_string: needle, limit: 8 }).catch(() => null);

  /* 1. REX's own quick search.

     listing_states matters more than it looks: without it the autocomplete
     answers about CURRENT listings only, which is most of what the OS book
     already holds - so the section came back empty for a let property whose
     address somebody had typed in full (15 Sep 2026). Naming the states is
     what makes this worth having, because a let property is exactly the kind
     of thing an agent remembers and cannot find. */
  const first = await rexCall("Listings", "autocomplete", {
    search_string: needle,
    listing_states: ["current", "leased", "withdrawn"],
    limit: LIMIT,
  }).catch(() => null);
  if (!first?.ok) {
    return NextResponse.json({ ok: true, hits: [], note: "REX did not answer just now." });
  }
  const rows = rexRows(first.result);
  const found = new Map<string, { address: string; state: string }>();
  for (const r of rows) {
    const row = r as Record<string, unknown>;
    const id = String(row.id ?? "");
    if (!id) continue;
    /* Lettings only, the same rule the book has always had - the sales
       business's stock is not this product's, and offering it here would put
       it one press away. */
    const cat = (row.category as { id?: string } | undefined)?.id ?? "";
    if (cat && cat !== "residential_rental") continue;
    found.set(id, {
      address: String(row.address ?? "").trim() || "Address not recorded",
      state: String(row.status ?? "").trim(),
    });
  }
  /* No early return when nothing matched: the people are still coming, and
     returning here skipped them entirely - which is how a search for a
     surname answered "nothing in REX" while REX had ten of them (15 Sep). */

  /* 2. The same ids back to REX, this time scoped. An owner skips it. */
  let allowed = new Set(found.keys());
  if (found.size > 0 && !scope.everything && mine) {
    const check = await rexCall("Listings", "search", {
      criteria: [
        { name: "id", type: "in", value: [...found.keys()] },
        { name: "listing_agent_1_id", value: mine },
      ],
      limit: LIMIT,
    }).catch(() => null);
    if (!check?.ok) {
      return NextResponse.json({ ok: true, hits: [], note: "REX did not answer just now." });
    }
    allowed = new Set(rexRows(check.result).map((r) => String((r as Record<string, unknown>).id ?? "")));
  }

  /* 3. Drop anything the OS already holds - this section is for what is
        MISSING, and a result that just opens a screen they already have is
        noise. The book is the cache the Listings board reads. */
  const book = found.size > 0 ? await bookFor(scope.everything ? null : mine).catch(() => null) : null;
  const held = new Set((book?.listings ?? []).map((l) => String(l.id)));

  const hits: RexHit[] = [];
  for (const [id, r] of found) {
    if (!allowed.has(id) || held.has(id)) continue;
    hits.push({ id, address: r.address, state: r.state, why: why(r.state) });
  }

  /* Now the people. No dedupe against our own contacts: the OS holds a
     handful and REX holds the book, so almost every name would survive it and
     the check would cost more than it saved. */
  const people: RexPerson[] = [];
  const pres = await peopleWork;
  if (pres?.ok) {
    for (const r of rexRows(pres.result)) {
      const row = r as Record<string, unknown>;
      const id = String(row.id ?? "");
      const name = String(row.name ?? "").trim();
      if (!id || !name) continue;
      const email = String(row.email_address ?? "").trim();
      const phone = String(row.phone_number ?? "").trim();
      people.push({ id, name, reach: email || phone || "No email or phone on the record", href: rexContactUrl(id) });
    }
  }

  return NextResponse.json({ ok: true, hits, people });
}
