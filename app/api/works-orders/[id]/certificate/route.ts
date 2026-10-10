import { NextRequest, NextResponse } from "next/server";
import { publicError } from "@/lib/public-error";
import { hasDb } from "@/lib/db";
import { whoIs } from "@/lib/admin";
import { getOrder, logEvent } from "@/lib/works-orders";
import { emailsForMove, outcomeLine } from "@/lib/works-emails";
import { pingCompliance } from "@/lib/works-compliance";
import { fileJobCertificate, CertificateRefused } from "@/lib/works-certificate";

/**
 * The certificate from a job, put on by the office.
 *
 * James, 8 Oct 2026: when the contractor texts the finished certificate
 * rather than using their page, "we need a place to not only confirm that
 * it's been completed but also upload the documents to replace the current
 * one." Exactly what the contractor's own upload does (lib/works-certificate):
 * the job is marked done, the file goes on the job, and it is filed as the
 * home's current certificate, waiting for compliance to check it.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { actor, subject } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  const { id } = await ctx.params;
  const found = await getOrder(id);
  if (!found) return NextResponse.json({ ok: false, error: "No such job." }, { status: 404 });
  const o = found.order;
  if (o.status === "cancelled") return NextResponse.json({ ok: false, error: "This job is cancelled." }, { status: 400 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!form || !(file instanceof File) || file.size === 0) return NextResponse.json({ ok: false, error: "Choose the certificate file." }, { status: 400 });
  if (file.size > 25 * 1024 * 1024) return NextResponse.json({ ok: false, error: "Files up to 25 MB, please." }, { status: 400 });

  const me = subject ?? actor;
  const by = me.name || me.email;
  const note = String(form.get("note") ?? "").trim();
  try {
    const { next, certificate } = await fileJobCertificate(o, {
      bytes: new Uint8Array(await file.arrayBuffer()), fileName: file.name, contentType: file.type,
      type: String(form.get("type") ?? ""), expiry: String(form.get("expiry") ?? ""), issue: String(form.get("issue") ?? ""),
      by, source: `job #${o.ref}, put on by ${by}`,
      doneNote: note || `Certificate put on by ${by}.`,
    });
    if (!o.completedAt) for (const e of await emailsForMove(next, "done", me).catch(() => [])) await logEvent(o.id, "TLE OS", "email", outcomeLine(e));
    await pingCompliance(next, o.completedAt ? "file" : "done");
    const after = await getOrder(id);
    return NextResponse.json({ ok: true, order: after?.order ?? next, events: after?.events ?? [], certificate });
  } catch (e) {
    if (e instanceof CertificateRefused) return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    return NextResponse.json({ ok: false, error: publicError(e, "The certificate did not file.") }, { status: 400 });
  }
}
