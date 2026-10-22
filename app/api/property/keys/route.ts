import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { whoIs } from "@/lib/admin";
import { hasDb, q } from "@/lib/db";
import { can } from "@/lib/roles";
import { scopeForWho } from "@/lib/scope";
import { managedBookFor } from "@/lib/managed-book-cache";
import { fetchKeys } from "@/lib/rex-keys";
import { bookFor } from "@/lib/listings-cache";
import { rexConfigured } from "@/lib/rex";
import { getOsProperty, isOsPropertyId } from "@/lib/os-properties";
import { record } from "@/lib/audit";
import { publicError } from "@/lib/public-error";

/**
 * A home's key numbers (Sean McMahon, 20 Oct 2026: "Where do we find key
 * numbers? ... I've got over 300 sets of keys all with code numbers on them").
 *
 * REX's key register already holds them: every key set has a label - FM23,
 * DJ D17, SBC02 - which is the number on the tag, where it is kept, and who
 * has it out. That is read live, read-only. A number REX has not got can be
 * recorded here (os_home_keys); it stays in the OS and is never written to REX.
 *
 * Who holds which key is guarded (Rig run 2, P-008): the office sees any
 * home, an agent only the homes in their own Portfolio - or, on a listing's
 * page (James, 22 Oct 2026), the home behind a listing in their own book.
 *
 *   GET  ?property=<id>[&listing=<id>]        the keys
 *   POST { property, label, location? }      record one in the OS
 *   POST { property, remove: <id> }           take an OS one off
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Key = { id: string; label: string; description: string | null; location: string | null; heldBy: string | null; since: string | null; reason: string | null; source: "rex" | "os"; by?: string; at?: string };

const isId = (v: string) => /^(\d+|pm-(test-)?[0-9a-f-]+)$/i.test(v);

async function allowed(req: NextRequest, propertyId: string, listingId?: string | null) {
  const who = await whoIs(req);
  const { actor } = who;
  if (!actor) return { actor: null, ok: false, why: "Sign in first.", status: 401 };
  if (can(actor.role, "see:everything") && !who.viewingAs) return { actor, ok: true };
  const scope = await scopeForWho(req, who).catch(() => null);
  if (!scope || scope.unlinked) return { actor, ok: false, why: "Your login isn't linked to an agent yet.", status: 403 };
  if (scope.everything) return { actor, ok: true };
  const { book } = await managedBookFor(scope.rexUserId);
  let mine = book.properties.some((p) => p.propertyId === propertyId);
  /* A listing in their own book, and only for the home that listing is on -
     a listing id cannot be used to open some other home's keys. */
  if (!mine && listingId && /^\d+$/.test(listingId)) {
    const listings = await bookFor(scope.rexUserId).then((b) => b.listings).catch(() => []);
    mine = listings.some((l) => String(l.id) === listingId && String(l.propertyId ?? "") === propertyId);
  }
  return mine ? { actor, ok: true } : { actor, ok: false, why: "The keys for a home are for its agent and the office.", status: 403 };
}

/** REX's id for the home: the OS's own homes carry it on their record. */
async function rexIdOf(propertyId: string): Promise<string | null> {
  if (/^\d+$/.test(propertyId)) return propertyId;
  if (!isOsPropertyId(propertyId)) return null;
  return (await getOsProperty(propertyId).catch(() => null))?.rexPropertyId ?? null;
}

async function keysFor(propertyId: string): Promise<{ keys: Key[]; rexFailed: boolean }> {
  const rexId = await rexIdOf(propertyId);
  let rexFailed = false;
  const fromRex: Key[] = [];
  if (rexId && rexConfigured()) {
    try {
      for (const k of (await fetchKeys([rexId]))[rexId] ?? []) {
        fromRex.push({ id: `rex-${k.id}`, label: k.label, description: k.description, location: k.location, heldBy: k.heldBy, since: k.since, reason: k.reason, source: "rex" });
      }
    } catch {
      rexFailed = true;
    }
  }
  const ours = hasDb()
    ? await q<{ id: string; label: string; location: string; by_name: string; created_at: Date }>(
        `SELECT id, label, location, by_name, created_at FROM os_home_keys WHERE home_key = ANY($1) AND removed_at IS NULL ORDER BY created_at`,
        [[propertyId, ...(rexId && rexId !== propertyId ? [rexId] : [])]]
      )
    : [];
  return {
    keys: [
      ...fromRex,
      ...ours.map((r) => ({ id: r.id, label: r.label, description: null, location: r.location || null, heldBy: null, since: null, reason: null, source: "os" as const, by: r.by_name, at: new Date(r.created_at).toISOString() })),
    ],
    rexFailed,
  };
}

export async function GET(req: NextRequest) {
  const property = (req.nextUrl.searchParams.get("property") ?? "").trim();
  if (!isId(property)) return NextResponse.json({ ok: false, error: "Which home?" }, { status: 400 });
  const a = await allowed(req, property, req.nextUrl.searchParams.get("listing"));
  if (!a.ok) return NextResponse.json({ ok: false, error: a.why }, { status: a.status ?? 403 });
  try {
    const { keys, rexFailed } = await keysFor(property);
    return NextResponse.json({ ok: true, keys, rexFailed });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "The keys couldn't be read.") }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database is connected." }, { status: 503 });
  const b = (await req.json().catch(() => ({}))) as { property?: unknown; listing?: unknown; label?: unknown; location?: unknown; remove?: unknown };
  const property = typeof b.property === "string" ? b.property.trim() : "";
  if (!isId(property)) return NextResponse.json({ ok: false, error: "Which home?" }, { status: 400 });
  const a = await allowed(req, property, typeof b.listing === "string" ? b.listing : null);
  if (!a.ok || !a.actor) return NextResponse.json({ ok: false, error: a.why }, { status: a.status ?? 403 });
  const who = await whoIs(req);
  if (who.viewingAs) return NextResponse.json({ ok: false, error: "Stop viewing as somebody first, so the key is in your name." }, { status: 403 });
  const me = who.subject ?? a.actor;

  if (typeof b.remove === "string" && b.remove) {
    await q(`UPDATE os_home_keys SET removed_at = NOW() WHERE id = $1 AND home_key = $2 AND removed_at IS NULL`, [b.remove, property]);
    await record({ kind: "home_key_set", actorId: me.id, actorEmail: me.email, detail: `home ${property}: key ${b.remove} taken off (OS only)` }).catch(() => {});
    return NextResponse.json({ ok: true, ...(await keysFor(property)) });
  }

  const label = typeof b.label === "string" ? b.label.trim().slice(0, 60) : "";
  const location = typeof b.location === "string" ? b.location.trim().slice(0, 80) : "";
  if (!label) return NextResponse.json({ ok: false, error: "What's the number on the tag?" }, { status: 400 });
  await q(
    `INSERT INTO os_home_keys (id, home_key, label, location, by_name) VALUES ($1, $2, $3, $4, $5)`,
    [randomUUID(), property, label, location, me.name]
  );
  await record({ kind: "home_key_set", actorId: me.id, actorEmail: me.email, detail: `home ${property}: key ${label}${location ? ` (${location})` : ""} recorded (OS only)` }).catch(() => {});
  return NextResponse.json({ ok: true, ...(await keysFor(property)) });
}
