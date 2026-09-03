import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { findUserById } from "@/lib/users";
import { addComment, commentsFor } from "@/lib/application-comments";
import { assertNotViewingAs, ViewingAsRefused, VIEW_AS_COOKIE } from "@/lib/view-as";

/**
 * The thread on one application.
 *
 * GET  → every comment, oldest first
 * POST { text } → add one, in the signed-in person's name
 *
 * A comment is written against whoever typed it, so it needs a session;
 * and it is refused while viewing as somebody else, for the same reason
 * every other write is - a note recorded in a colleague's name is a lie
 * on the file.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function who(req: NextRequest) {
  const userId = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  return userId ? findUserById(userId) : null;
}

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  if (!(await who(req))) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  return NextResponse.json({ ok: true, comments: await commentsFor(id) });
}

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const me = await who(req);
  if (!me) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });

  try {
    assertNotViewingAs(req.cookies.get(VIEW_AS_COOKIE)?.value);
  } catch (e) {
    if (e instanceof ViewingAsRefused) return NextResponse.json({ ok: false, error: e.message }, { status: 423 });
    throw e;
  }

  const body = (await req.json().catch(() => ({}))) as { text?: string };
  const text = (body.text ?? "").trim();
  if (!text) return NextResponse.json({ ok: false, error: "Write something first." }, { status: 400 });
  if (text.length > 4000) {
    return NextResponse.json({ ok: false, error: "That's a long one. Keep it under 4,000 characters." }, { status: 413 });
  }

  try {
    const comment = await addComment({ applicationId: id, body: text, author: { id: me.id, name: me.name || me.email } });
    return NextResponse.json({ ok: true, comment });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "That didn't save." },
      { status: 503 }
    );
  }
}
