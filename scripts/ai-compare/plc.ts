/**
 * PLC check, model against model, on real pack documents.
 *
 *   railway run -s TLE-OS -- env -u ANTHROPIC_BASE_URL DATABASE_URL= \
 *     npx tsx --conditions=react-server scripts/ai-compare/plc.ts set.json out.json
 *
 * set.json: [{ address, moveIn, checkId, name, key }]. Reads each file out of
 * R2 and runs it through readDocument - the real prompt, schema and rules -
 * once per model. Writes nothing anywhere: DATABASE_URL is blanked so even the
 * usage meter is off, and the results go to out.json.
 */
import fs from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { fetchDocument, readDocument } from "@/lib/plc-scan";
import { costOf, type Effort } from "@/lib/ai";
import type { CheckId, PlcDocument } from "@/lib/plc";

const [setPath, outPath] = process.argv.slice(2);
const models = (process.env.MODELS || "claude-haiku-5-5,claude-sonnet-5-5,claude-opus-5-5").split(",");
const effort = (process.env.EFFORT || undefined) as Effort | undefined;
const set = JSON.parse(fs.readFileSync(setPath, "utf8")) as Array<{ address: string; moveIn: string; checkId: CheckId; name: string; key: string }>;
const client = new Anthropic({ maxRetries: 4 });

(async () => {
  const out: unknown[] = [];
  let total = 0;
  for (const d of set) {
    const f = await fetchDocument({ checkId: d.checkId, name: d.name, key: d.key } as PlcDocument);
    const runs = await Promise.all(
      models.map(async (model) => {
        const t = Date.now();
        try {
          const r = await readDocument(client, { name: d.name, media: f.media, base64: f.base64 }, { checkId: d.checkId, address: d.address, moveInDate: d.moveIn }, { model, effort });
          const cost = costOf(r.model, r.usage) ?? 0;
          total += cost;
          return { model, served: r.model, stop: r.stop, verdict: r.result.verdict, reasons: r.result.reasons, facts: r.facts, findings: r.observations.map((o) => `${o.level}: ${o.message}`), usage: r.usage, cost, ms: Date.now() - t };
        } catch (e) {
          return { model, error: e instanceof Error ? e.message : String(e), ms: Date.now() - t };
        }
      })
    );
    out.push({ ...d, key: undefined, runs });
    console.log(`${d.name}: ${runs.map((r) => `${r.model.replace("claude-", "")}=${"verdict" in r ? r.verdict : "ERR " + ("error" in r ? r.error : "")}`).join("  ")}`);
    fs.writeFileSync(outPath, JSON.stringify(out, null, 1));
  }
  console.log(`total $${total.toFixed(3)}`);
})();
