import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { hasDb, q } from "@/lib/db";
import { uid } from "@/lib/auth";
import { R2_BUCKET, r2Configured, safeName, withR2 } from "@/lib/r2";
import { CERT_KEY } from "@/lib/certificate-intake";
import { isOurs, type CompProperty } from "@/lib/compliance";
import { londonParts } from "@/lib/london-time";

/**
 * IS THE ENGINEER ON THE REGISTER? (Michael, 24 Sep 2026)
 *
 * "When a gas safety comes in ... they should have a gas safety code on their
 * certificate. So you just put that in there and check it and just tick it
 * off." He has the Gas Safe Register, NICEIC and NAPIT bookmarked, because a
 * certificate from an engineer who is not registered is not a legal
 * certificate - and it is exactly what sinks a Section 8.
 *
 * James's answer on the same call: read the number off the certificate, put
 * the register one press away, and let Michael confirm it matches. Log every
 * check, so after a few months we know whether the read is right often enough
 * to trust further.
 *
 * So, for every gas safety record and EICR on his To verify list:
 *   1. READ: which scheme the engineer is registered with, the number, the
 *      engineer and the business, straight off the document (a small model,
 *      one call, kept - never read twice).
 *   2. OPEN: the register, with the number on his clipboard. The registers
 *      refuse a server's requests (Gas Safe answers 403), and he holds his own
 *      accounts, so the look-up is his, in his own browser - never automated.
 *   3. CONFIRM: his tick records the number he checked and whether it was the
 *      one we read. That is the accuracy log.
 *
 * And so nothing reaches the book without passing him (James, 2 Oct 2026:
 * "make sure that we're going to be getting all of the information to him"):
 * a gas or electrical certificate that turns up on REX for one of our homes -
 * which is where renewals land until go-live - is copied in and put on his
 * list too. See feedRexRenewals.
 */

const MODEL = process.env.CERT_READER_MODEL ?? "claude-haiku-4-5-20251001";

export type Scheme = "gas_safe" | "niceic" | "napit" | "elecsa" | "stroma" | "other" | "none";

/** Where each register checks a number. ELECSA and Stroma (and anything else
 *  government-approved) are searched on the Electrical Competent Person
 *  register, which covers every scheme. */
export const REGISTERS: Record<Exclude<Scheme, "none">, { name: string; url: string }> = {
  /* One page, its Check tab takes both numbers off a gas certificate: the
     business registration number (1-6 digits) and the engineer's own 7-digit
     licence number from their Gas Safe ID card (checked 9 Oct 2026). */
  gas_safe: { name: "Gas Safe Register", url: "https://www.gassaferegister.co.uk/find-an-engineer-or-check-the-register/" },
  niceic: { name: "NICEIC", url: "https://www.niceic.com/find-a-contractor" },
  napit: { name: "NAPIT", url: "https://search.napit.org.uk/" },
  elecsa: { name: "Electrical Competent Person register", url: "https://www.electricalcompetentperson.co.uk/" },
  stroma: { name: "Electrical Competent Person register", url: "https://www.electricalcompetentperson.co.uk/" },
  other: { name: "Electrical Competent Person register", url: "https://www.electricalcompetentperson.co.uk/" },
};

export interface RegisterRead {
  scheme: Scheme;
  number: string;
  /** For gas: the engineer's own licence number off their ID card, when printed. */
  licence: string;
  engineer: string;
  business: string;
  state: "read" | "failed";
  note: string;
  /** What Michael confirmed, once he has. */
  confirmed: { number: string; by: string; at: string; matched: boolean } | null;
}

/** Which documents are worth reading for an engineer: gas and electrical only. */
export function readable(kind: "certificate" | "landlord_document", type: string): boolean {
  return kind === "certificate" ? type === "gas_safety" || type === "eicr" : type === "gas" || type === "eicr";
}

let ready: Promise<void> | null = null;
function ensure(): Promise<void> {
  ready ??= q(`
    CREATE TABLE IF NOT EXISTS os_cert_register (
      subject_kind  TEXT NOT NULL,
      subject_id    TEXT NOT NULL,
      scheme        TEXT NOT NULL DEFAULT 'none',
      number        TEXT NOT NULL DEFAULT '',
      licence       TEXT NOT NULL DEFAULT '',
      engineer      TEXT NOT NULL DEFAULT '',
      business      TEXT NOT NULL DEFAULT '',
      state         TEXT NOT NULL DEFAULT 'read',
      note          TEXT NOT NULL DEFAULT '',
      read_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      confirmed_number TEXT,
      confirmed_by  TEXT,
      confirmed_at  TIMESTAMPTZ,
      matched       BOOLEAN,
      PRIMARY KEY (subject_kind, subject_id)
    );
    CREATE TABLE IF NOT EXISTS os_rex_cert_seen (
      property_id   TEXT NOT NULL,
      type_key      TEXT NOT NULL,
      expiry        DATE NOT NULL,
      seen_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (property_id, type_key)
    );
  `).then(() => undefined).catch((e) => {
    ready = null;
    throw e;
  });
  return ready;
}

type Row = { subject_kind: string; subject_id: string; scheme: Scheme; number: string; licence: string; engineer: string; business: string; state: string; note: string; confirmed_number: string | null; confirmed_by: string | null; confirmed_at: Date | null; matched: boolean | null };
const toRead = (r: Row): RegisterRead => ({
  scheme: r.scheme,
  number: r.number,
  licence: r.licence,
  engineer: r.engineer,
  business: r.business,
  state: r.state === "failed" ? "failed" : "read",
  note: r.note,
  confirmed: r.confirmed_number != null && r.confirmed_at ? { number: r.confirmed_number, by: r.confirmed_by ?? "", at: new Date(r.confirmed_at).toISOString(), matched: Boolean(r.matched) } : null,
});

/** What has been read already, for a list of items. */
export async function readsFor(items: { kind: string; id: string }[]): Promise<Map<string, RegisterRead>> {
  const out = new Map<string, RegisterRead>();
  if (!hasDb() || !items.length) return out;
  await ensure();
  const rows = await q<Row>(
    `SELECT * FROM os_cert_register WHERE (subject_kind || ':' || subject_id) = ANY($1::text[])`,
    [items.map((i) => `${i.kind}:${i.id}`)]
  );
  for (const r of rows) out.set(`${r.subject_kind}:${r.subject_id}`, toRead(r));
  return out;
}

const SYSTEM = `You are reading one UK gas safety record (CP12) or electrical certificate (EICR or EIC)
for a lettings agency's compliance officer, who will check the engineer on the official
register. Report only what is printed. Never guess or complete a number.

- Gas: the Gas Safe registration number of the business (usually 6 digits, sometimes 7,
  near "Gas Safe Reg No" or the Gas Safe logo), and the engineer's own licence or ID card
  number if printed separately (usually 7 digits). Scheme is gas_safe.
- Electrical: which scheme the contractor is registered with - NICEIC, NAPIT, ELECSA,
  Stroma or another - and their registration, enrolment or membership number for it.
- The engineer's or inspector's name, and the business name, as printed.
Never report a phone number (UK phone numbers start 01, 02, 03 or 07 and run to 11
digits) as a registration number.
If no registration number is printed anywhere, say scheme none and leave number empty.`;

const TOOL: Anthropic.Tool = {
  name: "report_engineer",
  description: "Who did the work and the register number they are under.",
  input_schema: {
    type: "object",
    properties: {
      scheme: { type: "string", enum: ["gas_safe", "niceic", "napit", "elecsa", "stroma", "other", "none"] },
      number: { type: "string", description: "The registration number exactly as printed, digits and letters only, or empty" },
      licence: { type: "string", description: "Gas only: the engineer's own licence/ID number if printed separately, or empty" },
      engineer: { type: "string" },
      business: { type: "string" },
      note: { type: "string", description: "One short sentence only if something needs saying (e.g. number partly illegible)" },
    },
    required: ["scheme"],
  },
};

async function bytesOf(key: string): Promise<{ bytes: Buffer; type: string } | null> {
  if (!r2Configured || !key) return null;
  const obj = await withR2((c) => c.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key })));
  const arr = await obj.Body?.transformToByteArray();
  return arr ? { bytes: Buffer.from(arr), type: obj.ContentType ?? "" } : null;
}

/** Read one document and keep what it says. Never read twice unless asked. */
export async function readOne(kind: "certificate" | "landlord_document", id: string, opts: { again?: boolean } = {}): Promise<RegisterRead> {
  await ensure();
  if (!opts.again) {
    const held = await readsFor([{ kind, id }]);
    const r = held.get(`${kind}:${id}`);
    if (r) return r;
  }
  const table = kind === "certificate" ? "os_certificates" : "os_landlord_documents";
  const rows = await q<{ r2_key: string; name: string }>(`SELECT r2_key, name FROM ${table} WHERE id = $1`, [id]);
  const save = async (r: Omit<RegisterRead, "confirmed">) => {
    await q(
      `INSERT INTO os_cert_register (subject_kind, subject_id, scheme, number, licence, engineer, business, state, note, read_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
       ON CONFLICT (subject_kind, subject_id) DO UPDATE SET scheme = EXCLUDED.scheme, number = EXCLUDED.number, licence = EXCLUDED.licence,
         engineer = EXCLUDED.engineer, business = EXCLUDED.business, state = EXCLUDED.state, note = EXCLUDED.note, read_at = NOW()`,
      [kind, id, r.scheme, r.number, r.licence, r.engineer, r.business, r.state, r.note]
    );
    return { ...r, confirmed: null };
  };
  const failed = (note: string) => save({ scheme: "none", number: "", licence: "", engineer: "", business: "", state: "failed", note });

  if (!rows[0]) return failed("That document is not on the record any more.");
  if (!process.env.ANTHROPIC_API_KEY) return failed("The reader is not set up on this environment.");
  const file = await bytesOf(rows[0].r2_key).catch(() => null);
  if (!file) return failed("Could not open the file to read it.");
  const name = rows[0].name.toLowerCase();
  const isPdf = file.type.includes("pdf") || name.endsWith(".pdf") || file.bytes.subarray(0, 4).toString() === "%PDF";
  const media = isPdf ? null : /png/.test(file.type) || name.endsWith(".png") ? "image/png" : /webp/.test(file.type) || name.endsWith(".webp") ? "image/webp" : /jpe?g/.test(file.type) || /\.jpe?g$/.test(name) ? "image/jpeg" : null;
  if (!isPdf && !media) return failed("Only PDFs and photos can be read.");
  if (file.bytes.length > 12 * 1024 * 1024) return failed("Too large to read - probably a whole pack, not one certificate.");

  try {
    const res = await new Anthropic().messages.create({
      model: MODEL,
      max_tokens: 300,
      system: SYSTEM,
      tools: [TOOL],
      tool_choice: { type: "tool", name: "report_engineer" },
      messages: [
        {
          role: "user",
          content: [
            isPdf
              ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: file.bytes.toString("base64") } }
              : { type: "image", source: { type: "base64", media_type: media as "image/png" | "image/jpeg" | "image/webp", data: file.bytes.toString("base64") } },
            { type: "text", text: "Read the engineer's registration from this certificate." },
          ],
        },
      ],
    });
    const call = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    const x = (call?.input ?? {}) as Record<string, unknown>;
    const clean = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "");
    const schemes: Scheme[] = ["gas_safe", "niceic", "napit", "elecsa", "stroma", "other", "none"];
    let number = clean(x.number, 30).replace(/[^A-Za-z0-9/-]/g, "");
    let licence = clean(x.licence, 30).replace(/[^A-Za-z0-9/-]/g, "");
    let note = clean(x.note, 200);
    const scheme = schemes.includes(x.scheme as Scheme) ? (x.scheme as Scheme) : "none";
    /* Gas Safe numbers are 6 or 7 digits, an engineer's licence 7. Anything
       else is a misread - on the first real run (2 Oct 2026) one came back as
       the engineer's mobile - so it is dropped and he reads it himself. */
    if (scheme === "gas_safe" && number && !/^\d{6,7}$/.test(number)) {
      note = `Read "${number}", which isn't a Gas Safe number - check the certificate by eye.`;
      number = "";
    }
    if (licence && !/^\d{7}$/.test(licence)) licence = "";
    if (/^0\d{10}$/.test(number)) {
      note = "Read a phone number, not a registration number - check the certificate by eye.";
      number = "";
    }
    return save({
      /* A number we threw out still tells him which register: keep the scheme. */
      scheme: number || (scheme === "gas_safe" && note) ? scheme : "none",
      number,
      licence,
      engineer: clean(x.engineer, 80),
      business: clean(x.business, 120),
      state: "read",
      note,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "read failed";
    return failed(/credit balance/i.test(msg) ? "The reader's Anthropic account has run out of credit." : "Could not read it this time.");
  }
}

/** His tick: the number he checked, and whether it was the one we read. */
export async function confirmRegister(kind: string, id: string, number: string, by: string): Promise<void> {
  if (!hasDb()) return;
  await ensure();
  const n = number.replace(/[^A-Za-z0-9/-]/g, "").slice(0, 30);
  await q(
    `INSERT INTO os_cert_register (subject_kind, subject_id, number, state, confirmed_number, confirmed_by, confirmed_at, matched)
     VALUES ($1, $2, $3, 'read', $3, $4, NOW(), FALSE)
     ON CONFLICT (subject_kind, subject_id) DO UPDATE SET confirmed_number = $3, confirmed_by = $4, confirmed_at = NOW(),
       matched = (os_cert_register.number <> '' AND UPPER(os_cert_register.number) = UPPER($3))`,
    [kind, id, n, by]
  );
}

/** How often the read number was the one Michael confirmed. */
export async function readAccuracy(): Promise<{ checked: number; matched: number }> {
  if (!hasDb()) return { checked: 0, matched: 0 };
  await ensure();
  const r = await q<{ checked: string; matched: string }>(
    `SELECT COUNT(*)::text AS checked, COUNT(*) FILTER (WHERE matched)::text AS matched FROM os_cert_register WHERE confirmed_at IS NOT NULL`
  );
  return { checked: Number(r[0]?.checked ?? 0), matched: Number(r[0]?.matched ?? 0) };
}

/* ── renewals that arrive on REX ──────────────────────────────────────── */

const WATCH: Record<string, string> = { gas: "gas_safety", eicr: "eicr" };

function expiryDate(daysFromToday: number, at: number): string {
  const p = londonParts(at);
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day + daysFromToday));
  return d.toISOString().slice(0, 10);
}

/**
 * After every compliance-book refresh: any gas or electrical certificate on
 * one of OUR homes whose expiry has jumped forward since we last looked is a
 * renewal somebody filed on REX. Its file is copied into the OS (R2 + a row in
 * os_certificates, source "filed on REX") - which puts it on Michael's list -
 * and nothing is written back to REX.
 *
 * The first run only remembers what is there: the backlog is not news. And a
 * renewal is a jump of more than 30 days, so the day-to-day wobble of turning
 * "expires in N days" back into a date never reads as one.
 */
export async function feedRexRenewals(properties: CompProperty[], at = Date.now()): Promise<{ seeded: number; queued: number; skipped: number }> {
  if (!hasDb()) return { seeded: 0, queued: 0, skipped: 0 };
  await ensure();
  const seen = new Map(
    (await q<{ property_id: string; type_key: string; expiry: Date }>(`SELECT property_id, type_key, expiry FROM os_rex_cert_seen`)).map((r) => [
      `${r.property_id}|${r.type_key}`,
      new Date(r.expiry).toISOString().slice(0, 10),
    ])
  );
  const firstRun = seen.size === 0;
  let seeded = 0;
  let queued = 0;
  let skipped = 0;
  for (const p of properties) {
    for (const [key, type] of Object.entries(WATCH)) {
      const c = p.certs[key as keyof typeof p.certs];
      if (!c || c.expires == null || c.inherited) continue;
      const expiry = expiryDate(c.expires, at);
      const held = seen.get(`${p.id}|${key}`);
      const jumped = !held || Date.parse(expiry) - Date.parse(held) > 30 * 86_400_000;
      if (held && !jumped) continue;
      await q(
        `INSERT INTO os_rex_cert_seen (property_id, type_key, expiry) VALUES ($1, $2, $3)
         ON CONFLICT (property_id, type_key) DO UPDATE SET expiry = EXCLUDED.expiry, seen_at = NOW()`,
        [p.id, key, expiry]
      );
      if (firstRun || !held) {
        seeded++;
        continue;
      }
      if (!isOurs(p) || !c.fileUrl) {
        skipped++;
        continue;
      }
      /* Already in the OS (filed here, then written to REX)? Then it is on his list already. */
      const twin = await q<{ id: string }>(
        `SELECT id FROM os_certificates WHERE property_id = $1 AND type_id = $2 AND ABS(expiry - $3::date) <= 3 LIMIT 1`,
        [p.id, type, expiry]
      );
      if (twin[0]) continue;
      try {
        const url = c.fileUrl.startsWith("//") ? `https:${c.fileUrl}` : c.fileUrl;
        const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
        if (!res.ok) throw new Error(String(res.status));
        const bytes = Buffer.from(await res.arrayBuffer());
        const contentType = res.headers.get("content-type") ?? "application/pdf";
        const ext = contentType.includes("png") ? "png" : contentType.includes("jp") ? "jpg" : "pdf";
        const fileName = `${type === "gas_safety" ? "Gas safety" : "EICR"} - ${p.name}.${ext}`;
        const r2Key = `documents/${safeName(`compliance-${p.id}-${CERT_KEY[type] ?? type}`)}/${Date.now()}-${safeName(fileName)}`;
        await withR2((client) => client.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: r2Key, Body: bytes, ContentType: contentType, Metadata: { "property-id": p.id, source: "rex" } })));
        await q(
          `INSERT INTO os_certificates (id, property_id, property_name, type_id, expiry, r2_key, name, source, added_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [uid(), p.id, p.name, type, expiry, r2Key, fileName, "filed on REX, picked up by the OS", p.agent ?? ""]
        );
        queued++;
      } catch {
        skipped++;
      }
    }
  }
  return { seeded, queued, skipped };
}
