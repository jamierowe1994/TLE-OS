import "server-only";
import { randomBytes } from "node:crypto";
import { hasDb, q } from "./db";
import type { PresentDeck, WelcomeVideo } from "./present";

/**
 * Presentations, stored.
 *
 * The token is the only thing between a stranger and the deck, so it is
 * generated the way a credential should be: 20 random bytes, base64url, ~160
 * bits. Not a lead id, not a hash of the address, nothing anyone could arrive
 * at by counting. That matters because the page must be public — the landlord
 * has no account and will open it on a phone, in a mail client, possibly
 * having forwarded it to a spouse.
 *
 * What the token therefore protects is worth being explicit about: a name, an
 * address we are visiting, an appointment time, and an agent's work contact
 * details. Nothing financial, no other customer's data, nothing that could be
 * used to change anything. A leaked link exposes one visit.
 */

export type PresentationRow = {
  token: string;
  kind: string;
  ref: string;
  deck: PresentDeck;
  authorName: string;
  createdAt: string;
  firstOpenedAt: string | null;
  lastOpenedAt: string | null;
  opens: number;
};

type Raw = {
  token: string;
  kind: string;
  ref: string;
  deck: PresentDeck;
  author_name: string;
  created_at: Date | string;
  first_opened_at: Date | string | null;
  last_opened_at: Date | string | null;
  opens: number;
};

const iso = (v: Date | string | null) => (v ? new Date(v).toISOString() : null);

function toRow(r: Raw): PresentationRow {
  return {
    token: r.token,
    kind: r.kind,
    ref: r.ref,
    deck: r.deck,
    authorName: r.author_name,
    createdAt: iso(r.created_at)!,
    firstOpenedAt: iso(r.first_opened_at),
    lastOpenedAt: iso(r.last_opened_at),
    opens: Number(r.opens ?? 0),
  };
}

export function newToken(): string {
  return randomBytes(20).toString("base64url");
}

export async function createPresentation(params: {
  ref: string;
  deck: PresentDeck;
  authorId: string | null;
  authorName: string;
}): Promise<PresentationRow | null> {
  if (!hasDb()) return null;
  const token = newToken();
  const rows = await q<Raw>(
    `INSERT INTO os_presentations (token, kind, ref, deck, author_id, author_name)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING token, kind, ref, deck, author_name, created_at,
               first_opened_at, last_opened_at, opens`,
    [token, params.deck.kind, params.ref, JSON.stringify(params.deck), params.authorId, params.authorName]
  );
  return rows[0] ? toRow(rows[0]) : null;
}

/**
 * Read for the viewer.
 *
 * Counting the open is a separate call on purpose. Next renders a page more
 * than once — a prefetch, a re-render, a bot following the link out of the
 * mail scanner — and an agent who rings a landlord because "they've opened it
 * four times" needs that four to be four people-shaped events, not four
 * renders. So the read is pure and the count is fired once from the client
 * when the deck is genuinely on screen.
 */
export async function readPresentation(token: string): Promise<PresentationRow | null> {
  if (!hasDb() || !token) return null;
  const rows = await q<Raw>(
    `SELECT token, kind, ref, deck, author_name, created_at,
            first_opened_at, last_opened_at, opens
       FROM os_presentations WHERE token = $1`,
    [token]
  ).catch(() => []);
  return rows[0] ? toRow(rows[0]) : null;
}

export async function markOpened(token: string): Promise<void> {
  if (!hasDb() || !token) return;
  await q(
    `UPDATE os_presentations
        SET opens = opens + 1,
            last_opened_at = NOW(),
            first_opened_at = COALESCE(first_opened_at, NOW())
      WHERE token = $1`,
    [token]
  ).catch(() => []);
}

/* ── the welcome video ────────────────────────────────────────────────────
   The deck is a jsonb column, so the video lives inside it rather than in new
   columns — one write, and no migration for a field that is optional by
   design. Both helpers below key on the video's OWN random key rather than
   the presentation token, so the webhook never has to be handed a credential.
-------------------------------------------------------------------------- */

export function newVideoKey(): string {
  return `tlev_${randomBytes(12).toString("base64url")}`;
}

/** Put a freshly reserved recording on a deck. */
export async function attachVideo(token: string, video: WelcomeVideo): Promise<boolean> {
  if (!hasDb() || !token) return false;
  const rows = await q(
    `UPDATE os_presentations
        SET deck = jsonb_set(deck, '{welcomeVideo}', $2::jsonb, true)
      WHERE token = $1
      RETURNING token`,
    [token, JSON.stringify(video)]
  ).catch(() => []);
  return rows.length > 0;
}

/**
 * Move a video on, found by the key Flow hands back.
 *
 * Written as one statement against the key rather than read-modify-write:
 * webhook deliveries can arrive more than once AND out of order, so two
 * updates can genuinely be in flight at the same moment.
 *
 * The status guard is what makes out-of-order safe. `ready` is terminal, so a
 * late-arriving `uploading` can never drag a playable video backwards into a
 * spinner.
 */
export async function updateVideoByKey(
  key: string,
  patch: Partial<WelcomeVideo>
): Promise<boolean> {
  if (!hasDb() || !key) return false;
  const rows = await q(
    `UPDATE os_presentations
        SET deck = jsonb_set(
              deck,
              '{welcomeVideo}',
              (deck -> 'welcomeVideo') || $2::jsonb,
              true
            )
      WHERE deck -> 'welcomeVideo' ->> 'key' = $1
        AND COALESCE(deck -> 'welcomeVideo' ->> 'status', '') <> 'ready'
      RETURNING token`,
    [key, JSON.stringify(patch)]
  ).catch(() => []);
  return rows.length > 0;
}

/** Everything sent for one lead, newest first — for the agent's own record. */
export async function presentationsFor(ref: string): Promise<PresentationRow[]> {
  if (!hasDb() || !ref) return [];
  const rows = await q<Raw>(
    `SELECT token, kind, ref, deck, author_name, created_at,
            first_opened_at, last_opened_at, opens
       FROM os_presentations WHERE ref = $1 ORDER BY created_at DESC LIMIT 20`,
    [ref]
  ).catch(() => []);
  return rows.map(toRow);
}
