import { NextRequest } from "next/server";
import { allAgents, lettingsAgents, type RexAgent } from "@/lib/rex-agents";
import { agentProfile } from "@/lib/agent-profile";
import { findUserByEmail, findUserByRexId } from "@/lib/users";
import { websiteAuth, websiteError, websiteJson } from "../_lib/auth";
import { listingExtras } from "../_lib/listing-extras";
import { slugify } from "../_lib/shape";

/**
 * GET /api/public/website/agents - the experts, for the website. Bearer
 * WEBSITE_API_TOKEN.
 *
 * Who: TLE's own people (lib/rex-agents lettingsAgents: active, on the TLE
 * domain) PLUS anyone named listing_agent_1 on a published rental, because a
 * partner on a sister-company address who is letting homes for TLE belongs
 * in the directory. Nobody else - six businesses share the REX account.
 *
 * Biographies: REX's profile_bio is null for every user, so the ONLY source
 * is the OS profile (os_user_prefs, key tle-profile-v1, via
 * lib/agent-profile), reached through the OS account linked to the REX user
 * (os_users.rex_user_id, falling back to the same email). The OS headshot
 * wins over REX's where the agent has uploaded one, for the reason in
 * lib/rex-agents presentAgentFor: it is the one they chose.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export interface WebsiteAgent {
  id: string;
  slug: string;
  name: string;
  firstName: string;
  email: string;
  position: string | null;
  phone: string | null;
  /** The OS upload (a data URL) where set, else REX's 700x875 portrait. */
  photo: string | null;
  /** From the OS profile. Null when the agent has not written one. */
  bio: string | null;
  /** How many published rentals name them as listing agent. */
  listingCount: number;
  source: { bio: "os" | null; photo: "os" | "rex" | null };
}

async function osProfileFor(a: RexAgent): Promise<{ bio: string; photo: string | null } | null> {
  const user = (await findUserByRexId(a.id).catch(() => null)) ?? (await findUserByEmail(a.email).catch(() => null));
  if (!user) return null;
  return agentProfile(user.id);
}

export async function GET(req: NextRequest) {
  const refused = websiteAuth(req);
  if (refused) return refused;
  try {
    const [tle, everyone, extras] = await Promise.all([
      lettingsAgents(),
      allAgents(),
      listingExtras().catch(() => null),
    ]);
    const counts = new Map<string, number>();
    for (const x of Object.values(extras?.value ?? {})) {
      if (x.agent?.id) counts.set(x.agent.id, (counts.get(x.agent.id) ?? 0) + 1);
    }
    const byId = new Map<string, RexAgent>();
    for (const a of tle) byId.set(a.id, a);
    for (const a of everyone) if (a.active && counts.has(a.id) && !byId.has(a.id)) byId.set(a.id, a);

    const agents: WebsiteAgent[] = await Promise.all(
      [...byId.values()].map(async (a) => {
        const os = await osProfileFor(a);
        const bio = os?.bio?.trim() || null;
        const osPhoto = os?.photo?.trim() || null;
        return {
          id: a.id,
          slug: slugify(a.name),
          name: a.name,
          firstName: a.name.split(" ")[0],
          email: a.email,
          position: a.title || null,
          phone: a.phone || null,
          photo: osPhoto ?? a.photo,
          bio,
          listingCount: counts.get(a.id) ?? 0,
          source: { bio: bio ? "os" : null, photo: osPhoto ? "os" : a.photo ? "rex" : null },
        };
      })
    );
    agents.sort((x, y) => y.listingCount - x.listingCount || x.name.localeCompare(y.name));
    /* Two people with one name: the second carries the id on the slug. */
    const seen = new Map<string, number>();
    for (const a of agents) {
      const n = (seen.get(a.slug) ?? 0) + 1;
      seen.set(a.slug, n);
      if (n > 1) a.slug = `${a.slug}-${a.id}`;
    }
    return websiteJson({
      ok: true,
      agents,
      pulledAt: new Date().toISOString(),
      extras: extras ? (extras.stale ? "stale" : "fresh") : "missing",
    });
  } catch (err) {
    return websiteError(err);
  }
}
