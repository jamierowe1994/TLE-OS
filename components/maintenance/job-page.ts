import type { Contractor, WorksOrder } from "@/lib/works-orders";
import { stepOf, type StepId } from "@/lib/works-steps";
import type { FormId } from "@/components/maintenance/JobForms";
import { day } from "@/components/maintenance/works-ui";
import { categoryName, certDatesOf, dueDayOf } from "@/lib/works-catalogue";

/**
 * What the job page (app/(os)/maintenance/[id]) hands to whichever look it
 * draws: today's, or the new one behind the "job" switch
 * (components/new-look/maintenance/JobPageNew). The state, the reads and every
 * handler stay in the page; these are the shapes and the small sums both
 * looks draw from, so neither keeps its own copy.
 */

/** What is open over the page. */
export type Pop =
  | { kind: "form"; form: FormId }
  | { kind: "stage"; stage: StepId }
  | { kind: "cert" }
  | { kind: "landlord_says" }
  | { kind: "people"; who: "tenant" | "contractor" };

export type TabId = "updates" | "details" | "people" | "files";
export const TABS: { id: TabId; label: string }[] = [
  { id: "updates", label: "Updates" },
  { id: "details", label: "Details" },
  { id: "people", label: "People" },
  { id: "files", label: "Files" },
];

/** One action on the job: a row in its group. `off` says why it can't be pressed. */
export type Tile = { key: string; label: string; what: string; icon: string; off?: string; done?: boolean; run: () => void };
export type TileGroup = { id: string; title: string; blurb: string; icon: string; keys: string[]; items: Tile[] };

/** Headings in Title Case, the small words left small (house style). */
const SMALL = new Set(["a", "an", "and", "as", "at", "but", "by", "for", "in", "it", "of", "on", "or", "the", "to", "up", "with"]);
export function titleCase(t: string): string {
  return t.split(" ").map((w, i) => (i > 0 && SMALL.has(w.toLowerCase()) ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1))).join(" ");
}

/** "in 6 days", "today", "3 days ago": how far off a date is, counted in London days. */
export function daysFrom(iso: string): string {
  const d = (x: Date) => Date.UTC(x.getFullYear(), x.getMonth(), x.getDate());
  const n = Math.round((d(new Date(iso)) - d(new Date())) / 86_400_000);
  return n === 0 ? "today" : n === 1 ? "tomorrow" : n === -1 ? "yesterday" : n > 0 ? `in ${n} days` : `${-n} days ago`;
}

/**
 * A PLANNED JOB FOR SEVERAL CERTIFICATES, EACH WITH ITS OWN DATE (Lianna
 * Denholm, 17 Nov 2026, ticket 578704cc: the job's page said "Due By 30 Dec"
 * for a gas safety and a PAT test, and nothing of the PAT test's date).
 * Soonest first, for the job's page and its drawer to draw in place of the
 * one Due By. Empty for a job with one date, which draws as it always did.
 * `chased` is said only when the job's own due date was since moved by hand.
 */
export function certDue(o: Pick<WorksOrder, "kind" | "category" | "certDates" | "dueAt">, open = true): { lines: { name: string; on: string; away: string | null; late: boolean }[]; chased: string | null } {
  const certs = certDatesOf(o);
  if (!certs.length) return { lines: [], chased: null };
  const today = dueDayOf(new Date().toISOString());
  const on = (ymd: string) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" });
  return {
    lines: certs.map((c) => ({ name: categoryName(c.category), on: on(c.expires), away: open ? daysFrom(`${c.expires}T12:00:00`) : null, late: open && c.expires < today })),
    chased: o.dueAt && dueDayOf(o.dueAt) !== certs[0].expires ? `Chased against ${day(o.dueAt)}` : null,
  };
}

export const tel = (s: string) => s.replace(/[^\d+]/g, "");
export const isImage = (f: { type: string; name: string }) => f.type.startsWith("image/") || /\.(jpe?g|png|gif|webp|heic)$/i.test(f.name);

/** The job's files: photos as pictures, everything else as a line. */
export function jobFiles(o: WorksOrder) {
  const url = (key: string) => `/api/r2/file?key=${encodeURIComponent(key)}`;
  const photos = o.files.filter(isImage);
  const docs = o.files.filter((f) => !isImage(f));
  return { url, photos, docs, urls: photos.map((p) => url(p.key)) };
}

/** The engineer going out: what they're registered for, their cover, and their job page link. */
export function engineerFacts(o: WorksOrder, c: Contractor | null) {
  const regs = c
    ? [
        c.gasSafeNumber ? `Gas Safe ${c.gasSafeNumber}` : "",
        c.niceicNumber ? `NICEIC ${c.niceicNumber}` : "",
        c.napitNumber ? `NAPIT ${c.napitNumber}` : "",
        c.otherRegistration ?? "",
      ].filter(Boolean)
    : [];
  if (c && !regs.length && c.registration) regs.push(c.registration);
  const insured = c?.publicLiabilityInsurer ? `${c.publicLiabilityInsurer}${c.publicLiabilityExpiry ? ` · to ${day(c.publicLiabilityExpiry)}` : ""}` : "";
  const quoting = stepOf(o) === "quote";
  /* Out for quotes, each firm has its own link; the job's one is for the works order. */
  const link = o.contractorToken && !quoting ? `${typeof window === "undefined" ? "" : window.location.origin}/contractor/${o.contractorToken}` : null;
  const out = o.quoteAsks.filter((a) => a.state === "asked" || a.state === "quoted");
  return { regs, insured, quoting, link, out };
}
