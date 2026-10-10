import { NextRequest, NextResponse } from "next/server";
import { jsonObject } from "@/lib/json-body";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { hasDb, q } from "@/lib/db";
import { fillMissingAgentPhoto } from "@/lib/present-store";
import { PHOTO_MAX_CHARS } from "@/lib/profile-photo";

/**
 * The bits of a profile the whole OS needs to know about.
 *
 * ── Why this exists ───────────────────────────────────────────────────────
 *
 * The profile page saved everything — including the headshot — to browser
 * storage. That is fine for a theme choice and wrong for a photograph: the
 * sidebar, decks and emails all read `os_users.photo` from the database, so a
 * headshot uploaded on a laptop was invisible everywhere except the page that
 * uploaded it, and gone entirely on a second machine.
 *
 * Name and photo therefore live in the database. Everything else on that page
 * can stay local.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(req: NextRequest) {
  const userId = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!userId) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database." }, { status: 503 });

  const b = await jsonObject(req);
  /* Types and sizes checked (Rig run 4, P-045, 10 Oct 2026): a 200,000
     character name went in and made Admin > People two million pixels wide; a
     number as the photo was a 500 after it had been saved; and any outside
     URL could become the face on a landlord's deck. A name is text up to 80
     characters; a photo is an uploaded image (a data: URL) or nothing. */
  if (b.name !== undefined && typeof b.name !== "string") {
    return NextResponse.json({ ok: false, error: "A name is words." }, { status: 400 });
  }
  if (b.photo !== undefined && b.photo !== null && typeof b.photo !== "string") {
    return NextResponse.json({ ok: false, error: "That isn't a picture." }, { status: 400 });
  }
  const name = typeof b.name === "string" ? b.name : undefined;
  const photo = b.photo as string | null | undefined;
  if (name && name.trim().length > 80) {
    return NextResponse.json({ ok: false, error: "Keep your name under 80 characters." }, { status: 400 });
  }
  if (photo && !/^data:image\/(jpeg|png|webp);base64,/.test(photo)) {
    return NextResponse.json({ ok: false, error: "Upload the picture from this page." }, { status: 400 });
  }

  /* A data: URL, and it is capped. The page downscales to 1200px and fits it
     under the same cap before this is called, but nothing stops a future
     caller sending the original, and several megabytes of base64 in a row
     that every page load reads is a slow site nobody can explain. The number
     is shared with the uploader - see lib/profile-photo for what happened
     when the two drifted apart. */
  if (photo && photo.length > PHOTO_MAX_CHARS) {
    return NextResponse.json({ ok: false, error: "That image is too large." }, { status: 413 });
  }

  if (typeof name === "string" && name.trim()) {
    await q(`update os_users set name = $1 where id = $2`, [name.trim(), userId]);
  }
  if (photo !== undefined) {
    await q(`update os_users set photo = $1 where id = $2`, [photo || null, userId]);
    /* Any deck already sent without a face gets this one. */
    if (photo) await fillMissingAgentPhoto(userId, photo);
  }
  return NextResponse.json({ ok: true });
}
