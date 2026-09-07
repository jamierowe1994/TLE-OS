import { NextRequest, NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { whoIs } from "@/lib/admin";
import { scopeFor } from "@/lib/scope";
import { managedBookFor } from "@/lib/managed-book-cache";
import { keyIsOurs, R2_BUCKET, r2Configured, withR2 } from "@/lib/r2";
import { ResendBlocked, sendEmail } from "@/lib/resend";
import { VAULT_LABEL } from "@/lib/vault";
import { proseEmail } from "@/lib/email/prose";

/**
 * POST /api/compliance/send-document
 *   { key, to: "landlord" | "other", email?, note? }
 *
 * Sends one certificate out of the vault as an attachment. "landlord" is
 * looked up from the managed book by the property the file is filed under,
 * so nobody has to know the address by heart; "other" takes the address
 * typed on the sheet. Goes on the public sender, so it sits behind the
 * customer email switch like every other customer message.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BYTES = 12 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!r2Configured) return NextResponse.json({ ok: false, error: "Storage isn't configured." }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as { key?: string; to?: string; email?: string; note?: string };
  const key = String(body.key ?? "");
  if (!keyIsOurs(key)) return NextResponse.json({ ok: false, error: "Not a valid file reference." }, { status: 400 });

  /* documents/compliance-<property>-<certKey>/<timestamp>-<name> */
  const m = key.match(/^documents\/compliance-([^/]+?)-([a-z]+)\/\d+-(.+)$/i);
  if (!m) return NextResponse.json({ ok: false, error: "That file is not a certificate in the vault." }, { status: 400 });
  const [, propertyId, certKey, fileName] = m;
  const label = VAULT_LABEL[certKey] ?? certKey;

  let to = String(body.email ?? "").trim();
  let propertyName = "";
  let landlordName = "";
  try {
    const scope = await scopeFor(req);
    if (!scope.unlinked) {
      const { book } = await managedBookFor(scope.rexUserId);
      const home = book.properties.find((p) => p.propertyId === propertyId);
      if (home) {
        propertyName = home.name;
        landlordName = home.landlord?.name ?? "";
        if (body.to === "landlord") to = home.landlord?.email ?? "";
      }
    }
  } catch {
    /* the book not answering only costs the landlord lookup */
  }
  if (body.to === "landlord" && !to) {
    return NextResponse.json({ ok: false, error: landlordName ? `REX holds no email address for ${landlordName}. Send it to someone else and type the address.` : "No landlord with an email address on this home's REX record. Type the address instead." });
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return NextResponse.json({ ok: false, error: "That email address does not look right." }, { status: 400 });

  let content: string;
  try {
    const obj = await withR2((c) => c.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key })));
    if ((obj.ContentLength ?? 0) > MAX_BYTES) return NextResponse.json({ ok: false, error: "That file is too big to email. Save it and send it another way." });
    const bytes = await obj.Body?.transformToByteArray();
    if (!bytes) throw new Error("empty");
    content = Buffer.from(bytes).toString("base64");
  } catch {
    return NextResponse.json({ ok: false, error: "Could not read the file from the vault." }, { status: 502 });
  }

  const subject = propertyName ? `${label} for ${propertyName}` : label;
  const note = String(body.note ?? "").trim();
  const bodyText = [
    body.to === "landlord" && landlordName ? `Dear ${landlordName.split(" ")[0]},` : "Hello,",
    propertyName ? `Please find attached the ${label} for ${propertyName}.` : `Please find attached the ${label}.`,
    note,
    `Kind regards,\n${actor.name ?? "The Letting Experts"}\nThe Letting Experts`,
  ].filter(Boolean).join("\n\n");

  try {
    await sendEmail({
      to,
      subject,
      html: proseEmail(bodyText),
      text: bodyText,
      audience: "customer",
      attachments: [{ filename: fileName, content }],
    });
  } catch (e) {
    const msg = e instanceof ResendBlocked ? e.message : e instanceof Error ? e.message : "The send did not go.";
    return NextResponse.json({ ok: false, error: msg }, { status: e instanceof ResendBlocked ? 200 : 502 });
  }
  return NextResponse.json({ ok: true, to });
}
