import { NextRequest, NextResponse } from "next/server";
import { londonToday } from "@/lib/london-clock";
import { randomUUID } from "node:crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { requireAnyCapability } from "@/lib/admin";
import { hasDb, q } from "@/lib/db";
import { R2_BUCKET, r2Configured, safeName, withR2 } from "@/lib/r2";
import { cleanShareCode, followUpFor, followUpsDue, isShareCode, listIdChecks } from "@/lib/id-checks";

/**
 * THE OFFICE'S RIGHT TO RENT CHECKS (4 Oct 2026, lib/id-checks).
 *
 * GET  ?q=<name or address> → every check, newest first, and the follow-ups
 *                              owed in the next 28 days.
 * POST (multipart)           → a share code check, made on GOV.UK in the
 *                              checker's own browser: who, the share code, the
 *                              result page they saved (PDF or picture), that
 *                              the photo on it is the person, and how long the
 *                              right lasts.
 *
 * The office only: pre-tenancy and compliance (one office since 30 Sep), and
 * the owners. An agent photographs a document on the phone; the office checks
 * share codes and opens the files.
 *
 * The file goes under right-to-rent/, the prefix /api/r2/file will not serve;
 * it is opened through /api/id-checks/file, behind the same gate as this.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const gate = (req: NextRequest) => requireAnyCapability(req, ["see:pretenancy", "see:agent-compliance"]);

const FILE_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 15 * 1024 * 1024;

export async function GET(req: NextRequest) {
  const me = await gate(req);
  if (!me) return NextResponse.json({ ok: false, error: "This is for the office." }, { status: 403 });
  if (!hasDb()) return NextResponse.json({ ok: true, stored: false, checks: [], due: [] });
  try {
    const [checks, due] = await Promise.all([listIdChecks({ search: req.nextUrl.searchParams.get("q") ?? "" }), followUpsDue(28)]);
    return NextResponse.json({ ok: true, stored: true, checks, due });
  } catch {
    return NextResponse.json({ ok: false, error: "The checks could not be read just now. Try again in a minute." }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const me = await gate(req);
  if (!me) return NextResponse.json({ ok: false, error: "This is for the office." }, { status: 403 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ ok: false, error: "Nothing arrived. Try again." }, { status: 400 });
  const name = String(form.get("name") ?? "").trim().slice(0, 120);
  const property = String(form.get("property") ?? "").trim().slice(0, 200);
  const code = cleanShareCode(String(form.get("shareCode") ?? ""));
  const likeness = form.get("likeness") === "yes";
  const lasts = String(form.get("lasts") ?? "");
  const rightUntil = String(form.get("rightUntil") ?? "").trim();
  const file = form.get("file");

  if (!name) return NextResponse.json({ ok: false, error: "Add the person's name." }, { status: 400 });
  if (!isShareCode(code)) return NextResponse.json({ ok: false, error: "A share code is nine letters and numbers, like W4X 7RT 9KP." }, { status: 400 });
  if (!likeness) return NextResponse.json({ ok: false, error: "Tick that the photo on the Home Office result is the person - seen in person or on a video call." }, { status: 400 });
  if (lasts !== "none" && lasts !== "until") return NextResponse.json({ ok: false, error: "Say how long they can rent for: no time limit, or until a date." }, { status: 400 });
  if (lasts === "until" && (!/^\d{4}-\d{2}-\d{2}$/.test(rightUntil) || rightUntil <= londonToday())) {
    return NextResponse.json({ ok: false, error: "Put in the date their permission runs out. If it has already run out, they do not have the right to rent." }, { status: 400 });
  }
  if (!(file instanceof File) || !file.size) {
    return NextResponse.json({ ok: false, error: "Attach the result page you saved from GOV.UK. It is the evidence; without it this is not a check." }, { status: 400 });
  }
  if (!FILE_TYPES.includes(file.type)) return NextResponse.json({ ok: false, error: "Save the result as a PDF or a picture and attach that." }, { status: 415 });
  if (file.size > MAX_BYTES) return NextResponse.json({ ok: false, error: "That file is too large." }, { status: 413 });
  if (!r2Configured || !hasDb()) return NextResponse.json({ ok: false, error: "Files can't be stored on this environment, so nothing was saved." }, { status: 503 });

  const id = randomUUID();
  const stamp = londonToday();
  const base = safeName(`right-to-rent share code ${name} ${stamp}`).replace(/\s+/g, "-").toLowerCase();
  const ext = file.type === "application/pdf" ? "pdf" : file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const key = `right-to-rent/${stamp.slice(0, 7)}/${id}/${base}.${ext}`;

  /* Storage first, then the row - the same order as the phone's, for the same reason. */
  const body = new Uint8Array(await file.arrayBuffer());
  try {
    await withR2((c) => c.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: body, ContentType: file.type })));
  } catch {
    return NextResponse.json({ ok: false, error: "The file did not save. Nothing was recorded - try again." }, { status: 502 });
  }
  try {
    await q(
      `INSERT INTO os_id_checks (id, person_name, property, doc_type, pages, file_key, file_type, seen_in_person, checked_by, checked_by_name, likeness,
                                 method, share_code, right_until, no_time_limit, follow_up_on)
       VALUES ($1, $2, $3, 'share_code', 1, $4, $5, FALSE, $6, $7, TRUE, 'share_code', $8, $9, $10, $11)`,
      [id, name, property, key, file.type, me.id, me.name ?? "", code, lasts === "until" ? rightUntil : null, lasts === "none", lasts === "until" ? followUpFor(rightUntil) : null]
    );
  } catch {
    return NextResponse.json({ ok: false, error: "The file saved but the check was not recorded. Try again." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, id });
}
