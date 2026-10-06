import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { contentBlock, fetchDocument } from "@/lib/plc-scan";
import { PLC_CHECKS, type CheckId, type FileRead, type PlcDocument } from "@/lib/plc";

/**
 * One file, read the moment it is dropped on a PLC pack.
 *
 * James, 6 Oct 2026, after walking a real HMO room through the wizard with
 * Rhiannon: "we should be able to drop in a whole folder ... automatically
 * work out what type of document it is ... confirm any validation dates and
 * how long it's valid until." So every file is read on arrival for three
 * things only: which check it belongs to, the dates on it, and the names on
 * it. The agent sees the answer and can move the file; nothing is decided.
 *
 * This is NOT the scan. The scan still runs when the pack is sent, with the
 * bigger model, against the move-in date, and its findings are what the
 * compliance team read. This only sorts the pile, so it is the small model:
 * a folder can be twenty files and the agent is watching it happen.
 */

const MODEL = process.env.PLC_SORTER_MODEL ?? "claude-haiku-4-5-20251001";

const SYSTEM = `You are sorting documents dropped into a UK letting agent's pre-let check pack.
For ONE document, say what it is, which slot it belongs in, the dates printed on it and the
people named on it. Report only what you can see. Never guess a date: leave it empty if it is
not printed, unless the document type has a standard life and you say you derived it.
Dates as YYYY-MM-DD.

Slots:
- landlord-id-aml: the landlord's photo ID (passport, driving licence), proof of address
  (utility bill, bank or council tax statement), proof of ownership (Land Registry title), AML check
- tenant-checks: a tenant referencing report or outcome (Goodlord, Homelet, Let Alliance, Propoly
  referencing, Legal for Landlords, credit check)
- guarantor-checks: a guarantor's referencing report, or a signed deed of guarantee
- right-to-rent: a TENANT's passport, visa, BRP, share code result, or Right to Rent check
- gas-safety: Gas Safety Record / CP12 (12 months)
- epc: Energy Performance Certificate (10 years)
- eicr: Electrical Installation Condition Report or Electrical Installation Certificate (usually 5 years)
- licensing: HMO, additional or selective licence, or the council saying none is needed
- pat: Portable Appliance Test report (usually 12 months)
- fire-safety: fire risk assessment, emergency lighting or fire alarm certificate (usually 12 months)
- alarms: smoke or carbon monoxide alarm test record or certificate
- legionella: legionella risk assessment (usually 2 years)
- tenancy-agreement: a tenancy agreement (AST, room let agreement, occupation contract)
- other: anything else (inventory, floor plan, photos, invoices)

A passport or driving licence is the landlord's ID if the name matches the landlord; if the
name matches a tenant, or you cannot tell and it looks like a tenant's, it is right-to-rent.`;

const SLOTS = PLC_CHECKS.map((c) => c.id);

const TOOL: Anthropic.Tool = {
  name: "sort_document",
  description: "Which slot this document belongs in, and the facts on it.",
  input_schema: {
    type: "object",
    properties: {
      slot: { type: "string", enum: SLOTS },
      what: { type: "string", description: "What the document is, in 2-5 words, e.g. 'Gas Safety Record'" },
      issue_date: { type: "string", description: "YYYY-MM-DD or empty" },
      expiry_date: {
        type: "string",
        description: "The expiry, valid-until or next-inspection date, YYYY-MM-DD, or empty",
      },
      expiry_derived: { type: "boolean", description: "true if worked out from the issue date and the usual life" },
      names: { type: "array", items: { type: "string" }, description: "People named on it, as printed" },
      confidence: { type: "string", enum: ["high", "medium", "low"] },
      note: { type: "string", description: "One short sentence, only if something needs saying (expired, unsigned, wrong address)" },
    },
    required: ["slot", "what", "confidence"],
  },
};

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const date = (v: unknown): string | null => {
  const s = String(v ?? "").trim();
  return YMD.test(s) && s >= "1990-01-01" && s <= "2060-12-31" ? s : null;
};

export const sorterConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY);

/** Said under a file the reader could not open, whatever the reason. */
const UNREAD = "Not read automatically, so sorted by its file name. Check it is in the right place.";

/**
 * Read one stored file. Never throws: a file the reader cannot open comes
 * back unplaced, with the reason, and the agent picks the slot by hand.
 */
export async function readDroppedFile(
  doc: Pick<PlcDocument, "key" | "name" | "placeholder">,
  context: { address: string; landlordName?: string | null; tenantNames?: string[] }
): Promise<FileRead> {
  const at = new Date().toISOString();
  const blank = (note: string): FileRead => ({
    checkId: null,
    what: "",
    issueDate: null,
    expiryDate: null,
    names: [],
    confidence: "low",
    note,
    at,
  });
  if (!sorterConfigured()) return blank(UNREAD);

  let fetched;
  try {
    fetched = await fetchDocument({ ...doc, checkId: "other", url: "", addedAt: "", addedBy: "" });
  } catch (e) {
    return blank(`Couldn't open it to read: ${e instanceof Error ? e.message : "unknown error"}.`);
  }
  if (!/^(application\/pdf|image\/(jpeg|png|webp|gif))$/.test(fetched.media)) {
    return blank("This kind of file can't be read automatically, so pick where it goes.");
  }

  const who = [
    `The property is ${context.address}.`,
    context.landlordName ? `The landlord is ${context.landlordName}.` : "",
    context.tenantNames?.length ? `The tenants are ${context.tenantNames.join(", ")}.` : "",
    `The file is named "${doc.name}".`,
  ]
    .filter(Boolean)
    .join(" ");

  try {
    const client = new Anthropic();
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 400,
      system: SYSTEM,
      tools: [TOOL],
      tool_choice: { type: "tool", name: "sort_document" },
      messages: [{ role: "user", content: [contentBlock(fetched), { type: "text", text: who }] }],
    });
    const use = res.content.find((b) => b.type === "tool_use");
    if (!use || use.type !== "tool_use") return blank(UNREAD);
    const i = use.input as Record<string, unknown>;
    const slot = SLOTS.includes(i.slot as CheckId) ? (i.slot as CheckId) : null;
    const confidence = i.confidence === "high" || i.confidence === "medium" ? i.confidence : "low";
    return {
      checkId: slot,
      what: String(i.what ?? "").slice(0, 80),
      issueDate: date(i.issue_date),
      expiryDate: date(i.expiry_date),
      ...(i.expiry_derived === true ? { expiryDerived: true } : {}),
      names: Array.isArray(i.names) ? i.names.map((n) => String(n).slice(0, 80)).slice(0, 8) : [],
      confidence,
      ...(i.note ? { note: String(i.note).slice(0, 240) } : {}),
      at,
    };
  } catch (e) {
    /* The agent gets a sentence they can act on; the API's own words go to
       the log, where whoever fixes it will look (6 Oct 2026: a spent credit
       balance put a raw JSON error under every file). */
    console.error("[plc-read-file]", e instanceof Error ? e.message : e);
    return blank(UNREAD);
  }
}
