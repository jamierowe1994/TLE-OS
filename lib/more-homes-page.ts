import "server-only";
import { redirect } from "next/navigation";
import { currentTenant, tenantPassport } from "@/lib/tenant-account";
import { homesOnMarket } from "@/lib/tenant-homes";
import { originFromPassport, originFromText, type Origin } from "@/lib/tenant-find";
import { letNoticeFor, readMoreHomesToken } from "@/lib/let-notice";

/**
 * SHOW ME OTHER HOMES (James, 22 Oct 2026): what the button in "it's been
 * let" opens. Find a home, with no account and no sign-in - the link itself
 * says who they are (lib/let-notice moreHomesLink). Searched from their own
 * house when they have a passport, otherwise from the home they asked about.
 * A tenant already signed in as that person goes to their own Find a home.
 *
 * Shared by the landing page and the list the home pages link back to.
 */

const POSTCODE = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i;

export type MoreHomes =
  | { ok: false }
  | {
      ok: true;
      token: string;
      first: string;
      home: Origin | null;
      start: Origin | null;
      intro: string;
      market: Awaited<ReturnType<typeof homesOnMarket>>;
      phone: string;
    };

export async function moreHomes(token: string): Promise<MoreHomes> {
  const who = readMoreHomesToken(token);
  if (!who) return { ok: false };
  const me = await currentTenant().catch(() => null);
  if (me && me.email.trim().toLowerCase() === who.email) redirect("/tenant/homes");

  const [told, record, market] = await Promise.all([
    letNoticeFor(who.listingId, who.email),
    tenantPassport(who.email).catch(() => null),
    homesOnMarket(),
  ]);
  const address = told?.address ?? "";
  const home = await originFromPassport(record).catch(() => null);
  let start: Origin | null = null;
  if (!home && address) {
    const pc = address.match(POSTCODE);
    const at = await originFromText(pc ? `${pc[1]} ${pc[2]}` : address).catch(() => null);
    if (at) start = { ...at, label: `Near ${address.split(",")[0].trim()}` };
  }
  const first = (told?.name || record?.data?.knownAs || record?.name || "").trim().split(/\s+/)[0] || "";
  const intro = address
    ? `${first ? `Hi ${first}, ` : ""}${address.split(",")[0].trim()} has gone, but here is everything else we have on${home ? ", nearest your home first" : start ? ", nearest it first" : ""}.`
    : "Here is everything we have on right now.";
  /* Not the home they were just told is let. */
  const others = market.ok ? { ...market, homes: market.homes.filter((h) => h.id !== who.listingId) } : market;
  return { ok: true, token, first: first || "there", home, start, intro, market: others, phone: record?.data?.mobile ?? "" };
}
