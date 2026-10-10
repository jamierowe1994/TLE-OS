import { NextRequest, NextResponse } from "next/server";
import { londonToday } from "@/lib/london-clock";
import { randomUUID } from "node:crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { whoIs } from "@/lib/admin";
import { hasDb, q } from "@/lib/db";
import { R2_BUCKET, r2Configured, safeName, withR2 } from "@/lib/r2";
import { bindPages, canBind } from "@/lib/doc-pages";
import { followUpFor } from "@/lib/id-checks";

/**
 * RIGHT TO RENT ID, photographed on a viewing (16 Sep 2026).
 *
 * James: "They should also have an upload button, and that will be for the
 * right-to-rent checks where they have to take a picture of people's IDs."
 *
 * POST (multipart) → the pages of one person's ID, with who it is, what it is,
 *                    and the agent's word that they saw the original with the
 *                    person in front of them. Bound into one PDF when there is
 *                    more than one page, stored, and recorded.
 * GET              → the checks THIS agent has sent in the last fortnight, so
 *                    the phone can show "sent" and nobody photographs a
 *                    passport twice wondering whether the first one went.
 *
 * ── Why the in-person tick is required, not optional ──────────────────────
 *
 * A manual Right to Rent check is only a check if the original document was
 * seen with its holder present. A photograph on its own proves somebody had a
 * passport near a phone. The tick is what turns the file into evidence, and
 * the date on the row is the date the law asks for.
 *
 * ── Where the file goes, and who can open it ──────────────────────────────
 *
 * R2, under right-to-rent/. That prefix is deliberately NOT one of the scopes
 * in lib/r2, so the general /api/r2/file route refuses to hand it out: any
 * signed-in agent can open any key that route knows, and a passport is not a
 * gas certificate. The office opens these through their own gated screen.
 *
 * Storage first, then the row. A row pointing at a file that never arrived is
 * a Right to Rent check the office believes it has; an orphaned file with no
 * row is only untidy.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DOC_TYPES = {
  passport: "Passport",
  card: "ID card or permit",
  other: "Other document",
} as const;
type DocType = keyof typeof DOC_TYPES;

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"];
const MAX_PAGES = 6;
const MAX_BYTES = 15 * 1024 * 1024;

export async function GET(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: true, checks: [] });

  /* ?lead=<id>: the checks kept against one tenant lead, whoever made them -
     so the lead can say its ID is done. Who, what and when; never the file. */
  const lead = req.nextUrl.searchParams.get("lead");
  if (lead) {
    const rows = await q<{ id: string; person_name: string; doc_type: string; checked_by_name: string; checked_at: Date; likeness: boolean }>(
      `SELECT id, person_name, doc_type, checked_by_name, checked_at, likeness FROM os_id_checks WHERE lead_id = $1 ORDER BY checked_at DESC LIMIT 10`,
      [lead]
    ).catch(() => null);
    if (!rows) return NextResponse.json({ ok: false, error: "Could not read the checks." }, { status: 500 });
    return NextResponse.json({
      ok: true,
      checks: rows.map((r) => ({ id: r.id, name: r.person_name, docType: DOC_TYPES[r.doc_type as DocType] ?? r.doc_type, by: r.checked_by_name, likeness: r.likeness, at: new Date(r.checked_at).toISOString() })),
    });
  }
  const rows = await q<{ id: string; person_name: string; property: string; doc_type: string; pages: number; checked_at: Date }>(
    `SELECT id, person_name, property, doc_type, pages, checked_at
       FROM os_id_checks
      WHERE checked_by = $1 AND checked_at > NOW() - INTERVAL '14 days'
      ORDER BY checked_at DESC
      LIMIT 30`,
    [actor.id]
  ).catch(() => null);
  if (!rows) return NextResponse.json({ ok: false, error: "Could not read your sent checks." }, { status: 500 });
  return NextResponse.json({
    ok: true,
    checks: rows.map((r) => ({
      id: r.id,
      name: r.person_name,
      property: r.property,
      docType: DOC_TYPES[r.doc_type as DocType] ?? r.doc_type,
      pages: r.pages,
      at: new Date(r.checked_at).toISOString(),
    })),
  });
}

export async function POST(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "The photos did not arrive. Try sending again." }, { status: 400 });
  }

  const name = String(form.get("name") ?? "").trim().slice(0, 120);
  const property = String(form.get("property") ?? "").trim().slice(0, 200);
  const apptId = String(form.get("appt") ?? "").trim().slice(0, 80) || null;
  const leadId = String(form.get("lead") ?? "").trim().slice(0, 80) || null;
  const likeness = form.get("likeness") === "yes";
  const docType = String(form.get("docType") ?? "");
  const seen = form.get("seenInPerson") === "yes";
  const files = form.getAll("pages").filter((f): f is File => f instanceof File && f.size > 0);
  /* How long they may rent for (4 Oct 2026): "none" for no time limit, or a
     date. Asked on every check, because a time-limited right owes a follow-up. */
  const lasts = String(form.get("lasts") ?? "");
  const rightUntil = String(form.get("rightUntil") ?? "").trim();

  if (!name) return NextResponse.json({ ok: false, error: "Add the person's name." }, { status: 400 });
  if (!(docType in DOC_TYPES)) return NextResponse.json({ ok: false, error: "Choose which document it is." }, { status: 400 });
  if (!seen) {
    return NextResponse.json(
      { ok: false, error: "Tick that you saw the original with the person there. Without it this is not a Right to Rent check." },
      { status: 400 }
    );
  }
  if (!likeness) {
    return NextResponse.json({ ok: false, error: "Tick that the photo on the document is the person in front of you." }, { status: 400 });
  }
  /* The older phone view (/m, inside the iPhone shell) does not ask yet, so an
     answer that is missing is recorded as not said - the office's list shows
     it - rather than refusing the photos. */
  if (lasts && lasts !== "none" && lasts !== "until") return NextResponse.json({ ok: false, error: "Say how long they can rent for: no time limit, or until a date." }, { status: 400 });
  if (lasts === "until" && (!/^\d{4}-\d{2}-\d{2}$/.test(rightUntil) || rightUntil <= londonToday())) {
    return NextResponse.json({ ok: false, error: "Put in the date their permission runs out. If it has already run out, they do not have the right to rent." }, { status: 400 });
  }
  if (files.length === 0) return NextResponse.json({ ok: false, error: "Take a photo of the document first." }, { status: 400 });
  if (files.length > MAX_PAGES) return NextResponse.json({ ok: false, error: `Up to ${MAX_PAGES} photos at a time.` }, { status: 400 });
  for (const f of files) {
    if (!IMAGE_TYPES.includes(f.type)) return NextResponse.json({ ok: false, error: "Only photos can be sent here." }, { status: 415 });
    if (f.size > MAX_BYTES) return NextResponse.json({ ok: false, error: "One of the photos is too large to send." }, { status: 413 });
  }

  /* Nothing is kept when there is nowhere safe to keep it - see the note on
     order above. Said plainly, because on a laptop this is the expected answer. */
  if (!r2Configured || !hasDb()) {
    return NextResponse.json(
      { ok: false, error: "Photos can't be stored on this environment, so nothing was sent." },
      { status: 503 }
    );
  }

  const id = randomUUID();
  const stamp = londonToday();
  const base = safeName(`right-to-rent ${name} ${stamp}`).replace(/\s+/g, "-").toLowerCase();
  let file: File;
  try {
    file = canBind(files) ? await bindPages(files, `${base}.pdf`) : files[0];
  } catch {
    return NextResponse.json({ ok: false, error: "The photos could not be put together. Try taking them again." }, { status: 422 });
  }
  /* A single photo keeps its own extension; a bound set is a PDF. */
  const ext = file.type === "application/pdf" ? "pdf" : file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : file.type === "image/heic" ? "heic" : "jpg";
  const key = `right-to-rent/${stamp.slice(0, 7)}/${id}/${base}.${ext}`;

  /* HEIC or mixed sets are not bindable; the first is stored and the rest are
     refused rather than dropped without a word. */
  if (files.length > 1 && file.type !== "application/pdf") {
    return NextResponse.json(
      { ok: false, error: "These photos could not be joined into one file. Send them one at a time." },
      { status: 422 }
    );
  }

  const body = new Uint8Array(await file.arrayBuffer());
  try {
    await withR2((client) =>
      client.send(
        new PutObjectCommand({
          Bucket: R2_BUCKET,
          Key: key,
          Body: body,
          ContentType: file.type,
        })
      )
    );
  } catch (e) {
    const err = e as { name?: string; message?: string };
    console.error("Right to Rent upload failed", err.name, err.message);
    return NextResponse.json({ ok: false, error: "The photos did not send. Nothing was saved - try again." }, { status: 502 });
  }

  try {
    await q(
      `INSERT INTO os_id_checks (id, person_name, property, appt_id, doc_type, pages, file_key, file_type, seen_in_person, checked_by, checked_by_name, lead_id, likeness,
                                 method, right_until, no_time_limit, follow_up_on)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE, $9, $10, $11, TRUE, 'document', $12, $13, $14)`,
      [id, name, property, apptId, docType, files.length, key, file.type, actor.id, actor.name ?? "", leadId,
        lasts === "until" ? rightUntil : null, lasts === "none", lasts === "until" ? followUpFor(rightUntil) : null]
    );
  } catch (e) {
    console.error("Right to Rent record failed", (e as Error).message);
    return NextResponse.json({ ok: false, error: "The photos went up but the check was not recorded. Try sending again." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id, pages: files.length });
}
