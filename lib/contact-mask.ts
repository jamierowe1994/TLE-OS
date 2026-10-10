import { can, type Role } from "@/lib/roles";

/**
 * No bulk contact lists for agents (James, 10 Oct 2026).
 *
 * "I'm a bad agent, I know I'm leaving" - and the quickest way to take the
 * book was never to open records one at a time, it was the screens whose data
 * call hands back a whole list of people with their email and phone in one
 * go: everybody matched to a home, every viewer, every applicant. One call,
 * hundreds of addresses, and the read log sees a single line.
 *
 * So in a LIST, an agent gets each person's name and enough of their email
 * and number to tell two people apart ("ja•••@gmail.com", "••• 4821"). The
 * full details come when they open that one person - which the read log
 * writes down and the pace cap counts. Sends that used to post email
 * addresses back now post lead ids, and the server finds the address.
 *
 * Anybody who works the whole business (see:everything - owners, Susan, the
 * office) still gets the full list, because their job is the list.
 */

export function seesContactLists(role: Role | string | null | undefined): boolean {
  return can((role ?? "agent") as Role, "see:everything");
}

/** "james@example.com" -> "ja•••@example.com". Blank stays blank. */
export function maskEmail(email: string | null | undefined): string {
  const e = (email ?? "").trim();
  if (!e) return "";
  const at = e.indexOf("@");
  if (at < 1) return "•••";
  return `${e.slice(0, Math.min(2, at))}•••${e.slice(at)}`;
}

/** "07700 900123" -> "••• 0123". Blank stays blank. */
export function maskPhone(phone: string | null | undefined): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (!digits) return "";
  return `••• ${digits.slice(-4)}`;
}

const EMAIL_KEY = /email$/i;
const PHONE_KEY = /(phone|mobile)$/i;

/**
 * Every email and phone field on a record shortened - any key ending in
 * email, phone or mobile, and the same one level down (a job's tenants). A
 * record's shape stays exactly as it was, so the screen reading it needs no
 * change to show the shortened value.
 */
export function maskContactFields<T>(o: T): T {
  if (!o || typeof o !== "object") return o;
  if (Array.isArray(o)) return o.map((x) => maskContactFields(x)) as T;
  const out: Record<string, unknown> = { ...(o as Record<string, unknown>) };
  for (const [k, v] of Object.entries(out)) {
    if (typeof v === "string") {
      if (EMAIL_KEY.test(k)) out[k] = maskEmail(v);
      else if (PHONE_KEY.test(k)) out[k] = maskPhone(v);
    } else if (Array.isArray(v) && v.some((x) => x && typeof x === "object")) {
      out[k] = v.map((x) => (x && typeof x === "object" && !Array.isArray(x) ? maskContactFields(x) : x));
    }
  }
  return out as T;
}

/** Is this record's agent (a name, as appraisals keep it) this person? */
export function sameName(a: string | null | undefined, b: string | null | undefined): boolean {
  const n = (x: string | null | undefined) => (x ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  return Boolean(n(a)) && n(a) === n(b);
}
