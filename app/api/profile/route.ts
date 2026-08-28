import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { hasDb, q } from "@/lib/db";

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

  const { name, photo } = (await req.json().catch(() => ({}))) as {
    name?: string;
    photo?: string | null;
  };

  /* A data: URL, and it is capped. The page downscales to 256px before this is
     called, but nothing stops a future caller sending the original, and a
     megabyte of base64 in a row that every page load reads is a slow site
     nobody can explain. */
  if (photo && photo.length > 400_000) {
    return NextResponse.json({ ok: false, error: "That image is too large." }, { status: 413 });
  }

  if (typeof name === "string" && name.trim()) {
    await q(`update os_users set name = $1 where id = $2`, [name.trim(), userId]);
  }
  if (photo !== undefined) {
    await q(`update os_users set photo = $1 where id = $2`, [photo || null, userId]);
  }
  return NextResponse.json({ ok: true });
}
