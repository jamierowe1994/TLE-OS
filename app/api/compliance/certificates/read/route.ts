import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireAnyCapability } from "@/lib/admin";

/**
 * POST /api/compliance/certificates/read → what one certificate says.
 *
 * Multipart: file (PDF or image), plus an optional `expect` (gas_safety,
 * eicr, epc, …) from wherever the file was filed. The model reports the
 * document's type, its dates and the property address ON the document -
 * facts only, no judgement - so the backlog runner can decide whether to
 * write it and where. Same shape as the PLC reader: one call, one
 * document, a forced tool call so the answer is structured.
 *
 * A small model on purpose: a certificate is a form, and the run is a few
 * thousand of them. CERT_READER_MODEL overrides.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = process.env.CERT_READER_MODEL ?? "claude-haiku-4-5-20251001";
const MAX_BYTES = 12 * 1024 * 1024;

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

export async function POST(req: NextRequest) {
  const me = await requireAnyCapability(req, ["manage:switches", "see:agent-compliance"]);
  if (!me) return NextResponse.json({ ok: false, error: "Not yours." }, { status: 403 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ ok: false, error: "No reader key on this environment." }, { status: 503 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const expect = String(form?.get("expect") ?? "").trim();
  if (!(file instanceof File) || !file.size) return NextResponse.json({ ok: false, error: "No file." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ ok: false, error: "Over 12MB - almost certainly a whole pack, not one certificate." }, { status: 413 });

  const bytes = Buffer.from(await file.arrayBuffer());
  const name = (file.name || "").toLowerCase();
  const isPdf = file.type === "application/pdf" || name.endsWith(".pdf") || bytes.subarray(0, 4).toString() === "%PDF";
  const media = isPdf ? "application/pdf" : /\.(jpe?g)$/.test(name) ? "image/jpeg" : /\.png$/.test(name) ? "image/png" : /\.webp$/.test(name) ? "image/webp" : null;
  if (!media) return NextResponse.json({ ok: false, error: "Only PDFs and images can be read." }, { status: 415 });

  const block: Anthropic.ContentBlockParam = isPdf
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: bytes.toString("base64") } }
    : { type: "image", source: { type: "base64", media_type: media as "image/jpeg" | "image/png" | "image/webp", data: bytes.toString("base64") } };

  try {
    const client = new Anthropic();
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 400,
      system: SYSTEM,
      tools: [TOOL],
      tool_choice: { type: "tool", name: "report_certificate" },
      messages: [
        {
          role: "user",
          content: [
            block,
            { type: "text", text: `${expect ? `This file was filed as: ${expect}. ` : ""}Read the document and report.` },
          ],
        },
      ],
    });
    const call = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "report_certificate");
    const r = (call?.input ?? {}) as Record<string, unknown>;
    const ymd = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
    return NextResponse.json({
      ok: true,
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
    });
  } catch (e) {
    /* Not 502: Cloudflare swaps an origin 502 for its own error page, and
       the reason (the backlog run, 6 Sep: "Your credit balance is too low")
       never reaches the caller. */
    const msg = e instanceof Error ? e.message : "read failed";
    const plain = /credit balance/i.test(msg) ? "The reader's Anthropic account has run out of credit - top it up at console.anthropic.com." : msg;
    return NextResponse.json({ ok: false, error: plain }, { status: 500 });
  }
}
