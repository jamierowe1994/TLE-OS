import { NextResponse } from "next/server";
import { rexCall, rexConfigured, rexRows } from "@/lib/rex";
import {
  scoreAll,
  worthSearching,
  normalisePhone,
  type ContactCandidate,
  type Facet,
} from "@/lib/contact-match";

/**
 * "Is this person already in REX?" — asked while somebody types.
 *
 * Read-only. Three narrow searches rather than one broad one, because the book
 * is far too big to scan and each identifier finds a duplicate the others
 * miss: the same person often appears once under a work email and once under a
 * mobile, with the name spelled differently in each.
 *
 *   email   — exact, and REX matches it case-insensitively
 *   mobile  — LIKE on the last nine digits, so "+44 7712 345678" finds
 *             "07712 345678"; matching the string as typed finds neither
 *   surname — LIKE, to catch the ones with no email or phone on file
 *
 * The results are unioned, then scored in lib/contact-match.ts. Scoring is
 * kept out of here so it can be reasoned about — and tested — without a
 * network.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PER_SEARCH = 25;

interface RexContact extends Record<string, unknown> {
  id?: string | number;
  name?: string | null;
  name_first?: string | null;
  name_last?: string | null;
  email_address?: string | null;
  phone_number?: string | null;
  address?: string | null;
  address_postal?: string | null;
  type?: string | null;
}

function toCandidate(c: RexContact, foundBy: Facet): ContactCandidate {
  const name =
    (c.name && String(c.name).trim()) ||
    [c.name_first, c.name_last].filter(Boolean).join(" ").trim() ||
    "Unnamed contact";
  return {
    id: String(c.id ?? ""),
    name,
    email: c.email_address ? String(c.email_address) : null,
    mobile: c.phone_number ? String(c.phone_number) : null,
    address: (c.address ?? c.address_postal) ? String(c.address ?? c.address_postal) : null,
    foundBy: [foundBy],
  };
}

export async function POST(req: Request) {
  if (!rexConfigured()) {
    return NextResponse.json({ configured: false, matches: [] });
  }

  let body: { name?: string; email?: string; mobile?: string; address?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON." }, { status: 400 });
  }

  const enquirer = {
    name: body.name?.trim() ?? "",
    email: body.email?.trim() ?? "",
    mobile: body.mobile?.trim() ?? "",
    address: body.address?.trim() ?? "",
  };
  if (!worthSearching(enquirer)) {
    return NextResponse.json({ configured: true, searched: false, matches: [] });
  }

  const surname = enquirer.name.split(/\s+/).filter(Boolean).slice(-1)[0] ?? "";
  const tail = normalisePhone(enquirer.mobile);

  const searches: { facet: Facet; criteria: Record<string, unknown>[] }[] = [];
  if (enquirer.email) {
    searches.push({ facet: "email", criteria: [{ name: "contact.email_address", type: "=", value: enquirer.email }] });
  }
  if (tail) {
    searches.push({ facet: "mobile", criteria: [{ name: "contact.phone_number", type: "like", value: `%${tail}%` }] });
  }
  if (surname.length >= 2) {
    searches.push({ facet: "name", criteria: [{ name: "contact.name_last", type: "like", value: `${surname}%` }] });
  }

  const found = new Map<string, ContactCandidate>();
  const failures: string[] = [];

  const results = await Promise.all(
    searches.map(async ({ facet, criteria }) => {
      try {
        const res = await rexCall("Contacts", "search", { criteria, limit: PER_SEARCH });
        if (!res.ok) return { facet, rows: [] as RexContact[], error: res.error };
        return { facet, rows: rexRows(res.result) as RexContact[], error: null };
      } catch (e) {
        return { facet, rows: [] as RexContact[], error: e instanceof Error ? e.message : "failed" };
      }
    })
  );

  for (const r of results) {
    if (r.error) failures.push(`${r.facet}: ${r.error}`);
    for (const row of r.rows) {
      const cand = toCandidate(row, r.facet);
      if (!cand.id) continue;
      const seen = found.get(cand.id);
      // The same contact surfacing on two identifiers is a stronger signal,
      // not a duplicate result — keep both reasons.
      if (seen) seen.foundBy = [...new Set([...seen.foundBy, r.facet])];
      else found.set(cand.id, cand);
    }
  }

  const matches = scoreAll(enquirer, [...found.values()]);
  return NextResponse.json({
    configured: true,
    searched: true,
    scanned: found.size,
    matches: matches.slice(0, 8),
    exact: matches.filter((m) => m.score === 100).length,
    // A search that failed is not the same as a person who isn't there.
    partial: failures.length ? failures : undefined,
  });
}
