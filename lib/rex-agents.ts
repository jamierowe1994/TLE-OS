import { rexCall } from "./rex";
import { absoluteUrl, firstNameOf, type PresentAgent } from "./present";

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

/** TLE's own people. Domain is the divider — see the diary's note on why. */
export async function lettingsAgents(): Promise<RexAgent[]> {
  const all = await allAgents();
  return all
    .filter((a) => a.active && a.email.endsWith("@thelettingexperts.co.uk"))
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
  bio: string
): Promise<PresentAgent> {
  const rex = await agentByEmail(email).catch(() => null);
  const name = rex?.name || fallback.name || "";
  return {
    name,
    firstName: firstNameOf(name),
    title: rex?.title ?? "",
    email: rex?.email || fallback.email || "",
    phone: rex?.phone ?? "",
    photo: rex?.photo ?? null,
    bio,
  };
}
