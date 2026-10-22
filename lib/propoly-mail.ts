import "server-only";
import { randomBytes } from "node:crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { hasDb, q } from "@/lib/db";
import { MailboxNotConnected, msAccessTokenFor } from "@/lib/microsoft";
import { isInternalAddress } from "@/lib/email-policy";
import { postcodeOf, sameHome } from "@/lib/address-parse";
import { R2_BUCKET, r2Configured, safeName, withR2 } from "@/lib/r2";
import { isScottishHome } from "@/lib/compliance";
import { missingFiles, PACK_FILES } from "@/lib/propoly-pack";
import { addFileDoc } from "@/lib/file-documents";
import { getAllPropolyDeals, getPropolyCompletes } from "@/lib/business/propoly-deals";

/**
 * THE MOVE-IN PACK, PROVEN ON THE FILE (21 Oct 2026, "PLC Checks and OS
 * Updates" call).
 *
 * When Kirstie presses Execute on a deal, Propoly emails the tenant the
 * move-in pack: the deposit leaflet, the certificates, How to Rent. The law
 * wants that pack in the tenant's hands within about 28-30 days of moving in,
 * or the landlord cannot later serve notice to get the home back. Propoly
 * cannot tell us it went (no webhooks, no documents back, until their new API
 * in December), but the agent on the let gets a copy in their own Outlook.
 *
 * So: every connected person's mailbox is asked for mail FROM PROPOLY'S
 * SENDER ADDRESS ONLY (a Graph filter on the sender; nothing else in the
 * mailbox is listed or read), with the Mail.Read consent they already gave.
 * Each email is kept once, however many mailboxes hold a copy, with its
 * attachments copied into file storage, and tied to the Propoly deal it is
 * about: by the tenant's email on the deal first, then by the home's address
 * in the email. The let and the home then say "Move-in pack sent <date>".
 *
 * Read from the day the OS went live (14 Oct 2026). The sender address is one
 * setting (Admin, Propoly), no-reply@propoly.com until somebody changes it; a
 * domain ("@propoly.com") is accepted too and is searched instead of
 * filtered. Only the move-in pack matters for now. Other Propoly emails about
 * a deal are kept as plain Propoly emails; one about no deal at all is not
 * kept unless it looks like a move-in pack, so it can be put on the right
 * file by hand.
 */

const GRAPH = "https://graph.microsoft.com/v1.0";
export const GO_LIVE = "2026-10-14T00:00:00Z";
/**
 * How far back "Read Again" goes for MOVE-IN PACKS (22 Oct 2026): lets that
 * moved in before go-live need their evidence too (5b Newton Road's pack went
 * on 9 Oct). Before go-live only packs are kept, never Propoly's other notices.
 */
export const BACKFILL_FROM = "2026-09-01T00:00:00Z";
const SETTINGS_KEY = "propoly_mail";
/** Each mailbox at most this often; the watcher's timer is every five minutes. */
const EVERY_MS = 15 * 60_000;
const MAX_TEXT = 40_000;
const MAX_ATTACHMENT = 25 * 1024 * 1024;

export interface PropolyMailSettings {
  /** Propoly's sender addresses, or a domain written "@propoly.com". */
  senders: string[];
  /** What marks the move-in pack, a regular expression over the subject and the attachment names. */
  moveInWords: string;
  /**
   * Mailboxes read on every run, never left fifteen minutes, and named first
   * when they stop being connected: the office's backstop (22 Oct 2026), so
   * the log never rests on one agent's Outlook alone.
   */
  alwaysWatch: string[];
  updatedBy?: string;
  updatedAt?: string;
}

/**
 * Seen 22 Oct 2026 (Rhiannon forwarded one, 5b Newton Road, sent 9 Oct): the
 * pack comes from "tle" <no-reply@propoly.com>, subject "Thank you for
 * completing the Tenancy Process.", with the deposit scheme's leaflet, the
 * signed tenancy agreement, gas, EPC and EICR attached, and the home's
 * address and move-in date in the words. It goes to the tenant; the agent
 * gets a copy.
 */
export const DEFAULT_SENDERS = ["no-reply@propoly.com"];
export const DEFAULT_MOVE_IN_WORDS = "completing the tenancy process|move.?in pack|prescribed information|how to rent|deposit.*leaflet|tds .*leaflet";

let ready: Promise<void> | null = null;
function ensureTables(): Promise<void> {
  ready ??= q(`CREATE TABLE IF NOT EXISTS os_propoly_mail (
      id TEXT PRIMARY KEY,
      internet_message_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      from_name TEXT NOT NULL DEFAULT '',
      from_email TEXT NOT NULL DEFAULT '',
      to_list JSONB NOT NULL DEFAULT '[]',
      cc_list JSONB NOT NULL DEFAULT '[]',
      subject TEXT NOT NULL DEFAULT '',
      preview TEXT NOT NULL DEFAULT '',
      body_text TEXT NOT NULL DEFAULT '',
      at TIMESTAMPTZ NOT NULL,
      has_attachments BOOLEAN NOT NULL DEFAULT FALSE,
      attachments JSONB NOT NULL DEFAULT '[]',
      attachments_note TEXT,
      mailboxes JSONB NOT NULL DEFAULT '[]',
      deal_id TEXT,
      address TEXT NOT NULL DEFAULT '',
      matched_on TEXT NOT NULL DEFAULT '',
      matched_by TEXT,
      logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS os_propoly_mail_once ON os_propoly_mail (internet_message_id);
    CREATE INDEX IF NOT EXISTS os_propoly_mail_deal ON os_propoly_mail (deal_id);
    ALTER TABLE os_propoly_mail ADD COLUMN IF NOT EXISTS filed_at TIMESTAMPTZ;
    ALTER TABLE os_propoly_mail ADD COLUMN IF NOT EXISTS filed_count INT NOT NULL DEFAULT 0;
    CREATE TABLE IF NOT EXISTS os_propoly_mail_boxes (
      user_id TEXT PRIMARY KEY,
      mailbox_email TEXT NOT NULL DEFAULT '',
      read_to TIMESTAMPTZ,
      last_run_at TIMESTAMPTZ,
      found INT NOT NULL DEFAULT 0,
      note TEXT
    )`).then(() => undefined).catch((e) => {
    ready = null;
    throw e;
  });
  return ready;
}

/* ── the setting ───────────────────────────────────────────────────────── */

export async function mailSettings(): Promise<PropolyMailSettings> {
  const blank: PropolyMailSettings = { senders: DEFAULT_SENDERS, moveInWords: DEFAULT_MOVE_IN_WORDS, alwaysWatch: [] };
  if (!hasDb()) return blank;
  const [row] = await q<{ value: Partial<PropolyMailSettings> }>(`SELECT value FROM os_settings WHERE key = $1`, [SETTINGS_KEY]).catch(() => []);
  const v = row?.value ?? {};
  return {
    senders: Array.isArray(v.senders) ? v.senders.map((s) => String(s).trim().toLowerCase()).filter(Boolean) : DEFAULT_SENDERS,
    moveInWords: typeof v.moveInWords === "string" && v.moveInWords.trim() ? v.moveInWords : DEFAULT_MOVE_IN_WORDS,
    alwaysWatch: Array.isArray(v.alwaysWatch) ? v.alwaysWatch.map((s) => String(s).trim().toLowerCase()).filter(Boolean) : [],
    updatedBy: v.updatedBy,
    updatedAt: v.updatedAt,
  };
}

export class SettingRefused extends Error {}

export async function saveMailSettings(p: { senders: string[]; moveInWords?: string; alwaysWatch?: string[] }, by: string): Promise<PropolyMailSettings> {
  const senders = [...new Set(p.senders.map((s) => s.trim().toLowerCase()).filter(Boolean))];
  for (const s of senders) {
    if (!/^[^@\s]*@[a-z0-9.-]+\.[a-z]{2,}$/.test(s)) throw new SettingRefused(`"${s}" isn't an email address or a domain like @propoly.com.`);
  }
  const words = (p.moveInWords ?? "").trim() || DEFAULT_MOVE_IN_WORDS;
  try {
    new RegExp(words, "i");
  } catch {
    throw new SettingRefused("The move-in words aren't a pattern the OS can read.");
  }
  const alwaysWatch = [...new Set((p.alwaysWatch ?? []).map((s) => s.trim().toLowerCase()).filter(Boolean))];
  for (const s of alwaysWatch) {
    if (!/^[^@\s]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(s)) throw new SettingRefused(`"${s}" isn't a mailbox address.`);
  }
  const value: PropolyMailSettings = { senders, moveInWords: words, alwaysWatch, updatedBy: by, updatedAt: new Date().toISOString() };
  await q(
    `INSERT INTO os_settings (key, value, updated_at, updated_by) VALUES ($1, $2::jsonb, NOW(), $3)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW(), updated_by = EXCLUDED.updated_by`,
    [SETTINGS_KEY, JSON.stringify(value), by]
  );
  return value;
}

/* ── Graph ─────────────────────────────────────────────────────────────── */

interface GraphAddress { emailAddress?: { name?: string; address?: string } }
interface GraphMessage {
  id: string; internetMessageId?: string; subject?: string; bodyPreview?: string; body?: { content?: string };
  from?: GraphAddress; toRecipients?: GraphAddress[]; ccRecipients?: GraphAddress[];
  receivedDateTime?: string; hasAttachments?: boolean; isDraft?: boolean;
}
interface GraphAttachment { "@odata.type"?: string; id: string; name?: string; contentType?: string; size?: number; isInline?: boolean }

const SELECT = "id,internetMessageId,subject,from,toRecipients,ccRecipients,receivedDateTime,bodyPreview,body,hasAttachments,isDraft";
const clean = (s?: string) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, 240);
const addrs = (list?: GraphAddress[]) => (list ?? []).map((a) => ({ name: a.emailAddress?.name ?? "", email: (a.emailAddress?.address ?? "").toLowerCase() })).filter((a) => a.email);

async function graphGet(token: string, url: string, text = false): Promise<Response> {
  const res = await fetch(url.startsWith("http") ? url : `${GRAPH}${url}`, {
    headers: { Authorization: `Bearer ${token}`, ...(text ? { Prefer: 'outlook.body-content-type="text"' } : {}) },
    cache: "no-store",
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) throw new Error(`Outlook said ${res.status}`);
  return res;
}

/** Messages from one sender (or one domain) received since `since`, oldest first. */
async function fromSender(token: string, sender: string, since: string): Promise<GraphMessage[]> {
  const out: GraphMessage[] = [];
  let url: string;
  if (sender.startsWith("@")) {
    /* A domain cannot be filtered on, only searched; $search takes no date or
       order, so the date is checked here. */
    const p = new URLSearchParams({ $search: `"from:${sender.slice(1)}"`, $top: "50", $select: SELECT });
    url = `/me/messages?${p}`;
  } else {
    const p = new URLSearchParams({
      $filter: `receivedDateTime ge ${since} and from/emailAddress/address eq '${sender.replace(/'/g, "''")}'`,
      $orderby: "receivedDateTime asc",
      $top: "50",
      $select: SELECT,
    });
    url = `/me/messages?${p}`;
  }
  for (let page = 0; url && page < 10; page += 1) {
    const j = (await (await graphGet(token, url, true)).json()) as { value?: GraphMessage[]; "@odata.nextLink"?: string };
    for (const m of j.value ?? []) {
      if (m.isDraft || !m.receivedDateTime || m.receivedDateTime < since) continue;
      if (sender.startsWith("@") && !(m.from?.emailAddress?.address ?? "").toLowerCase().endsWith(sender)) continue;
      out.push(m);
    }
    url = j["@odata.nextLink"] ?? "";
  }
  return out.sort((a, b) => (a.receivedDateTime ?? "").localeCompare(b.receivedDateTime ?? ""));
}

export interface StoredAttachment { name: string; type: string; size: number; key: string | null; note?: string }

/** The real files on an email, by name: inline pictures (logos) left out. */
async function listAttachments(token: string, messageId: string): Promise<GraphAttachment[]> {
  const j = (await (await graphGet(token, `/me/messages/${encodeURIComponent(messageId)}/attachments?$select=id,name,contentType,size,isInline`)).json()) as { value?: GraphAttachment[] };
  return (j.value ?? []).filter((a) => !a.isInline);
}

/** Each file copied into file storage, under the email's own row. */
async function copyAttachments(token: string, messageId: string, rowId: string, list: GraphAttachment[]): Promise<StoredAttachment[]> {
  const files: StoredAttachment[] = [];
  for (const a of list) {
    const name = a.name || "attachment";
    const base = { name, type: a.contentType || "application/octet-stream", size: a.size ?? 0 };
    if (a["@odata.type"] !== "#microsoft.graph.fileAttachment") { files.push({ ...base, key: null, note: "An attached email or link, not a file: open it in Outlook." }); continue; }
    if ((a.size ?? 0) > MAX_ATTACHMENT) { files.push({ ...base, key: null, note: "Over 25MB, so left in Outlook." }); continue; }
    if (!r2Configured) { files.push({ ...base, key: null, note: "File storage isn't set up here." }); continue; }
    try {
      const bytes = new Uint8Array(await (await graphGet(token, `/me/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(a.id)}/$value`)).arrayBuffer());
      const key = `documents/propoly-mail-${rowId}/${safeName(name)}`;
      await withR2((client) => client.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: bytes, ContentType: base.type })));
      files.push({ ...base, size: bytes.byteLength, key });
    } catch (e) {
      files.push({ ...base, key: null, note: `Couldn't be copied (${e instanceof Error ? e.message : "unknown"}): open it in Outlook.` });
    }
  }
  return files;
}

/* ── which deal ────────────────────────────────────────────────────────── */

/**
 * A deal as the reader needs it. The pack goes when Kirstie executes the
 * deal, which is the moment Propoly moves it to "complete" - and completed
 * deals live in their own book (lib/business/propoly-deals, completes-v4),
 * with the address but not the tenants. So both books are read: the live
 * one, then the completed deals it doesn't hold.
 */
export interface DealLite {
  id: string; propertyName: string; locality: string; startDate: string | null;
  statusKey: string; status: string; propertyUuid: string | null; tenants: { email: string | null }[];
  /** The REX listing the deal was matched to, where it was. */
  listingId: string | null;
}

export async function dealBook(): Promise<DealLite[] | null> {
  const [live, done] = await Promise.all([getAllPropolyDeals().catch(() => null), getPropolyCompletes().catch(() => null)]);
  if (!live && !done) return null;
  const out: DealLite[] = (live ?? []).map((d) => ({
    id: d.app.id, propertyName: d.app.propertyName, locality: d.app.locality, startDate: d.app.startDate ?? null,
    statusKey: d.statusKey, status: d.app.status, propertyUuid: d.app.propoly?.propertyUuid ?? null, tenants: d.app.tenants,
    listingId: d.app.listingId != null ? String(d.app.listingId) : null,
  }));
  const have = new Set(out.map((d) => d.id));
  for (const c of done ?? []) {
    if (!c.uuid || have.has(c.uuid) || !c.address) continue;
    out.push({ id: c.uuid, propertyName: c.address, locality: "", startDate: c.date, statusKey: "complete", status: "Complete", propertyUuid: c.propertyUuid, tenants: [], listingId: null });
  }
  return out;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export const dealAddress = (d: Pick<DealLite, "propertyName" | "locality">) => [d.propertyName, d.locality].filter(Boolean).join(", ");

export interface DealMatch { dealId: string; address: string; on: "tenant" | "address" }

const UNIT_WORDS = new Set(["flat", "room", "apartment", "apt", "unit", "studio", "floor", "the", "and"]);
/**
 * The home's line up to and including its street: "Flat 3, Albany Court" and
 * "2f1, 16 Grindlay Street", never "Flat 3" or "2f1" alone. A unit on its own
 * matched any email naming a Flat 3 anywhere (22 Oct 2026 backfill: "Flat 3,
 * NN1" filed on Flat 3, Albany Court, Bath). Null when there is no number or
 * no street word to hold on to.
 */
function streetLine(propertyName: string): string | null {
  const parts = propertyName.split(",").map(norm).filter(Boolean);
  const out: string[] = [];
  for (const part of parts) {
    out.push(part);
    if (part.split(" ").some((w) => /^[a-z]{3,}$/.test(w) && !UNIT_WORDS.has(w))) break;
  }
  const line = out.join(" ");
  return /\d/.test(line) && line.split(" ").some((w) => /^[a-z]{3,}$/.test(w) && !UNIT_WORDS.has(w)) ? line : null;
}

/**
 * The deal an email is about. The tenant's email on the deal is the surest
 * sign (the pack goes to the tenant, the agent is copied). Failing that, the
 * home's first line, and its postcode, in the subject or the words. A
 * cancelled deal is never the answer when another will do; of several, the
 * one moving in nearest the email.
 */
export function matchDeal(deals: DealLite[], m: { to: string[]; text: string; at: string }): DealMatch | null {
  const recipients = new Set(m.to.filter((e) => !isInternalAddress(e)));
  const when = Date.parse(m.at);
  const near = (d: DealLite) => {
    const s = d.startDate ? Date.parse(d.startDate) : NaN;
    return (d.statusKey === "cancelled" ? 1e15 : 0) + (Number.isFinite(s) ? Math.abs(s - when) : 1e14);
  };
  const byTenant = deals.filter((d) => d.tenants.some((t) => t.email && recipients.has(t.email.toLowerCase())));
  if (byTenant.length) {
    const d = byTenant.sort((a, b) => near(a) - near(b))[0];
    return { dealId: d.id, address: dealAddress(d), on: "tenant" };
  }
  /* Links out: Outlook's safelinks carry encoded paths, and "%2F1%2F" read
     as words is "2f1", which is a flat in Edinburgh (22 Oct 2026 backfill). */
  const plain = m.text.replace(/<?https?:\/\/[^\s>]+>?/gi, " ");
  const text = ` ${norm(plain)} `;
  const textPostcode = new Set((plain.match(/\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/gi) ?? []).map((p) => p.replace(/\s+/g, "").toUpperCase()));
  let best: { d: DealLite; score: number } | null = null;
  for (const d of deals) {
    const line1 = streetLine(d.propertyName);
    const whole = norm(d.propertyName);
    if (!line1) continue;
    const pc = postcodeOf(dealAddress(d));
    let score = 0;
    if (text.includes(` ${whole} `)) score += 3;
    else if (text.includes(` ${line1} `)) score += 2;
    if (pc && textPostcode.has(pc.replace(/\s+/g, "").toUpperCase())) score += 2;
    if (score < 2 || (score === 2 && !text.includes(` ${line1} `))) continue;
    if (!best || score > best.score || (score === best.score && near(d) < near(best.d))) best = { d, score };
  }
  if (best) return { dealId: best.d.id, address: dealAddress(best.d), on: "address" };
  /* A postcode alone (an attachment's name, "Tenancy Agreement TQ4 6DG.pdf")
     is enough only when one home in the books has it: a block of flats or a
     house of rooms shares one, and then it decides nothing. */
  const byPostcode = new Map<string, DealLite>();
  for (const d of deals) {
    if (d.statusKey === "cancelled") continue;
    const pc = postcodeOf(dealAddress(d))?.replace(/\s+/g, "").toUpperCase();
    if (pc && textPostcode.has(pc)) byPostcode.set(norm(d.propertyName), d);
  }
  if (byPostcode.size === 1) {
    const d = [...byPostcode.values()][0];
    return { dealId: d.id, address: dealAddress(d), on: "address" };
  }
  return null;
}

/* ── reading the mailboxes ─────────────────────────────────────────────── */

export const newId = () => randomBytes(12).toString("hex");

export interface ScanResult { mailboxes: number; read: number; logged: number; seenAgain: number; problems: number; rematched?: number; filed?: number; skipped?: string }

/**
 * Every connected mailbox, each at most every fifteen minutes unless `force`.
 * `from` re-reads from that date (the backfill); otherwise each mailbox
 * carries on from where it last read, starting at go-live.
 */
export async function scanPropolyMail(opts: { force?: boolean; from?: string; userId?: string; budgetMs?: number; file?: boolean } = {}): Promise<ScanResult> {
  const result: ScanResult = { mailboxes: 0, read: 0, logged: 0, seenAgain: 0, problems: 0 };
  if (!hasDb()) return { ...result, skipped: "No database here." };
  const settings = await mailSettings();
  if (!settings.senders.length) return { ...result, skipped: "No Propoly sender address set yet (Admin, Propoly)." };
  await ensureTables();
  const stopAt = Date.now() + (opts.budgetMs ?? 60_000);
  const moveIn = new RegExp(settings.moveInWords, "i");

  const boxes = await q<{ user_id: string; ms_email: string; read_to: Date | null; last_run_at: Date | null }>(
    `SELECT t.user_id, t.ms_email, b.read_to, b.last_run_at FROM os_ms_tokens t LEFT JOIN os_propoly_mail_boxes b ON b.user_id = t.user_id
      ${opts.userId ? "WHERE t.user_id = $1" : ""} ORDER BY b.last_run_at NULLS FIRST`,
    opts.userId ? [opts.userId] : []
  );
  let deals: DealLite[] | null = null;

  for (const box of boxes) {
    if (Date.now() > stopAt) break;
    const always = settings.alwaysWatch.includes(box.ms_email.toLowerCase());
    if (!opts.force && !always && box.last_run_at && Date.now() - new Date(box.last_run_at).getTime() < EVERY_MS) continue;
    result.mailboxes += 1;
    /* An hour's overlap: a message stamped just before the last read can land after it. */
    const since = opts.from ?? (box.read_to ? new Date(new Date(box.read_to).getTime() - 3600_000).toISOString() : GO_LIVE);
    let readTo = box.read_to ? new Date(box.read_to).toISOString() : GO_LIVE;
    let found = 0;
    try {
      const token = await msAccessTokenFor(box.user_id);
      for (const sender of settings.senders) {
        for (const m of await fromSender(token, sender, since)) {
          result.read += 1;
          const imid = m.internetMessageId || `${box.user_id}:${m.id}`;
          if ((m.receivedDateTime ?? "") > readTo) readTo = m.receivedDateTime!;
          const again = await q<{ id: string }>(
            `UPDATE os_propoly_mail SET mailboxes = CASE WHEN mailboxes ? $2 THEN mailboxes ELSE mailboxes || to_jsonb($2::text) END
              WHERE internet_message_id = $1 RETURNING id`,
            [imid, box.ms_email]
          );
          if (again.length) { result.seenAgain += 1; continue; }

          /* Before go-live only the move-in pack is wanted, and its subject
             says so: anything else is passed over before its files are asked for. */
          const beforeLive = (m.receivedDateTime ?? "") < GO_LIVE;
          if (beforeLive && !moveIn.test(m.subject ?? "")) continue;
          const to = addrs(m.toRecipients), cc = addrs(m.ccRecipients);
          const body = (m.body?.content ?? m.bodyPreview ?? "").slice(0, MAX_TEXT);
          deals ??= (await dealBook()) ?? [];
          let listed: GraphAttachment[] = [];
          let note: string | null = null;
          if (m.hasAttachments) {
            try {
              listed = await listAttachments(token, m.id);
            } catch (e) {
              note = `The attachments couldn't be read: ${e instanceof Error ? e.message : "unknown"}. They are still in Outlook.`;
            }
          }
          const isMoveIn = moveIn.test(`${m.subject ?? ""} ${listed.map((a) => a.name ?? "").join(" ")}`);
          /* The file names count as words: "Tenancy Agreement TQ4 6DG.pdf" carries the postcode. */
          const match = matchDeal(deals, { to: [...to, ...cc].map((a) => a.email), text: `${m.subject ?? ""}\n${body}\n${listed.map((a) => a.name ?? "").join("\n")}`, at: m.receivedDateTime! });
          /* Propoly mail about no deal at all (an account email, a newsletter)
             is not kept, unless it looks like a pack and needs a file by hand. */
          if (!match && !isMoveIn) continue;
          /* The same email sent separately to each person (the tenant, the
             agent, Kirstie) carries a different message id each time: one
             subject on one deal within fifteen minutes is one email. */
          if (match) {
            const twin = await q<{ id: string }>(
              `UPDATE os_propoly_mail SET mailboxes = CASE WHEN mailboxes ? $4 THEN mailboxes ELSE mailboxes || to_jsonb($4::text) END
                WHERE deal_id = $1 AND subject = $2 AND abs(extract(epoch FROM (at - $3::timestamptz))) < 900 RETURNING id`,
              [match.dealId, (m.subject ?? "").slice(0, 300), m.receivedDateTime, box.ms_email]
            );
            if (twin.length) { result.seenAgain += 1; continue; }
          }
          const id = newId();
          const files = listed.length ? await copyAttachments(token, m.id, id, listed) : [];
          const rows = await q<{ id: string }>(
            `INSERT INTO os_propoly_mail (id, internet_message_id, kind, from_name, from_email, to_list, cc_list, subject, preview, body_text, at, has_attachments, attachments, attachments_note, mailboxes, deal_id, address, matched_on)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
             ON CONFLICT (internet_message_id) DO NOTHING RETURNING id`,
            [id, imid, isMoveIn ? "move-in" : "other", m.from?.emailAddress?.name ?? "", (m.from?.emailAddress?.address ?? "").toLowerCase(),
              JSON.stringify(to), JSON.stringify(cc), (m.subject ?? "").slice(0, 300), clean(m.bodyPreview), body, m.receivedDateTime,
              Boolean(m.hasAttachments), JSON.stringify(files), note, JSON.stringify([box.ms_email]), match?.dealId ?? null, match?.address ?? "", match?.on ?? ""]
          );
          result.logged += rows.length;
          found += rows.length;
        }
      }
      await q(
        `INSERT INTO os_propoly_mail_boxes (user_id, mailbox_email, read_to, last_run_at, found, note) VALUES ($1,$2,$3,NOW(),$4,NULL)
         ON CONFLICT (user_id) DO UPDATE SET mailbox_email = EXCLUDED.mailbox_email, read_to = GREATEST(os_propoly_mail_boxes.read_to, EXCLUDED.read_to),
           last_run_at = NOW(), found = os_propoly_mail_boxes.found + EXCLUDED.found, note = NULL`,
        [box.user_id, box.ms_email, readTo, found]
      );
    } catch (e) {
      result.problems += 1;
      const note = e instanceof MailboxNotConnected ? "Outlook isn't connected any more." : `The last read failed: ${e instanceof Error ? e.message : "unknown"}.`;
      await q(
        `INSERT INTO os_propoly_mail_boxes (user_id, mailbox_email, last_run_at, note) VALUES ($1,$2,NOW(),$3)
         ON CONFLICT (user_id) DO UPDATE SET last_run_at = NOW(), note = EXCLUDED.note`,
        [box.user_id, box.ms_email, note]
      ).catch(() => undefined);
    }
  }
  /* What couldn't be placed is tried again every run: a deal Kirstie has just
     executed has left the live book and isn't in the completed one until its
     hourly read (12b Cliff Road, 22 Oct 2026, unplaced for that reason). */
  result.rematched = await rematchUnfiled(deals).catch(() => 0);
  if (opts.file !== false) result.filed = await fileMoveInPacks().catch(() => 0);
  await noteGaps().catch(() => undefined);
  return result;
}

/** Emails on no deal, matched again against today's books. Hand-placed ones are never touched. */
export async function rematchUnfiled(held?: DealLite[] | null): Promise<number> {
  if (!hasDb()) return 0;
  await ensureTables();
  const rows = await q<Row>(`SELECT * FROM os_propoly_mail WHERE deal_id IS NULL AND matched_on <> 'hand' ORDER BY at DESC LIMIT 200`);
  if (!rows.length) return 0;
  const deals = held ?? (await dealBook()) ?? [];
  let placed = 0;
  for (const r of rows) {
    const m = matchDeal(deals, { to: [...(r.to_list ?? []), ...(r.cc_list ?? [])].map((a) => a.email), text: `${r.subject}\n${r.body_text}\n${(r.attachments ?? []).map((f) => f.name).join("\n")}`, at: new Date(r.at).toISOString() });
    if (!m) continue;
    placed += (await q(`UPDATE os_propoly_mail SET deal_id = $2, address = $3, matched_on = $4 WHERE id = $1 AND deal_id IS NULL RETURNING id`, [r.id, m.dealId, m.address, m.on])).length;
  }
  return placed;
}

/* ── whose Propoly copies can't be caught ──────────────────────────────── */

export interface MailboxGap { name: string; email: string; role: string; why: string; alwaysWatch: boolean }

const GAPS_KEY = "propoly_mail_gaps";
/** The roles that get Propoly's copies: the agents on lets, Kirstie, the compliance desk. Owners only when they manage a deal. */
const WATCHED_ROLES = new Set(["agent", "pretenancy", "compliance"]);

/**
 * Everybody whose Propoly copies the OS can't read: staff in a role that
 * gets them, or anybody Propoly names as a deal's manager, with no Outlook
 * connected; and any always-watch mailbox not connected. Locked accounts
 * are left out.
 */
export async function connectionGaps(): Promise<MailboxGap[]> {
  if (!hasDb()) return [];
  const [users, settings, live] = await Promise.all([
    q<{ name: string; email: string; role: string; ms_email: string | null }>(
      `SELECT u.name, u.email, u.role, t.ms_email FROM os_users u LEFT JOIN os_ms_tokens t ON t.user_id = u.id
        WHERE u.locked_at IS NULL AND u.id NOT LIKE 'u-test%'`
    ),
    mailSettings(),
    getAllPropolyDeals().catch(() => null),
  ]);
  const managers = new Set((live ?? []).map((d) => (d.managerEmail ?? "").toLowerCase()).filter(Boolean));
  const connected = new Set(users.map((u) => (u.ms_email ?? "").toLowerCase()).filter(Boolean));
  const gaps: MailboxGap[] = [];
  for (const box of settings.alwaysWatch) {
    if (connected.has(box)) continue;
    const u = users.find((x) => x.email.toLowerCase() === box);
    gaps.push({ name: u?.name || box, email: box, role: u?.role ?? "mailbox", why: "On the always-watch list, but its Outlook isn't connected to the OS.", alwaysWatch: true });
  }
  for (const u of users) {
    if (u.ms_email || settings.alwaysWatch.includes(u.email.toLowerCase())) continue;
    const manages = managers.has(u.email.toLowerCase());
    if (!WATCHED_ROLES.has(u.role) && !manages) continue;
    gaps.push({ name: u.name || u.email, email: u.email, role: u.role, why: manages ? "Manages a live Propoly deal, and their Outlook isn't connected." : "Their Outlook isn't connected, so Propoly's copies to them aren't read.", alwaysWatch: false });
  }
  return gaps.sort((a, b) => Number(b.alwaysWatch) - Number(a.alwaysWatch) || a.name.localeCompare(b.name));
}

/**
 * The gaps as the owners' bell reads them: one line, kept with the day it
 * was first seen. A changed set of names is a new line; the same set is the
 * same line, so it is told once and stays done once ticked.
 */
async function noteGaps(): Promise<void> {
  const gaps = await connectionGaps();
  const names = gaps.map((g) => g.name);
  const [row] = await q<{ value: { names?: string[]; since?: string } }>(`SELECT value FROM os_settings WHERE key = $1`, [GAPS_KEY]);
  const had = row?.value?.names ?? [];
  if (had.join("|") === names.join("|")) return;
  await q(
    `INSERT INTO os_settings (key, value, updated_at, updated_by) VALUES ($1, $2::jsonb, NOW(), 'propoly-mail')
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW(), updated_by = EXCLUDED.updated_by`,
    [GAPS_KEY, JSON.stringify({ names, since: new Date().toISOString() })]
  );
}

/** For the bell (owners): the names, and since when. Null when nobody is missing. */
export async function gapsForBell(): Promise<{ names: string[]; since: string } | null> {
  if (!hasDb()) return null;
  const [row] = await q<{ value: { names?: string[]; since?: string } }>(`SELECT value FROM os_settings WHERE key = $1`, [GAPS_KEY]).catch(() => []);
  const names = row?.value?.names ?? [];
  return names.length && row?.value?.since ? { names, since: row.value.since } : null;
}

/* ── finding the sender (owner only, read live, nothing kept) ──────────── */

export interface SenderSeen { address: string; name: string; count: number; mailboxes: number; subjects: string[] }

/**
 * Who Propoly's mail comes from, across every connected mailbox since
 * go-live: a search for "propoly", grouped by sender, with a few subjects.
 * For setting the address; no words or files are read or kept.
 */
export async function discoverSenders(opts: { budgetMs?: number } = {}): Promise<{ senders: SenderSeen[]; mailboxes: number; problems: number }> {
  if (!hasDb()) return { senders: [], mailboxes: 0, problems: 0 };
  const stopAt = Date.now() + (opts.budgetMs ?? 90_000);
  const boxes = await q<{ user_id: string; ms_email: string }>(`SELECT user_id, ms_email FROM os_ms_tokens ORDER BY ms_email`);
  const seen = new Map<string, { name: string; count: number; boxes: Set<string>; subjects: Map<string, number> }>();
  let read = 0, problems = 0;
  for (const b of boxes) {
    if (Date.now() > stopAt) break;
    try {
      const token = await msAccessTokenFor(b.user_id);
      const p = new URLSearchParams({ $search: '"propoly"', $top: "100", $select: "from,subject,receivedDateTime" });
      const j = (await (await graphGet(token, `/me/messages?${p}`)).json()) as { value?: GraphMessage[] };
      read += 1;
      for (const m of j.value ?? []) {
        if ((m.receivedDateTime ?? "") < GO_LIVE) continue;
        const address = (m.from?.emailAddress?.address ?? "").toLowerCase();
        if (!address || isInternalAddress(address)) continue;
        const s = seen.get(address) ?? { name: m.from?.emailAddress?.name ?? "", count: 0, boxes: new Set<string>(), subjects: new Map<string, number>() };
        s.count += 1;
        s.boxes.add(b.user_id);
        /* Numbers and names vary per deal; the shape of the subject is what tells one email from another. */
        const shapeOf = (m.subject ?? "").replace(/\d+/g, "#").slice(0, 80);
        s.subjects.set(shapeOf, (s.subjects.get(shapeOf) ?? 0) + 1);
        seen.set(address, s);
      }
    } catch {
      problems += 1;
    }
  }
  return {
    mailboxes: read,
    problems,
    senders: [...seen].map(([address, s]) => ({
      address, name: s.name, count: s.count, mailboxes: s.boxes.size,
      subjects: [...s.subjects].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([t, n]) => `${t}${n > 1 ? ` (${n})` : ""}`),
    })).sort((a, b) => b.count - a.count),
  };
}

/* ── what the screens show ─────────────────────────────────────────────── */

export interface PropolyMail {
  id: string; kind: "move-in" | "other"; fromName: string; fromEmail: string;
  to: { name: string; email: string }[]; cc: { name: string; email: string }[];
  subject: string; preview: string; text: string; at: string;
  attachments: StoredAttachment[]; attachmentsNote: string | null;
  mailboxes: string[]; dealId: string | null; address: string; matchedOn: string; matchedBy: string | null;
  /** On a move-in pack: the expected files it came without (lib/propoly-pack). */
  missing?: string[];
}

type Row = {
  id: string; kind: string; from_name: string; from_email: string; to_list: PropolyMail["to"]; cc_list: PropolyMail["cc"];
  subject: string; preview: string; body_text: string; at: Date; attachments: StoredAttachment[]; attachments_note: string | null;
  mailboxes: string[]; deal_id: string | null; address: string; matched_on: string; matched_by: string | null;
};

const shape = (r: Row): PropolyMail => ({
  id: r.id, kind: r.kind === "move-in" ? "move-in" : "other", fromName: r.from_name, fromEmail: r.from_email, to: r.to_list ?? [], cc: r.cc_list ?? [],
  subject: r.subject, preview: r.preview, text: r.body_text, at: new Date(r.at).toISOString(), attachments: r.attachments ?? [],
  attachmentsNote: r.attachments_note, mailboxes: r.mailboxes ?? [], dealId: r.deal_id, address: r.address, matchedOn: r.matched_on, matchedBy: r.matched_by,
});

/**
 * Each move-in pack checked against what it should carry. An HMO's pack
 * should also hold the PAT and legionella; a Scottish let has no deposit
 * leaflet from Propoly; a home recorded as having no gas needs no gas
 * certificate. HMO and no-gas are the home's own record (os_properties).
 */
async function withMissing(mail: PropolyMail[]): Promise<PropolyMail[]> {
  const packs = mail.filter((m) => m.kind === "move-in");
  if (!packs.length) return mail;
  const homes = await q<{ address: string; hmo: boolean; no_gas: boolean }>(`SELECT address, hmo, no_gas FROM os_properties WHERE active AND (hmo OR no_gas)`).catch(() => []);
  for (const m of packs) {
    /* A room is in a house of rooms, which is an HMO whatever the home's record says. */
    const mine = m.address ? homes.filter((h) => sameHome(h.address, m.address)) : [];
    const hmo = /^\s*room\b/i.test(m.address) || mine.some((h) => h.hmo);
    const noGas = mine.some((h) => h.no_gas);
    const scotland = Boolean(m.address) && isScottishHome({ name: m.address, locality: "" });
    m.missing = missingFiles(m.attachments.map((f) => f.name), { hmo, scotland, noGas });
  }
  return mail;
}

/**
 * Propoly's emails about one let or one home: on its deal, or (a deal the
 * book no longer holds, or a home with several) on the same home by address.
 * Newest first.
 */
export async function mailFor(p: { dealIds?: string[]; addresses?: string[] }): Promise<PropolyMail[]> {
  if (!hasDb()) return [];
  await ensureTables();
  const dealIds = (p.dealIds ?? []).filter(Boolean);
  const addresses = (p.addresses ?? []).filter((a) => a.trim());
  if (!dealIds.length && !addresses.length) return [];
  const rows = await q<Row>(
    `SELECT * FROM os_propoly_mail WHERE deal_id = ANY($1) OR (address <> '' AND $2::int > 0) ORDER BY at DESC LIMIT 400`,
    [dealIds, addresses.length]
  );
  return withMissing(rows.filter((r) => (r.deal_id && dealIds.includes(r.deal_id)) || addresses.some((a) => r.address && sameHome(r.address, a))).slice(0, 40).map(shape));
}

/** For the owner's page: the latest kept, and whatever is on no file yet. */
export interface MailboxRead { email: string; readTo: string | null; lastRunAt: string | null; found: number; note: string | null; kept: number }

export async function recentMail(limit = 60): Promise<{ recent: PropolyMail[]; unfiled: PropolyMail[]; boxes: MailboxRead[]; gaps: MailboxGap[]; total: number; onlyOneBox: number }> {
  if (!hasDb()) return { recent: [], unfiled: [], boxes: [], gaps: [], total: 0, onlyOneBox: 0 };
  await ensureTables();
  const [recent, unfiled, boxes, gaps, spread] = await Promise.all([
    q<Row>(`SELECT * FROM os_propoly_mail ORDER BY at DESC LIMIT $1`, [limit]),
    q<Row>(`SELECT * FROM os_propoly_mail WHERE deal_id IS NULL ORDER BY at DESC LIMIT 100`),
    q<{ mailbox_email: string; read_to: Date | null; last_run_at: Date | null; found: number; note: string | null }>(
      `SELECT t.ms_email AS mailbox_email, b.read_to, b.last_run_at, coalesce(b.found, 0) AS found, b.note
         FROM os_ms_tokens t LEFT JOIN os_propoly_mail_boxes b ON b.user_id = t.user_id ORDER BY t.ms_email`
    ),
    connectionGaps().catch(() => []),
    /* How many mailboxes each email was found in, and which boxes hold what. */
    q<{ total: string; one: string; boxes: Record<string, number> | null }>(
      `SELECT count(*)::text AS total, count(*) FILTER (WHERE jsonb_array_length(mailboxes) <= 1)::text AS one,
              (SELECT jsonb_object_agg(b, n) FROM (SELECT jsonb_array_elements_text(mailboxes) AS b, count(*) AS n FROM os_propoly_mail GROUP BY 1) x) AS boxes
         FROM os_propoly_mail`
    ),
  ]);
  const kept = spread[0]?.boxes ?? {};
  return {
    recent: await withMissing(recent.map(shape)),
    unfiled: await withMissing(unfiled.map(shape)),
    boxes: boxes
      .map((b) => ({ email: b.mailbox_email, readTo: b.read_to ? new Date(b.read_to).toISOString() : null, lastRunAt: b.last_run_at ? new Date(b.last_run_at).toISOString() : null, found: Number(b.found), note: b.note, kept: Number(kept[b.mailbox_email] ?? 0) }))
      .sort((a, b) => b.kept - a.kept || a.email.localeCompare(b.email)),
    gaps,
    total: Number(spread[0]?.total ?? 0),
    onlyOneBox: Number(spread[0]?.one ?? 0),
  };
}

/** The owner or the office puts an email on a deal by hand (one the reader couldn't place). */
export async function fileMail(id: string, dealId: string, by: string): Promise<PropolyMail> {
  await ensureTables();
  const deals = (await dealBook()) ?? [];
  const d = deals.find((x) => x.id === dealId);
  if (!d) throw new SettingRefused("That deal isn't in the Propoly book the OS holds.");
  const [r] = await q<Row>(
    `UPDATE os_propoly_mail SET deal_id = $2, address = $3, matched_on = 'hand', matched_by = $4 WHERE id = $1 RETURNING *`,
    [id, dealId, dealAddress(d), by]
  );
  if (!r) throw new SettingRefused("That email isn't here any more.");
  await fileMoveInPacks().catch(() => 0);
  return shape(r);
}

/* ── the pack's files, on the home's file ──────────────────────────────── */

const DOC_TYPE_FOR: Partial<Record<string, string>> = { gas: "gas_safety", epc: "epc", eicr: "eicr" };

/**
 * Each move-in pack's files, filed on its home's Documents (lib/file-
 * documents), so they show on the home, the let and the deal with everything
 * else, not only in this log (James, 22 Oct 2026: "bring across the
 * attachments ... and then attach that to the log and file"). Gas, EPC and
 * EICR go in as their own types, the rest as Other, each named for the pack
 * and its date. Once per email; only the office can take one off. The
 * certificates are not dated into the compliance book: that stays with the
 * compliance desk.
 */
export async function fileMoveInPacks(): Promise<number> {
  if (!hasDb()) return 0;
  await ensureTables();
  const rows = await q<Row & { filed_at: Date | null }>(
    `SELECT * FROM os_propoly_mail WHERE kind = 'move-in' AND deal_id IS NOT NULL AND address <> '' AND filed_at IS NULL ORDER BY at LIMIT 50`
  );
  let filed = 0;
  for (const r of rows) {
    /* Claimed first, so two runs can't file the same pack twice. */
    const claimed = await q(`UPDATE os_propoly_mail SET filed_at = NOW() WHERE id = $1 AND filed_at IS NULL RETURNING id`, [r.id]);
    if (!claimed.length) continue;
    const sent = new Date(r.at).toLocaleDateString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", year: "numeric" });
    let n = 0;
    for (const f of r.attachments ?? []) {
      if (!f.key) continue;
      const kind = PACK_FILES.find((x) => x.re.test(f.name))?.key ?? null;
      const type = (kind && DOC_TYPE_FOR[kind]) || "other";
      const label = kind ? PACK_FILES.find((x) => x.key === kind)!.label : f.name.replace(/\.+(pdf|docx?|jpe?g|png)$/i, "");
      await addFileDoc({
        home: { address: r.address },
        from: { kind: "propoly", id: r.id },
        type,
        name: `${type === "other" ? `Move-in pack: ${label}` : label} (sent to the tenant ${sent})`,
        fileName: f.name,
        r2Key: f.key,
        mime: f.type,
        sizeBytes: f.size,
        by: { id: "", name: "Propoly move-in pack" },
        isTest: false,
      });
      n += 1;
    }
    await q(`UPDATE os_propoly_mail SET filed_count = $2 WHERE id = $1`, [r.id, n]);
    filed += n;
  }
  return filed;
}
