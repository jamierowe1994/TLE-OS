import "server-only";
import { hasDb, q } from "@/lib/db";

/**
 * EACH PERSON'S OWN EMAIL FOOTER, UNDER THE MAIL THE OS SENDS FOR THEM.
 *
 * James, 21 Sep 2026: "We need to add email footers to any emails that are
 * going out from the agent... they send a blank email, we take that image and
 * put it onto their account."
 *
 * ── How the blank email works, and why there is no inbox to send it to ─────
 *
 * The version James had seen elsewhere has people mail a special address. That
 * needs an inbound mailbox, a parser and a way to know who wrote. We need none
 * of it: every person has already let the OS read their own mailbox
 * (Mail.Read, lib/microsoft). So they send a blank email TO THEMSELVES with
 * "footer" in the subject, Outlook puts their signature on it as it does on
 * everything, and the OS reads that one message out of their own mailbox. Who
 * it belongs to is not inferred from a From line - it is whoever's mailbox it
 * was found in.
 *
 * ── The pictures travel inside the mail ───────────────────────────────────
 *
 * A signature's logo is an inline attachment (cid:...), not a link. It is kept
 * that way: stored beside the HTML and sent as an inline attachment on every
 * mail, which is exactly what their own Outlook does. A linked picture is
 * hidden by Outlook until somebody presses "download pictures"; an inline one
 * is simply there.
 *
 * ── What is refused ───────────────────────────────────────────────────────
 *
 * The HTML came out of an email, so it is treated as untrusted even though it
 * is their own: scripts, frames, forms and event handlers are stripped, and
 * the whole thing is capped. This goes under mail to landlords and tenants.
 */

const GRAPH = "https://graph.microsoft.com/v1.0";

/** A signature is a few lines and a logo. Past this it is not a signature. */
const MAX_HTML = 60_000;
/* Was 6 (21 Sep 2026). Howard's real signature, 24 Sep, has 18: three contact
   icons, social badges, nine award tiles and a banner. The first six were kept
   and the other twelve went out as broken-picture boxes. A banner-and-badges
   signature is normal, so the cap is by total weight, not by count alone. */
const MAX_IMAGES = 30;
const MAX_IMAGE_BYTES = 600 * 1024;
/** All the pictures together. Graph refuses a send much past 4MB. */
const MAX_TOTAL_BYTES = 2_500 * 1024;
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

export interface FooterImage {
  /** The content id the HTML refers to as cid:<this>. */
  cid: string;
  mime: string;
  /** Base64, as Graph gives it and wants it back. */
  data: string;
}

export interface EmailFooter {
  html: string;
  images: FooterImage[];
  source: "mailbox" | "upload";
  updatedAt: string;
}

export async function footerFor(userId: string): Promise<EmailFooter | null> {
  if (!hasDb()) return null;
  const rows = await q<{ html: string; images: FooterImage[]; source: string; updated_at: Date }>(
    `select html, images, source, updated_at from os_email_footers where user_id = $1`,
    [userId]
  ).catch(() => []);
  const r = rows[0];
  if (!r) return null;
  const images = Array.isArray(r.images) ? r.images : [];
  return {
    html: withoutMissingPictures(r.html, images),
    images,
    source: r.source === "upload" ? "upload" : "mailbox",
    updatedAt: new Date(r.updated_at).toISOString(),
  };
}

async function save(userId: string, f: { html: string; images: FooterImage[]; source: "mailbox" | "upload" }): Promise<void> {
  await q(
    `insert into os_email_footers (user_id, html, images, source, updated_at) values ($1,$2,$3,$4,now())
     on conflict (user_id) do update set html = excluded.html, images = excluded.images,
       source = excluded.source, updated_at = now()`,
    [userId, f.html, JSON.stringify(f.images), f.source]
  );
}

export async function removeFooter(userId: string): Promise<void> {
  if (!hasDb()) return;
  await q(`delete from os_email_footers where user_id = $1`, [userId]);
}

/** The inside of <body>, with everything that could run or phone home taken out. */
export function cleanFooterHtml(raw: string): string {
  let h = raw;
  const body = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(h);
  if (body) h = body[1];
  h = h
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|iframe|object|embed|form|link|meta|base|svg)\b[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<(script|style|iframe|object|embed|form|link|meta|base|input|button)\b[^>]*\/?>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|src)\s*=\s*("|')\s*(javascript|vbscript|data:text)[^"']*\2/gi, '$1="#"');
  /* A blank email opens with the empty lines the cursor sat on. Off the top. */
  h = h.replace(/^(\s|<br\s*\/?>|<(p|div)[^>]*>(\s|&nbsp;|<br\s*\/?>)*<\/\2>)+/i, "");
  return h.trim();
}

/**
 * Takes out any picture the footer points at but we do not hold. Left in, it
 * is a broken-picture box under a customer's email. Applied on read, so a
 * footer saved before the cap was raised stops showing boxes straight away.
 */
function withoutMissingPictures(html: string, images: FooterImage[]): string {
  const held = new Set(images.map((i) => i.cid.toLowerCase()));
  return html.replace(/<img\b[^>]*\bsrc\s*=\s*("|')cid:([^"']+)\1[^>]*>/gi, (tag, _q, cid: string) =>
    held.has(cid.toLowerCase()) ? tag : ""
  );
}

/** Is there anything here a person would recognise as a footer? */
function hasSubstance(html: string): boolean {
  const text = html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").trim();
  return text.length >= 3 || /<img\b/i.test(html);
}

export type FindResult =
  | { ok: true; footer: EmailFooter }
  | { ok: false; reason: "not_found" | "empty" | "too_big" | "refused"; detail: string };

/**
 * Look in the person's own mailbox for the blank email they sent themselves.
 *
 * The last day's mail, newest first; the first one FROM them with "footer" or
 * "signature" in the subject. Read from the inbox and from Sent Items, because
 * a mail to yourself lands in both and either can arrive first.
 *
 * The caller brings the Graph token (msAccessTokenFor). Not fetched here, so
 * that lib/microsoft can use this file to sign its sends without the two
 * importing each other.
 */
export async function findFooterInMailbox(userId: string, ownEmail: string, token: string): Promise<FindResult> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const me = ownEmail.trim().toLowerCase();

  type Msg = { id: string; subject: string | null; from?: { emailAddress?: { address?: string } }; body?: { content?: string }; hasAttachments?: boolean };
  let found: Msg | null = null;
  for (const folder of ["sentitems", "inbox"]) {
    const url =
      `${GRAPH}/me/mailFolders/${folder}/messages?$top=30&$orderby=receivedDateTime desc` +
      `&$filter=${encodeURIComponent(`receivedDateTime ge ${since}`)}&$select=id,subject,from,body,hasAttachments`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Prefer: 'outlook.body-content-type="html"' }, cache: "no-store" });
    if (!res.ok) {
      return { ok: false, reason: "refused", detail: `Microsoft wouldn't let us look (${res.status}).` };
    }
    const j = (await res.json()) as { value?: Msg[] };
    found =
      (j.value ?? []).find(
        (m) =>
          /footer|signature/i.test(m.subject ?? "") &&
          /* Sent Items is theirs by definition. In the inbox it must be FROM
             them: anybody can write "footer" in a subject line, and this goes
             under mail to customers. */
          (folder === "sentitems" || (m.from?.emailAddress?.address ?? "").toLowerCase() === me)
      ) ?? null;
    if (found) break;
  }
  if (!found) {
    return { ok: false, reason: "not_found", detail: "No email from you with \"footer\" in the subject in the last day." };
  }

  const html = cleanFooterHtml(found.body?.content ?? "");
  if (!hasSubstance(html)) {
    return { ok: false, reason: "empty", detail: "That email had no signature on it. In Outlook, check a signature is set for new messages, then send it again." };
  }
  if (html.length > MAX_HTML) {
    return { ok: false, reason: "too_big", detail: "That email is too long to be a footer. Send a blank one with only your signature on it." };
  }

  const images: FooterImage[] = [];
  if (/cid:/i.test(html)) {
    /* Every page of them: $top was 20, and a signature can carry more. */
    type Att = { contentId?: string | null; contentType?: string; contentBytes?: string; size?: number };
    let next: string | null = `${GRAPH}/me/messages/${found.id}/attachments?$top=50`;
    let total = 0;
    for (let page = 0; next && page < 5; page++) {
      const res: Response = await fetch(next, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      if (!res.ok) break;
      const j = (await res.json()) as { value?: Att[]; "@odata.nextLink"?: string };
      for (const a of j.value ?? []) {
        const cid = (a.contentId ?? "").replace(/^<|>$/g, "");
        const mime = (a.contentType ?? "").toLowerCase();
        if (!cid || !a.contentBytes || !IMAGE_TYPES.includes(mime)) continue;
        const bytes = a.size ?? Math.ceil((a.contentBytes.length * 3) / 4);
        if (bytes > MAX_IMAGE_BYTES || images.length >= MAX_IMAGES || total + bytes > MAX_TOTAL_BYTES) continue;
        /* Only pictures the footer actually shows. */
        if (!html.toLowerCase().includes(`cid:${cid.toLowerCase()}`)) continue;
        images.push({ cid, mime, data: a.contentBytes });
        total += bytes;
      }
      next = j["@odata.nextLink"] ?? null;
    }
  }

  await save(userId, { html, images, source: "mailbox" });
  const footer = await footerFor(userId);
  return footer ? { ok: true, footer } : { ok: false, reason: "refused", detail: "It was found but would not save." };
}

/** The other road: one picture of the footer, uploaded. */
export async function saveFooterImage(userId: string, mime: string, base64: string): Promise<EmailFooter | null> {
  if (!IMAGE_TYPES.includes(mime)) return null;
  if (Math.ceil((base64.length * 3) / 4) > MAX_IMAGE_BYTES) return null;
  const cid = "os-footer-image";
  await save(userId, {
    html: `<img src="cid:${cid}" alt="" style="max-width:100%;height:auto;border:0;display:block">`,
    images: [{ cid, mime, data: base64 }],
    source: "upload",
  });
  return footerFor(userId);
}

/** For showing it on a screen: the cid pictures become data URLs. Never for sending. */
export function footerPreviewHtml(f: EmailFooter): string {
  return f.images.reduce(
    (h, img) => h.split(`cid:${img.cid}`).join(`data:${img.mime};base64,${img.data}`),
    f.html
  );
}

/** Where a designed mail wants the footer: lib/email/render.js leaves this above its small print. */
const MARKER = "<!--os-agent-footer-->";

/**
 * The footer, put under a mail.
 *
 * A mail built by our block renderer says where it goes - under the words and
 * the sign-off, above the small print, inside the card - and it is put there,
 * left-aligned like the words above it.
 *
 * Anything else gets it after everything, inside <body> when there is one, in
 * its own 600-wide white panel: our other designed mails sit on a coloured
 * ground, and a signature written for a white page is unreadable on one.
 */
export function withFooter(html: string, f: EmailFooter): string {
  const type = "font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;color:#1f1a17;text-align:left";
  if (html.includes(MARKER)) {
    return html.replace(MARKER, `<div style="padding:6px 0 20px;${type}">${f.html}</div>`);
  }
  const block =
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%"><tr><td align="center" style="padding:16px 12px 24px">` +
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:#ffffff;border-radius:12px"><tr>` +
    `<td align="left" style="padding:20px 24px;${type}">${f.html}</td>` +
    `</tr></table></td></tr></table>`;
  return /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${block}</body>`) : `${html}${block}`;
}
