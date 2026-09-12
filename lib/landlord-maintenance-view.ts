import { landlordProperties, type LandlordAccount } from "@/lib/landlord-account";
import { listInspections, kindLabel as visitLabel } from "@/lib/inspections";
import { listOrders, pounds, stepOf, URGENCIES, type StepId, type WorksOrder } from "@/lib/works-orders";

/**
 * The Maintenance page's view: every job and every visit on the properties
 * we look after for this landlord, in their words - built once here and
 * read by the live page; the sample in lib/landlord-sample types the same
 * shape by hand.
 *
 * Everything is read at request time from the maintenance board and the
 * inspections book, so what the landlord sees is what Michael sees. Spend
 * is this calendar year's, worked out against now(), never stored.
 */

export interface MaintJob {
  id: string;
  ref: number;
  title: string;
  property: string;
  kind: "repair" | "planned";
  state: "open" | "done" | "cancelled";
  /** What is happening now, in the landlord's words. */
  now: string;
  /** "Booked for Tue 15 Sep", "Done 3 Aug 2026". */
  when: string | null;
  contractor: string | null;
  /** The quote while it is open, the invoice once it is in. */
  cost: string | null;
  /** Why it is waiting on the landlord, when it is. */
  needsYou: string | null;
  urgency: string | null;
  reported: string;
}

export interface MaintVisit {
  id: string;
  label: string;
  property: string;
  when: string;
  state: "upcoming" | "done" | "open";
  note: string;
}

export interface MaintProperty {
  name: string;
  locality: string;
  image: string | null;
}

export interface MaintView {
  properties: MaintProperty[];
  needsYou: MaintJob[];
  open: MaintJob[];
  done: MaintJob[];
  visits: MaintVisit[];
  spent: { figure: string; jobs: number; year: number };
  /** "£150": what we spend on a repair without asking first. */
  authority: string;
}

const day = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : null;
const dayShort = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) : null;

/** The step, said to the landlord rather than the agent. */
const NOW: Record<StepId, string> = {
  tell_landlord: "We're getting in touch with you about it",
  arranging: "Deciding who arranges it - we'll ask you",
  landlord_follow_up: "You're arranging it with your own contractor",
  pick_contractor: "Finding the right contractor",
  contractor_confirm: "Confirming a contractor",
  booking: "Booking the visit with the tenant",
  visit: "Booked",
  aftercare: "Done - checking the tenant is happy",
  payment: "Done - settling the invoice",
  invoice: "Done - settling the invoice",
  closed: "Closed",
};

function jobOf(o: WorksOrder): MaintJob {
  const step = stepOf(o);
  const open = ["reported", "approval", "approved", "scheduled"].includes(o.status);
  const state: MaintJob["state"] = o.status === "cancelled" ? "cancelled" : open ? "open" : "done";
  const quote = o.quotePence != null ? pounds(o.quotePence) : null;
  const needsYou =
    o.status === "approval"
      ? `${quote ? `A quote of ${quote}` : "A quote"} needs your say-so - it is over your ${pounds(o.authorityPence)} authority`
      : step === "landlord_follow_up"
        ? "You're arranging this one. Tell us when it is done"
        : null;
  const when =
    state === "done"
      ? `Done ${day(o.completedAt) ?? day(o.updatedAt) ?? ""}`.trim()
      : o.scheduledAt
        ? `Booked for ${dayShort(o.scheduledAt)}`
        : o.dueAt && o.kind === "planned"
          ? `Due by ${day(o.dueAt)}`
          : null;
  return {
    id: o.id,
    ref: o.ref,
    title: o.title || o.category || "Repair",
    property: o.propertyName,
    kind: o.kind,
    state,
    now: state === "done" ? "Done" : state === "cancelled" ? "Not going ahead" : o.scheduledAt && step === "visit" ? `Booked for ${dayShort(o.scheduledAt)}` : NOW[step],
    when,
    contractor: o.contractorName || null,
    cost: o.invoicePence != null ? pounds(o.invoicePence) : quote,
    needsYou,
    urgency: URGENCIES.find((u) => u.id === o.urgency)?.label ?? null,
    reported: `Reported ${day(o.reportedAt) ?? ""}${o.reportedBy ? ` by ${o.reportedBy.toLowerCase() === "tenant" ? "your tenant" : o.reportedBy.toLowerCase() === "landlord" ? "you" : "us"}` : ""}`,
  };
}

export async function loadLandlordMaintenance(me: LandlordAccount): Promise<MaintView> {
  const managed = await landlordProperties(me);
  const ids = new Set(managed.map((p) => p.propertyId).filter((x): x is string => Boolean(x)));
  const email = me.email.trim().toLowerCase();
  const mine = <T extends { propertyId: string | null; landlordEmail: string }>(rows: T[]) =>
    rows.filter((r) => (r.propertyId && ids.has(r.propertyId)) || (r.landlordEmail && r.landlordEmail.trim().toLowerCase() === email));

  const [orders, inspections] = await Promise.all([
    listOrders({ limit: 500 }).then(mine).catch(() => [] as WorksOrder[]),
    listInspections({}).then(mine).catch(() => []),
  ]);

  const jobs = orders.map(jobOf);
  const year = new Date().getFullYear();
  const doneThisYear = orders.filter((o) => !["reported", "approval", "approved", "scheduled", "cancelled"].includes(o.status) && new Date(o.completedAt ?? o.updatedAt).getFullYear() === year);
  const spentPence = doneThisYear.reduce((n, o) => n + (o.invoicePence ?? o.quotePence ?? 0), 0);

  const visits: MaintVisit[] = inspections
    .filter((i) => i.status !== "cancelled")
    .map((i) => {
      const done = i.status === "closed" || i.status === "reported";
      const upcoming = i.status === "booked";
      const at = done ? i.visitedAt ?? i.reportedAt : upcoming ? i.bookedAt ?? i.offered[0] ?? i.dueAt : i.dueAt;
      return {
        id: i.id,
        label: visitLabel(i.kind),
        property: i.propertyName,
        when: done ? (day(at) ?? "Done") : upcoming ? `Booked for ${dayShort(at) ?? "a date to come"}` : at ? `Due ${day(at)}` : "Being arranged",
        state: (done ? "done" : upcoming ? "upcoming" : "open") as MaintVisit["state"],
        note: done
          ? [i.condition ? `${i.condition[0].toUpperCase()}${i.condition.slice(1)} condition` : null, i.summary || null].filter(Boolean).join(" - ") || "Report to follow"
          : upcoming
            ? "Your tenant has agreed the date"
            : "We're arranging a date with your tenant",
      };
    })
    .sort((a, b) => (a.state === "done" ? 1 : 0) - (b.state === "done" ? 1 : 0));

  return {
    properties: managed.map((p) => ({ name: p.name, locality: p.locality ?? "", image: p.image })),
    needsYou: jobs.filter((j) => j.state === "open" && j.needsYou),
    open: jobs.filter((j) => j.state === "open"),
    done: jobs.filter((j) => j.state === "done").slice(0, 8),
    visits,
    spent: { figure: pounds(spentPence), jobs: doneThisYear.length, year },
    authority: pounds(orders[0]?.authorityPence ?? 15000),
  };
}
