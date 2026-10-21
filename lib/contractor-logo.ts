import "server-only";
import { safeUrl } from "@/lib/knowledge-links";

/**
 * THE FIRM'S LOGO, OFF THEIR WEBSITE (James, 21 Oct 2026: "We should be able
 * to attach their website, and if they do, we'll scrape the website and put
 * in the logo of the brand").
 *
 * One read of their home page, then the best picture it offers of itself:
 *
 *   1. the apple-touch-icon - a square, usually 180px, made to be shown
 *   2. a large <link rel="icon"> (96px and up, or an SVG)
 *   3. the og:image - the picture the site puts on a shared link
 *   4. any other <link rel="icon">
 *   5. /favicon.ico, if it is really there
 *
 * Each candidate is fetched to make sure it is an image before it is kept.
 * The URL is stored, not the file: a logo is not worth a copy in R2.
 *
 * A website is something somebody typed, so every fetch - the page, each
 * redirect, each candidate - goes through safeUrl (lib/knowledge-links):
 * http(s) only, ordinary ports, a name that resolves to a public address.
 * Six seconds for the lot, and the page is read no further than 1.5 MB.
 * It never throws: no logo is an answer, and the save never waits on it.
 */

const BUDGET_MS = 6_000;
const MAX_PAGE_BYTES = 1_500_000;
const MAX_HOPS = 4;
const UA = "Mozilla/5.0 (compatible; TLE-OS logo reader; +https://tle-os.co.uk)";

/** "jdplumbing.co.uk" and "www.jdplumbing.co.uk/" are both a website. */
export function websiteUrl(raw: string | null | undefined): string | null {
  const t = (raw ?? "").trim();
  if (!t) return null;
  const withScheme = /^https?:\/\//i.test(t) ? t : /^[a-z][a-z0-9+.-]*:/i.test(t) ? null : `https://${t.replace(/^\/+/, "")}`;
  if (!withScheme) return null;
  try {
    const u = new URL(withScheme);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Fetch with every hop checked, so a public page cannot forward us inside. */
async function guardedFetch(raw: string, signal: AbortSignal, accept: string): Promise<{ res: Response; url: URL } | null> {
  let url = await safeUrl(raw);
  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    const res = await fetch(url, { redirect: "manual", signal, headers: { "user-agent": UA, accept } });
    const loc = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && loc) {
      await res.body?.cancel().catch(() => {});
      url = await safeUrl(new URL(loc, url).toString());
      continue;
    }
    return { res, url };
  }
  return null;
}

/** The page, read no further than the cap: the <head> is all we want. */
async function readCapped(res: Response): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < MAX_PAGE_BYTES) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    chunks.push(value);
    size += value.byteLength;
    /* Past the head, nothing more to learn. */
    if (/<\/head>/i.test(new TextDecoder().decode(value))) break;
  }
  await reader.cancel().catch(() => {});
  const all = new Uint8Array(Math.min(size, MAX_PAGE_BYTES));
  let at = 0;
  for (const c of chunks) {
    const part = c.subarray(0, Math.max(0, all.length - at));
    all.set(part, at);
    at += part.length;
  }
  return new TextDecoder("utf-8").decode(all);
}

const attr = (tag: string, name: string) =>
  new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag)?.slice(1).find((x) => x != null) ?? null;

const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&#x2F;/gi, "/").replace(/&#47;/g, "/").trim();

/** The largest edge a sizes="" attribute promises. "any" is an SVG: as large as you like. */
function largest(sizes: string | null, href: string): number {
  if (/\.svg(\?|$)/i.test(href) || /\bany\b/i.test(sizes ?? "")) return 512;
  const nums = [...(sizes ?? "").matchAll(/(\d+)\s*x\s*(\d+)/gi)].map((m) => Math.max(Number(m[1]), Number(m[2])));
  return nums.length ? Math.max(...nums) : 0;
}

/** Candidates, best first. */
export function logoCandidates(html: string, base: URL): string[] {
  const head = /<head[\s\S]*?<\/head>/i.exec(html)?.[0] ?? html.slice(0, 200_000);
  const abs = (href: string | null) => {
    if (!href) return null;
    try {
      const u = new URL(decode(href), base);
      return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
    } catch {
      return null;
    }
  };
  const touch: { url: string; size: number }[] = [];
  const icons: { url: string; size: number }[] = [];
  for (const m of head.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    const rel = (attr(tag, "rel") ?? "").toLowerCase();
    const href = attr(tag, "href");
    const url = abs(href);
    if (!url || !href) continue;
    const size = largest(attr(tag, "sizes"), href);
    if (/apple-touch-icon/.test(rel)) touch.push({ url, size: size || 180 });
    else if (/(^|\s)icon(\s|$)/.test(rel)) icons.push({ url, size });
  }
  let og: string | null = null;
  for (const m of head.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    const key = (attr(tag, "property") ?? attr(tag, "name") ?? "").toLowerCase();
    if (key === "og:image" || key === "og:image:secure_url" || key === "og:logo") { og = og ?? abs(attr(tag, "content")); }
  }
  const bySize = (a: { size: number }, b: { size: number }) => b.size - a.size;
  touch.sort(bySize);
  icons.sort(bySize);
  const out = [
    ...touch.map((x) => x.url),
    ...icons.filter((x) => x.size >= 96).map((x) => x.url),
    ...(og ? [og] : []),
    ...icons.filter((x) => x.size < 96).map((x) => x.url),
    new URL("/favicon.ico", base).toString(),
  ];
  return [...new Set(out)];
}

/** Is it really an image? A 200 with an image type, or an .ico served as anything sensible. */
async function isImage(url: string, signal: AbortSignal): Promise<string | null> {
  try {
    const got = await guardedFetch(url, signal, "image/*,*/*;q=0.5");
    if (!got) return null;
    const { res } = got;
    const type = (res.headers.get("content-type") ?? "").toLowerCase();
    await res.body?.cancel().catch(() => {});
    if (!res.ok) return null;
    if (type.startsWith("image/")) return got.url.toString();
    if (/\.ico(\?|$)/i.test(got.url.pathname) && !/html/.test(type)) return got.url.toString();
    return null;
  } catch {
    return null;
  }
}

/**
 * The best logo their website offers, as an absolute URL, or null. Never
 * throws and never takes longer than the budget.
 */
export async function findLogo(website: string | null | undefined): Promise<string | null> {
  const start = websiteUrl(website);
  if (!start) return null;
  const signal = AbortSignal.timeout(BUDGET_MS);
  try {
    const got = await guardedFetch(start, signal, "text/html,application/xhtml+xml");
    let candidates: string[];
    if (got && got.res.ok && /html/i.test(got.res.headers.get("content-type") ?? "")) {
      candidates = logoCandidates(await readCapped(got.res), got.url);
    } else {
      await got?.res.body?.cancel().catch(() => {});
      /* No page to read, but a site may still serve its favicon. */
      candidates = [new URL("/favicon.ico", got?.url ?? new URL(start)).toString()];
    }
    for (const c of candidates.slice(0, 8)) {
      if (signal.aborted) break;
      const ok = await isImage(c, signal);
      if (ok) return ok;
    }
    return null;
  } catch {
    return null;
  }
}
