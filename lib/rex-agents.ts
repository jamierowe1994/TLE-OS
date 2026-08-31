import { rexCall } from "./rex";
import { absoluteUrl, firstNameOf, type PresentAgent } from "./present";
import { getTegPerson } from "./teg-people";

/**
 * The people, from REX.
 *
 * `AccountUsers/search` carries everything a presentation needs to introduce
 * an agent, in `settings`: profile_image, position, phone_mobile. Measured
 * across all 100 users on the shared account (13 Aug 2026):
 *
 *   • profile_image — set for ~70%, including 10 of the 14 TLE addresses.
 *     The URL is protocol-relative and the CDN is PUBLIC: fetching one with
 *     no Authorization header returns 200 image/jpeg. So a headshot works in
 *     an email, which is the reason it can be used at all.
 *   • position       — set for about a third. "Managing Director", "Property
 *     Expert", "Partner Agent". Dropped when empty rather than defaulted.
 *   • profile_bio    — NULL FOR EVERY SINGLE USER. Not "mostly empty" —
 *     empty. Which is why the deck's biography is written and stored in the
 *     OS instead of read from here. Do not wire it back to REX without
 *     re-measuring: it would ship a blank slide for all of them.
 *
 * The account is shared with five sister businesses, so a caller asking for
 * "the agents" gets TLE's own by email domain — the only reliable divider,
 * same rule the diary uses.
 */

export type RexAgent = {
  id: string;
  name: string;
  email: string;
  title: string;
  phone: string;
  photo: string | null;
  active: boolean;
};

type Row = {
  id?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  user_account_status?: string;
  settings?: {
    position?: string | null;
    phone_mobile?: string | null;
    phone_direct?: string | null;
    profile_bio?: string | null;
    profile_image?: {
      url?: string;
      thumbs?: Record<string, { url?: string; dimensions?: string }>;
    } | null;
  } | null;
};

/**
 * REX caps a page at 100 whatever you ask for — `limit: 200` comes back with
 * ZERO rows rather than an error or a truncated page, which is a quiet way to
 * lose everybody. Measured. So: pages of 100, walked.
 */
const PAGE = 100;
const MAX_PAGES = 6;

/** Portrait crop where there is one — the headshot slot is tall, and the
 *  full-size original is a phone photo weighing a megabyte. */
function bestPhoto(s: Row["settings"]): string | null {
  const img = s?.profile_image;
  if (!img) return null;
  return absoluteUrl(img.thumbs?.["700x875"]?.url ?? img.url ?? null);
}

let cache: { at: number; rows: RexAgent[] } | null = null;
const TTL_MS = 30 * 60 * 1000;

export async function allAgents(): Promise<RexAgent[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.rows;

  const out: RexAgent[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await rexCall("AccountUsers", "search", { limit: PAGE, offset: page * PAGE });
    if (!res.ok) break;
    const rows = ((res.result as { rows?: Row[] } | Row[] | null) as { rows?: Row[] })?.rows
      ?? (Array.isArray(res.result) ? (res.result as Row[]) : []);
    if (!rows.length) break;
    for (const r of rows) {
      const name = `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim();
      if (!name || !r.email) continue;
      out.push({
        id: String(r.id ?? ""),
        name,
        email: r.email.toLowerCase(),
        title: (r.settings?.position ?? "").trim(),
        phone: (r.settings?.phone_mobile ?? r.settings?.phone_direct ?? "").trim(),
        photo: bestPhoto(r.settings),
        active: (r.user_account_status ?? "") === "active",
      });
    }
    if (rows.length < PAGE) break;
  }

  if (out.length) cache = { at: Date.now(), rows: out };
  return out;
}

/**
 * TLE's own people. Domain is the divider, and James confirmed it on 27 Aug.
 *
 * ── Why The Property Experts are excluded outright ────────────────────────
 *
 * Six businesses share REX account 3517, and TPE is by far the biggest — 81 of
 * the 130 users. James: "It's a different company… The Property Experts cover
 * SALES, so we don't want that at all in the mix."
 *
 * That is a business decision, not a technical one, and it is the reason this
 * is a hard domain test rather than something cleverer.
 *
 * ── The disagreement this overrides, recorded on purpose ──────────────────
 *
 * The TLE portal does NOT do it this way. It matches on domain OR a 29-name
 * partner roster, because it found domain-only under-reported July listings
 * 34 vs 44 (-23%) — see TLE-portal lib/rex.ts:209-227.
 *
 * Measured here: TEN active TPE-domain users carry names on that roster —
 * Rebecca Adams, Chris Wilson-Slight, Bernadine Williams, Graham Cross, James
 * Crumpton, Rovena Buci, David Quigg, Paul Doig, Shane Yu, Zilvinas Navickis.
 *
 * James has been shown that list and has chosen to exclude them here. If a
 * figure in the OS ever reads low against the portal's, this is the first
 * place to look — the two products are answering deliberately different
 * questions, and neither is broken.
 */
const TLE_DOMAIN = "@thelettingexperts.co.uk";

export async function lettingsAgents(): Promise<RexAgent[]> {
  const all = await allAgents();
  return all
    .filter((a) => a.active && a.email.endsWith(TLE_DOMAIN))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function agentByEmail(email: string): Promise<RexAgent | null> {
  if (!email) return null;
  const want = email.trim().toLowerCase();
  return (await allAgents()).find((a) => a.email === want) ?? null;
}

/**
 * An agent as the deck wants them, with the OS's own biography folded in.
 *
 * `fallback` is whoever the OS thinks is acting — used when REX has never
 * heard of the address (a colleague signed in under a personal account, say).
 * Better a deck introducing the right person with no photo than one
 * introducing nobody.
 */
export async function presentAgentFor(
  email: string,
  fallback: { name: string; email: string },
  bio: string,
  /**
   * THE AGENT'S OWN HEADSHOT, from their OS profile, and it WINS.
   *
   * The profile page has had a photo uploader all along — click the headshot,
   * pick a file, it downscales to 256px and saves. Nothing ever read it back
   * out for the deck, which asked REX and the TEG Hub instead. REX's
   * `photo_url` is empty for every TLE record and the Hub's is empty too, so
   * an agent who had uploaded a picture of themselves still went out to a
   * landlord as a monogram. James, 31 Aug: it should just pull through.
   *
   * It takes precedence over both directories rather than filling in behind
   * them: it is the one of the three the agent chose deliberately, and it is
   * the only one they can fix themselves when it is wrong.
   */
  profilePhoto?: string | null
): Promise<PresentAgent> {
  /* Two people-directories, asked in order of how likely each is to be right.
     REX first because its headshots are real today (~70% have one) and already
     the right crop. The TEG Hub is authoritative for a person but its
     photo_url is empty for every TLE record as of 28 Aug 2026 — James is
     uploading them, so this fallback fills in behind us without another
     change. */
  const [rex, teg] = await Promise.all([
    agentByEmail(email).catch(() => null),
    getTegPerson({ email }).catch(() => null),
  ]);
  const name = rex?.name || teg?.name || fallback.name || "";
  return {
    name,
    firstName: firstNameOf(name),
    title: rex?.title || teg?.jobTitle || "",
    email: rex?.email || fallback.email || "",
    phone: rex?.phone ?? "",
    /* Theirs first, then the two directories. `||` not `??`, because an empty
       string is what a cleared uploader leaves behind and it must fall through
       rather than render as a photo that is not there. */
    photo: (profilePhoto || "").trim() || rex?.photo || teg?.photoUrl || null,
    /* The caller's bio wins — it is what the agent typed about themselves in
       the OS, and their own words beat the register's. The Hub is the
       fallback, which is what makes a partner who has never opened the profile
       page still get a real introduction instead of the generic one. */
    bio: bio.trim() || teg?.bio || "",
  };
}
