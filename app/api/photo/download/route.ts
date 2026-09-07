import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";

/**
 * GET /api/photo/download?u=<photo url>&name=<file name>
 *
 * The pop-out's download button (James, 7 Sep 2026). The photographs live
 * on REX's CDN, and a plain `download` link to another origin just opens the
 * picture; so the OS fetches it and hands it down as an attachment under a
 * sensible name. Only REX's own photo hosts are fetched - this is not an
 * open proxy.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ALLOWED = /(^|\.)rexsoftware\.com$/i;

export async function GET(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });

  let url: URL;
  try {
    url = new URL(req.nextUrl.searchParams.get("u") ?? "");
  } catch {
    return NextResponse.json({ ok: false, error: "Not a photo link." }, { status: 400 });
  }
  if (url.protocol !== "https:" || !ALLOWED.test(url.hostname)) {
    return NextResponse.json({ ok: false, error: "Only the property photographs can be downloaded from here." }, { status: 400 });
  }

  const upstream = await fetch(url, { signal: AbortSignal.timeout(20_000) }).catch(() => null);
  if (!upstream || !upstream.ok || !upstream.body) {
    return NextResponse.json({ ok: false, error: "The photograph could not be fetched." }, { status: 502 });
  }
  const type = upstream.headers.get("content-type") ?? "image/jpeg";
  const ext = type.includes("png") ? "png" : type.includes("webp") ? "webp" : "jpg";
  const wanted = (req.nextUrl.searchParams.get("name") ?? "photo").replace(/[^\w\- .,()]/g, "").trim() || "photo";
  const name = /\.(jpe?g|png|webp)$/i.test(wanted) ? wanted : `${wanted}.${ext}`;

  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": type,
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "private, max-age=60",
    },
  });
}
