import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { aiCreate } from "@/lib/ai";
import { realDayOrNull } from "@/lib/real-day";

/**
 * What one certificate says: its type, its dates and the address on it.
 * Facts only. Behind POST /api/compliance/certificates/read, and here on its
 * own so a model can be tried against real certificates without a request.
 */

const SYSTEM = `You are reading one document from a UK lettings compliance file. Report only what
you can see on it. Do not decide whether anything is compliant, and never guess a date:
if a field is not visible, leave it empty. Dates as YYYY-MM-DD.

Document types you may see: a Gas Safety Record (CP12, "next inspection due", usually
12 months), an Electrical Installation Condition Report (EICR, "next inspection" or
"recommended date of next inspection", usually 5 years - an Electrical Installation
Certificate for a new installation also counts, with the interval it recommends), an
Energy Performance Certificate (EPC, "valid until", 10 years), an HMO or selective
licence (issue and expiry dates), a Portable Appliance Test report, a Legionella Risk
Assessment (review date, usually 2 years), or something else entirely.

If the document states an expiry or next-inspection date, use it. If it states only an
issue or inspection date and an interval, work the expiry out from those and say so in
notes. Read the property address printed on the document.`;

const TOOL: Anthropic.Tool = {
  name: "report_certificate",
  description: "What the document is and the dates on it.",
  input_schema: {
    type: "object",
    properties: {
      type: { type: "string", enum: ["gas_safety", "eicr", "epc", "hmo_licence", "portable_appliance_testing", "legionella_risk_assessment", "other"] },
      issue_date: { type: "string", description: "YYYY-MM-DD or empty" },
      expiry_date: { type: "string", description: "YYYY-MM-DD or empty" },
      expiry_derived: { type: "boolean", description: "true when the expiry was worked out from an issue date and an interval rather than printed" },
      address: { type: "string", description: "The property address printed on the document, or empty" },
      postcode: { type: "string" },
      outcome: { type: "string", description: "pass, satisfactory, unsatisfactory, fail, or empty" },
      confidence: { type: "string", enum: ["high", "medium", "low"] },
      notes: { type: "string", description: "One sentence, only if something needs saying" },
    },
    required: ["type", "confidence"],
  },
};

export type CertificateRead = {
  type: string;
  issue: string | null;
  expiry: string | null;
  expiryDerived: boolean;
  address: string;
  postcode: string;
  outcome: string;
  confidence: string;
  notes: string;
};

export async function readCertificate(
  bytes: Buffer,
  media: string,
  expect: string
): Promise<{ read: CertificateRead; tokens: { in: number; out: number } }> {
  const block: Anthropic.ContentBlockParam =
    media === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: bytes.toString("base64") } }
      : { type: "image", source: { type: "base64", media_type: media as "image/jpeg" | "image/png" | "image/webp", data: bytes.toString("base64") } };

  const res = await aiCreate("cert-reader", {
    max_tokens: 4000,
    system: SYSTEM,
    tools: [TOOL],
    tool_choice: { type: "tool", name: "report_certificate" },
    messages: [
      {
        role: "user",
        content: [block, { type: "text", text: `${expect ? `This file was filed as: ${expect}. ` : ""}Read the document and report.` }],
      },
    ],
  });
  const call = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "report_certificate");
  const r = (call?.input ?? {}) as Record<string, unknown>;
  /* A worked-out "2025-02-29" comes back as the 28th, never as a date the
     filing will refuse (lib/certificate-intake realDayOrNull). */
  const ymd = realDayOrNull;
  return {
    read: {
      type: String(r.type ?? "other"),
      issue: ymd(r.issue_date),
      expiry: ymd(r.expiry_date),
      expiryDerived: Boolean(r.expiry_derived),
      address: String(r.address ?? "").slice(0, 200),
      postcode: String(r.postcode ?? "").toUpperCase().replace(/\s+/g, " ").trim().slice(0, 10),
      outcome: String(r.outcome ?? "").slice(0, 40),
      confidence: String(r.confidence ?? "low"),
      notes: String(r.notes ?? "").slice(0, 300),
    },
    tokens: { in: res.usage.input_tokens, out: res.usage.output_tokens },
  };
}
