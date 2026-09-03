import { NextRequest, NextResponse } from "next/server";
import { hasDb } from "@/lib/db";
import { whoIs } from "@/lib/admin";
import { createLink, ensureLinksForSends, getLink, listLinks, qrStats, qrSvg, qrUrl, type QrReason } from "@/lib/bond-qr";

/**
 * QR codes, for the rooms.
 *
 * GET  ?token=…  → the code as SVG and the link it carries
 * GET            → every code with its scans and responses, and the totals
 * POST { address, postcode, reason, reason_note?, property_key? } → a code by hand
 * POST { ensure: true } → a code for every card in the queue that lacks one
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!hasDb()) return NextResponse.json({ ok: false, reason: "no database" }, { status: 503 });
  const token = (req.nextUrl.searchParams.get("token") ?? "").trim();
  if (token) {
    const link = await getLink(token);
    if (!link) return NextResponse.json({ ok: false, reason: "No such code." }, { status: 404 });
    return NextResponse.json({ ok: true, link, url: qrUrl(token), svg: await qrSvg(token) });
  }
  const [links, stats] = await Promise.all([listLinks(300), qrStats()]);
  return NextResponse.json({ ok: true, links, stats });
}

export async function POST(req: NextRequest) {
  if (!hasDb()) return NextResponse.json({ ok: false, error: "no database" }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const who = await whoIs(req);
  const actor = who.subject?.name || who.subject?.email || "someone";
  if (body.ensure === true) {
    const made = await ensureLinksForSends();
    return NextResponse.json({ ok: true, made });
  }
  const address = typeof body.address === "string" ? body.address.trim() : "";
  const postcode = typeof body.postcode === "string" ? body.postcode.trim() : "";
  const reason = ["anniversary", "just_bought", "self_managing", "custom"].includes(String(body.reason)) ? (body.reason as QrReason) : "custom";
  if (!address || !/^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i.test(postcode)) {
    return NextResponse.json({ ok: false, error: "An address and a full postcode, please." }, { status: 400 });
  }
  const link = await createLink({
    address,
    postcode,
    reason,
    reason_note: typeof body.reason_note === "string" ? body.reason_note : "",
    property_key: typeof body.property_key === "string" ? body.property_key : null,
    created_by: actor,
  });
  return NextResponse.json({ ok: true, link, url: qrUrl(link.token), svg: await qrSvg(link.token) });
}
