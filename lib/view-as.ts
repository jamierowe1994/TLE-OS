import "server-only";
import crypto from "crypto";

/**
 * "View as" — an owner seeing the OS through somebody else's eyes.
 *
 * James, 27 Aug: "I don't mean log in using their password. I should be able to
 * peer into their account… This is only for the testing section. I'll probably
 * remove it before we go live."
 *
 * ── The one rule that makes this safe: IT IS READ-ONLY ────────────────────
 *
 * While a view-as is open, nothing may be written, sent or signed. Not a REX
 * note, not an email, not a contract. That is not caution for its own sake:
 * lib/rex-user.ts exists precisely so every REX write carries the name of the
 * person who made it, and a write performed while wearing somebody else's face
 * would poison the exact audit trail we built it to protect. An agent would be
 * recorded as having done something they have never seen.
 *
 * Enforced in `assertNotViewingAs()`, called from the write paths, rather than
 * left to whoever writes the next feature to remember.
 *
 * ── Why the cookie is signed ──────────────────────────────────────────────
 *
 * Its value decides whose data is rendered. Unsigned, anyone could set
 * `os_view_as=<somebody>` and read another person's screens without ever being
 * an owner. Signed with AUTH_SECRET and stamped with who opened it and when.
 *
 * ── Thirty minutes ────────────────────────────────────────────────────────
 *
 * Long enough to check what somebody is seeing, short enough that a forgotten
 * tab does not leave an owner silently wearing a colleague's identity for the
 * rest of the week. It expires on its own; there is no "extend".
 */

export const VIEW_AS_COOKIE = "os_view_as";
const TTL_MS = 30 * 60 * 1000;

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET is not set — refusing to sign a view-as token.");
  }
  return "dev-only-secret-not-for-production";
}

const sign = (data: string) =>
  crypto.createHmac("sha256", secret()).update(data).digest("base64url");

export interface ViewAs {
  /** The person being viewed. */
  subjectId: string;
  /** The owner doing the viewing — so the banner can name them and audit can too. */
  ownerId: string;
  expiresAt: number;
}

/** `subjectId.ownerId.expiry.signature` — ids are dot-free by construction. */
export function mintViewAs(subjectId: string, ownerId: string): string {
  const data = `${subjectId}.${ownerId}.${Date.now() + TTL_MS}`;
  return `${data}.${sign(data)}`;
}

export function readViewAs(token: string | undefined): ViewAs | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [subjectId, ownerId, exp, sig] = parts;
  const expected = sign(`${subjectId}.${ownerId}.${exp}`);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  if (Number(exp) < Date.now()) return null;
  return { subjectId, ownerId, expiresAt: Number(exp) };
}

export class ViewingAsRefused extends Error {}

/**
 * Refuse a write while somebody is being viewed.
 *
 * Call this at the TOP of any route that writes, sends or signs. It throws
 * rather than returning a boolean for the same reason assertInternalRecipient
 * does: the failure mode of a boolean is a caller who forgets to read it.
 */
export function assertNotViewingAs(token: string | undefined): void {
  if (readViewAs(token)) {
    throw new ViewingAsRefused(
      "You're viewing as somebody else, so this is read-only. Stop viewing as them first — " +
        "anything written now would be recorded against their name."
    );
  }
}
