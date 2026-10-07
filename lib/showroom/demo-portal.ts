import "server-only";
import { jobOf, type MaintView } from "@/lib/landlord-maintenance-view";
import type { DocRow, DocsView } from "@/lib/landlord-documents-view";
import { CAST, HOME_ID, type DemoWorld } from "@/lib/showroom/demo-world";

/**
 * The landlord's Maintenance page at a moment of a back office walkthrough:
 * the sample's own page (lib/landlord-sample) with its jobs replaced by the
 * walkthrough's, put into the landlord's words by the same function the live
 * page uses (lib/landlord-maintenance-view jobOf). So the step a job is on
 * reads exactly as a real landlord would read it.
 */
export function landlordMaintAt(w: DemoWorld, base: MaintView): MaintView {
  const jobs = w.orders.filter((o) => o.landlordEmail === CAST.landlord.email).map(jobOf);
  const year = new Date().getFullYear();
  const done = jobs.filter((j) => j.state === "done");
  return {
    ...base,
    needsYou: jobs.filter((j) => j.state === "open" && j.needsYou),
    open: jobs.filter((j) => j.state === "open"),
    done: [...done, ...base.done].slice(0, 8),
    /* The sample's own booked visit carries a fixed date; the walkthrough's
       visits replace it, and the ones already made stay. */
    visits: w.visits ?? base.visits.filter((v) => v.state === "done"),
    spent: { ...base.spent, year, jobs: base.spent.jobs + done.length },
  };
}

/**
 * The landlord's Documents page at a moment of a walkthrough: Recreation
 * Terrace's certificate rows worked out from the walkthrough's book, so a
 * certificate running out says so - with the row's Send the new one - and a
 * verified one is in date. The sample's own rows carry fixed dates.
 */
export function landlordDocsAt(w: DemoWorld, base: DocsView): DocsView {
  const home = w.homes.find((h) => h.id === HOME_ID);
  if (!home || !base.properties.length) return base;
  const when = (days: number) => new Date(Date.now() + days * 86_400_000).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const row = (title: string, kind: DocRow["kind"], days: number | null | undefined): DocRow => {
    if (days == null) return { title, sub: "No certificate on file", state: "missing", href: null, kind };
    if (days <= 30) return { title, sub: `Expires ${when(days)} - ${Math.max(0, Math.round(days))} days. Renewal being arranged; if your own engineer does it, send us the new certificate`, state: "watch", href: "#", cta: "Open", kind };
    return { title, sub: `Expires ${when(days)}`, state: "uploaded", href: "#", cta: "Open" };
  };
  const c = home.certs;
  const certs: DocRow[] = [
    row("Gas safety (CP12)", "gas", c.gas?.expires),
    row("EICR - electrical safety", "eicr", c.eicr?.expires),
    { ...row("Energy Performance Certificate", "epc", c.epc?.expires), sub: `Rating C  •  expires ${when(c.epc?.expires ?? 2400)}` },
    { title: "Smoke and carbon monoxide alarms", sub: "Checked at each visit - no dated record", state: "pending", href: null },
  ];
  const due = certs.filter((r) => r.state === "watch" || r.state === "missing");
  const [first, ...rest] = base.properties;
  return {
    ...base,
    properties: [{ ...first, certs, allInDate: due.length === 0, headline: due.length ? `${due[0].title.split(" ")[0]} due soon` : "All in date" }, ...rest],
  };
}
