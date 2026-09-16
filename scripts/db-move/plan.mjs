#!/usr/bin/env node
/**
 * STEP 1 OF 3 - what would move. Reads only; changes nothing anywhere.
 *
 *   SOURCE_URL=postgres://… node scripts/db-move/plan.mjs [--shared=copy|leave]
 *
 * Prints every table with its rows and size, the group it is in, and exactly
 * what the move would take. Stops with a non-zero exit if the live database
 * holds a table tables.mjs has never heard of - a table added since the list
 * was written would otherwise be silently left behind, and nobody would know
 * until the screen that uses it came up empty.
 */
import { createRequire } from "node:module";
import { SHARED, PORTAL_ONLY, isOs, tablesToMove } from "./tables.mjs";

const require = createRequire(import.meta.url);
const { Client } = require("pg");

const SOURCE = process.env.SOURCE_URL;
const shared = (process.argv.find((a) => a.startsWith("--shared=")) ?? "--shared=copy").split("=")[1];
if (!SOURCE) {
  console.error("Set SOURCE_URL to the database the OS runs on today.");
  process.exit(2);
}
if (!["copy", "leave"].includes(shared)) {
  console.error('--shared must be "copy" or "leave".');
  process.exit(2);
}

const mb = (b) => (Number(b) / 1048576).toFixed(1);
const c = new Client({ connectionString: SOURCE, ssl: SOURCE.includes("localhost") ? false : { rejectUnauthorized: false } });
await c.connect();
try {
  const version = (await c.query("SHOW server_version")).rows[0].server_version;
  const { rows } = await c.query(`
    SELECT c.relname AS name, pg_total_relation_size(c.oid) AS bytes,
           coalesce(s.n_live_tup, 0) AS approx_rows
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
     WHERE n.nspname = 'public' AND c.relkind = 'r'
     ORDER BY c.relname`);
  const seqs = (await c.query(`
    SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'S' ORDER BY c.relname`)).rows.map((r) => r.name);
  const cross = (await c.query(`
    SELECT conrelid::regclass::text AS t, confrelid::regclass::text AS ref
      FROM pg_constraint WHERE contype = 'f'`)).rows;

  const names = rows.map((r) => r.name);
  const { move, unknown } = tablesToMove(names, shared);
  const group = (n) => (isOs(n) ? "OS" : SHARED.includes(n) ? "SHARED" : PORTAL_ONLY.includes(n) ? "PORTAL" : "UNKNOWN");
  const sum = (list) => rows.filter((r) => list.includes(r.name)).reduce((a, r) => a + Number(r.bytes), 0);

  console.log(`Source: PostgreSQL ${version}`);
  console.log(`Decision for the shared tables: ${shared.toUpperCase()}\n`);
  for (const g of ["OS", "SHARED", "PORTAL", "UNKNOWN"]) {
    const inG = rows.filter((r) => group(r.name) === g);
    if (!inG.length) continue;
    console.log(`${g.padEnd(7)} ${String(inG.length).padStart(3)} tables  ${mb(inG.reduce((a, r) => a + Number(r.bytes), 0)).padStart(7)} MB`);
  }

  const moveSeqs = seqs.filter((s) => move.some((t) => s.startsWith(t)) || isOs(s));
  console.log(`\nWOULD MOVE  ${move.length} tables, ${moveSeqs.length} sequences, ${mb(sum(move))} MB`);
  console.log(`STAYS PUT   ${names.length - move.length} tables: ${names.filter((n) => !move.includes(n)).join(", ") || "none"}`);

  /* A foreign key from a table that moves to one that stays would break on
     the far side. There are none today; this is here for the day there is. */
  const broken = cross.filter((f) => move.includes(f.t) !== move.includes(f.ref));
  console.log(`Foreign keys that would be cut: ${broken.length ? broken.map((f) => `${f.t} -> ${f.ref}`).join(", ") : "none"}`);

  if (unknown.length) {
    console.error(`\nSTOP: ${unknown.length} table(s) are in no group - add them to tables.mjs first: ${unknown.join(", ")}`);
    process.exit(1);
  }
  if (broken.length) {
    console.error("\nSTOP: the move would cut a foreign key.");
    process.exit(1);
  }
  console.log("\nPlan is clean.");
} finally {
  await c.end();
}
