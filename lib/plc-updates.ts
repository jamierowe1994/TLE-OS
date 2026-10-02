import "server-only";
import type { PlcCase } from "@/lib/plc";
import { handoffFor } from "@/lib/deal-handoff";
import { createUpdate } from "@/lib/customer-updates";
import { HEADLINE, updateVars, type UpdateKind } from "@/lib/customer-update-copy";

/**
 * A PLC decision, put with the agent to tell the landlord (James, 2 Oct
 * 2026: "rather than sending automated messages ... for example, what failed
 * PLC ... allow the agent to push all of them"). Sent back, declined or
 * passed, the landlord hears it from the agent - by email the agent has read
 * and changed, or on the phone - never from the system.
 *
 * Each decision is its own update: a pack can be sent back twice, and the
 * second time is news too.
 */
export async function putPlcWithAgent(c: PlcCase, decision: "approved" | "deferred" | "declined") {
  const kind: UpdateKind = decision === "approved" ? "plc_approved" : decision === "deferred" ? "plc_deferred" : "plc_declined";
  const packet = c.applicationRef ? await handoffFor(c.applicationRef).catch(() => null) : null;
  const landlord = packet?.landlord ?? null;
  if (!landlord) return null;
  /* What the check needs, in the check's own words: the agent turns them
     into the landlord's when they read the draft. */
  const needs = c.findings.filter((f) => f.level !== "ok").map((f) => f.message.replace(/\s+$/, ""));
  if (decision !== "approved" && c.decisionNote?.trim()) needs.push(c.decisionNote.trim());
  const agentName = c.agentName || packet?.agent || "The Letting Experts";
  return createUpdate({
    key: `plc:${c.id}:${decision}:${c.decidedAt ?? ""}`,
    applicationId: c.applicationRef || null,
    property: c.address,
    agentEmail: c.agentEmail || null,
    agentName: c.agentName || null,
    kind,
    headline: HEADLINE[kind],
    why: decision === "approved" ? "" : needs.join(" "),
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
          needs: decision === "approved" ? [] : needs,
        }),
      },
    ],
  });
}
