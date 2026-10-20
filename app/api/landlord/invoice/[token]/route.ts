import { NextRequest, NextResponse } from "next/server";
import { asText, jsonObject } from "@/lib/json-body";
import { hasDb } from "@/lib/db";
import { orderByToken, moveOrder, logEvent, pounds, LANDLORD_SELF, LANDLORD_INVOICE_ANSWERS } from "@/lib/works-orders";
import { outcomeLine, tellInvoiceAnswer } from "@/lib/works-emails";
import { withR2, R2_BUCKET, r2Configured } from "@/lib/r2";

/**
 * The landlord's answer on a contractor's invoice (Kirstie Mulholland, 20 Oct
 * 2026: "a button so we can send it to the landlord for authorisation ...
 * Authorise to pay, or an option saying We'll pay direct, or Raise a query").
 * Reached by the token in their email; no sign-in.
 *
 *   GET            the job, the figure, and any answer already given
 *   GET ?file=1    the invoice itself
 *   POST { answer, note }   answered once, as the tenant's question is (Rig
 *                           run 4, P-047). The agent can send it again.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NOT_OURS = "That link isn't one of ours.";

export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const o = await orderByToken("landlord_invoice", token);
  if (!o || !o.landlordInvoiceAskedAt) return NextResponse.json({ ok: false, error: NOT_OURS }, { status: 404 });
  const file = [...(o.files ?? [])].reverse().find((f) => f.kind === "invoice");

  if (req.nextUrl.searchParams.get("file") === "1") {
    if (!file || !r2Configured) return NextResponse.json({ ok: false, error: "The invoice file isn't on the job." }, { status: 404 });
    try {
      const { GetObjectCommand } = await import("@aws-sdk/client-s3");
      const bytes = await withR2(async (client) => {
        const res = await client.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: file.key }));
        return res.Body ? await res.Body.transformToByteArray() : null;
      });
      if (!bytes) return NextResponse.json({ ok: false, error: "The invoice couldn't be opened." }, { status: 404 });
      const name = (file.name || `invoice-job-${o.ref}.pdf`).replace(/[^\w.\- ]+/g, "_");
      return new NextResponse(Buffer.from(bytes), {
        headers: { "Content-Type": file.type || "application/octet-stream", "Content-Disposition": `inline; filename="${name}"`, "Cache-Control": "private, no-store" },
      });
    } catch {
      return NextResponse.json({ ok: false, error: "The invoice couldn't be opened." }, { status: 502 });
    }
  }

  return NextResponse.json({
    ok: true,
    job: {
      ref: o.ref,
      title: o.title,
      address: [o.propertyName, o.locality].filter(Boolean).join(", "),
      contractorName: o.contractorName,
      invoice: pounds(o.invoicePence),
      invoiceRef: o.invoiceRef,
      hasFile: Boolean(file),
      answer: o.landlordInvoiceAnswer,
      closed: o.status === "cancelled" || o.status === "paid",
    },
  });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const o = await orderByToken("landlord_invoice", token);
  if (!o || !o.landlordInvoiceAskedAt || !hasDb()) return NextResponse.json({ ok: false, error: NOT_OURS }, { status: 404 });
  const b = await jsonObject(req);
  const answer = LANDLORD_INVOICE_ANSWERS.find((a) => a.id === b.answer)?.id;
  if (!answer) return NextResponse.json({ ok: false, error: "Which would you like?" }, { status: 400 });
  if (o.status === "cancelled" || o.status === "paid") return NextResponse.json({ ok: false, error: "This invoice is already settled. If something isn't right, reply to our email." }, { status: 409 });
  if (o.landlordInvoiceAnswer) {
    return NextResponse.json({ ok: false, error: "Thanks, you've already told us. If anything has changed, reply to our email or give us a ring.", answer: o.landlordInvoiceAnswer }, { status: 409 });
  }
  const note = asText(b.note).trim().slice(0, 2000);
  if (answer === "query" && !note) return NextResponse.json({ ok: false, error: "Tell us what your query is." }, { status: 400 });
  try {
    const next = await moveOrder(o.id, { action: "landlord_invoice", answer, note }, LANDLORD_SELF);
    await logEvent(next.id, "TLE OS", "email", outcomeLine(await tellInvoiceAnswer(next)));
    return NextResponse.json({ ok: true, answer: next.landlordInvoiceAnswer });
  } catch {
    return NextResponse.json({ ok: false, error: "That didn't save. Try again in a minute, or reply to our email." }, { status: 500 });
  }
}
