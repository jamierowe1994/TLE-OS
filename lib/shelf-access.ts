import "server-only";
import { hasDb, q } from "@/lib/db";
import { getLaunchPadAccessForPerson } from "@/lib/launchpad";
import { STAFF_SEES_ALL } from "@/lib/r2-access";
import { allAgents } from "@/lib/rex-agents";
import { getTegPerson } from "@/lib/teg-people";
import type { OsUser } from "@/lib/users";

/**
 * WHO SEES WHICH FOLDER ON THE FILE STORE (Francesca, 2 Nov 2026: "how will
 * pro agents get access to this? ... when you add them to TLE OS and they get
 * marked as a Pro Agent").
 *
 * Every folder on the shelf has one of three settings, chosen on Marketing hub
 * > File Store:
 *
 *   office   - marketing and the office only
 *   pro      - Pro agents too
 *   everyone - every agent
 *
 * A folder with no setting of its own takes its parent's, so "Pro Package" set
 * to Pro covers everything inside it. The top of the shelf, and every folder
 * made before this existed, is Everyone: that is what agents already had
 * through Steve and Learning, and nothing they could see before disappears.
 * A NEW folder is made Office only, so nothing reaches agents by accident.
 *
 * Who is Pro is Launch Pad's answer (lib/launchpad), the same one that opens
 * Paid Ads: James, 2 Nov 2026, chose it over the Hub's package field, which
 * last synced in August and was wrong both ways when Launch Pad was built. An
 * outage there is "couldn't check", never "not Pro" - but it shows nothing Pro
 * until the answer comes back.
 *
 * Settings live in os_settings under "library_folder_access", like the locks.
 */

export type Visibility = "office" | "pro" | "everyone";
/** What a person may see: the office sees everything, Pro sees Pro and Everyone. */
export type Tier = "office" | "pro" | "agent";

export const VISIBILITY_LABEL: Record<Visibility, string> = {
  office: "Office only",
  pro: "Pro agents",
  everyone: "Every agent",
};

const KEY = "library_folder_access";
const SHELF = "library/shelf/";

export type FolderAccess = Record<string, { level: Visibility; by: string; at: string }>;

export async function readFolderAccess(): Promise<FolderAccess> {
  if (!hasDb()) return {};
  const rows = await q<{ value: { folders?: FolderAccess } | null }>(`SELECT value FROM os_settings WHERE key = $1`, [KEY]);
  return rows[0]?.value?.folders ?? {};
}

export async function setFolderAccess(folder: string, level: Visibility, by: string): Promise<FolderAccess> {
  const all = await readFolderAccess();
  all[folder] = { level, by, at: new Date().toISOString() };
  await q(
    `INSERT INTO os_settings (key, value, updated_at, updated_by) VALUES ($1, $2, NOW(), $3)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW(), updated_by = EXCLUDED.updated_by`,
    [KEY, JSON.stringify({ folders: all }), by]
  );
  return all;
}

/** A folder's own setting, or the nearest parent's; the top of the shelf is Everyone. */
export function visibilityOf(folder: string, access: FolderAccess): Visibility {
  const steps = folder.split("/").filter(Boolean);
  for (let n = steps.length; n > 0; n--) {
    const own = access[steps.slice(0, n).join("/")];
    if (own) return own.level;
  }
  return "everyone";
}

/** "library/shelf/Pro Package/Social/123-a.png" -> "Pro Package/Social". */
export function folderOfKey(key: string): string {
  const tail = key.startsWith(SHELF) ? key.slice(SHELF.length) : key;
  const cut = tail.lastIndexOf("/");
  return cut > 0 ? tail.slice(0, cut) : "";
}

export function tierSees(tier: Tier, level: Visibility): boolean {
  if (tier === "office") return true;
  if (level === "everyone") return true;
  return level === "pro" && tier === "pro";
}

export function keyVisible(key: string, tier: Tier, access: FolderAccess): boolean {
  return tierSees(tier, visibilityOf(folderOfKey(key), access));
}

export type ShelfViewer = {
  tier: Tier;
  /** True when Launch Pad couldn't be asked, so a Pro agent may be shown less than they have. */
  unchecked: boolean;
};

const proCache = new Map<string, { at: number; pro: boolean; unchecked: boolean }>();
const PRO_TTL = 10 * 60_000;
/** A failed ask is retried sooner than a real answer is. */
const UNCHECKED_TTL = 60_000;

/**
 * What this person may see on the shelf. The office by role; an agent by
 * asking Launch Pad about every address the OS holds for them, exactly as
 * Tools > Launch Pad does (app/api/tools/launchpad-access).
 */
export async function shelfViewer(user: Pick<OsUser, "id" | "role" | "email" | "name" | "rexUserId"> | null): Promise<ShelfViewer> {
  if (!user) return { tier: "agent", unchecked: false };
  if (STAFF_SEES_ALL.has(user.role)) return { tier: "office", unchecked: false };
  const hit = proCache.get(user.id);
  if (hit && Date.now() - hit.at < (hit.unchecked ? UNCHECKED_TTL : PRO_TTL)) {
    return { tier: hit.pro ? "pro" : "agent", unchecked: hit.unchecked };
  }
  const alsoTry: string[] = [];
  if (user.rexUserId) {
    const agent = await allAgents()
      .then((rows) => rows.find((a) => a.id === user.rexUserId) ?? null)
      .catch(() => null);
    if (agent?.email) alsoTry.push(agent.email);
  }
  const teg = await getTegPerson({ rexId: user.rexUserId, email: user.email }).catch(() => null);
  if (teg?.email) alsoTry.push(teg.email);
  const access = await getLaunchPadAccessForPerson({ email: user.email, name: user.name, rexUserId: user.rexUserId, alsoTry });
  const pro = access.entitled;
  const unchecked = !pro && access.reason === "unavailable";
  proCache.set(user.id, { at: Date.now(), pro, unchecked });
  return { tier: pro ? "pro" : "agent", unchecked };
}
