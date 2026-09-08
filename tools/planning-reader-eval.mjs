/*
 * Does a cheaper model read planning applications as well as the one in
 * lib/planning does?
 *
 *   node tools/planning-reader-eval.mjs claude-haiku-4-5
 *
 * Run against a database that already holds read applications: those labels
 * are the reference. Measured 8 Sep 2026 on 280 stratified rows with 803
 * hand-checked labels behind them - Haiku agreed on the kind 85.3% of the
 * time and on to_let only 74.6%, and missed 12 real leads, so the reader
 * stayed on Opus. Re-run this before changing READER_MODEL.
 *
 * The reference is the labels already in the database, spot-checked by hand
 * across both the positives and the rejections. Agreement is the measure, and
 * every disagreement is printed so a person can say which one is right.
 */
import pg from "pg";
import Anthropic from "@anthropic-ai/sdk";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8");
process.env.ANTHROPIC_API_KEY = /^ANTHROPIC_API_KEY=(.+)$/m.exec(env)[1].trim().replace(/^["']|["']$/g, "");

const src = fs.readFileSync(path.join(ROOT, "lib/planning.ts"), "utf8");
const BRIEF = src.split("const READER_BRIEF = `")[1].split("`;")[0];
const SCHEMA = JSON.parse(
  '{"type":"object","properties":{"applications":{"type":"array","items":{"type":"object","properties":{"id":{"type":"string"},"kind":{"type":"string","enum":["hmo","flats","to_residential","new_homes","none"]},"homes":{"type":"integer"},"summary":{"type":"string"},"to_let":{"type":"boolean"},"confident":{"type":"boolean"}},"required":["id","kind","homes","summary","to_let","confident"],"additionalProperties":false}}},"required":["applications"],"additionalProperties":false}'
);

const c = new pg.Client({ connectionString: process.env.DATABASE_URL ?? "postgres://postgres:radar@localhost:55432/tleos" });
await c.connect();
/* Stratified: every kind represented, so a rare category cannot hide. */
const { rows } = await c.query(`
  (SELECT * FROM (SELECT ref,description,address,app_type,app_size,kind,to_let FROM os_planning_applications WHERE kind='hmo' ORDER BY random() LIMIT 40) a)
  UNION ALL (SELECT * FROM (SELECT ref,description,address,app_type,app_size,kind,to_let FROM os_planning_applications WHERE kind='flats' ORDER BY random() LIMIT 40) b)
  UNION ALL (SELECT * FROM (SELECT ref,description,address,app_type,app_size,kind,to_let FROM os_planning_applications WHERE kind='to_residential' ORDER BY random() LIMIT 40) d)
  UNION ALL (SELECT * FROM (SELECT ref,description,address,app_type,app_size,kind,to_let FROM os_planning_applications WHERE kind='new_homes' ORDER BY random() LIMIT 40) e)
  UNION ALL (SELECT * FROM (SELECT ref,description,address,app_type,app_size,kind,to_let FROM os_planning_applications WHERE kind='none' ORDER BY random() LIMIT 120) f)
`);
await c.end();
console.log("sample:", rows.length);

const model = process.argv[2] ?? "claude-haiku-4-5";
const client = new Anthropic();
const got = new Map();
let out = 0, inTok = 0;
const t0 = Date.now();
for (let i = 0; i < rows.length; i += 20) {
  const batch = rows.slice(i, i + 20);
  const listing = batch.map((a, n) =>
    `${n + 1}. id: ${a.ref}\n   address: ${a.address}\n   type: ${a.app_type ?? "unknown"} (${a.app_size ?? "unknown size"})\n   description: ${a.description}`
  ).join("\n\n");
  const res = await client.messages.parse({
    model, max_tokens: 4000,
    system: [{ type: "text", text: BRIEF, cache_control: { type: "ephemeral" } }],
    output_config: { format: { type: "json_schema", schema: SCHEMA } },
    messages: [{ role: "user", content: `Read these ${batch.length} planning applications.\n\n${listing}` }],
  });
  out += res.usage?.output_tokens ?? 0;
  inTok += res.usage?.input_tokens ?? 0;
  for (const r of res.parsed_output?.applications ?? []) got.set(r.id, r);
  process.stderr.write(".");
}
console.log(`\n${model}: ${out} output tokens, ${inTok} input, ${((Date.now()-t0)/1000).toFixed(0)}s\n`);

let kindAgree = 0, letAgree = 0, missing = 0;
const diffs = [];
for (const r of rows) {
  const g = got.get(r.ref);
  if (!g) { missing++; continue; }
  const k = g.kind === r.kind;
  if (k) kindAgree++; else diffs.push({ opus: r.kind, other: g.kind, d: r.description.slice(0, 105), s: g.summary });
  const realIsLet = r.to_let !== false, gotIsLet = g.to_let !== false;
  if (realIsLet === gotIsLet) letAgree++;
}
const n = rows.length - missing;
console.log(`kind agreement:   ${kindAgree}/${n}  (${(100*kindAgree/n).toFixed(1)}%)`);
console.log(`to_let agreement: ${letAgree}/${n}  (${(100*letAgree/n).toFixed(1)}%)`);
if (missing) console.log(`MISSING: ${missing}`);
/* The one that matters commercially: did it miss a real lead, or invent one? */
const missed = diffs.filter(d => d.other === "none").length;
const invented = diffs.filter(d => d.opus === "none").length;
console.log(`\nof ${diffs.length} disagreements: ${missed} Opus found / Haiku missed, ${invented} Haiku found / Opus called none, ${diffs.length-missed-invented} different category\n`);
diffs.slice(0, 18).forEach(d => console.log(` opus=${d.opus.padEnd(15)} other=${d.other.padEnd(15)} ${d.d.replace(/\s+/g," ")}`));
