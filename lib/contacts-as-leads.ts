import type { Lead } from "@/lib/leads-sample";

/**
 * A person added in the OS, shown as a row in the lead book.
 *
 * ── Why map rather than build a second list ───────────────────────────────
 *
 * There is already a file you can open: the Leads table, and the drawer behind
 * it. Someone added in the OS could not be opened for one reason only — the
 * table reads REX's lead book, and they are not in it. Nothing was missing from
 * the UI. They were missing from the LIST.
 *
 * So this maps our record onto the shape that list already speaks, and they
 * open in the same drawer as everybody else. The alternative — a second table
 * with its own record page — would mean two files, two designs and two places
 * to look for the same person, which is the thing an overlay exists to avoid.
 *
 * ── The id prefix is load-bearing ─────────────────────────────────────────
 *
 * REX leads are `rex-<id>`, the demo book is `l1`..`l9`, and ours are
 * `os-<uuid>`. Anything hanging off a lead is keyed on that string — appraisal
 * bookings, case state, scheduled sends — so a collision between a REX lead and
 * an OS person would silently attach one person's booking to another's file.
 * The prefix is what keeps those namespaces apart.
 */

export interface ContactRow {
  id: string;
  kind: string;
  name: string;
  email: string;
  mobile: string;
  address: string;
  postcode: string;
  source: string;
  enquiry: string;
  notes: string;
  createdBy: string;
  createdAt: string;
  rexId: string | null;
  rexState: "held" | "sent" | "failed" | "linked";
  rexDetail: string;
}

/** `os-<uuid>` — see the note above on why this prefix matters. */
export const OS_LEAD_PREFIX = "os-";
export const isOsLead = (id: string) => id.startsWith(OS_LEAD_PREFIX);
export const osContactIdFrom = (leadId: string) => leadId.slice(OS_LEAD_PREFIX.length);

/** "3h ago" / "2 days ago" — the column reads relative, like the REX rows. */
function ago(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "just now";
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/** The town out of a formatted address — the Area column, without a guess. */
function areaOf(address: string, postcode: string): string {
  if (!address) return postcode || "—";
  /* The town is the last part that is neither the country nor a postcode.
     Google does not always give the postcode its own comma — "W Balsdon
     Cottages, Whitstone, Holsworthy EX22 6LE, UK" puts it inside the town's
     part, so it is stripped from WITHIN each piece rather than matched against
     the whole one. Occasionally wrong on a single-line address, and roughly
     right beats blank in a column somebody scans. */
  const POSTCODE = /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/gi;
  const parts = address
    .split(",")
    .map((p) => p.replace(POSTCODE, "").trim())
    .filter((p) => p && p.toUpperCase() !== "UK");
  return parts.length > 1 ? parts[parts.length - 1] : parts[0] ?? postcode ?? "—";
}

export function contactToLead(c: ContactRow): Lead {
  /* enquiry drives leadSide(), which decides whether they show under Tenant or
     Landlord. "Letting" is the tenant side; anything else is the landlord one. */
  const enquiry: Lead["enquiry"] =
    c.kind === "landlord" ? "Landlord" : c.enquiry === "Valuation" ? "Valuation" : "Letting";

  return {
    id: `${OS_LEAD_PREFIX}${c.id}`,
    name: c.name,
    email: c.email,
    phone: c.mobile,
    enquiry,
    area: areaOf(c.address, c.postcode),
    budget: "—",
    source: c.source || "Added by hand",
    received: ago(c.createdAt),
    receivedAt: c.createdAt,
    stage: "New",
    moveDate: "—",
    preferred: c.address || "—",
    /* Whoever typed it in. The REX rows carry the managing agent here, and for
       a record somebody entered by hand that is the same question. */
    agent: c.createdBy,
    notes: c.notes,
    address: c.address || undefined,
    activity: [
      {
        icon: "user",
        text: `Added in the OS by ${c.createdBy}`,
        when: ago(c.createdAt),
      },
    ],
  };
}
