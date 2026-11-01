import { NextRequest, NextResponse } from "next/server";
import { currentLandlord, landlordProperties } from "@/lib/landlord-account";
import { certificatesFromBook } from "@/lib/compliance-cache";
import { CERT_META, type CertKey } from "@/lib/compliance";

/**
 * GET /api/landlord/certificate?property=<rex property id>&cert=<key>
 *
 * The certificate file, for the landlord who owns the property. REX keeps
 * the file on its CDN at a URL that is not a secret in the cryptographic
 * sense but is not the landlord's to have either: it names the account and
 * the entry, and it never expires. So the portal does not hand the URL out.
 * It checks the property is on this landlord's managed book, reads the
 * certificate row off the compliance book the Compliance screen holds (1 Nov
 * 2026: not a sweep of REX per click, which this used to be), fetches the file
 * under our own connection, and streams it back as a download with a name a
 * person would choose.
 *
 * A property that is not theirs, a certificate with no file, and a stranger
 * all get the same 404: the response must not say which.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const KEYS = new Set(Object.keys(CERT_META));

export async function GET(req: NextRequest) {
  const me = await currentLandlord();
  if (!me) return new NextResponse("Not found", { status: 404 });

  const propertyId = (req.nextUrl.searchParams.get("property") ?? "").trim();
  const cert = (req.nextUrl.searchParams.get("cert") ?? "").trim() as CertKey;
  if (!propertyId || !KEYS.has(cert)) return new NextResponse("Not found", { status: 404 });

  const mine = (await landlordProperties(me).catch(() => [])).find((p) => p.propertyId === propertyId);
  if (!mine) return new NextResponse("Not found", { status: 404 });

  const answer = await certificatesFromBook([{ propertyId, name: mine.name, locality: mine.locality, epcExpiry: null }]).catch(() => null);
  /* The book not to hand is not "no such file": say try again, not not found. */
  if (answer?.status !== "ready") return new NextResponse("Your certificates couldn't load just now. Try again in a few minutes.", { status: 503, headers: { "Retry-After": "120" } });
  const raw = answer.certs.properties.find((p) => String(p.id) === propertyId)?.certs[cert]?.fileUrl ?? null;
  if (!raw) return new NextResponse("Not found", { status: 404 });
  const url = raw.startsWith("//") ? `https:${raw}` : raw;

  let upstream: Response;
  try {
    upstream = await fetch(url, { cache: "no-store" });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
  if (!upstream.ok || !upstream.body) return new NextResponse("Not found", { status: 404 });

  const type = upstream.headers.get("content-type") ?? "application/pdf";
  const ext = type.includes("pdf") ? "pdf" : type.includes("png") ? "png" : type.includes("jpeg") || type.includes("jpg") ? "jpg" : "pdf";
  const name = `${CERT_META[cert].short} - ${mine.name}`.replace(/[^\w\s.-]+/g, " ").replace(/\s+/g, " ").trim();
  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": type,
      "Content-Disposition": `inline; filename="${name}.${ext}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
