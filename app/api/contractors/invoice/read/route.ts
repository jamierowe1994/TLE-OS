import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { readInvoice } from "@/lib/invoice-read";
import { publicError } from "@/lib/public-error";

/**
 * Read a contractor's invoice as it is attached (lib/invoice-read): the
 * total, number and date, to fill the form for the agent to check. Saves
 * nothing.
 *
 *   POST multipart { file }
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ ok: false, error: "Attach the invoice." }, { status: 400 });
  try {
    const read = await readInvoice(Buffer.from(await file.arrayBuffer()), file.type || "");
    return NextResponse.json({ ok: true, read });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "The invoice couldn't be read. Type the total in.") }, { status: 422 });
  }
}
