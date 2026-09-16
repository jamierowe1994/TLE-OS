import "server-only";
import { hasDb, q } from "@/lib/db";
import { freshnessOf } from "@/lib/staleness";

/**
 * SAVE WHAT REX SERVES AS IT GOES PAST - people (16 Sep 2026).
 *
 * James, 13 Sep: not a bulk copy of REX. "Anything a screen or a search
 * already pulls gets written to our own table with its REX id and when it was
 * read. Screens then read ours first and go to REX only when it is missing or
 * stale." This is the first one, and people are the right first one because
 * they are where the waiting is: measured on the live account, REX answers a
 * contact search in 2.8 seconds for "rowe" and 6.0 for "smith", against 221ms
 * for a listing.
 *
 * So the deal is simple. Every time somebody presses "look in REX" and REX
 * answers, the people it returned are remembered here. The next person to type
 * that name - or the same person ten minutes later - gets them instantly from
 * our own table, while REX is asked again behind the screen for anyone new.
 *
 * ── What it deliberately does NOT do ──────────────────────────────────────
 *
 * It does not create leads, contacts or tenants. What a pulled person should
 * BECOME is a decision nobody has made (tracker n06), and half-formed records
 * on the leads board are worse than a slow search. This is a memory of having
 * looked, nothing more: id, name, and how to reach them.
 *
 * ── Age is the only thing that makes it safe ──────────────────────────────
 *
 * Every row carries when it was read, and lib/staleness says what may be done
 * with a copy of that age: a contact is believed for three days, shown with
 * its age for a fortnight, and after that not shown at all. A fourteen-day-old
 * phone number is worse than admitting we do not have one, so it is dropped
 * rather than drawn.
 */

export interface RememberedPerson {
  id: string;
  name: string;
  email: string;
  phone: string;
  /** When we last read them out of REX. */
  readAt: string;
  /** "just now", "2 days ago" - shown when the copy is past its window. */
  age: string | null;
}

interface RememberedRow extends Record<string, unknown> {
  rex_id: string;
  name: string;
  email: string;
  phone: string;
  read_at: Date;
}

/** Keep what REX just told us. Never throws: a search must not fail because we could not remember it. */
export async function rememberPeople(
  people: { id: string; name: string; email?: string; phone?: string }[]
): Promise<number> {
  if (!hasDb() || people.length === 0) return 0;
  const rows = people.filter((p) => p.id && p.name);
  if (!rows.length) return 0;
  try {
    /* One statement for the lot: a search returns eight, and eight round trips
       to our own database to record a read is a worse deal than the read. */
    await q(
      `INSERT INTO os_rex_people (rex_id, name, email, phone, read_at, first_read_at)
       SELECT * FROM UNNEST($1::text[], $2::text[], $3::text[], $4::text[]) AS t(rex_id, name, email, phone),
              LATERAL (SELECT NOW(), NOW()) AS n(read_at, first_read_at)
       ON CONFLICT (rex_id) DO UPDATE
         SET name = EXCLUDED.name, email = EXCLUDED.email, phone = EXCLUDED.phone, read_at = NOW()`,
      [rows.map((p) => p.id), rows.map((p) => p.name), rows.map((p) => p.email ?? ""), rows.map((p) => p.phone ?? "")]
    );
    return rows.length;
  } catch {
    return 0;
  }
}

/**
 * Who we already know about, for a name somebody is typing.
 *
 * Answers from our own table only - this is the instant half. Anything too old
 * to show is left out rather than drawn with a caveat, because the caveat on a
 * phone number is not read by whoever is dialling it.
 */
export async function peopleLike(needle: string, limit = 6): Promise<RememberedPerson[]> {
  const term = needle.trim();
  if (!hasDb() || term.length < 3) return [];
  const digits = term.replace(/\D/g, "");
  try {
    const rows = await q<RememberedRow>(
      `SELECT rex_id, name, email, phone, read_at
         FROM os_rex_people
        WHERE lower(name) LIKE $1
           OR lower(email) LIKE $1
           OR ($2 <> '' AND regexp_replace(phone, '\\D', '', 'g') LIKE $3)
        ORDER BY read_at DESC
        LIMIT $4`,
      [`%${term.toLowerCase()}%`, digits.length >= 5 ? digits : "", `%${digits}%`, Math.min(Math.max(limit, 1), 20)]
    );
    const out: RememberedPerson[] = [];
    for (const r of rows) {
      const f = freshnessOf("contact", r.read_at);
      if (!f.show) continue;
      out.push({
        id: r.rex_id,
        name: r.name,
        email: r.email,
        phone: r.phone,
        readAt: new Date(r.read_at).toISOString(),
        age: f.state === "fresh" ? null : f.asAt,
      });
    }
    return out;
  } catch {
    return [];
  }
}

/** How many people we have remembered, and how old the oldest usable one is. */
export async function rememberedCount(): Promise<{ people: number; oldestReadAt: string | null }> {
  if (!hasDb()) return { people: 0, oldestReadAt: null };
  const rows = await q<{ n: string; oldest: Date | null }>(
    `SELECT count(*)::text AS n, min(read_at) AS oldest FROM os_rex_people`
  ).catch(() => []);
  return { people: Number(rows[0]?.n ?? 0), oldestReadAt: rows[0]?.oldest ? new Date(rows[0].oldest).toISOString() : null };
}
