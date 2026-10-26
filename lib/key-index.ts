import "server-only";
import { hasDb, q } from "@/lib/db";
import { rexCall, rexConfigured, rexRows } from "@/lib/rex";
import { failureFor, held, refresh } from "@/lib/managed-book-cache";
import { keyForms, keyNeedle, keyRank, keyShown } from "@/lib/key-number-match";

/**
 * Every key number, for Search (26 Oct 2026). A home's own page reads its keys
 * live (lib/home-keys); Search cannot ask REX which home holds "FM23" on each
 * keystroke, because each call to the register is about two seconds. So the whole
 * register is read in the background - 5,642 sets, 57 pages of 100, about a
 * hundred seconds - and kept like the books are: memory first, os_cache
 * behind it. A search finding it older than three hours is answered from what
 * is held and starts the next read; nobody waits for it.
 *
 * Most of the register (5,109 sets on 18M-numbered properties, read 26 Oct)
 * is the Warwickshire book sharing the REX account - Rugby, Southam,
 * Coventry. Those never show: search only answers with homes in the
 * searcher's own book (lib/search-all).
 *
 * Numbers the OS recorded itself (os_home_keys) are read fresh every time;
 * that table is a handful of rows.
 */

export interface KeyHit {
  /** The home the key is on: a REX property id, or the OS's own home id. */
  home: string;
  label: string;
  location: string | null;
  rank: 1 | 2;
}

type Entry = { l: string; p: string; o: string | null };

const KEY = "key-index:v1";
const FRESH_MS = 3 * 60 * 60 * 1000;

async function readRegister(): Promise<Entry[]> {
  const out: Entry[] = [];
  for (let offset = 0; offset < 50_000; offset += 100) {
    const res = await rexCall("KeyRegister", "search", { criteria: [], limit: 100, offset }, null, { quiet: true });
    if (!res.ok) throw new Error(res.error ?? "REX's key register could not be read.");
    const rows = rexRows(res.result) as Array<{ label?: string | null; location?: { name?: string } | null; property?: { id?: string | number } | number | null }>;
    for (const k of rows) {
      const p = typeof k.property === "object" && k.property ? k.property.id : k.property;
      if (p == null || !k.label?.trim()) continue;
      out.push({ l: k.label.trim(), p: String(p), o: k.location?.name ?? null });
    }
    if (rows.length < 100) break;
  }
  return out;
}

/* The forms are worked out once per read of the register, not per keystroke. */
let formed: { at: number; rows: Array<Entry & { f: string[] }> } | null = null;

async function register(): Promise<Array<Entry & { f: string[] }>> {
  const h = await held<Entry[]>(KEY);
  /* A read that failed is not tried again for ten minutes, or every keystroke
     while REX is down would start another. */
  const failed = failureFor(KEY);
  if ((!h || Date.now() - h.at > FRESH_MS) && rexConfigured() && !(failed && Date.now() - failed.at < 10 * 60 * 1000)) {
    refresh(KEY, readRegister).catch(() => {});
  }
  if (!h) return [];
  if (formed?.at !== h.at) formed = { at: h.at, rows: h.data.map((e) => ({ ...e, f: keyForms(e.l) })) };
  return formed.rows;
}

/** The keys a search names, best first; empty when it cannot be a key. */
export async function keysMatching(needle: string): Promise<KeyHit[]> {
  const n = keyNeedle(needle);
  if (!n) return [];
  const ours = hasDb()
    ? await q<{ home_key: string; label: string; location: string }>(
        `SELECT home_key, label, location FROM os_home_keys WHERE removed_at IS NULL`,
        []
      ).catch(() => [])
    : [];
  const rows = [
    ...(await register().catch(() => [])),
    ...ours.map((r) => ({ l: r.label, p: r.home_key, o: r.location || null, f: keyForms(r.label) })),
  ];
  const hits: KeyHit[] = [];
  for (const r of rows) {
    const rank = keyRank(n, r.f);
    if (rank) hits.push({ home: r.p, label: keyShown(r.l), location: r.o, rank });
  }
  return hits.sort((a, b) => b.rank - a.rank || a.label.length - b.label.length);
}
