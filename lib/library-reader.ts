import "server-only";
import crypto from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { hasDb, q } from "@/lib/db";
import { R2_BUCKET, r2Configured, withR2 } from "@/lib/r2";
import { deleteKnowledge, listKnowledge, upsertKnowledge } from "@/lib/business/knowledge-store";
import { LIBRARY_SECTION } from "@/lib/marketing-library";

/**
 * READING ON UPLOAD (James, 13 Oct 2026: "Add reading on upload so new files
 * get read").
 *
 * The 63 files already on the File Store were read by hand on 13 Oct (see
 * lib/marketing-library). This does the same for every file that arrives
 * after: when an upload finishes, the file is read in the background and
 * written up as a "Marketing library" knowledge entry in exactly the shape
 * the first 63 have - what it is, its points, when to offer it, who it is
 * for, and the file it is - so Steve can find it and hand it over.
 *
 *   - A PDF is read for its text; a PDF that is all pictures (or nearly) is
 *     sent to Claude whole, so the page images are read instead.
 *   - A picture is read as a picture.
 *   - Word, PowerPoint and video are left alone and said so on the page.
 *
 * The entry's id comes from the file's storage key, so reading a file again
 * replaces its entry rather than adding a second, and deleting the file
 * deletes the entry. How each read went (reading, couldn't, won't) is kept
 * in os_settings "library_reads" for the File storage page; a file with an
 * entry needs no note - the entry is the proof.
 */

const MODEL = "claude-sonnet-5-5";
const SHELF = "library/shelf/";
/** Claude takes a PDF up to 32MB and 100 pages; past that it's text only. */
const MAX_DOC_BYTES = 30 * 1024 * 1024;
/** Images go in under 5MB. */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
/** Less text than this and the PDF is pictures: read the pages instead. */
const THIN_TEXT = 500;
const SETTINGS_KEY = "library_reads";

export type ReadNote = { state: "reading" | "failed" | "skipped"; at: string; note?: string };

export const libraryEntryId = (key: string) => "library-" + crypto.createHash("sha1").update(key).digest("hex").slice(0, 12);

/** "<timestamp>-5_Renters Rights Act FAQ.pdf" -> "Renters Rights Act FAQ.pdf", as lib/library-files does. */
export const shelfName = (key: string) => key.slice(SHELF.length).replace(/^\d+-/, "").replace(/^\d{1,3}_/, "");

const noDashes = (s: string) => s.replace(/[—–]/g, "-");

async function note(key: string, n: ReadNote | null) {
  if (!hasDb()) return;
  /* One key at a time inside the JSON, so two uploads finishing together
     don't write over each other's note. */
  if (n) {
    await q(
      `INSERT INTO os_settings (key, value, updated_at, updated_by) VALUES ($1, jsonb_build_object($2::text, $3::jsonb), NOW(), 'library-reader')
       ON CONFLICT (key) DO UPDATE SET value = os_settings.value || jsonb_build_object($2::text, $3::jsonb), updated_at = NOW()`,
      [SETTINGS_KEY, key, JSON.stringify(n)]
    ).catch((e) => console.error("library read note failed", e));
  } else {
    await q(`UPDATE os_settings SET value = value - $2::text, updated_at = NOW() WHERE key = $1`, [SETTINGS_KEY, key]).catch(() => null);
  }
}

export async function readNotes(): Promise<Record<string, ReadNote>> {
  if (!hasDb()) return {};
  const rows = await q<{ value: Record<string, ReadNote> | null }>(`SELECT value FROM os_settings WHERE key = $1`, [SETTINGS_KEY]).catch(() => []);
  return rows[0]?.value ?? {};
}

/** The storage keys that already have an entry. */
export async function readKeys(): Promise<Set<string>> {
  const all = await listKnowledge().catch(() => []);
  const keys = new Set<string>();
  for (const e of all) {
    if (e.section !== LIBRARY_SECTION) continue;
    const k = e.content.match(/^File key:\s*(.+)$/m)?.[1]?.trim();
    if (k) keys.add(k);
  }
  return keys;
}

async function pdfText(buf: Buffer): Promise<string> {
  /* As lib/hmo: the package's index.js runs a self-test under bundling, so
     the library entry is imported directly. */
  const pdf = (await import("pdf-parse/lib/pdf-parse.js")).default as unknown as (
    data: Buffer,
    opts?: { pagerender?: (page: { getTextContent: () => Promise<{ items: Array<{ str: string }> }> }) => Promise<string> }
  ) => Promise<{ text: string }>;
  const out = await pdf(buf, {
    pagerender: (page) => page.getTextContent().then((tc) => tc.items.map((i) => i.str).join(" ")),
  });
  return out.text.replace(/\s+/g, " ").trim();
}

const kind = (name: string, type: string) => {
  const n = name.toLowerCase();
  if (type === "application/pdf" || n.endsWith(".pdf")) return "pdf";
  const img = type.match(/^image\/(jpeg|png|webp|gif)$/)?.[1] ?? n.match(/\.(jpe?g|png|webp|gif)$/)?.[1];
  if (img) return `image/${img === "jpg" ? "jpeg" : img}`;
  return null;
};

function prompt(name: string, text: string | null) {
  return `${text === null ? `Attached is "${name}"` : `Below is the full text of "${name}"`}, a document in The Letting Experts' marketing File Store (The Letting Experts is a UK lettings franchise; The Marketing Experts / TME and ESD are its marketing arm). Write the entry the TLE OS assistant, Steve, will use to know what is in it and when to hand it to someone.

Answer with JSON only:
{"title": a clean title (Title Case, no file extension),
 "audience": "landlord" | "tenant" | "agent",  (who reads it: a landlord-facing guide, a tenant-facing one, or a partner/agent's own marketing or business material)
 "region": "England and Wales" | "Scotland" | "UK",
 "what": one or two plain sentences on what it is,
 "points": 5 to 9 short bullet strings with the specific substance (rules, numbers, steps, names) someone would ask about,
 "offerWhen": one sentence: the questions or moments when Steve should offer this file}
UK English, no em dashes.${text === null ? "" : `\n\nTEXT:\n${text}`}`;
}

type WriteUp = { title: string; audience: string; region: string; what: string; points: string[]; offerWhen: string };

const WHO: Record<string, string> = { landlord: "Landlords", tenant: "Tenants", agent: "Partners (internal marketing)" };

/**
 * Read one File Store file and write (or rewrite) its library entry. Never
 * throws: how it went is left on the file's note for the page to show.
 */
export async function readLibraryFile(key: string, by = "Steve read it on upload"): Promise<{ ok: boolean; note: string }> {
  const done = async (state: ReadNote["state"], text: string) => {
    await note(key, { state, at: new Date().toISOString(), note: text });
    return { ok: false, note: text };
  };
  try {
    if (!key.startsWith(SHELF) || key.includes("..")) return { ok: false, note: "That isn't a File Store file." };
    if (!r2Configured) return done("failed", "Storage isn't configured here.");
    if (!process.env.ANTHROPIC_API_KEY) return done("failed", "Steve has no key to read with on this environment.");
    await note(key, { state: "reading", at: new Date().toISOString() });

    const got = await withR2(async (c) => {
      const res = await c.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }));
      const bytes = await res.Body?.transformToByteArray();
      return { bytes, type: res.ContentType ?? "", original: res.Metadata?.["original-name"] ?? null };
    });
    if (!got.bytes?.byteLength) return done("failed", "The stored file came back empty.");
    const name = shelfName(key) || got.original || key;
    const what = kind(name, got.type);
    if (!what) return done("skipped", "Steve reads PDFs and pictures. Word, PowerPoint and video aren't read.");

    const buf = Buffer.from(got.bytes);
    let content: Anthropic.ContentBlockParam[];
    if (what === "pdf") {
      const text = await pdfText(buf).catch(() => "");
      if (text.length >= THIN_TEXT) {
        content = [{ type: "text", text: prompt(name, text.slice(0, 60_000)) }];
      } else if (buf.byteLength <= MAX_DOC_BYTES) {
        content = [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: buf.toString("base64") } },
          { type: "text", text: prompt(name, null) },
        ];
      } else {
        return done("failed", "It's all pictures and too big to read the pages (over 30MB).");
      }
    } else {
      if (buf.byteLength > MAX_IMAGE_BYTES) return done("skipped", "Pictures over 5MB aren't read.");
      content = [
        { type: "image", source: { type: "base64", media_type: what as "image/jpeg", data: buf.toString("base64") } },
        { type: "text", text: prompt(name, null) },
      ];
    }

    const r = await new Anthropic().messages.create({ model: MODEL, max_tokens: 1500, messages: [{ role: "user", content }] });
    const raw = r.content.map((c) => (c.type === "text" ? c.text : "")).join("");
    const w = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) as WriteUp;
    if (!w.title || !w.what) return done("failed", "Steve couldn't make sense of it.");

    await upsertKnowledge({
      id: libraryEntryId(key),
      title: noDashes(w.title),
      section: LIBRARY_SECTION,
      content: noDashes(
        [
          w.what,
          "",
          ...(w.points ?? []).map((p) => `- ${p}`),
          "",
          `Offer it when: ${w.offerWhen ?? ""}`,
          `For: ${WHO[w.audience] ?? w.audience} · ${w.region}`,
          `File: ${name}`,
          `File key: ${key}`,
        ].join("\n")
      ),
      updatedBy: by,
    });
    await note(key, null);
    return { ok: true, note: `Read: ${noDashes(w.title)}` };
  } catch (e) {
    console.error("library read failed", key, e);
    const msg = e instanceof Error ? e.message : String(e);
    return done("failed", /page|too large|exceed/i.test(msg) ? "Too long for Steve to read in one go." : "Steve couldn't read it. Try Read now.");
  }
}

/** A deleted file takes its write-up with it. */
export async function forgetLibraryFile(key: string) {
  await deleteKnowledge(libraryEntryId(key)).catch(() => false);
  await note(key, null);
}
