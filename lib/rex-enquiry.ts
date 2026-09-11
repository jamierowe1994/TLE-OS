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

/** Read one REX lead in full. `rexLeadId` is REX's own id, without "rex-". */
export async function readEnquiry(rexLeadId: string): Promise<Enquiry | null> {
  const res = await rexCall("Leads", "read", { id: rexLeadId });
  if (!res.ok) return null;
  const r = (res.result ?? {}) as {
    plain_body?: string | null;
    system_ctime?: string | number | null;
    lead_source?: { text?: string } | null;
  };
  const plain = r.plain_body ?? "";
  const { message, fields } = parseEnquiry(plain);
  const t = Number(r.system_ctime ?? 0);
  return {
    message,
    fields,
    receivedAt: t ? new Date(t * 1000).toISOString() : null,
    source: r.lead_source?.text ?? null,
  };
}
