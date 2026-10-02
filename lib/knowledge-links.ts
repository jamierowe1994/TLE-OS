import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { upsertKnowledge, listKnowledge, type KnowledgeEntry } from "@/lib/business/knowledge-store";
import { noDashes } from "@/lib/no-dashes";

/**
 * FEED STEVE LINKS (James, 2 Oct 2026): "a section in Steve's knowledge where
 * I can feed it links. It should then read and save to memory recent articles
 * and legislation ... so we can keep him up to date with the most recent laws
 * ... increasing his knowledge base about lettings in the UK."
 *
 * Each link is fetched once, read, summarised for a lettings agency and kept
 * as a knowledge entry under "Law and news" - so it is in Steve's prompt on
 * the very next question, and editable on /knowledge like anything else. The
 * source and the day it was read are written into the entry, because a summary
 * of the law with no date or source is worse than none.
 *
 * Fetching a URL somebody typed is the classic way into a private network, so
 * only http(s) on the default ports, to a name that resolves to a public
 * address, with a size and time limit.
 */

export const LAW_SECTION = "Law and news";
const MODEL = "claude-opus-4-8";
const MAX_BYTES = 3_000_000;
const MAX_TEXT = 60_000;

export type LinkResult = { url: string; ok: true; id: string; title: string; updated: boolean } | { url: string; ok: false; error: string };

function privateAddress(ip: string): boolean {
  if (ip === "::1" || ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe80")) return true;
  const m = ip.replace(/^::ffff:/, "").split(".").map(Number);
  if (m.length !== 4) return false;
  const [a, b] = m;
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

async function safeUrl(raw: string): Promise<URL> {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    throw new Error("That isn't a link.");
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("Only web links (http or https).");
  if (u.port && u.port !== "80" && u.port !== "443") throw new Error("Only ordinary web links.");
  if (u.username || u.password) throw new Error("Links with a password in them are not read.");
  const host = u.hostname;
  if (/^(localhost|.*\.local|.*\.internal)$/i.test(host)) throw new Error("That address is inside a network, not on the web.");
  const ips = isIP(host) ? [host] : (await lookup(host, { all: true })).map((r) => r.address);
  if (!ips.length || ips.some(privateAddress)) throw new Error("That address is inside a network, not on the web.");
  return u;
}

/** The words of a page: no scripts, styles, menus or markup. */
function readable(html: string): { title: string; published: string | null; text: string } {
  const meta = (name: string) =>
    new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']+)["']`, "i").exec(html)?.[1] ??
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${name}["']`, "i").exec(html)?.[1] ??
    null;
  const title = meta("og:title") ?? /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() ?? "";
  const published = meta("article:published_time") ?? meta("DC.date.issued") ?? meta("date") ?? null;
  const body = (/<main[\s\S]*?<\/main>/i.exec(html)?.[0] ?? /<article[\s\S]*?<\/article>/i.exec(html)?.[0] ?? html)
    .replace(/<(script|style|noscript|svg|nav|footer|header|form|aside)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
  return { title: title.replace(/\s+/g, " "), published, text: body.slice(0, MAX_TEXT) };
}

async function fetchPage(u: URL): Promise<{ title: string; published: string | null; text: string }> {
  const res = await fetch(u, {
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
    headers: { "user-agent": "TLE-OS knowledge reader (+https://tle-os.co.uk)", accept: "text/html,application/xhtml+xml" },
  });
  /* One redirect, checked like the original - a public page that forwards to
     a private address must not get through. */
  if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
    const next = await safeUrl(new URL(res.headers.get("location")!, u).toString());
    return fetchPage(next);
  }
  if (!res.ok) throw new Error(`The page answered ${res.status}.`);
  const type = res.headers.get("content-type") ?? "";
  if (!/html|text\/plain/i.test(type)) throw new Error(type.includes("pdf") ? "That's a PDF - save it to the File Store instead, and Steve can hand it out from there." : "That isn't a web page.");
  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_BYTES) throw new Error("That page is too large to read.");
  const html = new TextDecoder("utf-8").decode(buf);
  const page = /html/i.test(type) ? readable(html) : { title: "", published: null, text: html.slice(0, MAX_TEXT) };
  if (page.text.length < 200) throw new Error("There wasn't enough text on that page to read.");
  return page;
}

async function summarise(url: string, page: { title: string; published: string | null; text: string }): Promise<{ title: string; summary: string }> {
  const client = new Anthropic();
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 1400,
    system:
      "You read articles, guidance and legislation for The Letting Experts, a UK lettings and property management agency, and write them up for the agency's knowledge base, which their assistant answers staff from. UK English. No em dashes. Plain, factual, no hype. Never invent a date, figure or rule that is not in the text.",
    messages: [
      {
        role: "user",
        content:
          `Source: ${url}\nPage title: ${page.title || "(none)"}\nPublished: ${page.published ?? "not stated on the page"}\n\n--- PAGE TEXT ---\n${page.text}\n--- END ---\n\n` +
          `Reply with JSON only: {"title": "...", "summary": "..."}.\n` +
          `title: a short plain heading for the knowledge base (under 80 characters).\n` +
          `summary: what it is and when (published or in force), what changes, who it affects (landlords, tenants, agents), what an agent must now do or say, key dates and penalties, and anything still uncertain. Short paragraphs and dashes for lists. 150 to 450 words. If the page is not about lettings, property or the law around it, say so in one line.`,
      },
    ],
  });
  const text = res.content.filter((c): c is Anthropic.TextBlock => c.type === "text").map((c) => c.text).join("");
  const json = /\{[\s\S]*\}/.exec(text)?.[0];
  if (!json) throw new Error("Steve couldn't write that one up.");
  const out = JSON.parse(json) as { title?: string; summary?: string };
  if (!out.title || !out.summary) throw new Error("Steve couldn't write that one up.");
  return { title: noDashes(out.title).slice(0, 120), summary: noDashes(out.summary) };
}

/** Read each link and keep it. A link already read is refreshed, not doubled. */
export async function readLinks(urls: string[], by: string): Promise<LinkResult[]> {
  const unique = [...new Set(urls.map((u) => u.trim()).filter(Boolean))].slice(0, 10);
  const existing: KnowledgeEntry[] = await listKnowledge().catch(() => []);
  const out: LinkResult[] = [];
  for (const raw of unique) {
    try {
      const u = await safeUrl(raw);
      const page = await fetchPage(u);
      const { title, summary } = await summarise(u.toString(), page);
      const read = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" });
      const source = `Source: ${u.toString()}${page.published ? ` (published ${page.published.slice(0, 10)})` : ""}. Read by Steve on ${read}.`;
      const already = existing.find((e) => e.section === LAW_SECTION && e.content.includes(`Source: ${u.toString()}`));
      const entry = await upsertKnowledge({ id: already?.id ?? null, title, content: `${summary}\n\n${source}`, section: LAW_SECTION, updatedBy: by });
      out.push({ url: raw, ok: true, id: entry.id, title: entry.title, updated: Boolean(already) });
    } catch (e) {
      out.push({ url: raw, ok: false, error: e instanceof Error ? e.message : "Couldn't read that one." });
    }
  }
  return out;
}
