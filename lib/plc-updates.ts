import "server-only";
import { PLC_CHECKS, groupOf, type CheckId, type PlcCase } from "@/lib/plc";
import { handoffFor } from "@/lib/deal-handoff";
import { closeOvertaken, createUpdate } from "@/lib/customer-updates";
import { HEADLINE, updateVars, type UpdateKind } from "@/lib/customer-update-copy";

/**
 * A PLC decision, put with the agent to tell the landlord (James, 2 Oct
 * 2026: "rather than sending automated messages ... for example, what failed
 * PLC ... allow the agent to push all of them"). Sent back, declined or
 * passed, the landlord hears it from the agent - by email the agent has read
 * and changed, or on the phone - never from the system.
 *
 * Each decision is its own update: a pack can be sent back twice, and the
 * second time is news too. A newer decision closes the older ones still open,
 * so a check that has passed stops chasing anyone about the time it didn't.
 */

const label = (id: CheckId) => PLC_CHECKS.find((c) => c.id === id)?.label ?? id;
const needsOf = (id: CheckId) => PLC_CHECKS.find((c) => c.id === id)?.needs ?? "";

/**
 * What the update says, kept to what a person decided (5 Nov 2026). It used
 * to join every reader finding into one paragraph - 9,300 characters on 68
 * Main Street, 19,000 on 27 Addison Road - and Sean asked whether someone was
 * winding him up. The reader's notes are for the checker and stay on the PLC
 * check; the landlord draft never carries them (they included the tenant's
 * credit and next of kin).
 */
export function plcSummary(c: PlcCase): { why: string; landlordNeeds: string[] } {
  const note = c.decisionNote?.trim() ?? "";
  /* The checks the checker marked not right, else the ones the reader could
     not pass. Each once, in checklist order. */
  const ticked = PLC_CHECKS.filter((k) => c.ticks?.[k.id]?.ok === false).map((k) => k.id);
  const blocked = PLC_CHECKS.filter((k) => c.findings.some((f) => f.checkId === k.id && f.level === "blocker")).map((k) => k.id);
  const open = ticked.length ? ticked : blocked;
  const readerNotes = c.findings.filter((f) => f.level !== "ok").length;

  const why = [
    note ? `The checker said: "${note}"` : "",
    open.length ? `${ticked.length ? "Marked not right" : "Still to pass"}: ${open.map(label).join(", ")}.` : "",
    /* No count: "64 notes" read as 64 problems, and most are the reader
       thinking aloud about documents that were fine. */
    readerNotes ? "The document reader's notes for the checker are on the PLC check, not in this email." : "",
  ]
    .filter(Boolean)
    .join(" ");

  /* The landlord hears the checker's own words where there are any, else
     what each of their own checks needs - never a tenant check. */
  const landlordNeeds = note
    ? [note]
    : open.filter((id) => groupOf(id) === "landlord").map((id) => `${label(id)}: ${needsOf(id)}`.replace(/:\s*$/, ""));
  return { why, landlordNeeds };
}

/**
 * The agent fixed it and sent the pack back to the check: whatever it said
 * was wrong is no longer news for the landlord (6 Nov 2026).
 */
export async function clearPlcProblems(caseId: string) {
  return closeOvertaken({
    prefix: `plc:${caseId}:`,
    kinds: ["plc_deferred", "plc_declined"],
    note: "Fixed and sent back to the PLC check, so this was no longer needed.",
  }).catch(() => 0);
}

export async function putPlcWithAgent(c: PlcCase, decision: "approved" | "deferred" | "declined") {
  const kind: UpdateKind = decision === "approved" ? "plc_approved" : decision === "deferred" ? "plc_deferred" : "plc_declined";
  const key = `plc:${c.id}:${decision}:${c.decidedAt ?? ""}`;
  await closeOvertaken({
    prefix: `plc:${c.id}:`,
    keep: key,
    note: decision === "approved" ? "The PLC check passed afterwards, so this was no longer needed." : "The PLC check was decided again, and the newer update replaces this one.",
  }).catch(() => 0);
  const packet = c.applicationRef ? await handoffFor(c.applicationRef).catch(() => null) : null;
  const landlord = packet?.landlord ?? null;
  if (!landlord) return null;
  const { why, landlordNeeds } = decision === "approved" ? { why: "", landlordNeeds: [] } : plcSummary(c);
  const agentName = c.agentName || packet?.agent || "The Letting Experts";
  return createUpdate({
    key,
    applicationId: c.applicationRef || null,
    property: c.address,
    agentEmail: c.agentEmail || null,
    agentName: c.agentName || null,
    kind,
    headline: HEADLINE[kind],
    why,
    recipients: [
      {
        role: "landlord",
        name: landlord.name,
        email: landlord.email,
        contactId: landlord.contactId,
        emailId: "update-landlord",
        vars: updateVars(kind, "landlord", {
          address: c.address,
          firstName: landlord.name.trim().split(/\s+/)[0] || "there",
          agentName,
          needs: landlordNeeds,
        }),
      },
    ],
  });
}
