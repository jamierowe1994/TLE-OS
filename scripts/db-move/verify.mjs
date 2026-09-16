#!/usr/bin/env node
/**
 * STEP 3 OF 3 - prove the copy, table by table, before anything points at it.
 *
 *   SOURCE_URL=… TARGET_URL=… node scripts/db-move/verify.mjs [--shared=copy|leave]
 *
 * An exact count(*) of every moved table on both sides, and the current value
 * of every moved sequence. Exits non-zero on the first disagreement, and lists
 * all of them, so "it looked fine" is never how the switch-over is decided.
 *
 * Counted exactly, not from pg_stat estimates: the estimates are what plan.mjs
 * uses to size the job, and they can be thousands out on a table that has just
 * been loaded - precisely the table this is checking.
 *
 * Run it with writes stopped on the source. A count taken while the OS is still
 * writing will differ by whatever arrived in between, and that is a real
 * difference: it is data the copy does not have.
 */
import { createRequire } from "node:module";
import { tablesToMove } from "./tables.mjs";

const require = createRequire(import.meta.url);
const { Client } = require("pg");

const SOURCE = process.env.SOURCE_URL;
const TARGET = process.env.TARGET_URL;
const shared = (process.argv.find((a) => a.startsWith("--shared=")) ?? "--shared=copy").split("=")[1];
if (!SOURCE || !TARGET) {
  console.error("Set SOURCE_URL and TARGET_URL.");
  process.exit(2);
}

const ssl = (url) => (/localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false });
const connect = async (url) => {
  const c = new Client({ connectionString: url, ssl: ssl(url) });
  await c.connect();
  return c;
};

const src = await connect(SOURCE);
const tgt = await connect(TARGET);
try {
  const tables = (await src.query(`
    SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r'`)).rows.map((r) => r.name);
  const { move } = tablesToMove(tables, shared);
  const seqs = (await src.query(`
    SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'S'`)).rows
    .map((r) => r.name)
    .filter((s) => s.startsWith("os_") || move.some((t) => s.startsWith(`${t}_`)));

  const count = async (c, t) => {
    try {
      return Number((await c.query(`SELECT count(*)::bigint AS n FROM "${t}"`)).rows[0].n);
    } catch {
      return null;
    }
  };
  const seqValue = async (c, s) => {
    try {
      const r = (await c.query(`SELECT last_value::bigint AS v, is_called FROM "${s}"`)).rows[0];
      return `${r.v}${r.is_called ? "" : " (not called)"}`;
    } catch {
      return null;
    }
  };

  const wrong = [];
  let rowsSource = 0;
  let rowsTarget = 0;
  for (const t of move) {
    const [a, b] = await Promise.all([count(src, t), count(tgt, t)]);
    rowsSource += a ?? 0;
    rowsTarget += b ?? 0;
    if (b === null) wrong.push(`${t}: missing on the target`);
    else if (a !== b) wrong.push(`${t}: ${a} rows on the source, ${b} on the target`);
  }
  for (const s of seqs) {
    const [a, b] = await Promise.all([seqValue(src, s), seqValue(tgt, s)]);
    if (b === null) wrong.push(`sequence ${s}: missing on the target`);
    else if (a !== b) wrong.push(`sequence ${s}: ${a} on the source, ${b} on the target`);
  }

  console.log(`Tables checked:    ${move.length}`);
  console.log(`Sequences checked: ${seqs.length}`);
  console.log(`Rows:              ${rowsSource.toLocaleString("en-GB")} on the source, ${rowsTarget.toLocaleString("en-GB")} on the target`);
  if (wrong.length) {
    console.error(`\nDOES NOT MATCH - ${wrong.length} difference(s). Do not switch over.`);
    for (const w of wrong) console.error(`  ${w}`);
    process.exit(1);
  }
  console.log("\nEvery table and every sequence matches. Safe to point the OS at the target.");
} finally {
  await src.end();
  await tgt.end();
}
