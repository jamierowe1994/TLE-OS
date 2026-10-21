/**
 * Steve, his morning brief, his link reader and the listing writer, model
 * against model, on real questions and real records.
 *
 * Runs against the live database through a READ-ONLY session
 * (default_transaction_read_only), with REX writes, email and texts left
 * out of the environment, so a tool that tries to change anything fails
 * rather than changes it. See scripts/ai-compare/run.sh.
 *
 *   npx tsx scripts/ai-compare/steve.ts cases.json out.json
 */
import fs from "node:fs";

/* The live schema already exists and this session cannot create anything. */
(globalThis as { __osSchemaReady?: Promise<void> }).__osSchemaReady = Promise.resolve();

type Cases = {
  steve: Array<{ q: string; user: { id: string; name: string; email: string } }>;
  brief: Array<{ id: string; name: string }>;
  links: string[];
  listings: number[];
};

const [casesPath, outPath] = process.argv.slice(2);
const models = (process.env.MODELS || "claude-haiku-5-5,claude-sonnet-5-5,claude-opus-5-5").split(",");
const only = (process.env.ONLY || "steve,brief,links,adverts").split(",");
const cases = JSON.parse(fs.readFileSync(casesPath, "utf8")) as Cases;

(async () => {
  const { ask } = await import("@/lib/assistant-brain");
  const { dayFacts, writeBrief } = await import("@/lib/steve-brief");
  const { safeUrl, fetchPage, summarise } = await import("@/lib/knowledge-links");
  const { readListingDetails } = await import("@/lib/listing-details");
  const { autofillListing } = await import("@/lib/listing-autofill");
  const { costOf, onAiResponse, usageOf } = await import("@/lib/ai");

  const spent: Record<string, number> = {};
  onAiResponse((_f, res) => {
    spent[res.model] = (spent[res.model] ?? 0) + (costOf(res.model, usageOf(res)) ?? 0);
  });
  const timed = async <T,>(fn: () => Promise<T>) => {
    const t = Date.now();
    try {
      const r = await fn();
      return { ...r, ms: Date.now() - t };
    } catch (e) {
      return { ms: Date.now() - t, error: e instanceof Error ? e.message : String(e) };
    }
  };

  /* Inputs read once, so every model sees exactly the same thing. */
  const pages = only.includes("links") ? await Promise.all(cases.links.map(async (u) => ({ u, page: await fetchPage(await safeUrl(u)) }))) : [];
  const facts = only.includes("brief") ? await Promise.all(cases.brief.map(async (p) => ({ p, f: await dayFacts(p.id) }))) : [];
  const listings = only.includes("adverts") ? await Promise.all(cases.listings.map((id) => readListingDetails(id))) : [];

  const out: Record<string, unknown[]> = { steve: [], brief: [], links: [], adverts: [] };
  for (const model of models) {
    for (const k of ["STEVE", "STEVE_BRIEF", "KNOWLEDGE_LINKS", "LISTING_AUTOFILL"]) process.env[`AI_MODEL_${k}`] = model;
    const before = spent[model] ?? 0;

    if (only.includes("steve"))
      for (const c of cases.steve) {
        const a = await timed(() => ask([], c.q, { scope: { rexUserId: null, everything: true, unlinked: false, label: "the whole business" }, path: "/dashboard", openListingId: null, me: c.user }));
        out.steve.push({ model, q: c.q, ...a });
      }
    if (only.includes("brief"))
      for (const { p, f } of facts) out.brief.push({ model, who: p.name, ...(await timed(() => writeBrief(p.name.split(" ")[0], [], f))) });
    if (only.includes("links"))
      for (const { u, page } of pages) out.links.push({ model, url: u, ...(await timed(() => summarise(u, page))) });
    if (only.includes("adverts"))
      for (const d of listings) out.adverts.push({ model, listing: `${d.street}, ${d.postcode}`, ...(await timed(() => autofillListing(d, { writeCopy: true }))) });

    console.log(model, `$${((spent[model] ?? 0) - before).toFixed(3)}`);
    fs.writeFileSync(outPath, JSON.stringify({ spent, ...out }, null, 1));
  }
  process.exit(0);
})();
