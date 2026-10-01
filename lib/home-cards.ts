/**
 * Homes as small cards, for the Homes That Fit email (Howard, 1 Oct 2026:
 * "it would be good to include photos/short description of the properties").
 *
 * Email-safe on purpose: one table per home, inline styles only, a fixed-size
 * photo with width and height attributes (Outlook ignores CSS sizing on
 * images), no grid, no flex, no classes. The photo is an absolute URL - an
 * email has no origin to resolve a relative one against.
 *
 * Client-safe: no database, so the catalogue's sample can use it too.
 */

export type CardHome = {
  name: string;
  locality?: string | null;
  rent?: number | null;
  rentPeriod?: string | null;
  image?: string | null;
  beds?: string | null;
  propertyType?: string | null;
  blurb?: string | null;
};

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 };

/**
 * "2 bedrooms", "Studio" or "Room in a shared house", read from the advert.
 * REX has no bedroom field (lib/rex-listings), so the advert's own words are
 * the only place it is written. Null when the advert does not say.
 */
export function bedsFrom(...texts: (string | null | undefined)[]): string | null {
  const t = texts.filter(Boolean).join(" ");
  if (!t) return null;
  if (/\bstudio\b/i.test(t)) return "Studio";
  const m = /\b(\d|one|two|three|four|five|six|seven)[\s-]*(?:double\s+|single\s+)?bed(?:room)?s?\b/i.exec(t);
  if (m) {
    const n = /\d/.test(m[1]) ? Number(m[1]) : WORDS[m[1].toLowerCase()];
    if (n) return n === 1 ? "1 bedroom" : `${n} bedrooms`;
  }
  if (/\b(house share|houseshare|shared house|ensuite room|room in a)\b/i.test(t)) return "Room in a shared house";
  return null;
}

/**
 * One short line about the home. The advert heading when it reads as a
 * sentence; a heading that is a pipe list ("£750 pcm | Unfurnished | ...")
 * gives way to the first sentence of the advert. Shouty notices, markdown
 * stars and long dashes are taken out, and it stops at a word near 120.
 */
export function blurbFrom(heading?: string | null, body?: string | null, max = 120): string | null {
  const clean = (s: string) =>
    s
      .replace(/\*+/g, "")
      .replace(/\s*[–—]\s*/g, " - ")
      .replace(/\s+/g, " ")
      .trim();
  const h = clean(heading ?? "");
  let pick = h && !h.includes("|") && !/^£/.test(h) && h.length >= 12 ? h : "";
  if (!pick) {
    const b = clean(body ?? "")
      /* "VIEWINGS CURRENTLY FULLY BOOKED - ..." is a notice, not a description. */
      .replace(/^[A-Z][A-Z\s]{8,}[A-Z]\b[^.]*\.\s*/, "");
    pick = (/^(.+?[.!?])(\s|$)/.exec(b)?.[1] ?? b).trim();
  }
  if (!pick) return null;
  if (pick.length <= max) return pick;
  const cut = pick.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 20)).replace(/[\s,;:.-]+$/, "")}…`;
}

/** An image URL an inbox can fetch: https, absolute, or nothing. */
function absolute(url: string | null | undefined, site?: string): string | null {
  if (!url) return null;
  if (url.startsWith("//")) return `https:${url}`;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("/") && site) return `${site.replace(/\/+$/, "")}${url}`;
  return null;
}

const FONT = "Inter,Helvetica,Arial,sans-serif";

/** The cards, one table each, stacked. `site` resolves a /path image. */
export function homeCardsHtml(homes: CardHome[], site?: string): string {
  return homes
    .map((h) => {
      const per = /week/i.test(h.rentPeriod ?? "") ? "per week" : "pcm";
      const rent = typeof h.rent === "number" && h.rent > 0 ? `£${Math.round(h.rent).toLocaleString("en-GB")} ${per}` : null;
      const img = absolute(h.image, site);
      const facts = [h.beds, h.propertyType && !(h.beds ?? "").toLowerCase().includes((h.propertyType ?? "").toLowerCase()) ? h.propertyType : null]
        .filter(Boolean)
        .join(" · ");
      const photo = img
        ? `<td width="132" valign="top" style="width:132px;padding:12px 0 12px 12px;"><img src="${esc(img)}" width="120" height="90" alt="${esc(h.name)}" style="display:block;width:120px;height:90px;object-fit:cover;border:0;outline:none;border-radius:10px;" /></td>`
        : "";
      const text = [
        rent ? `<div style="font-family:${FONT};font-size:16px;line-height:1.3;font-weight:700;color:#56423e;">${esc(rent)}</div>` : "",
        `<div style="font-family:${FONT};font-size:14px;line-height:1.4;font-weight:600;color:#3b3b3c;padding-top:2px;">${esc(h.name)}${h.locality ? `, ${esc(h.locality)}` : ""}</div>`,
        facts ? `<div style="font-family:${FONT};font-size:12.5px;line-height:1.4;color:#7a6f6b;padding-top:3px;">${esc(facts)}</div>` : "",
        h.blurb ? `<div style="font-family:${FONT};font-size:13px;line-height:1.5;color:#5b5552;padding-top:6px;">${esc(h.blurb)}</div>` : "",
      ].join("");
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:separate;border:1px solid #E7E2DD;border-radius:14px;background:#ffffff;margin:0 0 12px;"><tr>${photo}<td valign="top" style="padding:12px 14px;">${text}</td></tr></table>`;
    })
    .join("");
}
