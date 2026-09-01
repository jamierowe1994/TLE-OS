import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { requireCapability } from "@/lib/admin";
import { fetchTleRoster, tegHubConfigured } from "@/lib/business/teg-hub";
import type { TegTeamMember } from "@/lib/business/teg-hub";
import { storeTegPeople, tegLastSync, listTegPeople } from "@/lib/teg-people";
import type { TegPerson } from "@/lib/teg-people";

/**
 * Pull the TLE roster out of the TEG Team Hub. The thing the ping hits.
 *
 * POST /api/teg/sync  → pulls and stores; returns what it found and what's blank
 * GET  /api/teg/sync  → what we currently hold, and when it last ran
 *
 * James, 28 Aug: "I'll set up a ping so every time it pings, it will then get
 * that, and then we'll also have headshots added as well."
 *
 * ── Why the whole roster, every time ──────────────────────────────────────
 *
 * Fifty-odd people is one HTTP call. An incremental sync would need a reliable
 * "changed since" field on the Hub, and would break silently the first time
 * someone edited a record without touching it. Pull the lot; it costs nothing
 * and cannot drift.
 *
 * ── Blank is a normal answer, not a failure ───────────────────────────────
 *
 * Most bios are empty today and every TLE headshot is, because James is
 * writing and uploading them by hand. So the response counts what is filled
 * rather than just saying "ok" — the point of pinging this repeatedly is to
 * watch those numbers climb, and a bare success tells you nothing about
 * whether the last hour of typing actually landed.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

/** A cron key or a signed-in admin. Constant-time, so the key can't be guessed
 *  a character at a time. */
async function authorised(req: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET ?? "";
  const given = req.headers.get("x-cron-secret") ?? "";
  if (secret && given) {
    const a = Buffer.from(secret);
    const b = Buffer.from(given);
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  }
  return Boolean(await requireCapability(req, "see:people"));
}

const str = (v: unknown): string | null => {
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number") return String(v);
  return null;
};

/** One Hub record → one stored row. Returns null when there is no email: it is
 *  our primary key and the only field the Hub declares unique. */
function toPerson(m: TegTeamMember): Omit<TegPerson, "syncedAt"> | null {
  const email = str(m.email);
  if (!email) return null;
  return {
    email,
    /* rex_id arrives as a NUMBER from the Hub and is stored as TEXT here, to
       match os_users.rex_user_id — which is also TEXT. */
    rexId: str(m.rex_id),
    name: [str(m.first_name), str(m.last_name)].filter(Boolean).join(" ") || null,
    jobTitle: str(m.job_title),
    personType: str(m.person_type),
    partnerPackage: str(m.partner_package),
    bio: str(m.bio),
    photoUrl: str(m.photo_url),
    /* Free text, and typed by hand over years — multi-line, trailing commas,
       the odd lone ".". Whitespace is squashed so it can be geocoded and shown
       on one line; anything that is plainly not an address ("." on one record)
       is dropped rather than offered to somebody as their home. */
    homeAddress: (() => {
      const raw = str(m.home_address);
      if (!raw) return null;
      const tidied = raw.replace(/\s*\n\s*/g, ", ").replace(/\s{2,}/g, " ").trim();
      return tidied.replace(/[^A-Za-z0-9]/g, "").length < 6 ? null : tidied;
    })(),
    /* `status` is blank or null on real records (Kiran, Tiffany, Kirstie), and
       it disagrees with `active` — Costin, Margo and Amanda are all
       status "Departed" with active true. Both are kept so a reader can decide;
       neither alone is trustworthy. */
    status: str(m.status) ?? (m.active === false ? "Inactive" : null),
  };
}

export async function GET(req: NextRequest) {
  if (!(await requireCapability(req, "see:people"))) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const [people, lastSync] = await Promise.all([listTegPeople(), tegLastSync()]);
  return NextResponse.json({
    configured: tegHubConfigured(),
    lastSync,
    held: people.length,
    withBio: people.filter((p) => p.bio).length,
    withPhoto: people.filter((p) => p.photoUrl).length,
    withPackage: people.filter((p) => p.partnerPackage).length,
  });
}

export async function POST(req: NextRequest) {
  if (!(await authorised(req))) {
    return NextResponse.json({ ok: false, error: "Not allowed." }, { status: 403 });
  }

  if (!tegHubConfigured()) {
    return NextResponse.json(
      { ok: false, error: "TEG_HUB_API_SECRET isn't set — nothing to pull from." },
      { status: 503 }
    );
  }

  let people: Array<Omit<TegPerson, "syncedAt">>;
  try {
    const roster = await fetchTleRoster();
    people = roster
      .map(toPerson)
      .filter((p): p is Omit<TegPerson, "syncedAt"> => p !== null);
  } catch (e) {
    /* Said out loud rather than swallowed. A sync that fails quietly leaves
       yesterday's register in place looking perfectly healthy, and the whole
       reason for pinging is to know it is current. */
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Couldn't reach the TEG Hub." },
      { status: 502 }
    );
  }

  if (!people.length) {
    return NextResponse.json({
      ok: false,
      error:
        "The Hub answered with nobody. Not stored — an empty register would wipe the bios we already hold.",
      hint: "Check TEG_HUB_API_BASE / TEG_HUB_API_SECRET, and that the brand id still matches.",
    });
  }

  const written = await storeTegPeople(people);

  /* Which fields are still to be filled. This is the actual progress bar for
     James's evening of typing, so it names the people rather than counting
     them — "37 without a bio" is a number, "Lorna, Tiffany, Nigel…" is a list
     you can work through. */
  const missingBio = people.filter((p) => !p.bio).map((p) => p.name ?? p.email);
  const missingPhoto = people.filter((p) => !p.photoUrl).map((p) => p.name ?? p.email);
  const missingPackage = people
    .filter((p) => !p.partnerPackage && p.personType !== "Support Team")
    .map((p) => p.name ?? p.email);

  /* The same NAME on two rows means two records with two different emails —
     our key is the email, so a duplicate person survives de-duplication and
     the join can land on whichever of the two it meets first. If one has the
     bio and the other doesn't, that is a coin toss on a landlord-facing page.
     Surfaced here because the Hub is where it has to be merged; nothing this
     end can fix it. */
  const byName = new Map<string, number>();
  for (const p of people) {
    const n = (p.name ?? p.email).trim().toLowerCase();
    byName.set(n, (byName.get(n) ?? 0) + 1);
  }
  const duplicated = people
    .filter((p) => (byName.get((p.name ?? p.email).trim().toLowerCase()) ?? 0) > 1)
    .map((p) => `${p.name ?? "?"} <${p.email}>`)
    .sort();

  return NextResponse.json({
    ok: true,
    pulled: people.length,
    written,
    withBio: people.length - missingBio.length,
    withPhoto: people.length - missingPhoto.length,
    /* Counted directly, NOT as (total - missing). missingPackage deliberately
       excludes Support Team, who correctly have no package — so subtracting it
       from the total counted those people as HAVING one and overstated the
       figure. Exactly the arithmetic this dashboard has been punished for
       elsewhere: a number that looks like an answer and is measuring
       something else. */
    withPackage: people.filter((p) => p.partnerPackage).length,
    supportTeam: people.filter((p) => p.personType === "Support Team").length,
    duplicated,
    missingBio,
    missingPhoto,
    /* Support Team excluded: a package is a partner's commercial tier and they
       correctly don't have one, so listing them as "missing" would be noise
       that never goes away. */
    missingPackage,
  });
}
