import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { hasDb, q } from "@/lib/db";

/**
 * WHAT HAPPENED TO A NEWSLETTER (1 Oct 2026, Francesca).
 *
 * Opens and clicks are counted by the OS itself, not by Resend: every copy
 * carries its own token in a one-pixel picture (an open) and in each link,
 * which goes through /nl/c/<token> on its way to the real address (a click).
 * Nothing to switch on in Resend, and the figures sit beside the email.
 *
 * Delivered and bounced come from Resend's webhook (app/api/resend/webhook),
 * matched on the id Resend gave each copy. Our key can only send, so the OS
 * cannot ask Resend afterwards; Resend has to tell us.
 *
 * Opens are a soft number and the screen says so: Apple Mail loads every
 * picture as the email arrives (an open whether read or not), and Outlook
 * blocks pictures until asked (a read with no open). Clicks are the honest
 * figure.
 *
 * A click link is signed, so /nl/c cannot be used to bounce somebody to an
 * address that was never in the email.
 */

export function newTrackToken(): string {
  return randomBytes(16).toString("base64url");
}

function sign(token: string, url: string): string {
  const secret = process.env.AUTH_SECRET || "dev-only-secret-not-for-production";
  return createHmac("sha256", secret).update(`${token}|${url}`).digest("base64url").slice(0, 24);
}

export function validClick(token: string, url: string, sig: string): boolean {
  if (!token || !url || !sig) return false;
  const a = Buffer.from(sign(token, url));
  const b = Buffer.from(sig);
  return a.length === b.length && timingSafeEqual(a, b);
}

/* Only <a> tags: the font stylesheet's <link href> must load as it is, never counted as a click. */
const ANCHOR_HREF = /(<a\b[^>]*?\shref=")(https?:\/\/[^"]+)"/gi;

/** Every web link in the email, in order, once each. mailto and tel are left alone. */
export function linksIn(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(ANCHOR_HREF)) {
    const url = m[2].replace(/&amp;/g, "&");
    if (!out.includes(url)) out.push(url);
  }
  return out;
}

/** One recipient's copy, with the open pixel and every web link routed through us. */
export function trackHtml(html: string, token: string, origin: string): string {
  const base = origin.replace(/\/+$/, "");
  const linked = html.replace(ANCHOR_HREF, (_all, head: string, raw: string) => {
    const url = raw.replace(/&amp;/g, "&");
    if (url.startsWith(`${base}/nl/`)) return `${head}${raw}"`;
    const to = `${base}/nl/c/${token}?u=${encodeURIComponent(url)}&s=${sign(token, url)}`;
    return `${head}${to.replace(/&/g, "&amp;")}"`;
  });
  const pixel = `<img src="${base}/nl/o/${token}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;opacity:0;" />`;
  return /<\/body>/i.test(linked) ? linked.replace(/<\/body>/i, `${pixel}</body>`) : `${linked}${pixel}`;
}

export async function recordOpen(token: string): Promise<void> {
  if (!hasDb() || !token) return;
  await q(
    `update os_newsletter_sends set opens = opens + 1, opened_at = coalesce(opened_at, now()) where token = $1`,
    [token]
  ).catch(() => null);
}

/** Counts the click and says where to send them; null if the link was never in the email. */
export async function recordClick(token: string, url: string, sig: string): Promise<string | null> {
  if (!validClick(token, url, sig)) return null;
  if (!hasDb()) return url;
  const rows = await q<{ newsletter_id: string; email: string }>(
    `update os_newsletter_sends
        set clicks = clicks + 1, clicked_at = coalesce(clicked_at, now()),
            opens = greatest(opens, 1), opened_at = coalesce(opened_at, now())
      where token = $1 returning newsletter_id, email`,
    [token]
  ).catch(() => []);
  /* A click is also an open: somebody who clicked read it, even with pictures off. */
  if (rows[0]) {
    await q(`insert into os_newsletter_clicks (newsletter_id, email, url) values ($1, $2, $3)`, [rows[0].newsletter_id, rows[0].email, url]).catch(() => null);
  }
  return url;
}

export type NewsletterResults = {
  /** False for an email that went before tracking began: no opens or clicks to show. */
  tracked: boolean;
  /** Whether Resend has ever told us about any newsletter - i.e. the webhook is set up. */
  deliveryLinked: boolean;
  total: number;
  sent: number;
  failed: number;
  queued: number;
  delivered: number;
  bounced: number;
  opened: number;
  clicked: number;
  opens: number;
  clicks: number;
  links: { url: string; clicks: number; people: number }[];
  people: {
    name: string;
    email: string;
    state: string;
    error: string | null;
    sentAt: string | null;
    delivered: boolean;
    bounced: string | null;
    openedAt: string | null;
    opens: number;
    clickedAt: string | null;
    clicks: number;
  }[];
};

export async function newsletterResults(id: string): Promise<NewsletterResults> {
  const rows = await q<{
    name: string; email: string; state: string; error: string | null; sent_at: Date | null; token: string | null;
    delivered_at: Date | null; bounced_at: Date | null; bounce_reason: string | null; opened_at: Date | null; opens: number; clicked_at: Date | null; clicks: number;
  }>(
    `select name, email, state, error, sent_at, token, delivered_at, bounced_at, bounce_reason, opened_at, opens, clicked_at, clicks
       from os_newsletter_sends where newsletter_id = $1 order by name, email`,
    [id]
  );
  const links = await q<{ url: string; clicks: string; people: string }>(
    `select url, count(*)::text as clicks, count(distinct email)::text as people
       from os_newsletter_clicks where newsletter_id = $1 group by url order by count(*) desc`,
    [id]
  ).catch(() => []);
  const linked = await q<{ n: string }>(
    `select count(*)::text as n from os_newsletter_sends where delivered_at is not null or bounced_at is not null`
  ).catch(() => [{ n: "0" }]);
  const iso = (d: Date | null) => (d ? new Date(d).toISOString() : null);
  return {
    tracked: rows.some((r) => r.token),
    deliveryLinked: Number(linked[0]?.n ?? 0) > 0,
    total: rows.length,
    sent: rows.filter((r) => r.state === "sent").length,
    failed: rows.filter((r) => r.state === "failed").length,
    queued: rows.filter((r) => r.state === "queued").length,
    delivered: rows.filter((r) => r.delivered_at).length,
    bounced: rows.filter((r) => r.bounced_at).length,
    opened: rows.filter((r) => r.opened_at).length,
    clicked: rows.filter((r) => r.clicked_at).length,
    opens: rows.reduce((n, r) => n + (r.opens || 0), 0),
    clicks: rows.reduce((n, r) => n + (r.clicks || 0), 0),
    links: links.map((l) => ({ url: l.url, clicks: Number(l.clicks), people: Number(l.people) })),
    people: rows.map((r) => ({
      name: r.name,
      email: r.email,
      state: r.state,
      error: r.error,
      sentAt: iso(r.sent_at),
      delivered: Boolean(r.delivered_at),
      bounced: r.bounced_at ? r.bounce_reason || "Bounced" : null,
      openedAt: iso(r.opened_at),
      opens: r.opens || 0,
      clickedAt: iso(r.clicked_at),
      clicks: r.clicks || 0,
    })),
  };
}

/** Does each link in the email actually open? Asked of the live address, a few seconds each. */
export async function checkLinks(urls: string[]): Promise<{ url: string; ok: boolean; status: number | null; note: string }[]> {
  const one = async (url: string) => {
    const attempt = async (method: "HEAD" | "GET") => {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 9000);
      try {
        return await fetch(url, { method, redirect: "follow", signal: ctl.signal, headers: { "user-agent": "Mozilla/5.0 (TLE OS link check)" } });
      } finally {
        clearTimeout(t);
      }
    };
    try {
      let r = await attempt("HEAD");
      /* Plenty of sites refuse HEAD but open fine. */
      if (r.status === 405 || r.status === 403 || r.status === 404) r = await attempt("GET");
      const ok = r.status < 400;
      return { url, ok, status: r.status, note: ok ? "Opens" : `The site answered ${r.status}` };
    } catch (e) {
      const timedOut = e instanceof Error && e.name === "AbortError";
      return { url, ok: false, status: null, note: timedOut ? "Didn't answer in time" : "Couldn't be reached" };
    }
  };
  return Promise.all(urls.slice(0, 40).map(one));
}

/** Resend's word on one copy, from its webhook. */
export async function recordDelivery(resendId: string, event: string, reason?: string): Promise<boolean> {
  if (!hasDb() || !resendId) return false;
  if (event === "email.delivered") {
    const r = await q(`update os_newsletter_sends set delivered_at = coalesce(delivered_at, now()) where resend_id = $1 returning 1`, [resendId]);
    return r.length > 0;
  }
  if (event === "email.bounced" || event === "email.complained") {
    const why = event === "email.complained" ? "Marked as spam" : reason || "Bounced";
    const r = await q(`update os_newsletter_sends set bounced_at = coalesce(bounced_at, now()), bounce_reason = $2 where resend_id = $1 returning 1`, [resendId, why.slice(0, 300)]);
    return r.length > 0;
  }
  return false;
}
