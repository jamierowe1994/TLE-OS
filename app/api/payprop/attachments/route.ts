import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { requireCapability } from "@/lib/admin";
import { payPropGet, payPropGetRaw, type PayPropAccountId } from "@/lib/payprop";

/**
 * PayProp's files, read only (28 Sep 2026).
 *
 * The clean sweep found most of the missing Scottish documents sitting in
 * PayProp itself: Margaret Wilson's portfolio was run on PayProp before it came
 * to REX PM, and its tenancy agreements (PRTs), deposit certificates,
 * management contracts and referencing are attached to each property there.
 * This lets them be read and filed onto the OS home.
 *
 *   GET ?account=uk|scotland&entity=property|tenant&id=<PayProp id>  → the file list
 *   GET ?account=uk|scotland&attachment=<attachment id>              → the file itself
 *
 * Through lib/payprop, so the E&W OAuth token is refreshed by the one
 * refresher. Cron key or see:wiring. Reads only; PayProp is never written.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function cronAuthorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET ?? "";
  const given = req.headers.get("x-cron-key") ?? "";
  if (!secret || !given) return false;
  const a = Buffer.from(secret);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: NextRequest) {
  if (!cronAuthorised(req) && !(await requireCapability(req, "see:wiring"))) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  const q = req.nextUrl.searchParams;
  const account = (q.get("account") === "scotland" ? "scotland" : "uk") as PayPropAccountId;
  const attachment = q.get("attachment");
  const idOk = (s: string | null) => Boolean(s && /^[A-Za-z0-9]{6,20}$/.test(s));

  if (attachment) {
    if (!idOk(attachment)) return NextResponse.json({ ok: false, error: "No such file." }, { status: 400 });
    const r = await payPropGetRaw(account, `attachments/${attachment}`);
    if (!r.ok || !r.body) return NextResponse.json({ ok: false, error: r.error ?? "PayProp did not send it." }, { status: r.status || 502 });
    return new NextResponse(r.body, { headers: { "content-type": r.contentType ?? "application/octet-stream", "cache-control": "no-store" } });
  }

  const entity = q.get("entity") === "tenant" ? "tenant" : q.get("entity") === "property" ? "property" : null;
  const id = q.get("id");
  if (entity && idOk(id)) {
    const r = await payPropGet(account, `attachments/${entity}/${id}`);
    return NextResponse.json({ ok: r.ok, error: r.error, items: (r.result as { items?: unknown[] } | null)?.items ?? [] }, { status: r.ok ? 200 : r.status || 502 });
  }

  /* The list of properties, a page at a time, so a caller can walk the account. */
  const page = q.get("page") && /^\d{1,3}$/.test(q.get("page")!) ? q.get("page")! : "1";
  const r = await payPropGet(account, "export/properties", { rows: "25", page });
  return NextResponse.json({ ok: r.ok, error: r.error, items: (r.result as { items?: unknown[] } | null)?.items ?? [] }, { status: r.ok ? 200 : r.status || 502 });
}
