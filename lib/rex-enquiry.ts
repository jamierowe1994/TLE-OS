import { rexCall } from "@/lib/rex";

/**
 * A tenant's enquiry in full (James, 11 Sep 2026: "the first thing we should
 * see is their enquiry").
 *
 * REX's lead search hands back only `body_snippet` - the first 100 characters
 * - and refuses to return more. The whole email the portal sent is on the
 * lead itself (`plain_body`), one read per lead. Measured on 8 recent
 * enquiries: the snippet was cut short on all 8, the longest full body ran to
 * 1,038 characters. READ-ONLY: this only ever calls Leads/read.
 *
 * The portals (Rightmove, OnTheMarket, Orca, our own form) all write
 * "Label: value" lines - Name, Email Address, Phone Default, Property
 * Address, ListingLink, External Listing Id - and the applicant's own words
 * after "Message:". We keep both: the message as they wrote it, and the
 * labelled facts for the details card.
 */

/** Bumped whenever the parsing changes, so enquiries read by an older
 *  parser are read again (the first one missed OnTheMarket's HTML-only
 *  messages and saved them as empty). */
export const ENQUIRY_VERSION = 2;

export type Enquiry = {
  /** Their own words, in full. Empty when the portal sent none. */
  message: string;
  /** Every "Label: value" line the portal sent, in order. */
  fields: Array<[string, string]>;
  /** When REX received it, ISO. */
  receivedAt: string | null;
  /** Where it came from - "Rightmove", "OnTheMarket". */
  source: string | null;
};

const LABEL = /^\s*([A-Z][A-Za-z '\/()-]{1,40}):\s*(.*)$/;

/** Split a portal email into the message and its labelled fields. */
export function parseEnquiry(plain: string): { message: string; fields: Array<[string, string]> } {
  const lines = plain.replace(/\r\n?/g, "\n").split("\n");
  const fields: Array<[string, string]> = [];
  let message = "";
  for (let i = 0; i < lines.length; i++) {
    const m = LABEL.exec(lines[i]);
    if (!m) continue;
    const label = m[1].trim();
    if (/^message$/i.test(label)) {
      /* The message runs from here to the next labelled line or the end, and
         can be several paragraphs. */
      const rest = [m[2]];
      for (let j = i + 1; j < lines.length; j++) {
        if (LABEL.test(lines[j]) && !/^\s*https?:/i.test(lines[j])) break;
        rest.push(lines[j]);
        i = j;
      }
      message = rest.join("\n").trim();
      continue;
    }
    const value = m[2].trim();
    if (value) fields.push([label, value]);
  }
  /* A form that wrote no "Message:" line: the whole body is the message,
     minus the labelled lines already taken. */
  if (!message && !fields.length) message = plain.trim();
  return { message, fields };
}

/** The HTML body as lines of text - tags out, the common entities decoded. */
function htmlLines(html: string): string[] {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h\d|td|table)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&rsquo;|&#8217;/g, "'")
    .replace(/&quot;/g, '"')
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

/* OnTheMarket puts the applicant's words in its HTML only, as labelled lines
   (measured 11 Sep 2026: "Requirements:", "Comments:", then a dozen of its
   own flags). These carry words a person wrote, in the order to trust them. */
const HTML_MESSAGE_LABELS = ["Message", "Comments", "Requirements", "Enquiry"];
/* And these are worth showing beside the message. The rest of that block is
   OnTheMarket's own bookkeeping (Consent, RecentlyViewedProperties...). */
const HTML_FACT_LABELS = ["Requirements", "PropDescription", "PropPrice", "EnquiryType"];

/** Read one REX lead in full. `rexLeadId` is REX's own id, without "rex-". */
export async function readEnquiry(rexLeadId: string): Promise<Enquiry | null> {
  const res = await rexCall("Leads", "read", { id: rexLeadId });
  if (!res.ok) return null;
  const r = (res.result ?? {}) as {
    plain_body?: string | null;
    html_body?: string | null;
    body_snippet?: string | null;
    system_ctime?: string | number | null;
    lead_source?: { text?: string } | null;
  };
  const plain = r.plain_body ?? "";
  const parsed = parseEnquiry(plain);
  let message = parsed.message;
  const fields = [...parsed.fields];

  /* Where the plain text has no message, the HTML's labelled lines. */
  const labelled = new Map<string, string>();
  for (const line of htmlLines(r.html_body ?? "")) {
    const m = /^([A-Za-z][A-Za-z '\/()-]{1,40}):\s*(.*)$/.exec(line);
    if (m && m[2].trim().length > 1 && !labelled.has(m[1].trim())) labelled.set(m[1].trim(), m[2].trim());
  }
  if (!message) {
    for (const k of HTML_MESSAGE_LABELS) {
      const v = labelled.get(k);
      if (v) { message = v; break; }
    }
  }
  for (const k of HTML_FACT_LABELS) {
    const v = labelled.get(k);
    if (v && v !== message && !fields.some(([f]) => f === k)) fields.push([k, v]);
  }
  /* Last resort: the words after "Message:" in REX's own 100-character
     preview - short, but better than nothing. */
  if (!message) {
    const snip = /Message:\s*([\s\S]*)$/i.exec(r.body_snippet ?? "");
    if (snip) message = snip[1].replace(/\s+/g, " ").trim();
  }
  const t = Number(r.system_ctime ?? 0);
  return {
    message,
    fields,
    receivedAt: t ? new Date(t * 1000).toISOString() : null,
    source: r.lead_source?.text ?? null,
  };
}
