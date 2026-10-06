/**
 * A finished tenant passport, as the Leads board and the dashboard see it.
 *
 * Client-safe: no token, no link. The passport link IS the credential to the
 * tenant's whole file (see app/(os)/admin/tenant-passport/page.tsx), so a list
 * of them never carries one. `id` is a hash of the token, for React keys only.
 */
export interface DonePassport {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  submittedAt: string;
  /** Who the passport belongs to (os_users), or null if nobody minted it. */
  agent: string | null;
  /** The homes they asked about, newest first, from the portal and REX. */
  homes: string[];
  /** The lead on the board this is, when one matches - to open its drawer. */
  leadId: string | null;
}

/** "3h ago", "yesterday", "12 Oct". Short enough for a tile. */
export function doneAgo(iso: string, now = Date.now()): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const mins = Math.floor((now - t) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 14) return `${days}d ago`;
  return new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
