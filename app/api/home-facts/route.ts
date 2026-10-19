import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { hasDb } from "@/lib/db";
import { record } from "@/lib/audit";
import { applyOne, homeFactsFor, isHomeKey, setHomeFacts } from "@/lib/home-facts";
import { choiceLabel, isChoice, type FactKey } from "@/lib/home-facts-shared";
import { heldComplianceBook, patchHeldBook } from "@/lib/compliance-cache";

/**
 * A HOME'S FACTS, AS THE PEOPLE WHO KNOW IT SAY (19 Oct 2026, lib/home-facts).
 *
 *   GET   ?home=<REX property id | pm- id>[&book=1]   -> { facts, book: { hmo, hasGas } | null }
 *   PATCH { home, homeType?, gasSupply?, hotWater?, electrical?, eicReason? } -> the same
 *
 * The agent on the home is who usually knows (Rhiannon knew her flat was a
 * flat), so the agents and the office may answer. What changes is said on
 * the screen before it is saved, the answer carries their name, and the
 * compliance book is put right at once rather than at the next REX sweep.
 * Nothing is written to REX.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAY = new Set(["owner", "super_admin", "developer", "pretenancy", "compliance", "agent"]);
const KEYS: FactKey[] = ["homeType", "gasSupply", "hotWater", "electrical", "eicReason"];

async function bookView(home: string) {
  const held = await heldComplianceBook().catch(() => null);
  const p = held?.book.properties.find((x) => String(x.id) === home);
  return p ? { hmo: p.hmo, hasGas: p.hasGas, gasAnswered: p.gasAnswered ?? null } : null;
}

export async function GET(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const home = req.nextUrl.searchParams.get("home");
  if (!isHomeKey(home)) return NextResponse.json({ ok: false, error: "Which home?" }, { status: 400 });
  try {
    const [facts, book] = await Promise.all([homeFactsFor(home), req.nextUrl.searchParams.get("book") === "1" ? bookView(home) : null]);
    return NextResponse.json({ ok: true, facts, book, canEdit: MAY.has(actor.role) }, { headers: { "cache-control": "private, no-store" } });
  } catch {
    return NextResponse.json({ ok: false, error: "The home's facts did not load. Try again in a minute." }, { status: 502 });
  }
}

export async function PATCH(req: NextRequest) {
  const { actor, viewingAs } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (viewingAs) return NextResponse.json({ ok: false, error: "You are viewing as somebody else. Stop viewing as them to change this." }, { status: 403 });
  if (!MAY.has(actor.role)) return NextResponse.json({ ok: false, error: "The home's facts are for its agent or the office." }, { status: 403 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "There is no database on this environment." }, { status: 503 });

  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const home = b.home;
  if (!isHomeKey(home)) return NextResponse.json({ ok: false, error: "Which home?" }, { status: 400 });
  const change: Partial<Record<FactKey, string>> = {};
  for (const k of KEYS) {
    if (b[k] === undefined) continue;
    if (!isChoice(k, b[k])) return NextResponse.json({ ok: false, error: "That is not one of the choices." }, { status: 400 });
    change[k] = String(b[k]);
  }
  if (!Object.keys(change).length) return NextResponse.json({ ok: false, error: "Nothing to change." }, { status: 400 });

  const by = actor.name || actor.email;
  try {
    const facts = await setHomeFacts(home, change, by);
    /* Every screen shows it now; the next full build reads the same answer. */
    await patchHeldBook((book) => {
      for (const p of book.properties) if (String(p.id) === home) applyOne(p, facts);
    }).catch(() => false);
    const said = (Object.keys(change) as FactKey[]).map((k) => choiceLabel(k, change[k])).filter(Boolean).join(", ");
    await record({ kind: "home_facts_set", actorId: actor.id, actorEmail: actor.email, detail: `home ${home}: ${said} (kept in the OS only)` }).catch(() => {});
    return NextResponse.json({ ok: true, facts, book: await bookView(home), canEdit: true });
  } catch {
    return NextResponse.json({ ok: false, error: "That did not save. Try again in a minute." }, { status: 502 });
  }
}
