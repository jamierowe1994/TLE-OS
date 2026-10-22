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

/**
 * The same chat in the WhatsApp app itself, phone or computer (22 Oct 2026).
 *
 * Dan Richards and Sean McMahon: every WhatsApp press opened another browser
 * tab. Opening the chat in a named window ("tle-whatsapp") cannot fix that:
 * WhatsApp Web and wa.me send Cross-Origin-Opener-Policy: same-origin, which
 * wipes a window's name the moment they load, so the next press finds no
 * window of that name and opens another (tried in Chrome: three presses,
 * three tabs; a site without the header reused one). And in the iPhone app a
 * wa.me link is a web page, so it opened in a Safari sheet every time.
 *
 * The app's own address opens the chat in the one WhatsApp that is already
 * there - no tab at all. Where WhatsApp is not installed nothing happens, so
 * the caller keeps a web fallback (openWhatsAppApp below).
 */
export function waAppLink(phone: string, text?: string): string | null {
  const n = waNumber(phone);
  if (!n) return null;
  const t = (text ?? "").trim().slice(0, MAX_TEXT);
  return `whatsapp://send?phone=${n}${t ? `&text=${encodeURIComponent(t)}` : ""}`;
}

/**
 * Open the app's address, and call `missing` if the page is still in front a
 * moment later - WhatsApp did not open, so it is probably not installed.
 * Browser only.
 */
export function openWhatsAppApp(url: string, missing: () => void, waitMs = 1600): void {
  let left = false;
  const mark = () => {
    left = true;
  };
  window.addEventListener("blur", mark);
  window.addEventListener("pagehide", mark);
  document.addEventListener("visibilitychange", mark);
  window.location.href = url;
  window.setTimeout(() => {
    window.removeEventListener("blur", mark);
    window.removeEventListener("pagehide", mark);
    document.removeEventListener("visibilitychange", mark);
    if (!left && document.visibilityState === "visible") missing();
  }, waitMs);
}
