import type { Lead } from "@/lib/leads-sample";

/**
 * Who actually asked (Sean McMahon's ticket, 15 Oct 2026).
 *
 * REX files every enquiry against a contact, and it finds that contact by
 * email. Sean sent a test enquiry from our website as "Sean Murphy" with his
 * own email address: REX filed it under the contact that address already
 * belonged to - Sean McMahon, with an old mobile - and the board said Sean
 * McMahon too. He searched for Sean Murphy, found nothing, and reported the
 * enquiry as lost. It was on file two and a half minutes after he sent it.
 *
 * It is not only tests. A partner on a shared email, or a contact somebody
 * renamed, reads the same way: Linda Okpegulam's enquiry sat on the board as
 * Jayne James with Jayne's number (rex-4348115). Ring that number and you
 * reach the wrong person.
 *
 * So the board shows the name and number typed on the enquiry itself, when
 * they are a different person's, and keeps the record's own as `onFileAs` /
 * `onFilePhone` so the drawer can say both. Client-safe: no database.
 */

export type EnquiryFields = Array<[string, string]>;

const NAME_LABELS = ["name", "full name", "your name"];
const PHONE_LABELS = ["phone default", "phone number", "phone", "mobile", "telephone", "tel"];

const field = (fields: EnquiryFields, labels: string[]): string => {
  for (const l of labels) {
    const hit = fields.find(([k]) => k.trim().toLowerCase() === l);
    if (hit?.[1]?.trim()) return hit[1].trim();
  }
  return "";
};

/** The name and phone typed on the enquiry, read from its labelled lines. */
export function enquirerFrom(fields: unknown): { name: string; phone: string } | null {
  if (!Array.isArray(fields) || !fields.length) return null;
  const f = fields.filter((x): x is [string, string] => Array.isArray(x) && typeof x[0] === "string" && typeof x[1] === "string");
  const first = field(f, ["first name"]);
  const last = field(f, ["last name", "surname"]);
  const name = field(f, NAME_LABELS) || [first, last].filter(Boolean).join(" ");
  const phone = field(f, PHONE_LABELS);
  return name || phone ? { name, phone } : null;
}

const words = (s: string) => s.toLowerCase().replace(/[^a-z\s'-]/g, " ").split(/\s+/).filter(Boolean);

/**
 * The same person, written two ways? Every word of the shorter name inside
 * the longer one, in any order: "Umut Sen" is "Umut Emre sen", "Martina
 * Dragone" is "Dragone Martina", "Mike" is "Mike King". A shared first name
 * alone is not enough - Sean Murphy is not Sean McMahon.
 */
export function sameName(a: string, b: string): boolean {
  const x = words(a);
  const y = words(b);
  if (!x.length || !y.length) return true;
  const [short, long] = x.length <= y.length ? [x, new Set(y)] : [y, new Set(x)];
  return short.every((w) => long.has(w));
}

/** Digits only: 00 read as +, and +44 as a leading 0 (0017736829214 is +1 773 682 9214). */
const digitsOf = (p: string) => {
  const d = p.replace(/\D/g, "").replace(/^00/, "");
  return d.startsWith("44") && d.length === 12 ? `0${d.slice(2)}` : d;
};

/** A number somebody could ring: 9 to 13 digits and no words ("then enter code" is a switchboard). */
const ringable = (p: string) => !/[a-z]/i.test(p) && digitsOf(p).length >= 9 && digitsOf(p).length <= 13;

/**
 * The lead as the person who asked wrote it. Unchanged when the enquiry has
 * not been read yet, or when it agrees with the record.
 */
export function withEnquirer<L extends Pick<Lead, "name" | "phone"> & { onFileAs?: string; onFilePhone?: string }>(lead: L, fields: unknown): L {
  const e = enquirerFrom(fields);
  if (!e) return lead;
  let out = lead;
  if (e.name && lead.name && !sameName(e.name, lead.name)) {
    out = { ...out, name: e.name, onFileAs: lead.name };
  }
  if (e.phone && ringable(e.phone) && digitsOf(e.phone) !== digitsOf(lead.phone ?? "")) {
    out = { ...out, phone: e.phone, ...(lead.phone ? { onFilePhone: lead.phone } : {}) };
  }
  return out;
}
