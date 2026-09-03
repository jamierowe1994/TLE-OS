import { randomBytes } from "node:crypto";
import { hasDb, q } from "@/lib/db";

/**
 * Comments on an application.
 *
 * The drawer said "anything typed here stays on the deal" and it did not:
 * a comment lived in component state and died on reload. Now it is a row,
 * keyed on the REX application id, in whoever's name typed it.
 *
 * Stored here rather than as a REX note because REX writes sit behind the
 * allowlist and a per-user token, and "chased the tenant, spoke to the
 * landlord" is exactly the thing that must not be lost to either. When notes
 * are allowed through, pushing these to REX is one more step, not a rewrite.
 */

export interface ApplicationComment {
  id: string;
  applicationId: string;
  body: string;
  authorId: string | null;
  authorName: string;
  createdAt: string;
}

type Row = {
  id: string;
  application_id: string;
  body: string;
  author_id: string | null;
  author_name: string;
  created_at: string | Date;
};

const toComment = (r: Row): ApplicationComment => ({
  id: r.id,
  applicationId: r.application_id,
  body: r.body,
  authorId: r.author_id,
  authorName: r.author_name,
  createdAt: new Date(r.created_at).toISOString(),
});

/** Every comment on one application, oldest first - the order a thread reads in. */
export async function commentsFor(applicationId: string): Promise<ApplicationComment[]> {
  if (!hasDb() || !applicationId) return [];
  const rows = await q<Row>(
    `SELECT id, application_id, body, author_id, author_name, created_at
       FROM os_application_comments
      WHERE application_id = $1
      ORDER BY created_at`,
    [applicationId]
  ).catch(() => []);
  return rows.map(toComment);
}

export async function addComment(input: {
  applicationId: string;
  body: string;
  author: { id: string; name: string };
}): Promise<ApplicationComment> {
  if (!hasDb()) throw new Error("No database on this environment, so the comment has nowhere to live.");
  const id = randomBytes(9).toString("base64url");
  const rows = await q<Row>(
    `INSERT INTO os_application_comments (id, application_id, body, author_id, author_name)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, application_id, body, author_id, author_name, created_at`,
    [id, input.applicationId, input.body, input.author.id, input.author.name]
  );
  return toComment(rows[0]);
}

/** How many comments each application carries, for the list without opening every drawer. */
export async function commentCounts(applicationIds: string[]): Promise<Record<string, number>> {
  if (!hasDb() || applicationIds.length === 0) return {};
  const rows = await q<{ application_id: string; n: string }>(
    `SELECT application_id, COUNT(*)::text AS n
       FROM os_application_comments
      WHERE application_id = ANY($1::text[])
      GROUP BY application_id`,
    [applicationIds]
  ).catch(() => []);
  return Object.fromEntries(rows.map((r) => [r.application_id, Number(r.n)]));
}
