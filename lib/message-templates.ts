import "server-only";
import { hasDb, q } from "@/lib/db";

/**
 * The words an agent sends by hand.
 *
 * ── Why this is not os_email_templates ────────────────────────────────────
 *
 * That table is keyed on (campaign_id, step_index) — it is an overlay for the
 * copy of a campaign step, and a row means nothing without a campaign behind
 * it. What was missing is the ordinary case: an agent with a landlord in front
 * of them who wants to send one email now.
 *
 * ── Built-ins live in code, edits live in the table ───────────────────────
 *
 * The starters below exist without a database, so a fresh environment has a
 * usable library rather than an empty list. A row in os_message_templates with
 * the same id OVERRIDES a built-in, and deleting that row reverts it. That
 * makes "put it back how it was" a real button rather than a support request.
 *
 * (lib/email/starters.js already existed and is TMKE's — "Welcome to TMKE".
 * Wrong brand and wrong business. These are TLE's.)
 *
 * ── Copy rules ────────────────────────────────────────────────────────────
 *
 * Client-facing, so: no em dashes, UK English, and nothing that reads as
 * automated. An agent should be able to send one of these unedited without it
 * sounding like it came from a system.
 */

export type Audience = "landlord" | "tenant" | "any";

export interface MessageTemplate {
  id: string;
  name: string;
  subject: string;
  /** Plain text with {{merge}} fields. Rendered into the branded shell. */
  body: string;
  audience: Audience;
  /** True when it comes from the code below rather than the table. */
  builtin: boolean;
  updatedAt?: string;
  updatedBy?: string;
}

/* ── the starters ─────────────────────────────────────────────────────────
   Landlord-heavy on purpose: the tenant side already had "send properties",
   and the landlord side had nothing at all, which is the gap James hit. */

export const BUILT_IN: MessageTemplate[] = [
  {
    id: "ll-book-valuation",
    name: "Book a valuation",
    audience: "landlord",
    subject: "A rental valuation for {{address}}",
    body: `Hi {{firstName}},

Thanks for getting in touch about {{address}}.

I would like to come and see it so I can give you a proper rental figure rather than a guess from a screen. It takes about half an hour, and you will get a written valuation afterwards either way.

What does your week look like? I can usually work around you, evenings included.

Best,
{{agent}}
The Letting Experts`,
    builtin: true,
  },
  {
    id: "ll-after-appraisal",
    name: "After the visit - the figure",
    audience: "landlord",
    subject: "What {{address}} should let for",
    body: `Hi {{firstName}},

Thank you for your time today.

I have put everything together and will send the full valuation across separately. The short version is that I am confident about the figure we discussed, and I have set out the comparable properties behind it so you can see how I got there.

If anything is unclear, ring me. I would rather talk it through than have you reading a document on your own.

Best,
{{agent}}
The Letting Experts`,
    builtin: true,
  },
  {
    id: "ll-terms-follow-up",
    name: "Terms follow-up",
    audience: "landlord",
    subject: "Terms for {{address}}",
    body: `Hi {{firstName}},

I sent our terms of business over for {{address}} and wanted to check they reached you.

There is nothing to print or post. It is all done on screen and takes a couple of minutes. Once it is signed we can get photographs booked and the advert live.

Any questions on the terms themselves, just ask. Happy to go through any of it.

Best,
{{agent}}
The Letting Experts`,
    builtin: true,
  },
  {
    id: "ll-still-thinking",
    name: "Still thinking it over",
    audience: "landlord",
    subject: "Still happy to help with {{address}}",
    body: `Hi {{firstName}},

I know you were weighing up what to do with {{address}}, so this is just a note to say I am still here when you are ready.

No rush and no pressure. If the timing has changed, or you have decided to go a different way, that is genuinely fine - just let me know and I will stop chasing you.

Best,
{{agent}}
The Letting Experts`,
    builtin: true,
  },
  {
    id: "any-quick-note",
    name: "Quick note (blank)",
    audience: "any",
    subject: "",
    body: `Hi {{firstName}},



Best,
{{agent}}
The Letting Experts`,
    builtin: true,
  },
];

/* ── merge fields ─────────────────────────────────────────────────────────
   Deliberately few. Every one of these is something we reliably hold; a merge
   field that is usually empty is a trap, because the day it is empty is the
   day it goes out as "Hi ," to a landlord. */

export const MERGE_FIELDS = [
  { key: "firstName", label: "First name" },
  { key: "name", label: "Full name" },
  { key: "address", label: "Property address" },
  { key: "postcode", label: "Postcode" },
  { key: "agent", label: "Agent name" },
] as const;

export type MergeValues = Partial<Record<(typeof MERGE_FIELDS)[number]["key"], string>>;

/**
 * Fill the merge fields, and SAY which ones could not be filled.
 *
 * It would be easier to swap an unknown field for "" and move on. That is how
 * "Hi ," reaches a landlord. Unresolved fields are left in the text exactly as
 * written and returned in `missing`, so the composer can refuse to send and
 * point at them rather than quietly producing a broken email.
 */
export function applyMerge(
  text: string,
  values: MergeValues
): { text: string; missing: string[] } {
  const missing = new Set<string>();
  const out = text.replace(/\{\{\s*(\w+)\s*\}\}/g, (whole, key: string) => {
    const v = (values as Record<string, string | undefined>)[key];
    if (v && v.trim()) return v.trim();
    missing.add(key);
    return whole;
  });
  return { text: out, missing: [...missing] };
}

/* ── storage ──────────────────────────────────────────────────────────────
   A row overrides a built-in of the same id; anything else is an agent's own.
   Reverting is a DELETE, which is why built-ins are never written to the
   table on first read. */

type Row = {
  id: string;
  name: string;
  subject: string;
  body: string;
  audience: string;
  updated_at: string;
  updated_by: string;
};

const toTemplate = (r: Row, builtinIds: Set<string>): MessageTemplate => ({
  id: r.id,
  name: r.name,
  subject: r.subject,
  body: r.body,
  audience: (["landlord", "tenant", "any"].includes(r.audience)
    ? r.audience
    : "any") as Audience,
  /* An edited built-in is still a built-in — that is what makes Revert
     meaningful. Only an id we have never shipped is somebody's own. */
  builtin: builtinIds.has(r.id),
  updatedAt: r.updated_at,
  updatedBy: r.updated_by,
});

export async function listTemplates(): Promise<MessageTemplate[]> {
  const builtinIds = new Set(BUILT_IN.map((t) => t.id));
  if (!hasDb()) return [...BUILT_IN];
  let rows: Row[] = [];
  try {
    rows = await q<Row>(
      `SELECT id, name, subject, body, audience, updated_at, updated_by
         FROM os_message_templates ORDER BY name`
    );
  } catch {
    /* No table yet is not an error worth showing an agent — the built-ins
       are a complete, usable library on their own. */
    return [...BUILT_IN];
  }
  const overridden = new Map(rows.map((r) => [r.id, toTemplate(r, builtinIds)]));
  const merged = BUILT_IN.map((t) => overridden.get(t.id) ?? t);
  for (const [id, t] of overridden) if (!builtinIds.has(id)) merged.push(t);
  return merged;
}

export async function saveTemplate(
  t: Pick<MessageTemplate, "id" | "name" | "subject" | "body" | "audience">,
  by: string
): Promise<void> {
  if (!hasDb()) throw new Error("No database, so templates cannot be saved here.");
  await q(
    `INSERT INTO os_message_templates (id, name, subject, body, audience, updated_by)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name, subject = EXCLUDED.subject, body = EXCLUDED.body,
       audience = EXCLUDED.audience, updated_by = EXCLUDED.updated_by,
       updated_at = NOW()`,
    [t.id, t.name, t.subject, t.body, t.audience, by]
  );
}

/** Revert a built-in, or delete somebody's own. */
export async function deleteTemplate(id: string): Promise<void> {
  if (!hasDb()) return;
  await q(`DELETE FROM os_message_templates WHERE id = $1`, [id]);
}
