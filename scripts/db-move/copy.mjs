#!/usr/bin/env node
/**
 * STEP 2 OF 3 - copy the OS's tables into its own database.
 *
 *   SOURCE_URL=… TARGET_URL=… node scripts/db-move/copy.mjs [--shared=copy|leave] [--go]
 *
 * Without --go it prints what it would do and stops. With --go it dumps the
 * tables from SOURCE and restores them into TARGET, using the PostgreSQL 18
 * client in a throwaway container - the same image the nightly backup uses,
 * because the Mac has no psql and the local Postgres is 16, which cannot read
 * an 18 dump.
 *
 * ── It cannot damage the source, and it cannot overwrite the target ──────
 *
 *   • It only ever runs pg_dump against SOURCE. Nothing is dropped, truncated
 *     or altered there, so the old database is the rollback: point
 *     DATABASE_URL back at it and the OS is exactly where it was.
 *   • It refuses if SOURCE and TARGET are the same database.
 *   • It refuses if TARGET already holds any of these tables with rows in them.
 *     A second run, or a run against the wrong URL, stops instead of doubling
 *     up or replacing a database somebody is using.
 *
 * Sequences are named explicitly. pg_dump takes a sequence along with a table
 * only when a column OWNS it; os_invoices_seq and the works-order and
 * inspection references are free-standing, and without this every new invoice
 * after the move would reuse number 1.
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { tablesToMove } from "./tables.mjs";

const require = createRequire(import.meta.url);
const { Client } = require("pg");

const SOURCE = process.env.SOURCE_URL;
const TARGET = process.env.TARGET_URL;
const NETWORK = process.env.DOCKER_NETWORK || "";
const go = process.argv.includes("--go");
const shared = (process.argv.find((a) => a.startsWith("--shared=")) ?? "--shared=copy").split("=")[1];

if (!SOURCE || !TARGET) {
  console.error("Set SOURCE_URL (the database the OS runs on today) and TARGET_URL (its new, empty database).");
  process.exit(2);
}

const where = (url) => {
  const u = new URL(url);
  return `${u.hostname}:${u.port || 5432}/${u.pathname.slice(1)}`;
};
if (where(SOURCE) === where(TARGET)) {
  console.error("SOURCE and TARGET are the same database. Refusing.");
  process.exit(2);
}

const ssl = (url) => (/localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false });
const connect = async (url) => {
  const c = new Client({ connectionString: url, ssl: ssl(url) });
  await c.connect();
  return c;
};

/* What moves, read from the source itself so nothing added since is missed. */
const src = await connect(SOURCE);
const allTables = (await src.query(`
  SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r'`)).rows.map((r) => r.name);
const allSeqs = (await src.query(`
  SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'S'`)).rows.map((r) => r.name);
await src.end();

const { move, unknown } = tablesToMove(allTables, shared);
if (unknown.length) {
  console.error(`STOP: tables in no group - run plan.mjs and add them to tables.mjs: ${unknown.join(", ")}`);
  process.exit(1);
}
const seqs = allSeqs.filter((s) => s.startsWith("os_") || move.some((t) => s.startsWith(`${t}_`)));

/* The target must not already hold this data. */
const tgt = await connect(TARGET);
const present = (await tgt.query(`
  SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r'`)).rows.map((r) => r.name);
const clash = [];
for (const t of move.filter((m) => present.includes(m))) {
  const n = Number((await tgt.query(`SELECT count(*)::bigint AS n FROM "${t}"`)).rows[0].n);
  if (n > 0) clash.push(`${t} (${n} rows)`);
}
const tgtVersion = (await tgt.query("SHOW server_version")).rows[0].server_version;
await tgt.end();

if (clash.length) {
  console.error(`STOP: the target already has data in ${clash.length} of these tables - it is not the empty database it should be.`);
  console.error(clash.slice(0, 10).join(", ") + (clash.length > 10 ? ", …" : ""));
  process.exit(1);
}

console.log(`From  ${where(SOURCE)}`);
console.log(`To    ${where(TARGET)}  (PostgreSQL ${tgtVersion})`);
console.log(`Moves ${move.length} tables and ${seqs.length} sequences; shared tables: ${shared}.`);

if (!go) {
  console.log("\nDry run. Nothing was copied. Add --go to copy.");
  process.exit(0);
}

/* The copy itself, in a throwaway PostgreSQL 18 container. The script is piped
   in on stdin: under colima a -v mount of this folder arrives empty and
   silently, which is how a copy "succeeds" having dumped nothing. */
const args = [...move.map((t) => `-t "public.${t}"`), ...seqs.map((s) => `-t "public.${s}"`)].join(" ");
const script = `
set -eu
echo "dumping..."
pg_dump -Fc --no-owner --no-acl ${args} -f /tmp/os.dump "$SOURCE_URL"
echo "dump: $(wc -c < /tmp/os.dump) bytes"
echo "restoring..."
pg_restore --no-owner --no-acl --exit-on-error -d "$TARGET_URL" /tmp/os.dump
echo "restore finished"
`;
const docker = spawnSync(
  "docker",
  ["run", "--rm", "-i", ...(NETWORK ? ["--network", NETWORK] : []), "-e", "SOURCE_URL", "-e", "TARGET_URL", "postgres:18-alpine", "sh", "-s"],
  { input: script, stdio: ["pipe", "inherit", "inherit"], env: { ...process.env, SOURCE_URL: process.env.DOCKER_SOURCE_URL || SOURCE, TARGET_URL: process.env.DOCKER_TARGET_URL || TARGET } }
);
if (docker.status !== 0) {
  console.error(`\nThe copy failed (exit ${docker.status}). The source is untouched. Fix the cause, drop and recreate the target, and run again.`);
  process.exit(1);
}
console.log("\nCopied. Now run verify.mjs - a copy nobody has counted is not a copy.");
