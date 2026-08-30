import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { checkById, type CheckId } from "@/lib/plc";
import { readDocument, scanConfigured } from "@/lib/plc-scan";
import { summarise } from "@/lib/plc-rules";

/**
 * The scan bench: try a real certificate without touching anything.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 *
 * There is no way to know whether the scan is any good without giving it a
 * real gas certificate and a real EICR, and no honest way to get one except
 * off a live tenancy. Doing that through the wizard would mean a genuine
 * landlord's documents sitting in the bucket and a fake handover in the
 * queue, which then has to be remembered and deleted - and the deletion is
 * the step that gets forgotten.
 *
 * So this route reads bytes and returns findings. That is all it does.
 *
 * ── What it deliberately does NOT do ───────────────────────────────────────
 *
 *   - nothing is written to R2. The file is read out of the request body and
 *     goes out of scope when the response is sent.
 *   - no case is created, updated or read. The store is not imported.
 *   - nothing reaches REX, and no email leaves.
 *
 * The only trace is the API call to Anthropic, which is unavoidable - that IS
 * the thing being tested - and Anthropic does not train on API traffic.
 *
 * ── Refused in production ──────────────────────────────────────────────────
 *
 * Not gated behind a switch. Refused, because this is an endpoint that reads
 * an uploaded document with no record of who uploaded it or what happened to
 * it, and that is exactly right for a bench and exactly wrong for a live
 * system where every read of a compliance document should be attributable.
 *
 * It runs the SAME prompt, tool schema and model as the real scan, via
 * readDocument. A bench with its own prompt would test the bench.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

/** One document per request, and not a large one. */
const MAX_BYTES = 12 * 1024 * 1024;

const ALLOWED = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      {
        ok: false,
        error:
          "The bench only runs outside production. On the live system a document is read against a case, by a named person, and recorded.",
      },
      { status: 403 }
    );
  }

  if (!scanConfigured()) {
    return NextResponse.json(
      { ok: false, error: "ANTHROPIC_API_KEY is not set on this environment, so there is nothing to test." },
      { status: 503 }
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Expected a file upload." }, { status: 400 });
  }

  const file = form.get("file");
  const checkId = String(form.get("checkId") ?? "") as CheckId;
  const address = String(form.get("address") ?? "").trim();
  const moveInRaw = String(form.get("moveInDate") ?? "").trim();
  const moveInDate = /^\d{4}-\d{2}-\d{2}$/.test(moveInRaw) ? moveInRaw : null;

  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "No file was attached." }, { status: 400 });
  }
  const check = checkById(checkId);
  if (!check) {
    return NextResponse.json({ ok: false, error: "Pick which check to read it against." }, { status: 400 });
  }
  /* Right to Rent is scan: "none" — the model is never asked about it in the
     product, so the bench must not be able to ask either. Otherwise somebody
     tries it here, sees a confident answer, and reasonably assumes the real
     scan does the same. */
  if (check.scan === "none") {
    return NextResponse.json(
      {
        ok: false,
        error: `${check.label} is never sent to the model. ${check.why}`,
      },
      { status: 400 }
    );
  }
  if (!ALLOWED.includes(file.type)) {
    return NextResponse.json(
      { ok: false, error: `${file.type || "That file type"} cannot be read. Use a PDF or a photograph.` },
      { status: 415 }
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { ok: false, error: `That file is ${(file.size / 1024 / 1024).toFixed(1)}MB — the limit is 12MB.` },
      { status: 413 }
    );
  }

  const started = Date.now();
  try {
    const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    const read = await readDocument(
      new Anthropic(),
      { name: file.name, media: file.type, base64 },
      { checkId, address: address || "the property", moveInDate }
    );
    return NextResponse.json({
      ok: true,
      /* The rule verdict and the reasons that produced it, separately from the
         model's prose. Seeing which rule fired is the whole reason to run the
         bench twice on the same document with a different move-in date. */
      verdict: read.result.verdict,
      /* The one-liner first. A screen that leads with thirty rows of yes and no
         gets scrolled past, and everybody assumes somebody read it. */
      summary: summarise(check.label, read.result),
      reasons: read.result.reasons,
      facts: read.facts,
      findings: read.observations,
      /* Stated back so the bench cannot mislead about what it was told. The
         date checks are all "in date ON the move-in date", and a run with no
         move-in date answers a different question from the real scan. */
      asked: { check: check.label, address: address || "the property", moveInDate },
      ms: Date.now() - started,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "The read failed." },
      { status: 502 }
    );
  }
}

/** Whether the bench can run here at all, for the page to say so before you upload. */
export async function GET() {
  return NextResponse.json({
    ok: true,
    available: process.env.NODE_ENV !== "production",
    scanConfigured: scanConfigured(),
  });
}
