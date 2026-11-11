import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { publicError } from "@/lib/public-error";
import { getTerms } from "@/lib/terms/store";
import { answersView } from "@/lib/terms/answers-view";
import { answersRecordPdf, fileAnswersRecord, signedContractBytes } from "@/lib/terms/answers-record";

/**
 * What the landlord gave with their terms, for staff (lib/terms/answers-view).
 *
 *   GET            -> their details, the bank account by its last four, and every answer about the home
 *   GET ?file=1    -> the same as a PDF to keep, with the signed contract behind it. Drawn from what
 *                     is held now, and filed on the home's Documents the first time if it is not there.
 *
 * The same sign-in as the signed copy beside it (app/api/terms/[id]/document),
 * which carries all of this and the whole account number.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const t = await getTerms((await ctx.params).id).catch(() => null);
  if (!t || t.status === "cancelled") return NextResponse.json({ ok: false, error: "Those terms aren't on file." }, { status: 404 });

  if (req.nextUrl.searchParams.get("file") !== "1") {
    return NextResponse.json({ ok: true, view: await answersView(t) }, { headers: { "cache-control": "private, no-store" } });
  }

  if (t.status !== "signed") return NextResponse.json({ ok: false, error: "There is nothing to keep until everyone has signed." }, { status: 409 });
  try {
    const contract = await signedContractBytes(t);
    const bytes = await answersRecordPdf(t, contract);
    await fileAnswersRecord(t, contract, bytes);
    const name = `Landlord answers - ${t.propertyAddress}`.replace(/[^\w ,.-]+/g, " ").replace(/\s+/g, " ").trim();
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${name}.pdf"`,
        "cache-control": "private, no-store",
      },
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "The answers couldn't be made into a document just now.") }, { status: 502 });
  }
}
