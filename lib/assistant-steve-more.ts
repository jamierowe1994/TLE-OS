import "server-only";
import type { AssistantTool, ToolContext } from "@/lib/assistant-tools";
import { bookFor } from "@/lib/listings-cache";
import { fetchViewingsFor } from "@/lib/rex-viewings";
import { feedbackForListing } from "@/lib/rex-feedback";
import { osFeedbackFor } from "@/lib/viewing-feedback-store";
import { getApplications } from "@/lib/applications";
import { readListingDetails } from "@/lib/listing-details";
import { publishGaps } from "@/lib/listing-publish-check";
import { portalLinksFor } from "@/lib/rex-portal-links";
import { listOrders, OPEN_STATUSES } from "@/lib/works-orders";
import { listAppraisals } from "@/lib/appraisal-store";
import { withLiveStages } from "@/lib/appraisal-stage";
import { MA_STAGES } from "@/lib/market-appraisal";
import { hasDb, q } from "@/lib/db";
import { noDashes } from "@/lib/no-dashes";
import { shelfFiles } from "@/lib/library-files";

/**
 * STEVE, FURTHER (James, 2 Oct 2026): "we should be able to pull any details
 * from a property - viewings, applications, marketing material, jobs ...
 * check the files ... 'Is everything ready to push on my property?' ... give
 * recommendations ... suggest things it can do ... create tasks and lists for
 * the guys to follow ... build up data over time on how each person likes to
 * work ... on-screen awareness and talk them through the next step."
 *
 * The same three rules as lib/assistant-tools: read only (tasks are a
 * PROPOSAL, executed by the button in lib/assistant-actions), scoped to the
 * caller exactly as the screens are, and "not recorded" said out loud.
 */

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const day = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" }) : null;
const money = (n: number | null | undefined, period?: string | null) =>
  n == null ? "not recorded" : `£${Math.round(n).toLocaleString("en-GB")}${period === "week" ? " pw" : period === "month" || !period ? " pcm" : ` ${period}`}`;

/** The listing, if it is theirs to read. Owners read the whole business. */
async function theirListing(listingId: string, ctx: ToolContext): Promise<{ ok: true; propertyId: string | null; address: string } | { ok: false; error: string }> {
  if (ctx.scope.unlinked) return { ok: false, error: "I can't tell which REX user you are, so I can't read any property. Ask James to link your account." };
  if (!listingId) return { ok: false, error: "I need a listingId - use find_property first." };
  const book = await bookFor(ctx.scope.rexUserId);
  const l = book.listings.find((x) => String(x.id) === listingId);
  if (!l && !ctx.scope.everything) return { ok: false, error: "That property isn't on your book, so I can't read it for you." };
  return { ok: true, propertyId: l?.propertyId ? String(l.propertyId) : null, address: l ? `${l.name}, ${l.locality}` : `listing ${listingId}` };
}

const listingOnly = {
  type: "object" as const,
  properties: { listingId: { type: "string", description: "The listingId from find_property, or the listing open on their screen." } },
  required: ["listingId"],
};

/* ── viewings ─────────────────────────────────────────────────────────── */

const listingViewings: AssistantTool = {
  name: "listing_viewings",
  description:
    "Every viewing on a listing: what is booked, what has happened, who came and what they said afterwards. Call it for 'what viewings have I had on X', 'any feedback on X', 'how is X going'. Needs a listingId. Feedback is often not written up; when a viewing has none, say so.",
  input_schema: listingOnly,
  label: () => "Reading the viewings…",
  async run(input, ctx) {
    const id = str(input.listingId);
    const t = await theirListing(id, ctx);
    if (!t.ok) return { error: t.error };
    const all = (await fetchViewingsFor(id, t.propertyId)).filter((v) => v.kind === "viewing");
    const [rexFb, osFb] = await Promise.all([
      feedbackForListing(id).catch(() => []),
      osFeedbackFor(all.map((v) => v.id)).catch(() => new Map()),
    ]);
    const byRex = new Map(rexFb.map((f) => [f.id, f]));
    const now = Date.now();
    const line = (v: (typeof all)[number]) => {
      const fb = (v.feedbackId ? byRex.get(v.feedbackId) : null) ?? osFb.get(v.id) ?? null;
      return {
        when: day(v.startsAt),
        who: v.contacts.map((c) => (c as { name?: string }).name).filter(Boolean).join(", ") || "not recorded",
        agent: v.agent ?? "not recorded",
        status: v.cancelled ? "cancelled" : v.status ?? null,
        feedback: fb
          ? [fb.outcome, fb.interest ? `${fb.interest} interest` : null, fb.note].filter(Boolean).join(" - ") || "logged, nothing written"
          : "no feedback written up",
      };
    };
    const upcoming = all.filter((v) => !v.cancelled && new Date(v.startsAt).getTime() >= now).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    const past = all.filter((v) => new Date(v.startsAt).getTime() < now).sort((a, b) => b.startsAt.localeCompare(a.startsAt));
    return {
      address: t.address,
      booked: upcoming.length,
      happened: past.filter((v) => !v.cancelled).length,
      cancelled: all.filter((v) => v.cancelled).length,
      upcoming: upcoming.slice(0, 10).map(line),
      recent: past.slice(0, 12).map(line),
      withFeedback: past.filter((v) => (v.feedbackId && byRex.has(v.feedbackId)) || osFb.has(v.id)).length,
    };
  },
};

/* ── applications ─────────────────────────────────────────────────────── */

const listingApplications: AssistantTool = {
  name: "listing_applications",
  description:
    "The applications and offers on a listing: who applied, what they offered, from when, where each one has got to (received, accepted, referencing and so on). Call it for 'any offers on X', 'where is the application on X'. Needs a listingId.",
  input_schema: listingOnly,
  label: () => "Reading the applications…",
  async run(input, ctx) {
    const id = str(input.listingId);
    const t = await theirListing(id, ctx);
    if (!t.ok) return { error: t.error };
    const apps = (await getApplications(300, ctx.scope.everything ? null : ctx.scope.rexUserId)).filter((a) => String(a.listingId) === id);
    return {
      address: t.address,
      count: apps.length,
      applications: apps.slice(0, 15).map((a) => ({
        applicants: a.applicants.map((p) => p.name).filter(Boolean).join(", ") || "not recorded",
        status: a.stageLabel ?? a.statusLabel,
        offer: money(a.offerAmount, a.offerPeriod),
        moveIn: day(a.startDate) ?? "not recorded",
        term: a.agreementMonths ? `${a.agreementMonths} months` : "not recorded",
        received: day(a.dateReceived ? new Date(a.dateReceived).toISOString() : null),
        accepted: a.dateAccepted ? day(new Date(a.dateAccepted).toISOString()) : null,
        affordability: a.affordabilityPct != null ? `${a.affordabilityPct}% of income` : "not recorded",
      })),
      ...(apps.length ? {} : { note: "No applications on this listing." }),
    };
  },
};

/* ── marketing, and whether it is ready to go live ────────────────────── */

const listingMarketing: AssistantTool = {
  name: "listing_marketing",
  description:
    "The marketing on a listing and whether it is ready to push live: the advert heading and write-up, highlights, photos, floor plans, which portals it is on, what is still missing before it can be published (the same check as the Push it live button), and what would make it stronger. Call it for 'is my property ready to go live', 'what is missing on X', 'how does the advert look', 'is X on Rightmove'. Then RECOMMEND: name what is missing in plain words and offer what you can do about it (write the advert, set a task to get photos, open the listing on Marketing).",
  input_schema: listingOnly,
  label: () => "Checking the marketing…",
  async run(input, ctx) {
    const id = str(input.listingId);
    const t = await theirListing(id, ctx);
    if (!t.ok) return { error: t.error };
    const d = await readListingDetails(Number(id));
    const [gaps, portals] = await Promise.all([publishGaps(d).catch(() => []), portalLinksFor(id).catch(() => [])]);
    const words = d.body ? d.body.trim().split(/\s+/).length : 0;

    /* Beyond the hard rules: what an experienced lister would say. */
    const suggestions: string[] = [];
    if (d.images.length > 0 && d.images.length < 8) suggestions.push(`Only ${d.images.length} photos - eight or more does better on the portals.`);
    if (!d.floorplans.length) suggestions.push("No floor plan - portals rank listings with one higher, and tenants filter on it.");
    if (d.body && words < 120) suggestions.push(`The write-up is short (${words} words) - 150 to 300 reads as complete.`);
    if (!d.highlights.length) suggestions.push("No key features (highlights) - they show as the bullet list on Rightmove.");
    if (d.heading && d.heading.length > 255) suggestions.push("The heading is over 255 characters - Zoopla refuses it.");
    if (!d.material.broadband) suggestions.push("Broadband is not set - it is part of the material information portals ask for.");
    if (d.epc.expiry && new Date(d.epc.expiry).getTime() < Date.now() + 60 * 86400000) suggestions.push(`The EPC expires ${day(d.epc.expiry)} - worth renewing before it lapses on a live advert.`);

    return {
      address: d.address || t.address,
      status: d.status === "published" ? "live" : d.status ?? "not recorded",
      readyToPublish: gaps.length === 0 && d.blockers.publish.length === 0,
      missing: [...gaps.map((g) => g.label), ...d.blockers.publish],
      portalProblems: d.blockers.portals,
      onPortals: portals.map((p) => p.portal),
      heading: d.heading || "not written",
      writeUp: d.body ? `${words} words: ${d.body.slice(0, 500)}${d.body.length > 500 ? "…" : ""}` : "not written",
      highlights: d.highlights,
      photos: d.images.length,
      floorPlans: d.floorplans.length,
      rent: money(d.rent, d.rentPeriod),
      deposit: d.deposit != null ? money(d.deposit, "") : "not recorded",
      availableFrom: day(d.availableFrom) ?? "not recorded",
      bedrooms: d.beds ?? "not recorded",
      epc: d.epc.rating ? `${d.epc.rating}${d.epc.expiry ? `, expires ${day(d.epc.expiry)}` : ""}` : "not recorded",
      suggestions,
      editHere: `/listings?open=${encodeURIComponent(id)}&tab=marketing`,
      fixWhere: "Every missing field is filled in on the listing's Marketing tab here in the OS - offer to open it there (offer_to_open, kind listing). Do not send them to REX for it.",
    };
  },
};

/* ── jobs (maintenance) ───────────────────────────────────────────────── */

const propertyJobs: AssistantTool = {
  name: "property_jobs",
  description:
    "The maintenance jobs (works orders) on a property: what was reported, by whom, the job description, the contractor, the quote and where it has got to. Call it for 'any jobs on X', 'what is the repair at X', 'has the boiler at X been fixed'. Needs a listingId (or a propertyId).",
  input_schema: {
    type: "object",
    properties: {
      listingId: { type: "string", description: "The listingId from find_property." },
      propertyId: { type: "string", description: "The REX property id, if you have it instead." },
    },
  },
  label: () => "Reading the jobs…",
  async run(input, ctx) {
    let propertyId = str(input.propertyId);
    let address = "";
    const listingId = str(input.listingId);
    if (listingId) {
      const t = await theirListing(listingId, ctx);
      if (!t.ok) return { error: t.error };
      address = t.address;
      propertyId = propertyId || t.propertyId || (await readListingDetails(Number(listingId)).catch(() => null))?.propertyId || "";
    } else if (!ctx.scope.everything) {
      return { error: "Give me the property from find_property first, so I can check it is yours." };
    }
    if (!propertyId) return { error: "I couldn't find the property record behind that listing." };
    const orders = await listOrders({ propertyId, limit: 40 });
    const open = orders.filter((o) => (OPEN_STATUSES as string[]).includes(o.status));
    return {
      address: address || `property ${propertyId}`,
      open: open.length,
      jobs: orders.slice(0, 15).map((o) => ({
        ref: o.ref,
        title: o.title,
        description: o.description ?? "not written",
        kind: o.kind,
        status: o.status,
        urgency: o.urgency ?? null,
        reported: day(o.reportedAt),
        reportedBy: o.reportedBy ?? null,
        contractor: o.contractorName ?? "none yet",
        quote: o.quotePence != null ? money(o.quotePence / 100, "") : null,
        done: o.completedAt ? day(o.completedAt) : null,
        note: o.completionNote ?? null,
      })),
      ...(orders.length ? {} : { note: "No jobs recorded on this property in the OS." }),
      board: "/maintenance",
    };
  },
};

/* ── what to do next on their appraisals (on-screen awareness) ────────── */

const myNextSteps: AssistantTool = {
  name: "appraisal_next_step",
  description:
    "Where a market appraisal (valuation) has got to and the NEXT thing to do on it, step by step. Call it for 'how do I sort my valuation', 'what's next on X', 'how do I use this for my appraisal', or whenever an appraisal is open on their screen and they ask what to do. With no appraisalId it reads all of theirs that are still open. Then talk them through the one next step in plain words and offer to open it (offer_to_open with kind 'appraisal').",
  input_schema: {
    type: "object",
    properties: { appraisalId: { type: "string", description: "The appraisal id if one is open on their screen or named; leave out for all of theirs." } },
  },
  label: () => "Reading where your appraisals are up to…",
  async run(input, ctx) {
    if (ctx.scope.unlinked) return { error: "I can't tell which agent you are, so I can't read your appraisals." };
    const wanted = str(input.appraisalId);
    const all = await listAppraisals();
    const mine = all.filter((a) => (wanted ? a.id === wanted : true) && (ctx.scope.everything || a.agent === ctx.scope.label));
    const live = await withLiveStages(mine);
    const open = live.filter((a) => wanted || ((a.liveStage ?? a.stage) !== "won" && (a.liveStage ?? a.stage) !== "lost"));
    if (!open.length) return { note: wanted ? "That appraisal isn't one of yours." : "You have no open appraisals." };
    const stageLabel = (id: string) => MA_STAGES.find((s) => s.id === id)?.label ?? id;
    return {
      appraisals: open.slice(0, 8).map((a) => {
        const ticks = a.ticks ?? [];
        const stage = a.liveStage ?? a.stage;
        const next = ticks.find((t) => t.stage === stage && !t.done) ?? ticks.find((t) => !t.done) ?? null;
        return {
          appraisalId: a.id,
          address: a.address,
          landlord: a.landlord,
          appointment: day(a.appointmentAt),
          stage: stageLabel(stage),
          why: a.stageWhy,
          nextStep: next ? next.label : MA_STAGES.find((s) => s.id === stage)?.blurb ?? "Nothing outstanding",
          doneSoFar: ticks.filter((t) => t.done).map((t) => t.label),
          opens: { kind: "appraisal", id: a.id },
        };
      }),
    };
  },
};

/* ── tasks and lists, as a proposal ───────────────────────────────────── */

async function staffByName(name: string): Promise<{ id: string; name: string; email: string } | null> {
  if (!hasDb() || !name) return null;
  const n = name.trim().toLowerCase();
  const rows = await q<{ id: string; name: string; email: string }>(
    `SELECT id, name, email FROM os_users
      WHERE LOWER(TRIM(name)) = $1 OR LOWER(email) = $1 OR LOWER(SPLIT_PART(TRIM(name), ' ', 1)) = $1
      ORDER BY (LOWER(TRIM(name)) = $1) DESC LIMIT 2`,
    [n]
  ).catch(() => []);
  /* A first name two people share is not a person. */
  if (rows.length > 1 && rows[0].name.toLowerCase() !== n && rows[1].name.toLowerCase() !== n) return null;
  return rows[0] ?? null;
}

const proposeTasks: AssistantTool = {
  name: "propose_tasks",
  description:
    "Create a task, or a list of tasks (a checklist), for the person or for a named colleague - e.g. 'get photos and a floor plan for 4 Williams Court', 'make me a list for my take-on on Friday', 'give Rhiannon a task to chase the EPC'. Shows a card; nothing is created until they press it. Use it when they ask, AND offer it yourself when you have just found things that need doing (missing marketing, an overdue step). Keep items short and doable; one line each; a due date only when it matters.",
  input_schema: {
    type: "object",
    properties: {
      items: {
        type: "array",
        description: "The tasks, in the order to do them. One is fine.",
        items: {
          type: "object",
          properties: {
            title: { type: "string", description: "Short, starts with a verb: 'Book the photographer'." },
            detail: { type: "string", description: "Optional, one line." },
            due: { type: "string", description: "Optional ISO date (YYYY-MM-DD) it is due." },
          },
          required: ["title"],
        },
      },
      assignee: { type: "string", description: "Who it is for, by name or email. Leave out for the person asking." },
      listingId: { type: "string", description: "The listing it is about, if any." },
    },
    required: ["items"],
  },
  label: (i) => `Drafting ${Array.isArray(i.items) && i.items.length > 1 ? "a list" : "a task"}…`,
  async run(input, ctx) {
    const raw = Array.isArray(input.items) ? (input.items as Record<string, unknown>[]) : [];
    const items = raw
      .map((it) => ({ title: noDashes(str(it.title)).slice(0, 200), detail: noDashes(str(it.detail)).slice(0, 500), due: /^\d{4}-\d{2}-\d{2}$/.test(str(it.due)) ? str(it.due) : null }))
      /* Never a date already gone: that is a misread, not a deadline. */
      .map((it) => (it.due && it.due < new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" }) ? { ...it, due: null } : it))
      .filter((it) => it.title)
      .slice(0, 12);
    if (!items.length) return { error: "Give me at least one task." };
    const listingId = str(input.listingId) || null;
    let address: string | null = null;
    if (listingId) {
      const t = await theirListing(listingId, ctx);
      if (!t.ok) return { error: t.error };
      address = t.address;
    }
    const who = str(input.assignee);
    let assignee: { id: string; name: string } | null = null;
    if (who && !/^(me|myself|i)$/i.test(who)) {
      const found = await staffByName(who);
      if (!found) return { error: `I couldn't find one person called "${who}" in the OS. Give me their full name or email.` };
      assignee = { id: found.id, name: found.name || found.email };
    }
    return {
      __proposal: {
        kind: "tasks",
        listingId,
        address,
        /* null = whoever presses the button, resolved at execution. */
        assigneeId: assignee?.id ?? null,
        assigneeName: assignee?.name ?? null,
        items,
      },
      ok: `A card with ${items.length === 1 ? "the task" : `${items.length} tasks`} is under your reply. Nothing is created until they press it. Say who it is for in one line.`,
    };
  },
};

/* ── memory: how each person likes to work ───────────────────────────── */

const MEMORY_KEY = "steve.memory";
type Memory = { notes: { at: string; text: string }[] };

export async function memoryFor(userId: string | null | undefined): Promise<Memory> {
  if (!hasDb() || !userId) return { notes: [] };
  const rows = await q<{ value: Memory }>(`SELECT value FROM os_user_prefs WHERE user_id = $1 AND key = $2`, [userId, MEMORY_KEY]).catch(() => []);
  const v = rows[0]?.value;
  return v && Array.isArray(v.notes) ? v : { notes: [] };
}

async function saveMemory(userId: string, m: Memory): Promise<void> {
  await q(
    `INSERT INTO os_user_prefs (user_id, key, value, updated_at) VALUES ($1, $2, $3::jsonb, NOW())
     ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [userId, MEMORY_KEY, JSON.stringify(m)]
  );
}

const remember: AssistantTool = {
  name: "remember_about_them",
  description:
    "Keep a short note about how THIS person likes to work, so you serve them better next time: preferences ('likes answers as a list', 'rings landlords before emailing'), their patch or specialism, what they struggle with, standing instructions ('always copy Kirstie'). Call it when they tell you something like that, or ask you to remember something - never for one-off facts about a property. To forget something, pass forget with the words of the note. What you have kept is given to you at the start of every conversation with them.",
  input_schema: {
    type: "object",
    properties: {
      note: { type: "string", description: "One short line, in the third person: 'Prefers a checklist to prose.'" },
      forget: { type: "string", description: "Words from a kept note to remove instead." },
    },
  },
  label: () => "Noting that for next time…",
  async run(input, ctx) {
    const userId = ctx.me?.id;
    if (!userId || !hasDb()) return { error: "I can't keep notes on this environment." };
    const m = await memoryFor(userId);
    const forget = str(input.forget).toLowerCase();
    if (forget) {
      const before = m.notes.length;
      m.notes = m.notes.filter((n) => !n.text.toLowerCase().includes(forget));
      await saveMemory(userId, m);
      return { ok: before === m.notes.length ? "Nothing matched to forget." : "Forgotten." };
    }
    const note = noDashes(str(input.note)).slice(0, 240);
    if (!note) return { error: "Nothing to remember." };
    if (!m.notes.some((n) => n.text.toLowerCase() === note.toLowerCase())) {
      m.notes = [...m.notes, { at: new Date().toISOString(), text: note }].slice(-30);
      await saveMemory(userId, m);
    }
    return { ok: "Kept. Acknowledge it in a few words." };
  },
};

/* ── marketing knowledge: the File Store ──────────────────────────────── */

const findFile: AssistantTool = {
  name: "find_file",
  description:
    "Search the File Store (the marketing knowledge: brochures, guides, forms, templates, logos, videos the team has uploaded) by name, and hand the matches over as download buttons under your reply. Call it whenever someone asks for a document, form, template, brochure, guide or 'that file about X'. Leave query empty to list the most recent. Say what you found in a line; the buttons do the rest.",
  input_schema: {
    type: "object",
    properties: { query: { type: "string", description: "Words from the file's name, e.g. 'landlord guide' or 'fees'." } },
  },
  label: (i) => (str(i.query) ? `Looking in the File Store for ${str(i.query)}…` : "Looking in the File Store…"),
  async run(input) {
    const files = await shelfFiles().catch(() => null);
    if (!files) return { error: "I couldn't open the File Store just now." };
    const words = str(input.query).toLowerCase().replace(/[^a-z0-9]+/g, " ").split(" ").filter((w) => w.length > 1);
    const hits = words.length
      ? files.filter((f) => {
          const n = f.name.toLowerCase().replace(/[^a-z0-9]+/g, " ");
          /* Stems, so tenancy finds tenancies and guide finds guidelines. */
          return words.every((w) => n.includes(w.length > 5 ? w.slice(0, -2) : w.replace(/s$/, "")));
        })
      : files;
    const top = hits.slice(0, 6);
    return {
      __files: top.map((f) => ({ name: f.name, href: f.href })),
      found: hits.length,
      files: top.map((f) => ({ name: f.name, size: `${Math.max(1, Math.round(f.size / 1024))} KB`, added: f.uploadedAt?.slice(0, 10) ?? null })),
      ...(hits.length ? {} : { note: "Nothing in the File Store by that name. Files are added on Marketing hub > File Store." }),
    };
  },
};

export const MORE_TOOLS: AssistantTool[] = [listingViewings, listingApplications, listingMarketing, propertyJobs, myNextSteps, proposeTasks, remember, findFile];

/** Download buttons a tool asked for. Our own /api/r2/file links only. */
export function filesFrom(result: unknown): { name: string; href: string }[] {
  const f = (result as { __files?: unknown } | null)?.__files;
  return Array.isArray(f) ? (f as { name: string; href: string }[]).filter((x) => typeof x?.href === "string" && x.href.startsWith("/api/r2/file?")) : [];
}
