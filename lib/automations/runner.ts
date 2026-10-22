import "server-only";
import { hasDb, q } from "@/lib/db";
import { findUserById, type OsUser } from "@/lib/users";
import { sendsAnyway, switchOn } from "@/lib/switches";
import { CUSTOMER_DAILY_CAP, PERSON_DAILY_CAP, reachesCustomer, triggerDef, type AutomationDef } from "@/lib/automations/catalogue";
import { conditionFails, findEvents } from "@/lib/automations/sources";
import { nextScheduled } from "@/lib/automations/schedule";
import { act } from "@/lib/automations/actions";
import {
  addRun, ensure, finishRun, getAutomation, getRun, reachedToday,
  type ActionOutcome, type Automation, type PreviewItem, type Run, type Subject,
} from "@/lib/automations/store";

/**
 * THE RUNNER - one tick of the scheduled-sends cron (every five minutes).
 *
 * Two halves:
 *
 *   1. LOOK. For every automation that is on, ask its trigger what happened on
 *      the agent's own book since the last look (lib/automations/sources),
 *      and write a run for each customer not already given this one. The
 *      look's watermark moves on in the same statement that claims it, so two
 *      overlapping ticks never both look at the same minutes.
 *
 *   2. DO. Every run whose wait is over: check the conditions again now, then
 *      the brakes, then do the actions (lib/automations/actions). Emails are
 *      queued on os_scheduled_sends and go out on the next tick through the
 *      same runner as every other timed email.
 *
 * ── The brakes, in order ──────────────────────────────────────────────────
 *
 *   - The owner turned it off, it was changed, or the agent has gone: no.
 *   - More than three days late (the cron was down, a switch was off): the
 *     moment has passed, so it is skipped rather than sent stale.
 *   - "Agent automations" (Admin, Switches) off: HELD - nothing done - unless
 *     the customer is in ALWAYS_SEND_TO, so Howard can test it on himself.
 *   - Caps: the automation's own daily number, PERSON_DAILY_CAP per agent and
 *     CUSTOMER_DAILY_CAP per customer across everybody's automations. Over a
 *     cap waits for tomorrow morning rather than being lost.
 *   - Still in preview: the first one stops and shows the agent what would go.
 *   - Then each send still meets its own switch on the way out: customer
 *     email, the agent's Outlook, SENDING_LOCKED.
 */

const MAX_LATE_MS = 3 * 86_400_000;
/** How far back a first look may reach if the watermark is old (the cron was down). */
const MAX_LOOKBACK_MS = 2 * 86_400_000;

export type TickResult = { looked: number; found: number; ran: number; held: number; previews: number; skipped: number; failed: string[] };

export async function runAutomations(origin: string): Promise<TickResult> {
  const res: TickResult = { looked: 0, found: 0, ran: 0, held: 0, previews: 0, skipped: 0, failed: [] };
  if (!hasDb()) return res;
  await ensure();
  const globalOn = await switchOn("agent_automations");
  const owners = new Map<string, OsUser | null>();
  const ownerOf = async (id: string) => {
    if (!owners.has(id)) owners.set(id, await findUserById(id).catch(() => null));
    return owners.get(id) ?? null;
  };

  /* ── 1. Look ── */
  const ons = await q<{ id: string }>(`SELECT id FROM os_automations WHERE enabled ORDER BY updated_at`);
  for (const { id } of ons) {
    try {
      const a = await getAutomation(id);
      if (!a || !a.enabled) continue;
      const owner = await ownerOf(a.userId);
      if (!owner || owner.locked) continue;
      res.looked++;
      if (a.def.trigger.key === "schedule") {
        const next = nextScheduled(a.def.trigger.params);
        const claimed = await q<{ due: Date }>(
          `WITH o AS (SELECT id, next_at FROM os_automations WHERE id = $1 AND enabled AND next_at IS NOT NULL AND next_at <= NOW() FOR UPDATE SKIP LOCKED)
           UPDATE os_automations a SET next_at = $2 FROM o WHERE a.id = o.id RETURNING o.next_at AS due`,
          [a.id, next]
        );
        if (!claimed[0]) continue;
        const due = new Date(claimed[0].due);
        const s: Subject = {
          key: `schedule:${due.toISOString()}`, at: due.toISOString(), name: owner.name || "", email: null, phone: null, address: "",
          postcode: null, listingId: null, leadId: null, propertyId: null, what: `Scheduled: ${due.toLocaleString("en-GB", { timeZone: "Europe/London", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`, facts: {},
        };
        if (await addRun(a, s, new Date(due.getTime() + a.def.waitHours * 3_600_000))) res.found++;
        continue;
      }
      const claimed = await q<{ since: Date | null; until: Date }>(
        `WITH o AS (SELECT id, cursor_at FROM os_automations WHERE id = $1 AND enabled FOR UPDATE SKIP LOCKED)
         UPDATE os_automations a SET cursor_at = NOW() FROM o WHERE a.id = o.id RETURNING o.cursor_at AS since, a.cursor_at AS until`,
        [a.id]
      );
      if (!claimed[0]) continue;
      const until = new Date(claimed[0].until);
      const since = new Date(Math.max(claimed[0].since ? new Date(claimed[0].since).getTime() : until.getTime(), until.getTime() - MAX_LOOKBACK_MS));
      if (since >= until) continue;
      const events = await findEvents(a.def.trigger.key, a.def.trigger.params, owner, { since, until });
      for (const s of events) {
        if (await addRun(a, s, new Date(new Date(s.at).getTime() + a.def.waitHours * 3_600_000))) res.found++;
      }
    } catch (e) {
      res.failed.push(`${id}: ${e instanceof Error ? e.message : "look failed"}`);
    }
  }

  /* ── 2. Do ── */
  const due = await q<{ id: string }>(
    `UPDATE os_automation_runs SET state = 'working'
      WHERE id IN (SELECT id FROM os_automation_runs WHERE state = 'waiting' AND due_at <= NOW() ORDER BY due_at LIMIT 40 FOR UPDATE SKIP LOCKED)
      RETURNING id`
  );
  for (const { id } of due) {
    try {
      const outcome = await doRun(id, { origin, globalOn, ownerOf });
      res[outcome]++;
    } catch (e) {
      const why = e instanceof Error ? e.message : "it failed";
      res.failed.push(`${id}: ${why}`);
      await finishRun(id, { state: "failed", detail: `Something went wrong: ${why}` }).catch(() => null);
    }
  }
  return res;
}

type DoCtx = { origin: string; globalOn: boolean; ownerOf: (id: string) => Promise<OsUser | null> };

/** Back to waiting, due again at `at`. */
async function later(id: string, at: Date, detail: string) {
  await q(`UPDATE os_automation_runs SET state = 'waiting', due_at = $2, detail = $3 WHERE id = $1`, [id, at, detail]);
}

/** Tomorrow at nine, London. */
function tomorrowNine(): Date {
  const d = new Date(Date.now() + 86_400_000);
  const day = d.toLocaleDateString("en-CA", { timeZone: "Europe/London" });
  const guess = new Date(`${day}T09:00:00Z`);
  const offset = new Date(guess.toLocaleString("en-US", { timeZone: "Europe/London" })).getTime() - new Date(guess.toLocaleString("en-US", { timeZone: "UTC" })).getTime();
  return new Date(guess.getTime() - offset);
}

async function doRun(id: string, c: DoCtx): Promise<"ran" | "held" | "previews" | "skipped"> {
  const run = await getRun(id);
  if (!run) return "skipped";
  const a = await getAutomation(run.automationId);
  if (!a || !a.enabled) {
    await finishRun(id, { state: "cancelled", detail: a ? "The automation was switched off before this was due." : "The automation was deleted." });
    return "skipped";
  }
  if (Date.now() - new Date(run.dueAt).getTime() > MAX_LATE_MS) {
    await finishRun(id, { state: "skipped", detail: "This was due more than three days ago, so its moment had passed and nothing was done." });
    return "skipped";
  }
  const owner = await c.ownerOf(a.userId);
  if (!owner || owner.locked) {
    await finishRun(id, { state: "skipped", detail: "Whoever it belongs to no longer has an account here, so nothing goes out in their name." });
    return "skipped";
  }

  /* The conditions, now - not when it was triggered. */
  for (const cond of a.def.conditions) {
    const no = await conditionFails(cond, run.subject, owner);
    if (no) {
      await finishRun(id, { state: "skipped", detail: no });
      return "skipped";
    }
  }

  const customer = reachesCustomer(a.def);
  const testOnly = sendsAnyway(run.subject.email);
  if (!c.globalOn && !testOnly) {
    await finishRun(id, { state: "held", detail: "Agent automations is switched off on Admin, Switches, so nothing was done. It won't go later." });
    return "held";
  }

  if (customer) {
    const n = await reachedToday({ automationId: a.id, userId: a.userId, customer: (run.subject.email || run.subject.phone || "").trim().toLowerCase() || null });
    const over =
      n.auto >= a.dailyCap ? `This automation has reached its ${a.dailyCap} for today.`
        : n.person >= PERSON_DAILY_CAP ? `Your automations have reached ${PERSON_DAILY_CAP} customers today, the most for one person.`
          : n.customer >= CUSTOMER_DAILY_CAP ? `They've already had ${CUSTOMER_DAILY_CAP} automatic messages today.`
            : null;
    if (over) {
      await later(id, tomorrowNine(), `${over} Waiting until tomorrow morning.`);
      return "held";
    }
  }

  if (customer && a.state !== "live") {
    /* One preview at a time: the agent checks the first, the rest wait. */
    const open = await q<{ id: string }>(`SELECT id FROM os_automation_runs WHERE automation_id = $1 AND state = 'preview' AND id <> $2 LIMIT 1`, [a.id, id]);
    if (open.length) {
      await later(id, new Date(Date.now() + 30 * 60_000), "Waiting for you to check the first one.");
      return "held";
    }
    const items: PreviewItem[] = [];
    const outcomes: ActionOutcome[] = [];
    for (const [i, step] of a.def.actions.entries()) {
      const r = await act(step, { automation: a, runId: id, index: i, owner, subject: run.subject, origin: c.origin, mode: "preview" });
      outcomes.push(r.outcome);
      if (r.preview) items.push(r.preview);
    }
    if (!items.some((x) => x.subject || x.text || x.note)) {
      await finishRun(id, { state: "skipped", detail: outcomes.map((o) => o.detail).join(" "), outcomes });
      return "skipped";
    }
    await finishRun(id, { state: "preview", detail: "Waiting for you to check the first one before anything is sent.", outcomes, preview: items });
    return "previews";
  }

  await perform(a, run, owner, c.origin);
  return "ran";
}

/** Do every action for real, and write down what happened. */
async function perform(a: Automation, run: Run, owner: OsUser, origin: string): Promise<{ outcomes: ActionOutcome[]; reached: boolean }> {
  const outcomes: ActionOutcome[] = [];
  let reached = false;
  for (const [i, step] of a.def.actions.entries()) {
    const r = await act(step, { automation: a, runId: run.id, index: i, owner, subject: run.subject, origin, mode: "send" }).catch((e) => ({
      outcome: { action: step.key, state: "failed" as const, to: "-", detail: e instanceof Error ? e.message : "It failed." },
      reached: false,
    }));
    outcomes.push(r.outcome);
    reached ||= r.reached;
  }
  const allFailed = outcomes.length > 0 && outcomes.every((o) => o.state === "failed");
  const allHeld = outcomes.length > 0 && outcomes.every((o) => o.state === "held" || o.state === "skipped");
  await finishRun(run.id, {
    state: allFailed ? "failed" : allHeld && !reached ? "held" : "done",
    detail: outcomes.map((o) => `${o.action}: ${o.detail}`).join(" "),
    outcomes,
    reached,
    preview: null,
  });
  return { outcomes, reached };
}

/**
 * The agent's answer to a first send. "send" does it now (conditions and the
 * global switch checked again) and makes the automation live; "skip" drops
 * this one and keeps it in preview for the next.
 */
export async function answerPreview(p: { runId: string; me: OsUser; send: boolean; origin: string }): Promise<{ ok: true; run: Run | null } | { ok: false; error: string }> {
  await ensure();
  const run = await getRun(p.runId);
  if (!run || run.state !== "preview") return { ok: false, error: "That one isn't waiting any more." };
  const a = await getAutomation(run.automationId);
  if (!a || a.userId !== p.me.id) return { ok: false, error: "Only the person it belongs to can answer it." };
  if (!p.send) {
    await finishRun(run.id, { state: "cancelled", detail: "You chose not to send it." });
    return { ok: true, run: await getRun(run.id) };
  }
  if (!a.enabled) return { ok: false, error: "Switch the automation on first." };
  if (!(await switchOn("agent_automations")) && !sendsAnyway(run.subject.email)) {
    return { ok: false, error: "Agent automations is switched off on Admin, Switches, so nothing can be sent yet." };
  }
  for (const cond of a.def.conditions) {
    const no = await conditionFails(cond, run.subject, p.me);
    if (no) {
      await finishRun(run.id, { state: "skipped", detail: no });
      return { ok: false, error: `${no} Nothing was sent.` };
    }
  }
  await q(`UPDATE os_automations SET state = 'live', updated_at = NOW() WHERE id = $1 AND state = 'preview'`, [a.id]);
  await perform({ ...a, state: "live" }, run, p.me, p.origin);
  return { ok: true, run: await getRun(run.id) };
}

/**
 * What the trigger would have caught in the last `days` days - for the
 * editor's "Try it" and the chat builder. Reads only; writes no runs.
 */
export async function wouldHaveCaught(def: AutomationDef, owner: OsUser, days = 7): Promise<{ count: number; examples: { name: string; what: string; at: string }[]; note: string | null; newest: Subject | null }> {
  const t = triggerDef(def.trigger.key);
  if (!t || def.trigger.key === "schedule") return { count: 0, examples: [], note: "A schedule doesn't wait for anything to happen.", newest: null };
  const until = new Date();
  const since = new Date(until.getTime() - days * 86_400_000);
  /* Dated events (anniversaries, expiries, move-ins) look forward a week as well. */
  const forward = ["cert.expiring", "tenancy.move_in", "tenancy.anniversary"].includes(def.trigger.key);
  const w = forward ? { since, until: new Date(until.getTime() + days * 86_400_000) } : { since, until };
  const found = await findEvents(def.trigger.key, def.trigger.params, owner, w);
  const seen = new Set<string>();
  const unique = found.filter((s) => (seen.has(s.key) ? false : (seen.add(s.key), true)));
  return {
    count: unique.length,
    examples: unique.slice(-6).reverse().map((s) => ({ name: s.name, what: s.what, at: s.at })),
    note: forward ? `The last ${days} days and the next ${days}.` : `The last ${days} days.`,
    newest: unique[unique.length - 1] ?? null,
  };
}
