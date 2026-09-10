import "server-only";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { DATA_DIR } from "@/lib/business/data-dir";
import { hasDb, q } from "@/lib/db";

/**
 * The newsroom - what the office broadcasts to everybody.
 *
 * ── Why this exists at all ────────────────────────────────────────────────
 *
 * James, 10 Sep 2026: "we want to make this a bit more of a broadcast feature…
 * We also need a news section, which we want to launch and say to the news
 * section." Steve had three tabs, all of them a way for an agent to pull
 * something out of us. Nothing in the product could PUSH - so "the OS now does
 * X" reached people by Susan sending an email, or not at all.
 *
 * ── Not the same thing as /api/news ───────────────────────────────────────
 *
 * That route reads Landlord Today's RSS feed. This is us. They sit one above
 * the other under their own headings in Steve's News tab, because an agent has
 * to be able to tell a change to their own system from a headline about
 * somebody else's business.
 *
 * ── The dual backend ──────────────────────────────────────────────────────
 *
 * Postgres in production, a JSON file under DATA_DIR otherwise - the same
 * shape as lib/business/knowledge-store. Not for redundancy: DATABASE_URL is
 * unset on a developer's machine, and without the file half of this, the one
 * screen where somebody writes a post could not be opened, let alone driven,
 * before it shipped.
 */

export const NEWS_KINDS = ["announcement", "release", "reminder"] as const;
export type NewsKind = (typeof NEWS_KINDS)[number];

/** What each kind is called on the badge, and what it is FOR. */
export const NEWS_KIND_LABEL: Record<NewsKind, string> = {
  announcement: "Announcement",
  release: "New in the OS",
  reminder: "Reminder",
};

export interface NewsPost {
  id: string;
  title: string;
  body: string;
  kind: NewsKind;
  pinned: boolean;
  /** A screen in the OS or a guide, for "read more". Never an outside link. */
  link: string;
  author: string;
  publishedAt: string;
  /** Retires itself after this. Null means it stands until deleted. */
  until: string | null;
}

export const NEWS_MAX_TITLE_CHARS = 160;
export const NEWS_MAX_BODY_CHARS = 4_000;

const isKind = (s: string): s is NewsKind => (NEWS_KINDS as readonly string[]).includes(s);

/**
 * Where "read more" may point.
 *
 * Inside the OS only, and the check is on the shape rather than a list of
 * screens, so a new page needs no edit here. A post is written by a member of
 * staff and read by every agent in the group: an off-site URL in that position
 * is a link every one of them would follow on our word, so it is refused
 * rather than sanitised.
 */
function safeLink(raw: string): string {
  const v = raw.trim();
  if (!v) return "";
  return /^\/[\w\-/[\]().?=&#]*$/.test(v) ? v.slice(0, 300) : "";
}

/* ------------------------------------------------------------------------ */
/* Postgres                                                                  */
/* ------------------------------------------------------------------------ */

interface Row extends Record<string, unknown> {
  id: string;
  title: string;
  body: string;
  kind: string;
  pinned: boolean;
  link: string;
  author: string;
  published_at: string | Date;
  until: string | Date | null;
}

const rowToPost = (r: Row): NewsPost => ({
  id: r.id,
  title: r.title,
  body: r.body,
  kind: isKind(r.kind) ? r.kind : "announcement",
  pinned: Boolean(r.pinned),
  link: r.link,
  author: r.author,
  publishedAt: new Date(r.published_at).toISOString(),
  until: r.until ? new Date(r.until).toISOString() : null,
});

/* ------------------------------------------------------------------------ */
/* JSON fallback                                                             */
/* ------------------------------------------------------------------------ */

const FILE = path.join(DATA_DIR, "news.json");

async function readFile(): Promise<NewsPost[]> {
  try {
    const parsed = JSON.parse(await fs.readFile(FILE, "utf8"));
    return Array.isArray(parsed) ? (parsed as NewsPost[]) : [];
  } catch {
    return [];
  }
}

async function writeFile(rows: NewsPost[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(rows, null, 2), "utf8");
}

/* ------------------------------------------------------------------------ */
/* Store                                                                     */
/* ------------------------------------------------------------------------ */

/**
 * Pinned first, then newest.
 *
 * `all` is the writer's view: it includes posts that have passed their `until`
 * date so they can still be edited or deleted. Everybody else gets the live
 * board, scoped to now() on every read - never a stored "is live" flag, which
 * would be a figure that goes stale the moment nothing writes to it.
 */
export async function listNews(opts: { all?: boolean } = {}): Promise<NewsPost[]> {
  const rows = hasDb()
    ? (
        await q<Row>(
          `SELECT id, title, body, kind, pinned, link, author, published_at, until
             FROM os_news_posts ORDER BY pinned DESC, published_at DESC`
        ).catch(() => [] as Row[])
      ).map(rowToPost)
    : (await readFile()).sort(
        (a, b) =>
          Number(b.pinned) - Number(a.pinned) || b.publishedAt.localeCompare(a.publishedAt)
      );

  if (opts.all) return rows;
  const now = new Date().toISOString();
  return rows.filter((p) => !p.until || p.until > now);
}

export async function upsertNews(input: {
  id?: string | null;
  title: string;
  body: string;
  kind?: string | null;
  pinned?: boolean;
  link?: string | null;
  until?: string | null;
  author?: string;
}): Promise<NewsPost> {
  const existing = input.id ? (await listNews({ all: true })).find((p) => p.id === input.id) : null;
  const post: NewsPost = {
    id: existing?.id ?? crypto.randomUUID(),
    title: input.title.trim().slice(0, NEWS_MAX_TITLE_CHARS),
    body: input.body.trim().slice(0, NEWS_MAX_BODY_CHARS),
    kind: isKind((input.kind ?? "").trim()) ? ((input.kind as string).trim() as NewsKind) : "announcement",
    pinned: Boolean(input.pinned),
    link: safeLink(input.link ?? ""),
    author: (input.author ?? existing?.author ?? "").slice(0, 200),
    /* An edit does not re-date a post. Somebody fixing a typo on Thursday must
       not send Tuesday's announcement back to the top of everybody's panel. */
    publishedAt: existing?.publishedAt ?? new Date().toISOString(),
    until: input.until ? new Date(input.until).toISOString() : null,
  };
  if (!post.title) throw new Error("A post needs a headline.");

  if (hasDb()) {
    await q(
      `INSERT INTO os_news_posts (id, title, body, kind, pinned, link, author, published_at, until, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
       ON CONFLICT (id) DO UPDATE
         SET title = EXCLUDED.title, body = EXCLUDED.body, kind = EXCLUDED.kind,
             pinned = EXCLUDED.pinned, link = EXCLUDED.link, author = EXCLUDED.author,
             until = EXCLUDED.until, updated_at = NOW()`,
      [post.id, post.title, post.body, post.kind, post.pinned, post.link, post.author,
       post.publishedAt, post.until]
    );
    return post;
  }

  const rows = await readFile();
  const i = rows.findIndex((r) => r.id === post.id);
  if (i >= 0) rows[i] = post;
  else rows.push(post);
  await writeFile(rows);
  return post;
}

export async function deleteNews(id: string): Promise<boolean> {
  if (hasDb()) {
    const rows = await q<{ id: string }>(`DELETE FROM os_news_posts WHERE id = $1 RETURNING id`, [id]);
    return rows.length > 0;
  }
  const rows = await readFile();
  const next = rows.filter((r) => r.id !== id);
  if (next.length === rows.length) return false;
  await writeFile(next);
  return true;
}
