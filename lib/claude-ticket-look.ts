import "server-only";
import { hasDb, q } from "@/lib/db";
import { TOOLS, type AssistantTool, type ToolContext } from "@/lib/assistant-tools";
import { findUserByEmail, findUserById } from "@/lib/users";
import { lookRows } from "@/lib/new-look-store";
import { allSwitches } from "@/lib/switches";
import { writeReadLog } from "@/lib/read-log";

/**
 * LIVE LOOK-UPS FOR A TICKET RUN (James, 26 Nov 2026, lib/claude-tickets).
 *
 * A Claude run works from the code and one ticket. It could not see the live
 * database, so anything that turned on what one home, let or deal IS came
 * back as "look this up" (and twice, in October, a guess went out as a fix).
 * Steve already has read-only look-ups for exactly those questions, so the
 * run asks them, through the same per-ticket token, as the person who sent
 * the ticket (James), with the whole business in view.
 *
 * Only the tools below, all of which read and none of which write, send,
 * propose or open anything on a screen. Each answer goes to the run on
 * James's own plan; the playbook keeps names and addresses out of commits
 * and pull requests (the repository is public). Every look-up is in
 * os_read_log under James, and a ticket gets LOOK_CAP of them per send.
 */

const READ_ONLY = [
  "find_property",
  "property_detail",
  "property_contacts",
  "compliance_due",
  "portal_links",
  "my_properties",
  "search_everything",
  "listing_viewings",
  "listing_applications",
  "listing_marketing",
  "property_jobs",
  "let_push_check",
  "rent_status",
  "listing_portal_stats",
  "home_record",
  "rtr_on_let",
  "find_passport",
] as const;

/** Not one of Steve's: how every switch in Admin is set, which a run otherwise has to guess. */
const SWITCHES_TOOL = {
  name: "switches",
  description:
    "How every switch in Admin is set on the live system right now: each new-look screen (off, me = only the person who set it, owners, testers, everyone) and each sending switch (on or off). Read only.",
  input_schema: { type: "object" as const, properties: {} },
};

export const LOOK_CAP = 60;

const tools = (): AssistantTool[] => TOOLS.filter((t) => (READ_ONLY as readonly string[]).includes(t.name));

export const LOOK_UP_NAMES: string[] = [...READ_ONLY, SWITCHES_TOOL.name];

/** What the run is told it can ask, with each look-up's own words and inputs. */
export function lookUpMenu(): Array<{ name: string; description: string; input_schema: unknown }> {
  return [...tools().map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema })), SWITCHES_TOOL];
}

export class LookRefused extends Error {}

/** The record id in a ticket's page, when it is a listing's, so "this home" means the one they were on. */
function listingIdIn(path: string): string | null {
  const m = /^\/listings\/([A-Za-z0-9_-]+)/.exec(path) ?? /[?&]open=([A-Za-z0-9_-]+)/.exec(path);
  return m ? m[1] : null;
}

/** Long answers are cut, never dropped: the run can ask a narrower question. */
function fit(v: unknown): unknown {
  const s = JSON.stringify(v ?? null);
  return s.length <= 24_000 ? v : { cutShort: true, first24k: s.slice(0, 24_000) };
}

export async function lookUp(id: string, tool: string, input: Record<string, unknown>): Promise<unknown> {
  if (!hasDb()) throw new LookRefused("No database here.");
  const rows = await q<{ path: string; state: string; bot_state: string; context: Record<string, unknown> | null }>(
    `SELECT path, state, bot_state, context FROM os_bugs WHERE id = $1`,
    [id]
  );
  const t = rows[0];
  if (!t) throw new LookRefused("No such ticket.");
  /* Only while the run is on it: a ticket that has come back or closed has no business reading live records. */
  if (t.bot_state !== "with_claude") throw new LookRefused("This ticket isn't with Claude any more.");
  if (tool !== SWITCHES_TOOL.name && !(READ_ONLY as readonly string[]).includes(tool)) {
    throw new LookRefused(`No look-up called ${tool}. Ask for one of: ${LOOK_UP_NAMES.join(", ")}.`);
  }

  /* Count first, atomically, so two calls at once can't both slip under the cap. */
  const counted = await q<{ n: number }>(
    `UPDATE os_bugs SET context = coalesce(context, '{}'::jsonb) || jsonb_build_object('claudeLooks', coalesce((context->>'claudeLooks')::int, 0) + 1)
      WHERE id = $1 RETURNING (context->>'claudeLooks')::int AS n`,
    [id]
  );
  if ((counted[0]?.n ?? 0) > LOOK_CAP) throw new LookRefused(`That's ${LOOK_CAP} look-ups on this ticket. Report what you have.`);

  /* As the person who sent it. Older sends didn't record who: the first sender allowed. */
  const sender = (t.context?.claudeSender ?? null) as { id?: string; email?: string } | null;
  const me =
    (sender?.id ? await findUserById(sender.id).catch(() => null) : null) ??
    (sender?.email ? await findUserByEmail(sender.email).catch(() => null) : null) ??
    (await findUserByEmail("james@therecruitmentexperts.co.uk").catch(() => null));
  if (!me) throw new LookRefused("Can't tell who sent this ticket, so there's nobody to look it up as.");

  await writeReadLog([{ at: Date.now(), userId: me.id, method: "LOOK", path: `/api/bugs/claude/look/${tool}`, query: `ticket=${id}`, ip: "claude-ticket" }]).catch(() => {});

  if (tool === SWITCHES_TOOL.name) {
    const [looks, sends] = await Promise.all([lookRows().catch(() => []), allSwitches().catch(() => [])]);
    return {
      newLook: looks.map((r) => ({ screen: r.id, label: r.label, level: r.level, ...(r.level === "me" ? { onlyFor: r.changedBy } : {}) })),
      sending: sends.map((s) => ({ key: s.key, label: s.label, on: s.on })),
    };
  }

  const run = tools().find((x) => x.name === tool);
  if (!run) throw new LookRefused(`No look-up called ${tool}.`);
  const ctx: ToolContext = {
    scope: { rexUserId: null, everything: true, unlinked: false, label: "the whole business" },
    path: t.path || null,
    openListingId: listingIdIn(t.path || ""),
    me: { id: me.id, name: me.name, email: me.email },
  };
  const out = await run.run(input ?? {}, ctx);
  return fit(out);
}
