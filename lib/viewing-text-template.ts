/**
 * An agent's own viewing reminder text (10 Oct 2026).
 *
 * James: customisable per person, in Profile > Custom, with the standard text
 * shown until they change it - and safeguards built in. Shared by the editor
 * (components/ViewingTextEditor), the save (app/api/me/viewing-text) and the
 * send (lib/viewing-texts), so all three agree on what is allowed.
 *
 * ── The safeguards ────────────────────────────────────────────────────────
 *
 *   {time} and {address} must be in it - a reminder that does not say when
 *   or where is not a reminder.
 *   Only the tags below. A typo like {adress} would go out as typed.
 *   Long dashes and curly quotes are straightened on save: they would turn
 *   the whole text into the expensive kind (see smsParts).
 *   Emojis and other symbols are allowed but warned about, for the same reason.
 *   At most three text-lengths, worked out with long example details, so a
 *   long address cannot push it past the cap on the day.
 *
 * The sender checks again: a stored text that fails any rule (written some
 * other way, or saved before a rule existed) goes out as the standard text.
 *
 * Unaccompanied viewings always get the standard text. It is the one that
 * says nobody from us will be there; "see you there!" would be wrong.
 */

export const VIEWING_TEXT_PREF = "viewing-text-v1";

export const TEXT_TAGS = [
  { tag: "{first name}", what: "The viewer's first name" },
  { tag: "{time}", what: "The viewing time, like 3pm or 10:30am" },
  { tag: "{address}", what: "The address of the home" },
  { tag: "{my name}", what: "Your full name" },
  { tag: "{my first name}", what: "Your first name" },
  { tag: "{my phone}", what: "Your mobile" },
] as const;

export const STANDARD_TEMPLATE =
  "Hi {first name}, a reminder of your viewing today at {time} at {address}. {my first name} will meet you there. Running late or can't make it? Just reply, or call {my first name} on {my phone}. The Letting Experts";

export const MAX_PARTS = 3;

export interface TextVars {
  firstName: string;
  time: string;
  address: string;
  myName: string;
  myPhone: string;
}

/** Plain characters bill 160 to a text (153 once split); anything else, 70 (67). */
const GSM = /^[A-Za-z0-9 \r\n@£$¥èéùìòÇØøÅå_ÆæßÉ!"#%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà^{}\\[~\]|€]*$/;
/** Still plain, but each takes the room of two. */
const GSM_DOUBLE = /[\^{}\\[~\]|€]/g;

export function smsParts(body: string): { parts: number; plain: boolean } {
  const plain = GSM.test(body);
  if (!plain) return { parts: body.length <= 70 ? 1 : Math.ceil(body.length / 67), plain };
  const len = body.length + (body.match(GSM_DOUBLE)?.length ?? 0);
  return { parts: len <= 160 ? 1 : Math.ceil(len / 153), plain };
}

/** Long dashes to "-", curly quotes to straight, runs of spaces to one. */
export function tidyTemplate(t: string): string {
  return t
    .replace(/[‒-―−]/g, "-")
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”‟″]/g, '"')
    .replace(/…/g, "...")
    .replace(/ /g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

export function fillTemplate(t: string, v: TextVars): string {
  const first = (s: string) => s.trim().split(/\s+/)[0] || "";
  return t
    .replace(/\{first name\}/gi, v.firstName || "there")
    .replace(/\{time\}/gi, v.time)
    .replace(/\{address\}/gi, v.address)
    .replace(/\{my name\}/gi, v.myName)
    .replace(/\{my first name\}/gi, first(v.myName))
    .replace(/\{my phone\}/gi, v.myPhone);
}

/** Long, real-looking details: the cap is checked against the worst day, not the best. */
const LONG: TextVars = {
  firstName: "Christopher",
  time: "10:30am",
  address: "Flat 12, 145a Wilmslow Road, Manchester M14 5AN",
  myName: "Alexandra Fitzgerald",
  myPhone: "07700 900123",
};

export interface TemplateCheck {
  ok: boolean;
  /** Reasons it cannot be saved. */
  errors: string[];
  /** Saved anyway, but worth knowing. */
  warnings: string[];
  /** How many texts it comes to on a long day. */
  worstParts: number;
}

export function checkTemplate(raw: string): TemplateCheck {
  const t = tidyTemplate(raw);
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!t) errors.push("It's empty. Use Back to standard to go back to the standard text.");
  for (const need of ["{time}", "{address}"]) {
    if (!t.toLowerCase().includes(need)) errors.push(`It needs ${need} in it, so the viewer knows ${need === "{time}" ? "when" : "where"}.`);
  }
  const known = new Set<string>(TEXT_TAGS.map((x) => x.tag));
  const unknown = [...new Set((t.match(/\{[^}]*\}/g) ?? []).filter((x) => !known.has(x.toLowerCase())))];
  if (unknown.length) errors.push(`${unknown.join(", ")} ${unknown.length === 1 ? "isn't a tag" : "aren't tags"}. Use the tags listed, spelt the same way.`);
  if (/[{}]/.test(t.replace(/\{[^{}]*\}/g, ""))) errors.push("There's a { or } on its own. Tags open with { and close with }.");
  if (/https?:\/\/|www\./i.test(t)) errors.push("Links aren't allowed. Phones flag texts with links from unknown numbers as spam.");

  const filled = fillTemplate(t, LONG);
  const { parts, plain } = smsParts(filled);
  if (!plain) {
    const odd = [...new Set([...filled].filter((ch) => !GSM.test(ch)))];
    warnings.push(`${odd.join(" ")} ${odd.length > 1 ? "are special characters, which turn" : "is a special character, which turns"} the whole message into the expensive kind of text (70 characters each, not 160), so it costs more.`);
  }
  if (parts > MAX_PARTS) errors.push(`It's too long: with a long address it comes to ${parts} texts. The most is ${MAX_PARTS}.`);
  return { ok: errors.length === 0, errors, warnings, worstParts: parts };
}
