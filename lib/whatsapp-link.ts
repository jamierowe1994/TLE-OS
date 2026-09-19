/**
 * A phone number, as WhatsApp's chat links want it.
 *
 * wa.me will not take a national number: 07700 900123 has to arrive as
 * 447700900123. Anything already international (+44, 0044, +353) is kept as
 * it is, minus the punctuation. Too short to be a phone and it is null, so
 * the button can stay off the screen rather than open a chat with nobody.
 */
export function waNumber(phone: string | null | undefined): string | null {
  let d = (phone ?? "").replace(/[^\d+]/g, "");
  if (d.startsWith("+")) d = d.slice(1);
  else if (d.startsWith("00")) d = d.slice(2);
  else if (d.startsWith("0")) d = `44${d.slice(1)}`;
  d = d.replace(/\D/g, "");
  return d.length >= 10 && d.length <= 15 ? d : null;
}

/* A code carrying a whole letter is too dense for a phone camera at arm's length. */
const MAX_TEXT = 500;

/** The link a phone opens: straight into the chat, the message already typed. */
export function waLink(phone: string, text?: string): string | null {
  const n = waNumber(phone);
  if (!n) return null;
  const t = (text ?? "").trim().slice(0, MAX_TEXT);
  return `https://wa.me/${n}${t ? `?text=${encodeURIComponent(t)}` : ""}`;
}

/** The same chat in the browser, for a desk with no WhatsApp installed. */
export function waWebLink(phone: string, text?: string): string | null {
  const n = waNumber(phone);
  if (!n) return null;
  const t = (text ?? "").trim().slice(0, MAX_TEXT);
  return `https://web.whatsapp.com/send?phone=${n}${t ? `&text=${encodeURIComponent(t)}` : ""}`;
}
