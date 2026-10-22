import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { aiFailure } from "@/lib/ai-outage";

/**
 * READ A CONTRACTOR'S INVOICE (the agents' call, 20 Oct 2026: "can I not see
 * how much it is?"). The total, the invoice number and the date, read off the
 * PDF or photo the moment it is attached, so the agent checks a figure rather
 * than keys one. Nothing is saved from here: the form is filled in and the
 * agent saves it as before.
 *
 * Structured output, not a forced tool call: Claude Opus 5.5 refuses forced
 * tool_choice. A refused or unreadable file comes back empty and the agent
 * types the figure, as they did before this existed.
 */

const MODEL = process.env.INVOICE_READER_MODEL ?? "claude-opus-5-5";

export interface InvoiceRead {
  /** In pounds, the amount to pay including VAT. */
  total: number | null;
  ref: string | null;
  /** YYYY-MM-DD. */
  date: string | null;
  from: string | null;
}

const EMPTY: InvoiceRead = { total: null, ref: null, date: null, from: null };

const SYSTEM = `You read one UK contractor's invoice (a tradesperson billing a letting agent for work at a rented home).
Report only what is printed. Leave anything you cannot see as null rather than guessing.
- total: the amount due to be paid, in pounds, INCLUDING VAT where VAT is charged (the grand total / balance due), as a number with no currency sign.
- ref: the invoice number as printed.
- date: the invoice date as YYYY-MM-DD.
- from: the business that issued the invoice.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    total: { type: ["number", "null"] },
    ref: { type: ["string", "null"] },
    date: { type: ["string", "null"] },
    from: { type: ["string", "null"] },
  },
  required: ["total", "ref", "date", "from"],
};

const realDay = (v: unknown): string | null => {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v ? v : null;
};

export async function readInvoice(bytes: Buffer, type: string): Promise<InvoiceRead> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("The invoice reader is not set up here.");
  if (bytes.length > 15 * 1024 * 1024) throw new Error("That file is too large to read.");
  const isPdf = type.includes("pdf") || bytes.subarray(0, 4).toString() === "%PDF";
  const media = isPdf ? null : /png/.test(type) ? "image/png" : /jpe?g/.test(type) ? "image/jpeg" : /webp/.test(type) ? "image/webp" : null;
  if (!isPdf && !media) throw new Error("Only a PDF or a photo of the invoice can be read.");

  /* Not through lib/ai yet, so the API's refusal is turned into a sentence here (lib/ai-outage). */
  const out = await new Anthropic().beta.messages.create({
    model: MODEL,
    max_tokens: 2000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
    messages: [
      {
        role: "user",
        content: [
          isPdf
            ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: bytes.toString("base64") } }
            : { type: "image", source: { type: "base64", media_type: media as "image/png" | "image/jpeg" | "image/webp", data: bytes.toString("base64") } },
          { type: "text", text: "Read this invoice." },
        ],
      },
    ],
  }).catch((e: unknown) => {
    throw aiFailure("invoice-reader", "reader", e);
  });
  if (out.stop_reason === "refusal" || out.stop_reason === "max_tokens") return EMPTY;
  const text = out.content.find((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")?.text ?? "";
  let x: Record<string, unknown>;
  try {
    x = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return EMPTY;
  }
  const total = typeof x.total === "number" && Number.isFinite(x.total) && x.total > 0 && x.total < 1_000_000 ? Math.round(x.total * 100) / 100 : null;
  const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
  return { total, ref: str(x.ref, 60), date: realDay(x.date), from: str(x.from, 120) };
}
