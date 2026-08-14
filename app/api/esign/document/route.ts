import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { cdnUrlFor, signedDocuments } from "@/lib/rex-esign";

/**
 * Open a signed document, without handing anybody its address.
 *
 * ── The reason this route exists at all ─────────────────────────────────────
 *
 * REX writes DocuSign's completed PDF back as a Document on the listing, and
 * that file is served from REX's CDN over the open internet with NO
 * authentication whatsoever. Measured: a landlord's signed terms of business —
 * their name, their address, their signature, a record marked
 * `privacy_id: "private"` — returns 200 application/pdf to an anonymous
 * request. The only thing protecting it is a random string in the filename.
 *
 * We did not create that and cannot close it. What we can refuse to do is
 * WIDEN it. So the URL never reaches a browser, never goes into an email and
 * never appears in a page's HTML; the bytes are fetched here and streamed on.
 * If a link to this route leaks, it is useless without an OS session — which
 * is not true of the URL underneath it.
 *
 * ── Why the id is checked against the listing ───────────────────────────────
 *
 * The caller passes a document id AND the listing it should belong to, and the
 * id must appear in that listing's own document list. Without that check a
 * signed-in agent could walk document ids and pull every contract on the
 * account — including the five sister businesses', since the REX account is
 * shared. Membership is the authorisation, not the id.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const userId = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!userId) {
    return NextResponse.json({ error: "Sign in to open a signed document." }, { status: 401 });
  }

  const listingId = req.nextUrl.searchParams.get("listingId") ?? "";
  const id = Number(req.nextUrl.searchParams.get("id") ?? 0);
  if (!listingId || !id) {
    return NextResponse.json({ error: "listingId and id required" }, { status: 400 });
  }

  const docs = await signedDocuments(listingId).catch(() => []);
  const doc = docs.find((d) => d.id === id);
  if (!doc) {
    // Deliberately the same answer whether the document does not exist or
    // simply is not on this listing. Telling those apart is free help to
    // anyone trying ids.
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const url = cdnUrlFor(doc.uri);
  if (!url) return NextResponse.json({ error: "That document has no readable address." }, { status: 502 });

  const upstream = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(20000) }).catch(
    () => null
  );
  if (!upstream || !upstream.ok) {
    return NextResponse.json({ error: "Couldn't fetch that document from REX." }, { status: 502 });
  }

  const safeName = doc.name.replace(/[^\w.\- ]+/g, "_");
  return new NextResponse(upstream.body, {
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "application/pdf",
      // inline: agents want to read it, not collect downloads.
      "content-disposition": `inline; filename="${safeName}"`,
      // Never let a shared proxy hold a copy of somebody's contract.
      "cache-control": "private, no-store",
    },
  });
}
