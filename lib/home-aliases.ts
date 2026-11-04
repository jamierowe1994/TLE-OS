import "server-only";
import { hasDb, q } from "@/lib/db";
import { heldListingsOn, heldPropertyIds } from "@/lib/rex-landlord";
import { everyPerson, oncePerPerson, peopleOnKeys, peopleVersion, type PropertyPerson } from "@/lib/property-people";

/**
 * EVERY KEY ONE HOME IS FILED UNDER (Lianna Denholm, 4 Nov 2026: eighteen
 * tickets on one let, its second landlord added on one screen and missing
 * from the terms, the let and the PLC).
 *
 * A joint landlord or a point of contact is kept against the key of the screen
 * it was added on (lib/property-people): the REX property id where that screen
 * knows it, else the OS record's id ("pm-..."), "listing:<id>",
 * "appraisal:<id>" or "let:<ref>". Every reader asked under its own screen's
 * one key, so somebody added on the appraisal before its REX property was
 * picked never reached the listing, the let, the terms or the Propoly push,
 * and nothing ever moved them across. Nothing here moves them either: a write
 * keeps the key it uses. A read asks here for every key the home is known by
 * and reads them all.
 *
 * From whichever of a home's keys a screen has, in the OS's own tables only
 * (never a call to REX):
 *   - a listing's REX property, from its held landlord read (lib/rex-landlord)
 *   - an appraisal's REX property, once an agent has picked it
 *   - the OS record rows linked to a REX property, and the REX property an OS
 *     record is linked to (os_properties.rex_property_id), as
 *     lib/record-landlords and the PLC already join them
 *   - every appraisal on the REX property, and every listing held as on it
 *   - a let's own key, which only the let knows, so the let passes it in
 */

const pick = (raw: string | null | undefined) => (raw ?? "").trim();

export async function homeKeysFor(...known: Array<string | null | undefined>): Promise<string[]> {
  const homes = new Set<string>();
  const listings = new Set<string>();
  const appraisals = new Set<string>();
  const lets = new Set<string>();
  for (const raw of known) {
    const k = pick(raw);
    if (!k) continue;
    if (k.startsWith("listing:")) listings.add(k.slice("listing:".length));
    else if (k.startsWith("appraisal:")) appraisals.add(k.slice("appraisal:".length));
    else if (k.startsWith("let:")) lets.add(k.slice("let:".length));
    else homes.add(k);
  }
  for (const s of [listings, appraisals, lets]) s.delete("");

  if (hasDb()) {
    /* The REX property behind the listing and the appraisal. */
    const [fromListings, fromAppraisals] = await Promise.all([
      heldPropertyIds([...listings]).catch(() => [] as string[]),
      appraisals.size
        ? q<{ pid: string }>(
            `SELECT rex_property_id AS pid FROM os_market_appraisals WHERE id = ANY($1) AND rex_property_id IS NOT NULL AND btrim(rex_property_id) <> ''`,
            [[...appraisals]]
          ).catch(() => [] as { pid: string }[])
        : Promise.resolve([] as { pid: string }[]),
    ]);
    fromListings.forEach((p) => homes.add(p));
    fromAppraisals.forEach((r) => homes.add(r.pid.trim()));

    if (homes.size) {
      /* The OS record and the REX property it is linked to, either way round. */
      const records = await q<{ id: string; rex: string | null }>(
        `SELECT id, rex_property_id AS rex FROM os_properties WHERE active AND (id = ANY($1) OR rex_property_id = ANY($1))`,
        [[...homes]]
      ).catch(() => [] as { id: string; rex: string | null }[]);
      for (const r of records) {
        homes.add(r.id);
        if (pick(r.rex)) homes.add(pick(r.rex));
      }
      /* Every appraisal and every held listing on the home. */
      const [onAppraisals, onListings] = await Promise.all([
        q<{ id: string }>(`SELECT id FROM os_market_appraisals WHERE rex_property_id = ANY($1)`, [[...homes]]).catch(() => [] as { id: string }[]),
        heldListingsOn([...homes]).catch(() => [] as string[]),
      ]);
      onAppraisals.forEach((r) => appraisals.add(r.id));
      onListings.forEach((l) => listings.add(l));
    }
  }

  return [
    ...homes,
    ...[...listings].map((l) => `listing:${l}`),
    ...[...appraisals].map((a) => `appraisal:${a}`),
    ...[...lets].map((r) => `let:${r}`),
  ];
}

/** Everyone on the home under any of its keys, the same person once (lib/property-people peopleOnKeys). */
export async function peopleOnHome(...known: Array<string | null | undefined>): Promise<PropertyPerson[]> {
  return peopleOnKeys(await homeKeysFor(...known));
}

/*
 * EVERYONE ON MANY HOMES AT ONCE (4 Nov 2026), for a screen that reads the
 * whole book: Portfolio's managed book (lib/book-lets), which named REX's
 * first owner and nobody else. The same people peopleOnHome gives one home:
 * each key a person was added under is read through homeKeysFor, as a let
 * reads its own home, and a home has everyone whose keys take in one of its
 * own. One homeKeysFor per key a person is kept under, not per home, so the
 * whole book is a few dozen small reads. Held for half a minute, and read
 * again at once when anybody is added, changed or removed (peopleVersion).
 */
const PEOPLE_FRESH_MS = 30_000;
let held: { at: number; version: number; people: Array<{ person: PropertyPerson; keys: Set<string> }> } | null = null;

async function everyoneWithKeys(): Promise<Array<{ person: PropertyPerson; keys: Set<string> }>> {
  const version = peopleVersion();
  if (held && held.version === version && Date.now() - held.at < PEOPLE_FRESH_MS) return held.people;
  const everyone = await everyPerson();
  const queue = [...new Set(everyone.map((p) => p.propertyId))];
  const aliases = new Map<string, Set<string>>();
  /* A few at a time: the pool is small and the book waits on this. */
  await Promise.all(Array.from({ length: 4 }, async () => {
    for (let k = queue.shift(); k !== undefined; k = queue.shift()) {
      const key = k;
      aliases.set(key, new Set(await homeKeysFor(key).catch(() => [key])));
    }
  }));
  const people = everyone.map((person) => ({ person, keys: aliases.get(person.propertyId) ?? new Set([person.propertyId]) }));
  held = { at: Date.now(), version, people };
  return people;
}

/** Everyone on each home, by the id given with it; a home with nobody is left out. */
export async function peopleOnHomes(homes: Array<{ id: string; keys: Array<string | null | undefined> }>): Promise<Map<string, PropertyPerson[]>> {
  const out = new Map<string, PropertyPerson[]>();
  if (!hasDb() || !homes.length) return out;
  const everyone = await everyoneWithKeys();
  if (!everyone.length) return out;
  for (const h of homes) {
    const mine = h.keys.map(pick).filter(Boolean);
    const on = everyone.filter((e) => mine.some((k) => e.keys.has(k))).map((e) => e.person);
    if (on.length) out.set(h.id, oncePerPerson(on));
  }
  return out;
}
