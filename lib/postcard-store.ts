import "server-only";
import { randomBytes } from "node:crypto";
import { hasDb, q } from "@/lib/db";
import { STOCK_DESIGNS, faultsIn, normalise, type PostcardDesign } from "@/lib/postcard-design";

/**
 * Where the designs live, and the proof link.
 *
 * One row in os_settings rather than a table of its own: there are two or
 * three of these, they are edited by hand, and nothing joins to them. A
 * table would be ceremony.
 *
 * The proof token is per design and stable, so the link James sends Susan on
 * Monday still opens the card on Friday - and shows her the design as it
 * stands then, which is the point of showing somebody a proof.
 */

const KEY = "postcard-designs";

export interface StoredDesigns {
  designs: PostcardDesign[];
  /** designId → token, for the sharable proof. */
  tokens: Record<string, string>;
}

export async function readDesigns(): Promise<StoredDesigns> {
  const fallback: StoredDesigns = { designs: STOCK_DESIGNS, tokens: {} };
  if (!hasDb()) return fallback;
  const rows = await q<{ value: StoredDesigns | null }>(`SELECT value FROM os_settings WHERE key = $1`, [KEY]).catch(() => []);
  const held = rows[0]?.value;
  if (!held?.designs?.length) return fallback;
  /* Brought up to shape on the way out, so a design stored before a field
     existed does not crash the screen that reads it. */
  const designs = held.designs.map(normalise).filter((d): d is PostcardDesign => d !== null);
  return { designs: designs.length ? designs : STOCK_DESIGNS, tokens: held.tokens ?? {} };
}

export async function writeDesigns(designs: PostcardDesign[]): Promise<StoredDesigns> {
  const held = await readDesigns();
  const tokens = { ...held.tokens };
  /* A design keeps the token it already had; a new one gets one. */
  for (const d of designs) tokens[d.id] ??= randomBytes(12).toString("base64url");
  const next: StoredDesigns = { designs, tokens };
  if (hasDb()) {
    await q(
      `INSERT INTO os_settings (key, value, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [KEY, JSON.stringify(next)]
    ).catch(() => {});
  }
  return next;
}

/** The design behind a proof link, or nothing. */
export async function designByToken(token: string): Promise<PostcardDesign | null> {
  const { designs, tokens } = await readDesigns();
  const id = Object.keys(tokens).find((k) => tokens[k] === token);
  return id ? designs.find((d) => d.id === id) ?? null : null;
}

/** Only a card that fits may be sent to anybody, proof included. */
export const sendable = (d: PostcardDesign) => faultsIn(d).length === 0;
