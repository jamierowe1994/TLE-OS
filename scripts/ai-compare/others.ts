/**
 * Ask Bond, the planning reader, translation and the marketing library
 * reader, model against model, on real questions, applications, messages and
 * File Store files. Same running instructions as steve.ts (read-only
 * database, nothing that sends); writes nothing.
 *
 *   MODELS=... ONLY=bond,planning,translate,library CAP=1.00 \
 *     scripts/ai-compare/run.sh others.ts cases.json out.json
 *
 * CAP stops the run once that many dollars have gone, between calls.
 */
import fs from "node:fs";

(globalThis as { __osSchemaReady?: Promise<void> }).__osSchemaReady = Promise.resolve();

type Cases = {
  bond: Array<{ q: string; districts: string[]; focus: { kind: "door" | "landlord"; key: string; label: string } | null }>;
  planning: Array<{ ref: string; address: string; app_type: string | null; app_size: string | null; description: string }>;
  translate: { in: string[]; out: Array<{ text: string; language: string }> };
  library: string[];
};

const [casesPath, outPath] = process.argv.slice(2);
const models = (process.env.MODELS || "claude-haiku-5-5,claude-sonnet-5-5,claude-opus-5-5").split(",");
const only = (process.env.ONLY || "bond,planning,translate,library").split(",");
const cap = Number(process.env.CAP || 1);
const cases = JSON.parse(fs.readFileSync(casesPath, "utf8")) as Cases;

(async () => {
  const { ask } = await import("@/lib/bond-ask");
  const { readBatch } = await import("@/lib/planning");
  const { toEnglish, fromEnglish } = await import("@/lib/translate");
  const { readLibraryFile } = await import("@/lib/library-reader");
  const { costOf, onAiResponse, usageOf } = await import("@/lib/ai");

  const spent: Record<string, number> = {};
  const total = () => Object.values(spent).reduce((a, b) => a + b, 0);
  /* The library reader saves its write-up, which this session cannot; the
     write-up is taken from the reply on its way past instead. */
  let libraryReply = "";
  onAiResponse((f, res) => {
    spent[res.model] = (spent[res.model] ?? 0) + (costOf(res.model, usageOf(res)) ?? 0);
    if (f === "library-reader") libraryReply = res.content.map((c) => (c.type === "text" ? c.text : "")).join("");
  });
  const timed = async <T,>(fn: () => Promise<T>) => {
    const t = Date.now();
    try {
      const r = await fn();
      return { result: r, ms: Date.now() - t };
    } catch (e) {
      return { ms: Date.now() - t, error: e instanceof Error ? e.message : String(e) };
    }
  };
  const over = () => {
    if (total() < cap) return false;
    console.log(`stopped at the $${cap} cap`);
    return true;
  };

  const out: Record<string, unknown[]> = { bond: [], planning: [], translate: [], library: [] };
  const save = () => fs.writeFileSync(outPath, JSON.stringify({ spent, ...out }, null, 1));
  run: for (const model of models) {
    for (const k of ["BOND_ASK", "PLANNING_READER", "TRANSLATE", "LIBRARY_READER"]) process.env[`AI_MODEL_${k}`] = model;
    const before = spent[model] ?? 0;

    if (only.includes("planning"))
      for (let i = 0; i < cases.planning.length; i += 20) {
        if (over()) break run;
        out.planning.push({ model, ...(await timed(() => readBatch(cases.planning.slice(i, i + 20)))) });
      }
    if (only.includes("translate")) {
      for (const text of cases.translate.in) {
        if (over()) break run;
        out.translate.push({ model, dir: "in", text, ...(await timed(() => toEnglish(text))) });
      }
      for (const c of cases.translate.out) {
        if (over()) break run;
        out.translate.push({ model, dir: "out", ...c, ...(await timed(() => fromEnglish(c.text, c.language))) });
      }
    }
    if (only.includes("library"))
      for (const key of cases.library) {
        if (over()) break run;
        libraryReply = "";
        const r = await timed(() => readLibraryFile(key, "ai-compare"));
        out.library.push({ model, key, reply: libraryReply, ...r });
      }
    if (only.includes("bond"))
      for (const c of cases.bond) {
        if (over()) break run;
        out.bond.push({ model, q: c.q, focus: c.focus?.label ?? null, ...(await timed(() => ask([], c.q, { districts: c.districts, focus: c.focus }))) });
      }

    console.log(model, `$${((spent[model] ?? 0) - before).toFixed(3)}`);
    save();
  }
  save();
  console.log("total", `$${total().toFixed(3)}`);
  process.exit(0);
})();
