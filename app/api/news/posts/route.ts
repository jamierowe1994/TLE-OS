import { NextRequest, NextResponse } from "next/server";
import { requireCapability, whoIs } from "@/lib/admin";
import { hasDb } from "@/lib/db";
import { deleteNews, listNews, NEWS_KINDS, upsertNews } from "@/lib/news-store";

/**
 * The newsroom's door.
 *
 *   GET    /api/news/posts        → { posts }         anyone signed in
 *   GET    /api/news/posts?all=1  → { posts }         includes retired, writers only
 *   POST   /api/news/posts        { id?, title, … }   edit:knowledge
 *   DELETE /api/news/posts?id=…                       edit:knowledge
 *
 * Reading is open to every signed-in person because that is the entire point of
 * a broadcast. Writing is edit:knowledge - the same capability that feeds Steve
 * and the Guides shelf, held by Susan, Francesca, Michael and Kirstie. A post
 * goes to every agent in the group, so it is not an agent's button.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { actor } = await whoIs(req);
  /* No database at all means a developer's machine, where nobody is signed in
     and the panel still has to be openable. Same reasoning as HelpDock's own
     guard, and it cannot let a stranger in on the live site because
     DATABASE_URL is always set there. */
  if (!actor && hasDb()) {
    return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  }

  const wantsAll = req.nextUrl.searchParams.get("all") === "1";
  /* Retired posts are the WRITER's view. Asking for them without the
     capability gets the live board rather than a refusal: the tab that reads
     this is the same tab either way, and the request is a preference, not a
     door somebody is trying. */
  const mayWrite = wantsAll ? Boolean(await requireCapability(req, "edit:knowledge")) : false;
  const posts = await listNews({ all: wantsAll && mayWrite }).catch(() => []);
  return NextResponse.json({ ok: true, posts, kinds: NEWS_KINDS, canPublish: mayWrite });
}

export async function POST(req: NextRequest) {
  const me = await requireCapability(req, "edit:knowledge");
  if (!me) return NextResponse.json({ ok: false, error: "Not yours to publish." }, { status: 403 });

  const b = (await req.json().catch(() => ({}))) as {
    id?: string;
    title?: string;
    body?: string;
    kind?: string;
    pinned?: boolean;
    link?: string;
    until?: string | null;
  };
  if (!(b.title ?? "").trim()) {
    return NextResponse.json({ ok: false, error: "A post needs a headline." }, { status: 400 });
  }

  try {
    const post = await upsertNews({
      id: b.id ?? null,
      title: b.title ?? "",
      body: b.body ?? "",
      kind: b.kind ?? null,
      pinned: b.pinned,
      link: b.link ?? null,
      until: b.until ?? null,
      author: me.name || me.email,
    });
    return NextResponse.json({ ok: true, post });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "That didn't save." },
      { status: 400 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const me = await requireCapability(req, "edit:knowledge");
  if (!me) return NextResponse.json({ ok: false, error: "Not yours to publish." }, { status: 403 });
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ ok: false, error: "Which post?" }, { status: 400 });
  const deleted = await deleteNews(id);
  return NextResponse.json({ ok: true, deleted });
}
