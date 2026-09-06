const { Client } = require("pg");
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_PUBLIC_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const r = await c.query("SELECT id, property_name, type_id, rex_note FROM os_certificates WHERE rex_entry_id IS NULL OR rex_entry_id = ''");
  require("fs").writeFileSync(__dirname + "/retry-ids.json", JSON.stringify(r.rows.map((x) => x.id)));
  console.log("to retry", r.rowCount);
  const why = {}; for (const x of r.rows) { const k = (x.rex_note || "").slice(0, 50); why[k] = (why[k] || 0) + 1; }
  console.log(JSON.stringify(why));
  await c.end();
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
