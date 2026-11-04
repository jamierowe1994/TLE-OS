import "server-only";
import { hasDb, q } from "@/lib/db";
import { recordFact } from "@/lib/property-facts";
import { forgetRecord, recordForProperty } from "@/lib/listing-record";
import { heldPropertyIds } from "@/lib/rex-landlord";
import { isRealDay, joinRegExpiries, joinRegNumbers, joinRegOwners, regNumbers, withLandlordReg, type HomeReg } from "@/lib/reg-numbers";
import { saveHomeAddress } from "@/lib/landlord-home";
import { sameHome } from "@/lib/address-parse";
import { isTestId } from "@/lib/test-overlay";
import { isTestFile } from "@/lib/test-guard";
import type { LandlordDetails } from "@/lib/terms/types";
import type { Party, TermsRow } from "@/lib/terms/store";

/**
 * THE LANDLORD REGISTRATION ON THE TERMS, BOTH WAYS (Lianna Denholm, 4 Nov
 * 2026).
 *
 * The Scottish terms ask each landlord for their council registration number
 * and when it runs out. The home already held them (the listing's Landlord
 * section, os_property_facts: landlord_registration, _expiry, _owner), but
 * nothing carried them across, so every landlord met two blank boxes and
 * typed them - one put a shortened number for the one on file -
 * and what they typed stayed on the contract and nowhere else.
 *
 *   in:   createTerms starts each landlord from their own number on file
 *         (lib/reg-numbers regForLandlords), marked as from the file, so the
 *         signing page shows it in a box for them to check and change.
 *   back: what a landlord gives when they sign goes on file - their
 *         registration on the home, their home address on their own record
 *         (lib/landlord-home, by their email) - only filling blanks or
 *         changing their own entry, never another landlord's. Never REX.
 */

type Home = { propertyId?: string | null; listingId?: string | null; appraisalId?: string | null };

/** The home the facts are kept against: the terms' property, else the appraisal's, else the listing's held one. The OS's own tables only. */
async function homeIdOf(h: Home): Promise<string | null> {
  const pid = (h.propertyId ?? "").trim();
  if (pid) return pid;
  if (!hasDb()) return null;
  const appraisal = (h.appraisalId ?? "").trim();
  if (appraisal) {
    const rows = await q<{ pid: string | null }>(`SELECT rex_property_id AS pid FROM os_market_appraisals WHERE id = $1`, [appraisal]).catch(() => []);
    const p = (rows[0]?.pid ?? "").trim();
    if (p) return p;
  }
  const listing = (h.listingId ?? "").trim();
  if (listing && !isTestId(listing)) return (await heldPropertyIds([listing]).catch(() => [] as string[]))[0] ?? null;
  return null;
}

/** What the home holds: each number, when it runs out and whose. Null where there is no home to ask. */
export async function homeRegistration(h: Home, opts: { fresh?: boolean; strict?: boolean } = {}): Promise<(HomeReg & { factsKey: string; homeId: string }) | null> {
  const homeId = await homeIdOf(h);
  if (!homeId) return null;
  const rec = await recordForProperty(homeId, {}, opts);
  if (!rec.factsKey) return null;
  const numbers = regNumbers(rec.landlordRegistration);
  return { numbers, expiry: rec.landlordRegistrationExpiry ?? {}, owners: rec.landlordRegistrationOwner ?? {}, factsKey: rec.factsKey, homeId };
}

/* As the listing's Landlord section takes them (app/api/listings/details). */
const NUMBER_OK = /^[A-Za-z0-9/ -]{3,40}$/;
const dayOk = (d: string) => isRealDay(d) && d >= "2000-01-01" && d <= `${new Date().getUTCFullYear() + 10}-12-31`;
const flat = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim();

/**
 * What one landlord gave on their signing page, back on file. `party` is them
 * as they were before this save; `given` what they saved. A detail put in from
 * the file and left as it was is not written back: there is nothing new in it.
 * A test file is left alone. Never throws: their signing goes on regardless.
 */
export async function keepFromSigning(t: TermsRow, party: Party, given: Partial<LandlordDetails>): Promise<void> {
  try {
    if (isTestId(t.listingId) || (await isTestFile({ appraisalId: t.appraisalId, address: t.propertyAddress }).catch(() => true))) return;
    const before = party.details ?? {};
    const fromFile = new Set(party.fromFile ?? []);
    const by = party.email;

    const number = flat(given.registrationNumber);
    const day = flat(given.registrationExpiry);
    const untouched = fromFile.has("registrationNumber") && number === flat(before.registrationNumber) && day === flat(before.registrationExpiry);
    if (number && !untouched && NUMBER_OK.test(number)) {
      /* Read now and in full: a number added on the listing a minute ago must not be written over, and a read that fails writes nothing. */
      const held = await homeRegistration(t, { fresh: true, strict: true }).catch(() => null);
      const next = held ? withLandlordReg(held, party.name, number, dayOk(day) ? day : null) : null;
      if (held && next) {
        const was = { n: joinRegNumbers(held.numbers), e: joinRegExpiries(held.expiry, held.numbers), o: joinRegOwners(held.owners, held.numbers) };
        const now = { n: joinRegNumbers(next.numbers), e: joinRegExpiries(next.expiry, next.numbers), o: joinRegOwners(next.owners, next.numbers) };
        const fact = (field: string, value: string | null) =>
          recordFact({ propertyId: held.factsKey, field, value, source: "manual", sourceRef: `terms ${t.id} (${party.name}, at signing)`, by });
        if (now.n !== was.n) await fact("landlord_registration", now.n);
        if (now.e !== was.e) await fact("landlord_registration_expiry", now.e);
        if (now.o !== was.o) await fact("landlord_registration_owner", now.o);
        forgetRecord(held.homeId);
      }
    }

    /* Their own home address, kept against the email their link went to. */
    const address = flat(given.address);
    if (address && address !== flat(before.address) && by) {
      await saveHomeAddress({ email: by, name: party.name, address, source: "landlord", sameAsProperty: sameHome(address, t.propertyAddress), by }).catch(() => null);
    }
  } catch {
    /* The file keeps what it had; the contract has what they gave. */
  }
}
