import { NextRequest, NextResponse } from "next/server";
import { publicError } from "@/lib/public-error";
import { readCertificate } from "@/lib/cert-read";
import { whoIs } from "@/lib/admin";

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
 * thousand of them. The model is set in lib/ai.ts (AI_MODEL_CERT_READER overrides).
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 12 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ ok: false, error: "No reader key on this environment." }, { status: 503 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const expect = String(form?.get("expect") ?? "").trim();
  if (!(file instanceof File) || !file.size) return NextResponse.json({ ok: false, error: "No file." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ ok: false, error: "That file is over 12MB, too big to read the dates off. Type them in below." }, { status: 413 });

  const bytes = Buffer.from(await file.arrayBuffer());
  const name = (file.name || "").toLowerCase();
  const isPdf = file.type === "application/pdf" || name.endsWith(".pdf") || bytes.subarray(0, 4).toString() === "%PDF";
  const media = isPdf ? "application/pdf" : /\.(jpe?g)$/.test(name) ? "image/jpeg" : /\.png$/.test(name) ? "image/png" : /\.webp$/.test(name) ? "image/webp" : null;
  if (!media) return NextResponse.json({ ok: false, error: "Only PDFs and images can be read." }, { status: 415 });

  try {
    return NextResponse.json({ ok: true, ...(await readCertificate(bytes, media, expect)) });
  } catch (e) {
    /* Not 502: Cloudflare swaps an origin 502 for its own error page, and
       the reason (the backlog run, 6 Sep: "Your credit balance is too low")
       never reaches the caller. */
    /* Out of credit or busy is already one plain sentence (lib/ai-outage). */
    return NextResponse.json({ ok: false, error: publicError(e, "The reader couldn't read this one. Type the dates in below.") }, { status: 500 });
  }
}
