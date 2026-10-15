import "server-only";
import type { AssistantTool, ToolContext } from "@/lib/assistant-tools";
import { findUserById } from "@/lib/users";
import { can } from "@/lib/roles";
import { searchEverything } from "@/lib/search";
import { rtrFor, rtrLet, tenantOn } from "@/lib/application-rtr";
import { followUpFor } from "@/lib/id-checks";

/**
 * "HOW DO I PUT IN A TENANT'S RIGHT TO RENT EXPIRY DATE" (Kirstie Mulholland,
 * 12 Oct 2026). She was told it had gone to James. Now Steve finds the let,
 * the tenant and the date, and puts a card up - the press saves it
 * (lib/assistant-actions "rtr-expiry", stored by lib/application-rtr), and the
 * let's page shows it beside the right to rent check.
 */

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const nice = (ymd: string) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" });

/** The let ids a search hit points at: /applications?open=<id>, ?deal=<id>, /pre-tenancy?deal=<id>. */
function letIdOf(href: string): string | null {
  const m = /[?&](?:open|deal)=([^&]+)/.exec(href);
  return m && /^\/(applications|pre-tenancy)\b/.test(href) ? decodeURIComponent(m[1]) : null;
}

/** Which let they mean: given, on their screen, or found by words on the lets they can see. */
async function whichLet(input: Record<string, unknown>, ctx: ToolContext, wholeBusiness: boolean): Promise<{ id: string } | { candidates: { letId: string; what: string }[] } | { error: string }> {
  const given = str(input.letId);
  if (given) return { id: given };
  const onScreen = /^\/applications\/([^/?#]+)/.exec(ctx.path ?? "");
  const find = str(input.find);
  if (!find && onScreen) return { id: decodeURIComponent(onScreen[1]) };
  if (!find) return { error: "Which let? Give me the address or the tenant's name." };
  if (!wholeBusiness && (ctx.scope.unlinked || !ctx.scope.rexUserId)) return { error: "I can't tell which lets are yours, so I can't look one up. Ask James to link your account." };
  const hits = await searchEverything(find, wholeBusiness ? null : ctx.scope.rexUserId).catch(() => []);
  const lets = new Map<string, string>();
  for (const h of hits) {
    if (h.kind !== "application" && h.kind !== "deal") continue;
    const id = letIdOf(h.href);
    if (id && !lets.has(id)) lets.set(id, `${h.title} - ${h.sub}`);
  }
  if (!lets.size) return { error: `I couldn't find a let matching "${find}". Try the tenant's full name, or the address as it is on the let.` };
  if (lets.size > 1) return { candidates: [...lets].slice(0, 6).map(([letId, what]) => ({ letId, what })) };
  return { id: [...lets.keys()][0] };
}

export const proposeRtrExpiry: AssistantTool = {
  name: "propose_rtr_expiry",
  description:
    "Record a tenant's right to rent expiry date on their let (or that their right has no time limit, e.g. a British or Irish citizen). Call it for 'put in the right to rent expiry', 'their right to rent runs out on...', 'no expiry for right to rent'. Give the let (letId, or `find` with the address or tenant's name; the let open on their screen is used if neither), the tenant's name, and the date as YYYY-MM-DD - or noTimeLimit true. Call it STRAIGHT AWAY with `find` - not find_property first: it searches the lets themselves (the office's across the business), which find_property does not, and it is what says whether a let is Scottish. Never guess a date you were not given, and never decide a let is Scottish yourself. Shows a card to confirm; it is NOT saved until they press it. A Scottish let has no right to rent: it refuses, and you say so.",
  input_schema: {
    type: "object",
    properties: {
      letId: { type: "string", description: "The let's id, if you have it (the id in /applications/<id>)." },
      find: { type: "string", description: "Words to find the let by: the address or the tenant's name." },
      tenant: { type: "string", description: "The tenant whose right it is, as named on the let." },
      until: { type: "string", description: "The expiry date, YYYY-MM-DD." },
      noTimeLimit: { type: "boolean", description: "True when their right to rent has no time limit." },
    },
    required: ["tenant"],
  },
  label: () => "Finding the let…",
  async run(input, ctx) {
    if (!ctx.me?.id) return { error: "I can't tell who you are, so I won't record anything." };
    if (ctx.viewingAs) return { error: "You're viewing the OS as somebody else, so I won't record anything under their name. Stop viewing as them and ask again." };
    const me = await findUserById(ctx.me.id);
    if (!me) return { error: "I can't tell who you are, so I won't record anything." };
    /* The office and owners find any let; an agent finds their own (and the
       let's own rule below has the last word either way). */
    const wholeBusiness = ctx.scope.everything || can(me.role, "see:pretenancy");
    const which = await whichLet(input, ctx, wholeBusiness);
    if ("error" in which) return which;
    if ("candidates" in which) return { candidates: which.candidates, note: "More than one let matched. Ask which one they mean, then call again with its letId." };

    const got = await rtrLet(which.id, me);
    if (!got.ok) return { error: got.error };
    const l = got.let;
    const address = `${l.property}${l.locality ? `, ${l.locality}` : ""}`;
    if (got.scottish) {
      return { scottish: true, error: `${address} is a Scottish let. Right to rent doesn't apply in Scotland, so there's no expiry to record and the let doesn't ask for one.` };
    }
    const said = str(input.tenant);
    const tenant = tenantOn(l, said);
    if (!tenant) {
      return { error: `${said || "That person"} isn't a tenant on ${address}.`, tenantsOnTheLet: l.tenants.map((t) => t.name) };
    }
    const noTimeLimit = input.noTimeLimit === true;
    const until = str(input.until);
    if (!noTimeLimit) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(until)) return { error: "I need the expiry date (or that it has no time limit). Ask them for it." };
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
      if (until <= today) return { error: `${nice(until)} has already passed. A right to rent that has run out needs a fresh check, not an expiry date.` };
    }
    const followUp = noTimeLimit ? null : followUpFor(until);
    const before = (await rtrFor(which.id).catch(() => [])).find((r) => r.tenant.toLowerCase() === tenant.name.toLowerCase()) ?? null;
    const was = before ? (before.noTimeLimit ? "no time limit" : before.rightUntil ? `until ${nice(before.rightUntil)}` : null) : null;
    const text =
      `${tenant.name}: ${noTimeLimit ? "no time limit" : `until ${nice(until)}`}` +
      (followUp ? `\nFollow-up check due by ${nice(followUp)}.` : "") +
      (was ? `\nReplaces what is there now: ${was}.` : "");
    return {
      __proposal: { kind: "rtr-expiry", listingId: null, address, letId: which.id, tenant: tenant.name, until: noTimeLimit ? null : until, noTimeLimit, text },
      done: false,
      note: `Shown to them to confirm: ${text.replace(/\n/g, " ")} It is NOT saved yet. Say in one line what it will record, then that it shows on the let beside the right to rent check${followUp ? ", with a reminder to the office when the follow-up check is due" : ""}, and end with exactly "Shall I save it?" - a yes, or the Save it button, saves it.`,
    };
  },
};
