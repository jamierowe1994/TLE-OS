#!/usr/bin/env node
/**
 * REX PM documents against what the OS holds, per home (22 Oct 2026).
 *
 * READ-ONLY. It reads REX PM's compliance entries from an export file (REX PM
 * is never called), the OS's Postgres and the R2 bucket's listing, and writes
 * a CSV of every REX PM file with what the OS has for it. Nothing is written
 * anywhere but the output folder.
 *
 *   railway run -s TLE-OS -- sh -c \
 *     'AUDIT_DATABASE_URL=<Postgres DATABASE_PUBLIC_URL> node scripts/rex-pm-doc-audit.mjs <rex-pm-entries.json> <out-dir>'
 *
 * The export is REX PM's /compliance-entries read into rows of
 * { id, status, type, expires, issued, propertyId, address, ref, files: [{ name, size }] }
 * (6 Sep 2026: ~/Downloads/rex-pm-entries.json, 18,244 rows).
 *
 * Each live REX PM file (not Archived) on a home the OS knows is one of:
 *   held          the same file is on the home (same size, or the same name)
 *   held_elsewhere the same file is in the OS, on another record (a room's house, a duplicate)
 *   person_unlinked a landlord's or tenant's paper REX PM files against the person, whose home the export does not name
 *   covered       a certificate: the OS holds that type for the home running to the same day or later
 *   check         a paper: the OS holds that kind for the home, but a different file
 *   superseded    a certificate REX PM itself holds a later one of
 *   missing       none of the above
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { rexPmKind } from "../lib/rex-pm-types.ts";

const require = createRequire(import.meta.url);
const { Client } = require("pg");
const { S3Client, ListObjectsV2Command } = require("@aws-sdk/client-s3");

const [entriesPath, outDir = "."] = process.argv.slice(2);
if (!entriesPath) {
  console.error("usage: node scripts/rex-pm-doc-audit.mjs <rex-pm-entries.json> [out-dir]");
  process.exit(1);
}

/** REX's type -> the compliance book's key, as lib/os-certs. */
const BOOK_KEY = {
  gas_safety: "gas", eicr: "eicr", epc: "epc",
  mandatory_hmo_license: "licence", additional_hmo_license: "licence", selective_hmo_license: "licence",
  legionella_risk_assessment: "legionella", portable_appliance_testing: "pat",
  smoke_alarms: "alarms", co_alarms: "alarms", emergency_lighting_fire_exit: "fire",
};

/** A file's name with the OS's prefixes and the punctuation R2 keys lose taken off. */
function normName(n) {
  let b = String(n).split("/").pop().toLowerCase();
  b = b.replace(/^(rexpm|propoly|flatfair|payprop|rex|tds|mydeposits)-[a-z0-9]+-/, "").replace(/^\d{13}-/, "");
  /* "EICR 1.pdf", "EICR (1).pdf": the same file saved twice. */
  return b.replace(/\.[a-z0-9]{2,5}$/, "").replace(/(?: \d| ?\(\d\))$/, "").replace(/[^a-z0-9]/g, "");
}

const dayOf = (offsetDays) => {
  const d = new Date();
  d.setUTCHours(12, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
};

async function listR2() {
  const endpoint = process.env.R2_ENDPOINT || `https://${process.env.R2_ACCOUNT_ID}.eu.r2.cloudflarestorage.com`;
  const s3 = new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
  });
  const out = [];
  let token;
  do {
    const r = await s3.send(new ListObjectsV2Command({ Bucket: process.env.R2_BUCKET, Prefix: "documents/", ContinuationToken: token }));
    for (const o of r.Contents ?? []) out.push({ key: o.Key, size: o.Size });
    token = r.IsTruncated ? r.NextContinuationToken : undefined;
  } while (token);
  return out;
}

async function readDb() {
  const db = new Client({ connectionString: process.env.AUDIT_DATABASE_URL || process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();
  const all = async (sql) => (await db.query(sql)).rows;
  const out = {
    props: await all(`SELECT id, address, rex_property_id, active, hmo, agent_name, service_level, pm_managed FROM os_properties`),
    certs: await all(`SELECT property_id, type_id, expiry::text AS expiry, name, r2_key FROM os_certificates`),
    facts: await all(`SELECT property_id, field, file_key FROM os_property_facts WHERE file_key IS NOT NULL`),
    fileDocs: await all(`SELECT rex_property_id, file_name, r2_key, size_bytes FROM os_file_documents WHERE removed_at IS NULL`),
    book: (await all(`SELECT payload FROM os_cache WHERE key = 'compliance:v7'`))[0]?.payload?.book?.properties ?? [],
  };
  await db.end();
  return out;
}

const csvCell = (v) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const writeCsv = (file, rows) => {
  const cols = Object.keys(rows[0] ?? { empty: "" });
  fs.writeFileSync(file, [cols.join(","), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(","))].join("\n") + "\n");
};

const entries = JSON.parse(fs.readFileSync(entriesPath, "utf8"));
const [r2, db] = await Promise.all([listR2(), readDb()]);

const props = new Map(db.props.map((p) => [p.id, p]));
/* Every id a home is filed under: its pm- id, its REX id, and any other OS record on the same REX home. */
const byRex = new Map();
for (const p of db.props) if (p.rex_property_id) (byRex.get(String(p.rex_property_id)) ?? byRex.set(String(p.rex_property_id), []).get(String(p.rex_property_id))).push(p.id);
const idsOf = (pmId) => {
  const p = props.get(pmId);
  const rex = p?.rex_property_id ? String(p.rex_property_id) : null;
  return [...new Set([pmId, ...(rex ? [rex, ...(byRex.get(rex) ?? [])] : [])])];
};
/* R2 objects by the record they sit under: documents/property-<id>/ and documents/compliance-<id>-<key>/. */
const r2ById = new Map();
for (const o of r2) {
  const m = o.key.match(/^documents\/(?:property-(.+?)\/|compliance-(.+)-[a-z]+\/)/);
  const id = m?.[1] ?? m?.[2];
  if (id) (r2ById.get(id) ?? r2ById.set(id, []).get(id)).push(o);
}
const r2BySig = new Map();
for (const o of r2) {
  const sig = `${o.size}|${normName(o.key)}`;
  (r2BySig.get(sig) ?? r2BySig.set(sig, []).get(sig)).push(o.key);
}
const fileDocsByRex = new Map();
for (const d of db.fileDocs) if (d.rex_property_id) (fileDocsByRex.get(String(d.rex_property_id)) ?? fileDocsByRex.set(String(d.rex_property_id), []).get(String(d.rex_property_id))).push(d);
const factFolders = new Map(db.facts.map((f) => [`${f.property_id}|${f.field}`, f.file_key]));
const bookById = new Map(db.book.map((p) => [String(p.id), p]));

/* The latest REX PM expiry per home and certificate: an older live entry is superseded, not missing.
   Fire by which fire certificate it is, because the OS's one fire slot is three certificates
   there (the risk assessment, the alarm test, the emergency lighting): a new
   alarm test does not replace the risk assessment. */
const fireCert = (label) =>
  /risk/i.test(label) ? "risk assessment" : /alarm/i.test(label) ? "alarm" : /lighting/i.test(label) ? "emergency lighting" : "equipment";
const certSlot = (e, type) => (type === "emergency_lighting_fire_exit" ? `fire ${fireCert(e.type)}` : BOOK_KEY[type] ?? type);
const latest = new Map();
for (const e of entries) {
  if (e.status === "Archived" || !e.files?.length) continue;
  const k = rexPmKind(e.type);
  if (k?.as !== "certificate") continue;
  const key = `${e.propertyId}|${certSlot(e, k.type)}`;
  if ((e.expires ?? "") > (latest.get(key) ?? "")) latest.set(key, e.expires ?? "");
}
/* Fire is covered only by the same certificate (same expiry), for the same reason. */
const ONE_OF_SEVERAL = new Set(["emergency_lighting_fire_exit"]);

const rows = [];
const unmapped = new Map();
for (const e of entries) {
  if (e.status === "Archived" || !e.files?.length) continue;
  const kind = rexPmKind(e.type);
  if (!kind) {
    unmapped.set(e.type, (unmapped.get(e.type) ?? 0) + e.files.length);
    continue;
  }
  if (kind.as === "not_home") continue;
  const pmId = `pm-${e.propertyId}`;
  const home = props.get(pmId);
  const ids = home ? idsOf(pmId) : [];
  const onHome = ids.flatMap((id) => r2ById.get(id) ?? []);
  const docsOnHome = ids.flatMap((id) => fileDocsByRex.get(id) ?? []);
  const certsOnHome = db.certs.filter((c) => ids.includes(c.property_id));

  for (const f of e.files) {
    const n = normName(f.name);
    let state = "missing";
    let where = "";
    const same = onHome.find((o) => o.size === f.size || (n && normName(o.key) === n)) ??
      docsOnHome.find((d) => d.size_bytes === f.size || (n && normName(d.file_name) === n));
    const elsewhere = r2BySig.get(`${f.size}|${n}`)?.[0];
    if (same) {
      state = "held";
      where = same.key ?? same.r2_key;
    } else if (elsewhere) {
      state = "held_elsewhere";
      where = elsewhere;
    } else if (!home) {
      /* Filed in REX PM against the landlord or tenant, and the export does
         not say whose home that is. */
      state = "person_unlinked";
    } else if (kind.as === "certificate") {
      const top = latest.get(`${e.propertyId}|${certSlot(e, kind.type)}`) ?? "";
      const ownDays = certsOnHome.filter((c) => BOOK_KEY[c.type_id] === BOOK_KEY[kind.type]).map((c) => c.expiry);
      const inBook = ids.map((id) => bookById.get(id)?.certs?.[BOOK_KEY[kind.type]]).find((c) => c?.expires != null);
      const bookDay = inBook ? dayOf(inBook.expires) : "";
      const best = [...ownDays, bookDay].sort().pop();
      const sameCert = Boolean(e.expires) && [...ownDays, bookDay].includes(e.expires);
      if (e.expires && (ONE_OF_SEVERAL.has(kind.type) ? sameCert : best && best >= e.expires)) {
        state = "covered";
        where = `OS runs to ${ONE_OF_SEVERAL.has(kind.type) ? e.expires : best}`;
      } else if ((e.expires ?? "") < top) {
        state = "superseded";
        where = `REX PM holds one to ${top}`;
      }
    } else if (kind.as === "document") {
      const folder = ids.map((id) => factFolders.get(`${id}|${kind.field}`)).find(Boolean);
      const filesThere = folder ? r2.filter((o) => o.key.startsWith(folder)).length : 0;
      if (filesThere) {
        state = "check";
        where = `${filesThere} other file(s) in ${kind.field}`;
      }
    }
    rows.push({
      state,
      address: home?.address ?? e.address ?? "",
      os_id: home ? pmId : "",
      rex_id: home?.rex_property_id ?? "",
      active: home ? (home.active ? "yes" : "no") : "",
      hmo: home?.hmo || ids.some((id) => bookById.get(id)?.hmo) ? "yes" : "no",
      agent: home?.agent_name ?? "",
      rexpm_type: e.type,
      os_kind: kind.as === "certificate" ? kind.type : kind.as === "document" ? kind.field : `Other: ${kind.name}`,
      rexpm_status: e.status,
      expires: e.expires ?? "",
      file_name: f.name,
      bytes: f.size,
      rexpm_entry: e.id,
      where,
    });
  }
}

fs.mkdirSync(outDir, { recursive: true });
rows.sort((a, b) => a.state.localeCompare(b.state) || String(a.agent).localeCompare(String(b.agent)) || a.address.localeCompare(b.address));
writeCsv(path.join(outDir, "rex-pm-doc-audit-all.csv"), rows);
writeCsv(path.join(outDir, "rex-pm-missing-documents.csv"), rows.filter((r) => r.state === "missing"));

const count = (xs, f) => xs.reduce((m, x) => m.set(f(x), (m.get(f(x)) ?? 0) + 1), new Map());
console.log("live REX PM files on homes:", rows.length);
for (const [s, n] of [...count(rows, (r) => r.state)].sort((a, b) => b[1] - a[1])) console.log(`  ${s}: ${n}`);
if (unmapped.size) console.log("UNMAPPED REX PM types (add them to lib/rex-pm-types.ts):", Object.fromEntries(unmapped));
