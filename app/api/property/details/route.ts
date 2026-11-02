import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { hasDb } from "@/lib/db";
import { can } from "@/lib/roles";
import { record } from "@/lib/audit";
import { bookScope } from "@/lib/scope";
import { publicError } from "@/lib/public-error";
import { managedBookFor } from "@/lib/managed-book-cache";
import { heldComplianceBook, patchHeldBook } from "@/lib/compliance-cache";
import { applyOne, homeFactsFor, isHomeKey, setHomeFacts } from "@/lib/home-facts";
import { choiceLabel, isChoice, type FactKey } from "@/lib/home-facts-shared";
import { archiveHome, keysFor, mayArchiveOwn } from "@/lib/archived-homes";
import { logChange, overrideLog, overridesFor, saveOverrides } from "@/lib/home-overrides";
import {
  LET_TYPES,
  SERVICE_LABEL,
  cleanTenants,
  isDay,
  isServiceLevel,
  sayValue,
  type OverrideField,
} from "@/lib/home-overrides-shared";
import type { ManagedProperty } from "@/lib/portfolio-types";

/**
 * A HOME'S DETAILS, EDITED ON ITS PAGE (2 Nov 2026, lib/home-overrides).
 *
 *   GET   ?listing=<id>  -> { canEdit, canEnd, values, marks, facts, factsBook, log }
 *   PATCH { listing, service?, letType?, tenancyStart?, tenancyEnd?, tenants?,
 *           homeType?, gasSupply?, end?: { listingIds, label, reason } }
 *
 * A field left out is not touched; a field sent as null goes back to what
 * REX (or the record) says. Who may: anybody whose own book holds the home -
 * the agent on it, and the office and owners, whose book is the whole
 * business - as themselves, not viewing as somebody. Taking a home off
 * management is the archive (lib/archived-homes), so it is for whoever holds
 * archive:homes (Michael, Susan, the owners) or the home's own agent (2 Nov 2026).
 *
 * Every change goes in the home's log with who, what it was and what it is
 * now. Nothing is written to REX, REX PM, PayProp or Propoly.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function homeFor(req: NextRequest, listing: string) {
  const who = await whoIs(req);
  if (!who.actor) return { error: NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 }) };
  const scope = await bookScope(req, who);
  if (scope.unlinked) return { error: NextResponse.json({ ok: false, error: "We can't tell whose book this is." }, { status: 403 }) };
  const { book } = await managedBookFor(scope.rexUserId);
  const home = book.properties.find((p) => String(p.listingId) === listing) ?? null;
  if (!home) return { error: NextResponse.json({ ok: false, error: "This home isn't in your book." }, { status: 404 }) };
  /* Taking it off management (James, 2 Nov 2026): Michael, Susan and the owners
     (archive:homes), and the home's own agent - it is in their own book. */
  const mayEnd = !who.viewingAs && (can(who.actor.role, "archive:homes") || mayArchiveOwn(who.actor.role, scope));
  return { who, home, book, mayEnd };
}

async function payload(home: ManagedProperty, canEdit: boolean, canEnd: boolean) {
  const key = home.propertyId && isHomeKey(home.propertyId) ? String(home.propertyId) : null;
  const [values, facts, held, log] = await Promise.all([
    overridesFor(home),
    key ? homeFactsFor(key) : null,
    key ? heldComplianceBook().catch(() => null) : null,
    overrideLog(home),
  ]);
  const c = key ? held?.book.properties.find((x) => String(x.id) === key) ?? null : null;
  return {
    ok: true,
    canEdit,
    canEnd,
    factsKey: key,
    values: Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v?.value ?? null])),
    marks: home.overridden ?? {},
    facts,
    /* What the compliance book treats the home as, before anybody answered. */
    factsBook: c ? { hmo: c.hmo, hasGas: c.hasGas } : null,
    log,
  };
}

export async function GET(req: NextRequest) {
  const listing = req.nextUrl.searchParams.get("listing")?.trim() ?? "";
  if (!listing) return NextResponse.json({ ok: false, error: "Which home?" }, { status: 400 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "There is no database on this environment." }, { status: 503 });
  try {
    const r = await homeFor(req, listing);
    if ("error" in r) return r.error;
    const actor = r.who.actor!;
    const canEdit = !r.who.viewingAs && !r.home.test;
    return NextResponse.json(await payload(r.home, canEdit, canEdit && r.mayEnd), { headers: { "cache-control": "private, no-store" } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "The home's details couldn't be read just now.") }, { status: 503 });
  }
}

type Body = Record<string, unknown> & { listing?: unknown; end?: { listingIds?: unknown; label?: unknown; reason?: unknown } };

export async function PATCH(req: NextRequest) {
  if (!hasDb()) return NextResponse.json({ ok: false, error: "There is no database on this environment." }, { status: 503 });
  const b = (await req.json().catch(() => ({}))) as Body;
  const listing = typeof b.listing === "string" ? b.listing.trim() : "";
  if (!listing) return NextResponse.json({ ok: false, error: "Which home?" }, { status: 400 });

  try {
    const r = await homeFor(req, listing);
    if ("error" in r) return r.error;
    const { who, home, book } = r;
    const actor = who.actor!;
    if (who.viewingAs) return NextResponse.json({ ok: false, error: "You are viewing as somebody else. Stop viewing as them to change this." }, { status: 403 });
    if (home.test) return NextResponse.json({ ok: false, error: "A test home keeps its own details." }, { status: 400 });
    const by = { name: actor.name || actor.email, email: actor.email };

    /* The answer to "Do you need to re-sign a new contract?" after a change of
       service (James, 2 Nov 2026). No sends nothing and says so on the log;
       Yes opens the terms to send, and the terms keep their own record. */
    if (b.contract === "no") {
      const service = typeof b.service === "string" && isServiceLevel(b.service) ? SERVICE_LABEL[b.service] : home.service;
      await logChange(home, "contract", null, `No new contract needed${service ? ` for ${service}` : ""}`, by);
      return NextResponse.json(await payload(home, true, r.mayEnd));
    }

    /* ── the OS's own answers ─────────────────────────────────────────── */
    const held = await overridesFor(home);
    const changes: { field: OverrideField; value: unknown | null; from: string | null }[] = [];
    const bad = (error: string) => NextResponse.json({ ok: false, error }, { status: 400 });

    if (b.service !== undefined) {
      if (b.service !== null && !isServiceLevel(b.service)) return bad("That isn't one of the services.");
      if (b.service !== (held.service?.value ?? null)) changes.push({ field: "service", value: b.service, from: home.service ?? "Not set" });
    }
    if (b.letType !== undefined) {
      if (b.letType !== null && !(LET_TYPES as readonly unknown[]).includes(b.letType)) return bad("That isn't one of the let types.");
      if (b.letType !== (held.letType?.value ?? null)) changes.push({ field: "letType", value: b.letType, from: home.letType ?? "Not set" });
    }
    if (b.tenancyStart !== undefined) {
      if (b.tenancyStart !== null && !isDay(b.tenancyStart)) return bad("The tenancy start needs to be a date.");
      if (b.tenancyStart !== (held.tenancyStart?.value ?? null)) changes.push({ field: "tenancyStart", value: b.tenancyStart, from: sayValue("tenancyStart", home.letSince?.slice(0, 10)) ?? "Not set" });
    }
    if (b.tenancyEnd !== undefined) {
      if (b.tenancyEnd !== null && b.tenancyEnd !== "rolling" && !isDay(b.tenancyEnd)) return bad("The tenancy end needs to be a date, or rolling.");
      const start = typeof b.tenancyStart === "string" ? b.tenancyStart : held.tenancyStart?.value ?? home.letSince?.slice(0, 10) ?? null;
      if (isDay(b.tenancyEnd) && typeof start === "string" && b.tenancyEnd <= start) return bad("The tenancy can't end before it starts.");
      if (b.tenancyEnd !== (held.tenancyEnd?.value ?? null)) changes.push({ field: "tenancyEnd", value: b.tenancyEnd, from: sayValue("tenancyEnd", held.tenancyEnd?.value) ?? "As PayProp has it" });
    }
    if (b.tenants !== undefined) {
      const list = b.tenants === null ? null : cleanTenants(b.tenants);
      if (b.tenants !== null && !list) return bad("Each tenant needs a name, and an email that looks right.");
      if (JSON.stringify(list) !== JSON.stringify(held.tenants?.value ?? null)) changes.push({ field: "tenants", value: list, from: home.tenants.map((t) => t.name).join(", ") || "Nobody" });
    }

    /* ── the home facts (lib/home-facts), where they already lived ──────── */
    const facts: Partial<Record<FactKey, string>> = {};
    for (const k of ["homeType", "gasSupply"] as const) {
      if (b[k] === undefined || b[k] === null) continue;
      if (!isChoice(k, b[k])) return bad("That is not one of the choices.");
      facts[k] = String(b[k]);
    }
    const factsKey = home.propertyId && isHomeKey(home.propertyId) ? String(home.propertyId) : null;
    if (Object.keys(facts).length && !factsKey) return bad("This home has no property record yet, so its type and gas can't be kept.");

    /* ── no longer managed: the archive ───────────────────────────────── */
    let ended = false;
    if (b.end) {
      if (!r.mayEnd) return NextResponse.json({ ok: false, error: "Taking a home off management is for the home's own agent, Michael, Susan and the owners." }, { status: 403 });
      const asked = Array.isArray(b.end.listingIds) ? [...new Set(b.end.listingIds.map((x) => String(x ?? "").trim()).filter(Boolean))].slice(0, 60) : [listing];
      const homes = book.properties.filter((p) => asked.includes(String(p.listingId)));
      if (!homes.length) return bad("That home isn't in the book.");
      const reason = String(b.end.reason ?? "").trim().slice(0, 300);
      if (!reason) return bad("Say why it is no longer managed: sold, management ended, or what happened.");
      const label = String(b.end.label ?? "").trim().slice(0, 200) || `${home.name}, ${home.locality}`;
      const listingIds = homes.map((p) => String(p.listingId));
      const keys = await keysFor([...listingIds, ...homes.map((p) => String(p.propertyId ?? "")).filter(Boolean)]);
      await archiveHome({ label, keys, listingIds, reason: `No longer managed: ${reason}`, byName: by.name, byEmail: by.email });
      ended = true;
    }

    if (!changes.length && !Object.keys(facts).length && !ended) return bad("Nothing has changed.");

    if (changes.length) await saveOverrides(home, changes, by);
    if (Object.keys(facts).length && factsKey) {
      const before = await homeFactsFor(factsKey);
      /* What the records had it as, for the log, where nobody had answered yet. */
      const was = (await heldComplianceBook().catch(() => null))?.book.properties.find((x) => String(x.id) === factsKey) ?? null;
      const recordSaid = { homeType: was ? (was.hmo ? "HMO" : "Not an HMO") : null, gasSupply: was ? (was.hasGas ? "Gas at the property" : "No gas supply") : null };
      const after = await setHomeFacts(factsKey, facts, by.name);
      /* Every screen shows it now, as the compliance drawer's answers do. */
      await patchHeldBook((cb) => {
        for (const p of cb.properties) if (String(p.id) === factsKey) applyOne(p, after);
      }).catch(() => false);
      for (const k of Object.keys(facts) as ("homeType" | "gasSupply")[]) {
        if (before[k] === after[k]) continue;
        await logChange(home, k, choiceLabel(k, before[k]) ?? recordSaid[k], choiceLabel(k, after[k]), by);
      }
    }
    if (ended) await logChange(home, "management", "Managed by us", `No longer managed: ${String(b.end?.reason ?? "").trim().slice(0, 300)}`, by);

    const said = [
      ...changes.map((c) => `${c.field}: ${c.from ?? "-"} -> ${c.value == null ? "back to REX" : sayValue(c.field, c.value)}`),
      ...(Object.keys(facts) as FactKey[]).map((k) => `${k}: ${choiceLabel(k, facts[k])}`),
      ...(ended ? ["no longer managed (archived)"] : []),
    ].join("; ");
    await record({ kind: "home_details_set", actorId: actor.id, actorEmail: actor.email, detail: `home ${home.propertyId ?? listing} (listing ${listing}): ${said}. Kept in the OS only, not REX.` }).catch(() => undefined);

    if (ended) return NextResponse.json({ ok: true, ended: true });
    /* The book again, with the answers on: the page shows what every other screen now shows. */
    const { book: after } = await managedBookFor((await bookScope(req, who)).rexUserId);
    const now = after.properties.find((p) => String(p.listingId) === listing) ?? home;
    return NextResponse.json(await payload(now, true, r.mayEnd));
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "That didn't save. Try again in a minute.") }, { status: 503 });
  }
}
