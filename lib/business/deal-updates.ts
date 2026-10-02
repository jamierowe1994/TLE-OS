import "server-only";
import { q } from "@/lib/db";
import type { BusinessDeal } from "@/lib/business/propoly-deals";
import type { DealEvent, DealEventKind } from "@/lib/business/deal-events";
import { referenceState } from "@/lib/business/stage-evidence";
import { createUpdate, type UpdateRecipient } from "@/lib/customer-updates";
import { AUDIENCE, HEADLINE, updateVars, type UpdateKind } from "@/lib/customer-update-copy";

/**
 * The Propoly watcher's moves, turned into customer updates for the agent
 * (James, 2 Oct 2026). The watcher used to email the agent "references are
 * back"; now the same email says who should hear about it and opens the
 * update where the agent emails them, rings, or marks it not needed. Nothing
 * goes to a landlord or tenant from here.
 */

const FROM_EVENT: Partial<Record<DealEventKind, UpdateKind>> = {
  referencing_started: "referencing_started",
  references_back: "references_back",
  reference_failed: "reference_failed",
  agreement_out: "agreement_out",
  complete: "complete",
  cancelled: "cancelled",
  move_in_ready: "move_in_ready",
};

const words = (iso: string | null | undefined) =>
  iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }) : null;
const first = (name: string) => name.trim().split(/\s+/)[0] || "there";

export function dealRecipients(deal: BusinessDeal, kind: UpdateKind, opts: { onlyTenant?: string } = {}): Omit<UpdateRecipient, "state">[] {
  const agentName = deal.managerName ? deal.managerName.replace(/\b\w/g, (c) => c.toUpperCase()) : "The Letting Experts";
  const ctx = (name: string) => ({ address: deal.app.propertyName, firstName: first(name), agentName, moveIn: words(deal.app.startDate) });
  const out: Omit<UpdateRecipient, "state">[] = [];
  const roles = AUDIENCE[kind];
  if (roles.includes("tenant")) {
    const tenants = deal.app.tenants ?? [];
    /* The lead tenant, except where every tenant has a part: everyone signs
       the agreement, and a failed reference is that tenant's own news. */
    const pick = opts.onlyTenant
      ? tenants.filter((t) => t.name?.toLowerCase() === opts.onlyTenant!.toLowerCase())
      : kind === "agreement_out"
        ? tenants
        : tenants.filter((t) => t.isPrimary).slice(0, 1).concat(tenants.some((t) => t.isPrimary) ? [] : tenants.slice(0, 1));
    for (const t of pick.length ? pick : opts.onlyTenant ? [{ name: opts.onlyTenant, email: null, isPrimary: true }] : []) {
      out.push({ role: "tenant", name: t.name, email: t.email ?? null, emailId: "update-tenant", vars: updateVars(kind, "tenant", ctx(t.name)) });
    }
  }
  const landlord = deal.app.propoly?.landlord;
  if (roles.includes("landlord") && landlord?.name) {
    out.push({ role: "landlord", name: landlord.name.trim(), email: landlord.email ?? null, emailId: "update-landlord", vars: updateVars(kind, "landlord", ctx(landlord.name)) });
  }
  return out;
}

/**
 * Makes the updates for this run's events. Returns the ids of the events now
 * covered by an update, so the watcher sends the agent the update's email
 * instead of a second "your deal moved" one.
 */
export async function updatesFromEvents(events: DealEvent[], deals: BusinessDeal[]): Promise<Set<number>> {
  const covered = new Set<number>();
  for (const e of events) {
    let kind = FROM_EVENT[e.event];
    if (!kind) continue;
    const deal = deals.find((d) => d.app.id === e.dealId);
    if (!deal) continue;
    /* References back, but one of them only with a guarantor: that is the
       news the tenant needs, not "all fine". */
    if (kind === "references_back" && referenceState(deal.app.propoly)?.needGuarantor.length) kind = "guarantor_needed";
    const recipients = dealRecipients(deal, kind, kind === "reference_failed" && e.toStatus ? { onlyTenant: e.toStatus } : {});
    if (!recipients.length) continue;
    try {
      const made = await createUpdate({
        key: `deal:${e.dealId}:${kind}${kind === "reference_failed" ? `:${(e.toStatus ?? "").toLowerCase()}` : ""}`,
        dealId: e.dealId,
        property: e.property,
        agentEmail: e.agentEmail,
        agentName: e.agentName,
        kind,
        headline: kind === "reference_failed" && e.toStatus ? `${e.toStatus} has failed referencing` : HEADLINE[kind],
        recipients,
      });
      if (made) {
        covered.add(e.id);
        await q(`UPDATE os_deal_events SET told_note = $2 WHERE id = $1`, [e.id, `With ${e.agentName ?? "the agent"} to tell the customer (update ${made.id}).`]).catch(() => null);
      }
    } catch {
      /* the event still stands on the feed; the agent can tell them by hand */
    }
  }
  return covered;
}
