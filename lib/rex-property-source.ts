import "server-only";
import { rexCall, rexWritesLocked } from "@/lib/rex";
import { switchOn } from "@/lib/switches";
import { noteFailure } from "@/lib/auto-bugs";

/**
 * THE PROPERTY'S SOURCE, which REX wants before it will make a listing
 * (bug 9ad8cc4f, 9 Oct 2026: "Please select a Source before saving this
 * property. You can find this field under the 'More Info' tab").
 *
 * ── What it is ────────────────────────────────────────────────────────────
 *
 * Not a listing field at all: a custom field on the PROPERTY, "More Info >
 * Source > Source" (cf.Properties.7901, read off CustomFields/
 * describeSearchFields on 15 Oct 2026). It says how the landlord came to us,
 * from REX's own list of 23 - "Personal referral / word of mouth",
 * "Rightmove", "Leaflet drop / flyer" and so on. Agents fill it in by hand in
 * REX before they add a listing; the OS never did, so a listing on a home
 * nobody had given a Source - every address the OS made itself, for a start -
 * was refused.
 *
 * Of the last 60 rental listings made in REX (7 Sep - 13 Oct 2026), 39 carry
 * "Personal referral / word of mouth", 5 "Leaflet drop / flyer", a handful
 * others, and 11 sit on properties with none.
 *
 * ── What the OS does about it ─────────────────────────────────────────────
 *
 * Asks for the listing as before. Only when REX refuses it for want of a
 * Source, and only with the "rex_property_source" switch on, it reads the
 * property's Source, writes the LEAD'S source when it is blank - the one the
 * agent picked on the landlord, put into REX's words (rexSourceFor), or
 * DEFAULT_SOURCE when the lead has none REX can take (through
 * CustomFields/setFieldValues - the method the handover uses for the Propoly
 * uuid, on a property instead of a listing) and asks for the listing once
 * more. Off, nothing is written and the agent is told what is missing,
 * rather than "Check the details and try again".
 */

export const SOURCE_FIELD = "core.more_info.Source.Source";

/** The one most of the office already picks - a default for James to
    confirm or change (15 Oct 2026); nothing is written until the switch is on. */
export const DEFAULT_SOURCE = "Personal referral / word of mouth";

/**
 * REX's own list for the field, read off CustomFields/describeSearchFields
 * (cf.Properties.7901) on 19 Oct 2026. Only these are accepted.
 */
export const REX_SOURCES = [
  "ValPal - NAF", "Community group / local sponsorship", "Door knocking / canvassing", "Email marketing campaign",
  "For Sale board enquiry", "Google Ads", "Google Business Profile", "Instant online valuation tool",
  "Leaflet drop / flyer", "Local networking event", "Newspaper advert", "OnTheMarket", "Partner referral",
  "Personal referral / word of mouth", "Previous buyer (now selling)", "Rightmove", "Social media (organic)",
  "Social media (paid)", "Website enquiry form", "Zoopla", "TLE Paid Adverts", "Viewing Enquiry", "GetAgent",
] as const;

/** The OS's lead sources (LEAD_SOURCES in lib/leads-sample) in REX's words.
    Missing ones - Phone-in, Walk-in, SpareRoom, Unknown - have no fair match
    and fall back to DEFAULT_SOURCE. */
const FROM_OS: Record<string, string> = {
  rightmove: "Rightmove",
  zoopla: "Zoopla",
  onthemarket: "OnTheMarket",
  "facebook ad": "Social media (paid)",
  "instagram ad": "Social media (paid)",
  "tiktok ad": "Social media (paid)",
  "google ads": "Google Ads",
  website: "Website enquiry form",
  "email enquiry": "Website enquiry form",
  "live chat": "Website enquiry form",
  referral: "Personal referral / word of mouth",
  "existing landlord": "Personal referral / word of mouth",
  "existing tenant": "Personal referral / word of mouth",
  "repeat customer": "Personal referral / word of mouth",
  event: "Local networking event",
  "board / signage": "For Sale board enquiry",
};

/** The lead's source as REX will take it: an exact REX option as it stands,
    an OS option translated, otherwise DEFAULT_SOURCE. */
export function rexSourceFor(leadSource: string | null | undefined): string {
  const key = String(leadSource ?? "").trim().toLowerCase();
  if (!key) return DEFAULT_SOURCE;
  const exact = REX_SOURCES.find((s) => s.toLowerCase() === key);
  return exact ?? FROM_OS[key] ?? DEFAULT_SOURCE;
}

/** The property's Source: the value, "" when it has none, or null when REX would not say. */
export async function propertySource(propertyId: string): Promise<string | null> {
  const res = await rexCall("CustomFields", "getValuesKeyedByFieldName", {
    service_name: "Properties",
    service_object_id: Number(propertyId),
  }).catch(() => null);
  if (!res?.ok || !res.result || typeof res.result !== "object") return null;
  const v = (res.result as Record<string, unknown>)[SOURCE_FIELD];
  return typeof v === "string" ? v.trim() : "";
}

export type SourceOutcome =
  | { ok: true; source: string; wrote: boolean }
  | { ok: false; reason: "no_source" | "refused"; detail: string; ownerDetail: string };

/** Is this REX refusal the missing Source? */
export const wantsSource = (error: string | null | undefined) => /select a source/i.test(String(error ?? ""));

/**
 * After REX has refused a listing for want of a Source: fill it in, if the
 * switch allows and the property really has none, so the listing can be
 * asked for once more. As the agent (`token`), so REX says who set it.
 *
 * Only ever after a refusal, never before: 7 Caernarvon Close had a listing
 * made in REX on 12 Oct 2026 with no Source on the property, so REX does not
 * refuse every such home, and asking first would block listings it takes.
 */
export async function fillPropertySource(propertyId: string, token: string | null, leadSource?: string | null): Promise<SourceOutcome> {
  const source = rexSourceFor(leadSource);
  const words = "This home has no Source yet - how the landlord came to us - and a listing can't be made without one. Pick it under Source on the home's Portfolio page (or ask the office), then try again.";
  const switchedOn = await switchOn("rex_property_source").catch(() => false);
  if (!switchedOn || rexWritesLocked("CustomFields", "setFieldValues")) {
    return {
      ok: false,
      reason: "no_source",
      detail: words,
      ownerDetail: `REX refused the listing because property ${propertyId} has no Source (More Info > Source). ${
        switchedOn ? "CustomFields/setFieldValues is not on REX_ALLOW_WRITES." : `Turn on "Fill in the Source on REX properties" (Admin > Switches) to have the OS set "${source}" (the lead's source), or set it in REX.`
      }`,
    };
  }
  /* Never over one already there - if REX says it is missing but the read
     finds one, the refusal is about something else and the write would not
     help. */
  const held = await propertySource(propertyId);
  if (held !== "") {
    return { ok: false, reason: "refused", detail: words, ownerDetail: `REX asked for a Source on property ${propertyId}, but it reads as ${held === null ? "unreadable" : `"${held}"`}, so nothing was written.` };
  }
  const write = (asToken: string | null) =>
    rexCall(
      "CustomFields",
      "setFieldValues",
      { service_name: "Properties", service_object_id: Number(propertyId), value_map: { [SOURCE_FIELD]: source } },
      asToken
    ).catch((e: Error) => ({ ok: false, error: e.message, status: 0, result: null }));
  const res = await write(token);
  if (res.ok) return { ok: true, source, wrote: true };
  /* REX's reason, said somewhere (22 Oct 2026). This refusal reached nobody:
     the agent was told to ask the office, nothing was logged, and no ticket
     was filed - most likely because REX's words mention a token or being
     authenticated, which rexCall reads as a lapsed sign-in and keeps quiet
     about. Now it is in the logs and on the bug list, in REX's words. */
  const why = `${res.error ?? `answered ${res.status}`}`;
  console.warn(`[rex-property-source] setting the Source on property ${propertyId} as the agent was refused: ${why}`);
  if (token && (await switchOn("rex_property_source_office").catch(() => false))) {
    const office = await write(null);
    if (office.ok) return { ok: true, source, wrote: true };
    console.warn(`[rex-property-source] ...and as the office: ${office.error ?? office.status}`);
  }
  noteFailure({ source: "REX", what: "CustomFields/setFieldValues (Source)", status: res.status || null, message: why });
  return { ok: false, reason: "refused", detail: words, ownerDetail: `Setting the property's Source was refused: ${why}` };
}

/**
 * Picked by a person on the home's page (Sean McMahon, 21 Oct 2026: "Re-let
 * 68 Main Street: blocked because the home has no Source. Agent can't add it
 * and neither can Steve"). Same field and same switches as the automatic
 * fill above, but the agent chooses the value, and a Source already there can
 * be corrected. As the agent; as the office when REX refuses the agent and
 * "Source written by the office" is on.
 */
export async function setPropertySource(propertyId: string, source: string, token: string | null): Promise<{ ok: true } | { ok: false; detail: string }> {
  if (!(REX_SOURCES as readonly string[]).includes(source)) return { ok: false, detail: "Pick one of the sources on the list." };
  if (!(await switchOn("rex_property_source").catch(() => false)) || rexWritesLocked("CustomFields", "setFieldValues")) {
    return { ok: false, detail: "Setting the Source from here isn't switched on. Ask the office to add it." };
  }
  const write = (asToken: string | null) =>
    rexCall("CustomFields", "setFieldValues", { service_name: "Properties", service_object_id: Number(propertyId), value_map: { [SOURCE_FIELD]: source } }, asToken).catch(
      (e: Error) => ({ ok: false, error: e.message, status: 0, result: null })
    );
  const res = await write(token);
  if (res.ok) return { ok: true };
  console.warn(`[rex-property-source] the agent's Source pick on property ${propertyId} was refused: ${res.error ?? res.status}`);
  if (token && (await switchOn("rex_property_source_office").catch(() => false))) {
    const office = await write(null);
    if (office.ok) return { ok: true };
  }
  noteFailure({ source: "REX", what: "CustomFields/setFieldValues (Source, picked)", status: res.status || null, message: `${res.error ?? res.status}` });
  return { ok: false, detail: "The back office wouldn't take the Source from your login. The office can add it, and James has been told." };
}
