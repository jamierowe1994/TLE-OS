import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { aiCreate } from "@/lib/ai";
import { hasDb, q } from "@/lib/db";
import { bandForScore, type EpcBand } from "@/lib/listing-record";

/**
 * THE EPC, READ OFF THE CERTIFICATE (James, 6 Oct 2026): "If you're reading
 * the EPC, you should automatically be able to fill that out."
 *
 * The listing already carries the certificate (REX's epc_file). This reads
 * the current band and both SAP scores off it - REX takes the two scores
 * together or not at all - and keeps the answer in os_cache against the
 * file, so a listing opened twice is read once. The agent still sees the
 * boxes and can change them; nothing here writes anywhere.
 */

/* v2 (15 Oct 2026): the date as well as the scores, so a listing read under
   v1 is read once more rather than kept without one. */
const KEY = (fileUrl: string) => `epc-read:v2:${fileUrl.replace(/^https?:/, "")}`;

export interface EpcRead {
  band: EpcBand | null;
  current: number | null;
  potential: number | null;
  /** The date the certificate was lodged (YYYY-MM-DD). REX will not take the
      two scores without it (bug bf3ba4c2, 11 Oct 2026). */
  lodged: string | null;
}

const SYSTEM = `You are reading one UK Energy Performance Certificate (England, Wales or Scotland)
for a lettings agent who must put its rating on an advert. Report only what is printed.
- current: the CURRENT energy efficiency rating score (SAP, a number usually 1-100, sometimes
  over 100), the number shown against the current band on the energy efficiency rating chart.
- potential: the POTENTIAL energy efficiency rating score from the same chart.
- band: the current energy efficiency band letter, A to G.
- certificate_date: the date of the certificate (also printed as "Date of certificate",
  "Date of lodgement" or "Certificate date"), as YYYY-MM-DD.
- valid_until: the "Valid until" date, as YYYY-MM-DD. Newer certificates print only this one.
Ignore the environmental impact (CO2) rating chart; Scottish certificates print both, and only
the energy efficiency one is wanted. Leave anything you cannot see empty rather than guessing.`;

const TOOL: Anthropic.Tool = {
  name: "report_epc",
  description: "The current band and both energy efficiency scores.",
  input_schema: {
    type: "object",
    properties: {
      band: { type: "string", enum: ["A", "B", "C", "D", "E", "F", "G", ""] },
      current: { type: "integer", description: "Current energy efficiency score, or 0 if not printed" },
      potential: { type: "integer", description: "Potential energy efficiency score, or 0 if not printed" },
      certificate_date: { type: "string", description: "Date of the certificate as YYYY-MM-DD, or empty if not printed" },
      valid_until: { type: "string", description: "Valid until date as YYYY-MM-DD, or empty if not printed" },
    },
    required: ["band", "current", "potential"],
  },
};

/** A real calendar date, YYYY-MM-DD, or null. */
const ymd = (v: unknown): string | null => {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v.trim())) return null;
  const d = new Date(`${v.trim()}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v.trim() ? v.trim() : null;
};

/**
 * The lodgement date: printed, or ten years before "Valid until" (an EPC
 * runs ten years from the day it is lodged; the newer certificates print
 * only the end date). Never a date in the future.
 */
export function lodgedFrom(certificateDate: unknown, validUntil: unknown): string | null {
  const today = new Date().toISOString().slice(0, 10);
  const printed = ymd(certificateDate);
  if (printed && printed <= today) return printed;
  const until = ymd(validUntil);
  if (!until) return null;
  /* 29 February ten years back is the 28th. */
  const from = ymd(`${Number(until.slice(0, 4)) - 10}${until.slice(4)}`) ?? `${Number(until.slice(0, 4)) - 10}-02-28`;
  return from <= today ? from : null;
}

const score = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 150 ? n : null;
};

export async function readEpcFile(fileUrl: string): Promise<EpcRead> {
  const url = fileUrl.startsWith("//") ? `https:${fileUrl}` : fileUrl;
  if (hasDb()) {
    const held = await q<{ payload: { data: EpcRead } }>("SELECT payload FROM os_cache WHERE key = $1", [KEY(url)]).catch(() => []);
    if (held[0]?.payload?.data) return held[0].payload.data;
  }
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("The EPC reader is not set up here.");
  /* Only REX's own file store: this fetches a URL the listing gave us, and
     must never become a way to make the server fetch anything else. */
  if (!/^https:\/\/[a-z0-9.-]+\.rexsoftware\.com\//i.test(url)) throw new Error("That EPC is not somewhere we can read it from.");
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("The EPC file would not open.");
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length > 12 * 1024 * 1024) throw new Error("That EPC is too large to read.");
  const type = res.headers.get("content-type") ?? "";
  const isPdf = type.includes("pdf") || bytes.subarray(0, 4).toString() === "%PDF";
  const media = isPdf ? null : /png/.test(type) ? "image/png" : /jpe?g/.test(type) ? "image/jpeg" : /webp/.test(type) ? "image/webp" : null;
  if (!isPdf && !media) throw new Error("Only a PDF or a photo of the EPC can be read.");

  const out = await aiCreate("epc-reader", {
    max_tokens: 4000,
    system: SYSTEM,
    tools: [TOOL],
    tool_choice: { type: "tool", name: "report_epc" },
    messages: [
      {
        role: "user",
        content: [
          isPdf
            ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: bytes.toString("base64") } }
            : { type: "image", source: { type: "base64", media_type: media as "image/png" | "image/jpeg" | "image/webp", data: bytes.toString("base64") } },
          { type: "text", text: "Read the energy efficiency rating from this EPC." },
        ],
      },
    ],
  });
  const call = out.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
  const x = (call?.input ?? {}) as Record<string, unknown>;
  const current = score(x.current);
  const potential = score(x.potential);
  const printed = typeof x.band === "string" && /^[A-G]$/.test(x.band) ? (x.band as EpcBand) : null;
  /* The score decides the band when both are read and they disagree: the
     letter is the easier thing to misread off a coloured chart. */
  const read: EpcRead = { band: bandForScore(current) ?? printed, current, potential, lodged: lodgedFrom(x.certificate_date, x.valid_until) };
  if (hasDb() && (read.band || read.current)) {
    await q(
      `INSERT INTO os_cache (key, payload, computed_at) VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET payload = EXCLUDED.payload, computed_at = NOW()`,
      [KEY(url), JSON.stringify({ data: read })]
    ).catch(() => {});
  }
  return read;
}
