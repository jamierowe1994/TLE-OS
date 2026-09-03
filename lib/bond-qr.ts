import "server-only";
import { randomBytes } from "crypto";
import QRCode from "qrcode";
import { hasDb, q } from "@/lib/db";
import { getProspect } from "@/lib/radar";
import { saveContact } from "@/lib/contacts-store";
import { logActivity } from "@/lib/bond";
import { rentCheck, type RentCheck } from "@/lib/rent-check";
import { sendRentCheck } from "@/lib/rent-check-email";

/**
 * The QR loop: letterbox to inbox.
 *
 * Every card Bond sends carries a code of its own. The landlord scans it,
 * lands on a page that already knows the door and why we wrote, sees what
 * similar homes nearby are advertised at, and leaves their name and email
 * to get the full check. That makes them an inbound lead in the OS who has
 * opted in, and it tells Bond which card worked, which is what the learned
 * weights will be trained on.
 *
 * ── The token is the whole key ────────────────────────────────────────────
 *
 * Ten characters from a safe alphabet, unguessable, and the only thing in
 * the URL. Nothing about the person or the property is in the link, so a
 * code on a card can be photographed by anyone and reveal nothing until it
 * is scanned - and what it reveals then is the property's own address and
 * some public advert figures.
 *
 * ── The reason travels with the code ──────────────────────────────────────
 *
 * James, 3 Sep: "we could change the postcard based on what the reason is".
 * A link records why the card went (the campaign trigger, or a reason typed
 * by hand), and the page speaks to that reason. A hand-made code for a
 * one-off card carries its own note.
 */

export type QrReason = "anniversary" | "just_bought" | "self_managing" | "custom";

export const REASON_LABEL: Record<QrReason, string> = {
  anniversary: "Tenancy anniversary",
  just_bought: "Just bought",
  self_managing: "Letting it themselves",
  custom: "Other reason",
};

export interface QrLink extends Record<string, unknown> {
  token: string;
  property_key: string | null;
  address: string;
  postcode: string;
  district: string | null;
  reason: QrReason;
  reason_note: string;
  send_id: number | null;
  campaign_name: string | null;
  step_title: string | null;
  created_by: string;
  created_at: string;
  scans: number;
  first_scan_at: string | null;
  last_scan_at: string | null;
  responses: number;
  contact_id: string | null;
}

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

/** "12 A Road, Town, NN1 1AA, NN1 1AA" happens when a postcode is appended twice. Once is enough. */
export function tidyAddress(address: string): string {
  const parts = address.split(",").map((x) => x.trim()).filter(Boolean);
  const out: string[] = [];
  for (const p of parts) if (!out.some((o) => o.toUpperCase().replace(/\s+/g, " ") === p.toUpperCase().replace(/\s+/g, " "))) out.push(p);
  return out.join(", ");
}
function newToken(): string {
  const bytes = randomBytes(10);
  let out = "";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

/** Where a code points. The service's own origin, never the request's. */
export function qrOrigin(): string {
  return (process.env.OS_ORIGIN ?? process.env.NEXT_PUBLIC_OS_ORIGIN ?? "https://tle-os.co.uk").replace(/\/+$/, "");
}
export const qrUrl = (token: string) => `${qrOrigin()}/r/${token}`;

/** The code itself, as SVG, sized so a phone reads it off a postcard. */
export async function qrSvg(token: string): Promise<string> {
  return QRCode.toString(qrUrl(token), { type: "svg", errorCorrectionLevel: "M", margin: 1, color: { dark: "#1a1a1a", light: "#ffffff" } });
}

function toLink(r: Record<string, unknown>): QrLink {
  return {
    ...r,
    token: String(r.token),
    property_key: (r.property_key as string) ?? null,
    address: String(r.address ?? ""),
    postcode: String(r.postcode ?? ""),
    district: (r.district as string) ?? null,
    reason: (r.reason as QrReason) ?? "custom",
    reason_note: String(r.reason_note ?? ""),
    send_id: r.send_id == null ? null : Number(r.send_id),
    campaign_name: (r.campaign_name as string) ?? null,
    step_title: (r.step_title as string) ?? null,
    created_by: String(r.created_by ?? ""),
    created_at: new Date(r.created_at as string).toISOString(),
    scans: Number(r.scans ?? 0),
    first_scan_at: r.first_scan_at ? new Date(r.first_scan_at as string).toISOString() : null,
    last_scan_at: r.last_scan_at ? new Date(r.last_scan_at as string).toISOString() : null,
    responses: Number(r.responses ?? 0),
    contact_id: (r.contact_id as string) ?? null,
  };
}

export async function getLink(token: string): Promise<QrLink | null> {
  if (!hasDb() || !/^[a-z0-9]{6,20}$/.test(token)) return null;
  const rows = await q<Record<string, unknown>>(`SELECT * FROM os_bond_qr_links WHERE token = $1`, [token]);
  return rows[0] ? toLink(rows[0]) : null;
}

/**
 * A code by hand: for a one-off card, with its own reason. The door comes
 * from the board when it is on it; an address typed in works too.
 */
export async function createLink(p: {
  property_key?: string | null;
  address: string;
  postcode: string;
  reason: QrReason;
  reason_note?: string;
  created_by: string;
}): Promise<QrLink> {
  const district = p.postcode.toUpperCase().trim().split(/\s+/)[0] || null;
  const token = newToken();
  const rows = await q<Record<string, unknown>>(
    `INSERT INTO os_bond_qr_links (token, property_key, address, postcode, district, reason, reason_note, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [token, p.property_key ?? null, tidyAddress(p.address), p.postcode.toUpperCase().replace(/\s+/g, " ").trim(), district, p.reason, (p.reason_note ?? "").trim().slice(0, 300), p.created_by]
  );
  await logActivity({ actor: p.created_by, kind: "postcard", property_key: p.property_key ?? null, address: p.address, detail: `QR code made · ${REASON_LABEL[p.reason]}${p.reason_note ? ` · ${p.reason_note}` : ""}` });
  return toLink(rows[0]);
}

/** Every queued or held card gets a code of its own, once. Cheap; run after the queue is built. */
export async function ensureLinksForSends(): Promise<number> {
  if (!hasDb()) return 0;
  const todo = await q<{ id: number; property_key: string; address: string; trigger: string; campaign_name: string; step_title: string }>(
    `SELECT s.id, s.property_key, s.address, c.trigger, c.name AS campaign_name, st.title AS step_title
       FROM os_bond_campaign_sends s
       JOIN os_bond_campaigns c ON c.id = s.campaign_id
       JOIN os_bond_campaign_steps st ON st.id = s.step_id
      WHERE s.qr_token IS NULL AND s.status IN ('queued', 'held')
      LIMIT 2000`
  );
  for (const s of todo) {
    const token = newToken();
    const postcode = (s.address.match(/([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\s*$/i)?.[1] ?? "").toUpperCase().replace(/\s+/g, " ");
    const reason: QrReason = s.trigger === "anniversary" || s.trigger === "just_bought" || s.trigger === "self_managing" ? s.trigger : "custom";
    await q(
      `INSERT INTO os_bond_qr_links (token, property_key, address, postcode, district, reason, send_id, campaign_name, step_title, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'Bond')`,
      [token, s.property_key, tidyAddress(s.address), postcode, postcode.split(" ")[0] || null, reason, s.id, s.campaign_name, s.step_title]
    );
    await q(`UPDATE os_bond_campaign_sends SET qr_token = $2 WHERE id = $1`, [s.id, token]);
  }
  return todo.length;
}

/* ── What the page shows ─────────────────────────────────────────────────── */

export interface LandingPage {
  link: QrLink;
  beds: number | null;
  property_type: string | null;
  check: RentCheck;
}

export async function landingPage(token: string): Promise<LandingPage | null> {
  const link = await getLink(token);
  if (!link) return null;
  const p = link.property_key ? await getProspect(link.property_key) : null;
  const sector = link.postcode.replace(/\s+/g, " ").trim().replace(/(\d)[A-Z]{2}$/i, "$1").trim();
  const check = await rentCheck({
    district: link.district,
    sector: p?.sector ?? (sector || null),
    beds: p?.beds ?? null,
    property_type: p?.property_type ?? null,
    address: link.address,
  });
  return { link, beds: p?.beds ?? null, property_type: p?.property_type ?? null, check };
}

/** A scan: counted on the link, kept as an event. Never blocks the page. */
export async function recordScan(token: string, agent: string): Promise<void> {
  if (!hasDb()) return;
  try {
    await q(
      `UPDATE os_bond_qr_links SET scans = scans + 1, first_scan_at = coalesce(first_scan_at, NOW()), last_scan_at = NOW() WHERE token = $1`,
      [token]
    );
    await q(`INSERT INTO os_bond_qr_events (token, kind, agent) VALUES ($1, 'scan', $2)`, [token, agent.slice(0, 200)]);
  } catch (e) {
    console.error("[bond-qr] scan not recorded", e);
  }
}

/**
 * The landlord left their details: an OS contact of kind landlord, source
 * Bond, with the door and the reason on it, so it shows in Leads at once.
 */
export async function recordResponse(p: {
  token: string;
  name: string;
  email: string;
  phone?: string;
  consent: boolean;
  message?: string;
}): Promise<{ ok: boolean; reason?: string }> {
  if (!hasDb()) return { ok: false, reason: "no database" };
  const link = await getLink(p.token);
  if (!link) return { ok: false, reason: "That link is not one of ours." };
  const name = p.name.trim().slice(0, 120);
  const email = p.email.trim().toLowerCase().slice(0, 200);
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, reason: "A name and a working email address, please." };
  let contactId: string | null = null;
  try {
    const c = await saveContact(
      {
        kind: "landlord",
        name,
        email,
        mobile: (p.phone ?? "").trim().slice(0, 40),
        address: link.address,
        postcode: link.postcode,
        source: "Bond postcard",
        enquiry: `Rent check for ${link.address} (${REASON_LABEL[link.reason]}${link.campaign_name ? `, ${link.campaign_name}` : ""}${link.reason_note ? `, ${link.reason_note}` : ""}). ${p.consent ? "Opted in to email." : "Did not opt in to marketing email."}${p.message?.trim() ? ` They said: ${p.message.trim().slice(0, 500)}` : ""}`,
      },
      "Bond"
    );
    contactId = c.id;
  } catch (e) {
    console.error("[bond-qr] contact not saved", e);
  }
  const [resp] = await q<{ id: number }>(
    `INSERT INTO os_bond_qr_responses (token, name, email, phone, consent, message, contact_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [p.token, name, email, (p.phone ?? "").trim().slice(0, 40), p.consent, (p.message ?? "").trim().slice(0, 1000), contactId]
  );
  await q(`UPDATE os_bond_qr_links SET responses = responses + 1, contact_id = coalesce(contact_id, $2) WHERE token = $1`, [p.token, contactId]);
  await q(`INSERT INTO os_bond_qr_events (token, kind) VALUES ($1, 'submit')`, [p.token]);
  if (link.send_id) await q(`UPDATE os_bond_campaign_sends SET status = CASE WHEN status = 'sent' THEN 'sent' ELSE status END WHERE id = $1`, [link.send_id]);
  await logActivity({
    actor: name,
    kind: "postcard",
    property_key: link.property_key,
    address: link.address,
    detail: `Scanned the card and asked for a rent check${p.consent ? ", opted in to email" : ""} · ${REASON_LABEL[link.reason]}`,
  });
  /* The thing they asked for, straight away. A shut door (no key, the
     switch off) is recorded on the response and never fails the page. */
  try {
    const page = await landingPage(p.token);
    if (page) {
      await sendRentCheck(page, { email, firstName: name.split(/\s+/)[0] }, qrOrigin());
      await q(`UPDATE os_bond_qr_responses SET email_sent_at = NOW() WHERE id = $1`, [resp.id]);
    }
  } catch (e) {
    const why = e instanceof Error ? e.message : "send failed";
    await q(`UPDATE os_bond_qr_responses SET email_error = $2 WHERE id = $1`, [resp.id, why.slice(0, 300)]);
    console.error("[bond-qr] rent check email not sent:", why);
  }
  return { ok: true };
}

/** The button in the email: they want the valuation. Told to the office, marked on the contact. */
export async function recordBooking(token: string): Promise<{ ok: boolean; reason?: string }> {
  if (!hasDb()) return { ok: false, reason: "no database" };
  const link = await getLink(token);
  if (!link) return { ok: false, reason: "That link is not one of ours." };
  const [resp] = await q<{ id: number; name: string; contact_id: string | null }>(
    `SELECT id, name, contact_id FROM os_bond_qr_responses WHERE token = $1 ORDER BY created_at DESC LIMIT 1`,
    [token]
  );
  if (resp) await q(`UPDATE os_bond_qr_responses SET booked_at = coalesce(booked_at, NOW()) WHERE id = $1`, [resp.id]);
  await q(`INSERT INTO os_bond_qr_events (token, kind) VALUES ($1, 'book')`, [token]);
  if (resp?.contact_id) {
    try {
      const { updateContact, getContact } = await import("@/lib/contacts-store");
      const c = await getContact(resp.contact_id);
      if (c && !c.notes.includes("Asked to book")) await updateContact(resp.contact_id, { notes: `${c.notes ? `${c.notes}\n` : ""}Asked to book a free valuation from the rent-check email.` });
    } catch (e) {
      console.error("[bond-qr] contact not updated", e);
    }
  }
  await logActivity({ actor: resp?.name ?? "A landlord", kind: "appraisal", property_key: link.property_key, address: link.address, detail: "Asked to book a free valuation from the rent-check email" });
  return { ok: true };
}

/* ── For the rooms ───────────────────────────────────────────────────────── */

export async function listLinks(limit = 200): Promise<QrLink[]> {
  if (!hasDb()) return [];
  const rows = await q<Record<string, unknown>>(`SELECT * FROM os_bond_qr_links ORDER BY created_at DESC LIMIT $1`, [limit]);
  return rows.map(toLink);
}

export interface QrStats {
  links: number;
  scanned: number;
  responded: number;
  byReason: Record<string, { links: number; scanned: number; responded: number }>;
}

export async function qrStats(): Promise<QrStats> {
  const empty: QrStats = { links: 0, scanned: 0, responded: 0, byReason: {} };
  if (!hasDb()) return empty;
  const rows = await q<{ reason: string; links: string; scanned: string; responded: string }>(
    `SELECT reason, count(*) AS links, count(*) FILTER (WHERE scans > 0) AS scanned, count(*) FILTER (WHERE responses > 0) AS responded
       FROM os_bond_qr_links GROUP BY reason`
  );
  const out = { ...empty, byReason: {} as QrStats["byReason"] };
  for (const r of rows) {
    const v = { links: Number(r.links), scanned: Number(r.scanned), responded: Number(r.responded) };
    out.byReason[r.reason] = v;
    out.links += v.links;
    out.scanned += v.scanned;
    out.responded += v.responded;
  }
  return out;
}
