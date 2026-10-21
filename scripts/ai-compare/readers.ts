/**
 * The document readers, model against model, on real files from R2:
 * certificate dates, engineer registration, EPC scores and the PLC file
 * sorter. Same running instructions as plc.ts; writes nothing.
 *
 *   ... npx tsx scripts/ai-compare/readers.ts certs.json epcs.json sorter.json out.json
 */
import fs from "node:fs";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { R2_BUCKET, withR2 } from "@/lib/r2";
import { readCertificate } from "@/lib/cert-read";
import { readRegisterFile } from "@/lib/cert-register";
import { readEpc } from "@/lib/epc-read";
import { readDroppedFile } from "@/lib/plc-read-file";
import { costOf, onAiResponse, usageOf } from "@/lib/ai";

const [certsPath, epcsPath, sorterPath, outPath] = process.argv.slice(2);
const models = (process.env.MODELS || "claude-haiku-4-5-20251001,claude-haiku-5-5,claude-sonnet-5-5").split(",");
const load = (p: string) => (p && p !== "-" ? JSON.parse(fs.readFileSync(p, "utf8")) : []);
const certs = load(certsPath) as Array<{ key: string; name: string; type: string }>;
const epcs = load(epcsPath) as Array<{ key: string; name: string }>;
const sorter = load(sorterPath) as Array<{ key: string; name: string; address: string }>;

let spent: Record<string, number> = {};
onAiResponse((_f, res) => {
  spent[res.model] = (spent[res.model] ?? 0) + (costOf(res.model, usageOf(res)) ?? 0);
});

async function bytesOf(key: string) {
  return withR2(async (c) => {
    const r = await c.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    return { bytes: Buffer.from((await r.Body!.transformToByteArray())), type: r.ContentType ?? "" };
  });
}
const mediaOf = (name: string, type: string, bytes: Buffer) =>
  type.includes("pdf") || bytes.subarray(0, 4).toString() === "%PDF" ? "application/pdf" : /png/i.test(type + name) ? "image/png" : "image/jpeg";
const safe = async <T,>(fn: () => Promise<T>) => {
  try {
    return await fn();
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
};

(async () => {
  const out: Record<string, unknown[]> = { certs: [], epcs: [], sorter: [] };
  const files = new Map<string, { bytes: Buffer; type: string }>();
  const file = async (key: string) => files.get(key) ?? (files.set(key, await bytesOf(key)), files.get(key)!);

  for (const model of models) {
    for (const k of ["CERT_READER", "CERT_REGISTER", "EPC_READER", "PLC_SORTER"]) process.env[`AI_MODEL_${k}`] = model;
    for (const c of certs) {
      const f = await file(c.key);
      const [cert, reg] = await Promise.all([
        safe(() => readCertificate(f.bytes, mediaOf(c.name, f.type, f.bytes), c.type)),
        safe(() => readRegisterFile(f, c.name)),
      ]);
      out.certs.push({ model, name: c.name, cert: "read" in cert ? cert.read : cert, reg });
    }
    for (const e of epcs) {
      const f = await file(e.key);
      out.epcs.push({ model, name: e.name, epc: await safe(() => readEpc(f.bytes, mediaOf(e.name, f.type, f.bytes))) });
    }
    for (const d of sorter) {
      out.sorter.push({ model, name: d.name, read: await safe(() => readDroppedFile({ key: d.key, name: d.name }, { address: d.address })) });
    }
    console.log(model, "done", JSON.stringify(spent));
    fs.writeFileSync(outPath, JSON.stringify({ spent, ...out }, null, 1));
  }
})();
