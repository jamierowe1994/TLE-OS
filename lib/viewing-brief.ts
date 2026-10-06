import "server-only";
import { hasDb, q } from "@/lib/db";
import { rexCall } from "@/lib/rex";
import { accessKeyFor } from "@/lib/access-key";

/**
 * WHAT THE AGENT'S DIARY ENTRY SAYS ABOUT A VIEWING (Lianna, 6 Oct 2026).
 *
 * Her first viewing on 6 Ruskin Place went into REX's diary - and through
 * REX's copy, her Outlook - saying only "Booked in TLE OS": no postcode, no
 * applicant's number (REX had it), nothing about getting in. James: the
 * calendar should show the address, the time, the tenant's details and the
 * access. This writes that block, for REX's entry and for Outlook alike, and
 * rewrites it when the access is set after the booking (the booker's last
 * step usually comes after the diary entry is made).
 */

export interface BriefInput {
  address: string;
  applicantName: string;
  phone?: string | null;
  email?: string | null;
  access?: string | null;
  unaccompanied?: boolean;
  agentName?: string | null;
}

export function viewingBrief(b: BriefInput): string {
  return [
    `${b.unaccompanied ? "Unaccompanied viewing" : "Viewing"} at ${b.address}`,
    "",
    `Applicant: ${b.applicantName}`,
    `Phone: ${b.phone?.trim() || "not on file"}`,
    `Email: ${b.email?.trim() || "not on file"}`,
    "",
    `Access: ${b.access?.trim() || "not set yet - confirm it on the listing in TLE OS"}`,
    b.unaccompanied ? "Nobody from us is going." : null,
    "",
    `Booked in TLE OS${b.agentName ? ` by ${b.agentName}` : ""}.`,
  ]
    .filter((l) => l !== null)
    .join("\n");
}

type AccessPayload = { kind?: string | null; name?: string; phone?: string; email?: string; keysCollected?: boolean };

/** The home's access arrangement in one line, or null when none is set. */
export async function accessLineFor(listingId: string | null, propertyId: string | null): Promise<string | null> {
  if (!hasDb()) return null;
  const keys = [accessKeyFor({ listingId, propertyId }), listingId].filter(Boolean) as string[];
  if (!keys.length) return null;
  const rows = await q<{ record_id: string; payload: AccessPayload }>(
    `SELECT record_id, payload FROM os_case_state WHERE kind = 'access' AND record_id = ANY($1::text[])`,
    [keys]
  ).catch(() => []);
  const a = rows.find((r) => r.record_id === keys[0])?.payload ?? rows[0]?.payload;
  if (!a?.kind) return null;
  const who = [a.name, a.phone].filter((x) => x && String(x).trim()).join(", ");
  if (a.kind === "vacant") return `Vacant - keys in the office${a.keysCollected ? " (collected)" : ""}.`;
  if (a.kind === "tenant") return `Through the tenant${who ? ` - ${who}` : ""}.`;
  if (a.kind === "landlord") return `Through the landlord${who ? ` - ${who}` : ""}.`;
  return null;
}

/** The applicant's phone and email from REX's contact. */
export async function rexContactDetails(contactId: string | null): Promise<{ phone: string | null; email: string | null }> {
  if (!contactId) return { phone: null, email: null };
  const res = await rexCall("Contacts", "read", { id: Number(contactId) }).catch(() => null);
  const c = (res?.ok ? res.result : null) as { related?: { contact_phones?: { phone_number?: string; phone_primary?: boolean }[]; contact_emails?: { email_address?: string }[] }; phone_number?: string; email_address?: string } | null;
  const phones = c?.related?.contact_phones ?? [];
  const phone = phones.find((p) => p.phone_primary)?.phone_number ?? phones[0]?.phone_number ?? c?.phone_number ?? null;
  const email = c?.related?.contact_emails?.[0]?.email_address ?? c?.email_address ?? null;
  return { phone: phone?.trim() || null, email: email?.trim() || null };
}

/**
 * Rewrite the diary entries of every viewing still to come on this listing,
 * after its access changed. REX's entry where REX took it (Outlook follows
 * through REX's copy); the OS's own Outlook entry otherwise.
 */
export async function refreshViewingDiaries(listingId: string): Promise<number> {
  if (!hasDb() || !/^\d+$/.test(listingId)) return 0;
  const rows = await q<{ id: string; rex_event_id: string | null; author_id: string; author_name: string; lead_id: string | null; booking: Record<string, unknown> | null }>(
    `SELECT id, rex_event_id, author_id, author_name, lead_id, booking FROM os_appointments
      WHERE kind = 'viewing' AND starts_at > NOW() AND booking->>'listingId' = $1`,
    [listingId]
  ).catch(() => []);
  if (!rows.length) return 0;
  const { readListingDetails } = await import("@/lib/listing-details");
  const details = await readListingDetails(Number(listingId), { cached: true }).catch(() => null);
  const access = await accessLineFor(listingId, details?.propertyId ?? null);
  let done = 0;
  for (const r of rows) {
    const b = (r.booking ?? {}) as { applicantName?: string; applicantEmail?: string | null; applicantPhone?: string | null; address?: string; startsAt?: string; minutes?: number; unaccompanied?: boolean; leadId?: string };
    const address = details?.address || b.address || "the property";
    /* Booked before the number was kept on the booking: REX's contact has it. */
    let phone = b.applicantPhone ?? null;
    if (!phone && b.startsAt) {
      const seen = await q<{ payload: { contactId?: string | null } }>(
        `SELECT payload FROM os_case_state WHERE kind = 'rex-viewing' AND record_id = $1`,
        [`${b.leadId ?? r.lead_id}|${listingId}|${new Date(b.startsAt).toISOString()}`]
      ).catch(() => []);
      phone = (await rexContactDetails(seen[0]?.payload?.contactId ?? null).catch(() => ({ phone: null }))).phone;
    }
    const brief = viewingBrief({
      address,
      applicantName: b.applicantName || "The applicant",
      phone,
      email: b.applicantEmail ?? null,
      access,
      unaccompanied: b.unaccompanied,
      agentName: r.author_name,
    });
    if (r.rex_event_id) {
      const { changeRexEvent } = await import("@/lib/rex-diary-write");
      const res = await changeRexEvent({ userId: r.author_id, eventId: r.rex_event_id, describe: { description: brief, location: address } }).catch(() => null);
      if (res?.ok) done++;
    }
    if (b.startsAt) {
      const { putInOutlook } = await import("@/lib/outlook-calendar");
      const key = `viewing|${b.leadId ?? r.lead_id}|${listingId}|${new Date(b.startsAt).toISOString()}`;
      const held = await q<{ n: string }>(`SELECT COUNT(*)::text AS n FROM os_case_state WHERE kind = 'outlook-event' AND record_id = $1`, [key]).catch(() => []);
      if (Number(held[0]?.n ?? 0) > 0) {
        const res = await putInOutlook({
          userId: r.author_id, key, force: true,
          subject: `${b.unaccompanied ? "Unaccompanied viewing" : "Viewing"} - ${address} with ${b.applicantName ?? "the applicant"}`,
          body: brief, location: address, startsAt: b.startsAt, minutes: b.minutes ?? 30, showAs: b.unaccompanied ? "free" : "busy",
        }).catch(() => null);
        if (res?.ok) done++;
      }
    }
  }
  return done;
}

/**
 * The address with its postcode. The booker sends what the card shows ("6
 * Ruskin Place"), so the applicant's email went without a postcode; the
 * listing's own address carries it.
 */
export async function fullAddressFor(listingId: string | null, given: string): Promise<string> {
  const hasPostcode = (s: string) => /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i.test(s);
  if (hasPostcode(given) || !listingId || !/^\d+$/.test(listingId)) return given;
  try {
    const { readListingDetails } = await import("@/lib/listing-details");
    const d = await readListingDetails(Number(listingId), { cached: true });
    return d.address && hasPostcode(d.address) ? d.address : given;
  } catch {
    return given;
  }
}
