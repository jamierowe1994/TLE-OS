import "server-only";
import crypto from "crypto";
import type Anthropic from "@anthropic-ai/sdk";
import { aiCreate, aiModel } from "@/lib/ai";
import { checkById, docTitle, gateOf, PLC_CHECKS, sentAnywayNow, type CheckId, type PlcAiSummary, type PlcCase } from "@/lib/plc";

/**
 * THE AI SUMMARY AT THE TOP OF A PACK (James, 23 Oct 2026).
 *
 * "It says what the scan found: 98 things, which is just insane, and then
 * you have to scroll so far down just to get there ... we should just give
 * her an answer saying we think that this is a fail or a pass."
 *
 * The scan reads each file on its own and says everything it sees, so a full
 * pack comes back as dozens of lines, most of them fine or trivial. This
 * reads those lines together, with the pack's facts, and says in a few
 * sentences what actually matters and what the OS would do: pass, fail, or
 * look at one thing first. The lines are still there, a click away.
 *
 * It is a recommendation. The person checking still decides, and the shadow
 * log (lib/plc-shadow) still records the rules' own verdict apart from this.
 *
 * Written once per pack and kept (os_plc_cases.ai_summary). `basis` is a hash
 * of everything it read, so a pack that changes - a file replaced, a fresh
 * scan, a reason added - is summarised again the next time it opens.
 */

/** What the summary was written from. Change any of it and it is written again. */
export function summaryBasis(c: PlcCase): string {
  const facts = {
    findings: c.findings.map((f) => [f.checkId, f.level, f.message, f.documentName ?? "", f.waiting ? 1 : 0]),
    documents: c.documents.map((d) => [d.checkId, d.key, d.covers ?? []]).sort(),
    waivers: (c.waivers ?? []).map((w) => [w.checkId, w.reason]),
    moveIn: c.moveInDate,
    letType: c.letType ?? null,
    scannedAt: c.scannedAt,
  };
  return crypto.createHash("sha256").update(JSON.stringify(facts)).digest("hex").slice(0, 24);
}

/** A kept summary that still describes the pack as it is. */
export function freshSummary(c: PlcCase): PlcAiSummary | null {
  return c.aiSummary && c.aiSummary.basis === summaryBasis(c) ? c.aiSummary : null;
}

const SYSTEM = `You help Kirstie, the pre-tenancy compliance officer at The Letting Experts, a UK letting agent, decide whether a pre-let compliance (PLC) pack is ready.

An automated reader has already read every document in the pack one at a time and listed everything it noticed. It is thorough and over-cautious: it flags things that do not matter, repeats itself across documents, and treats small differences (a middle name, an abbreviation, a flat letter, a date format) as problems. Kirstie's complaint is that it is far too harsh and too long.

Your job is to read the whole list together, as an experienced compliance officer would, and say plainly:
- whether you think the pack is a pass, a fail, or needs one or two things looked at first,
- the few things that genuinely matter, and
- in one sentence, what the reader flagged that can be ignored.

What genuinely stops a let in England: a gas safety record, EICR or EPC that is missing or out of date on the move-in date (where the home has gas, or needs one); an EPC rated F or G; a missing licence where the council licenses the home; no Right to Rent evidence for an adult tenant; no landlord ID; a document for the wrong property; an unsatisfactory EICR (C1, C2 or FI) or an 'at risk' / 'immediately dangerous' gas item with no remedial evidence; a referencing outcome of decline with no guarantor. An HMO also needs fire safety, alarms and emergency lighting evidence.

What does not stop a let: name formatting differences, missing middle names, abbreviations, an address written slightly differently, C3 observations, an EPC of E or better, a certificate that is valid on the move-in date even if it runs out a few months later (mention it only as worth chasing), a reader that could not read a page, anything the agent has explained in a reason that is sensible.

Write in UK English, plainly, as a colleague would. No em dashes; use a hyphen. Never say "compliant", "legally" or "approved". Do not invent facts: use only what you are given.

Answer by calling the summarise_pack tool once.`;

const TOOL: Anthropic.Tool = {
  name: "summarise_pack",
  description: "Your read of the whole pack, for the top of the review screen.",
  input_schema: {
    type: "object",
    properties: {
      verdict: {
        type: "string",
        enum: ["pass", "fail", "review"],
        description: "pass: nothing here stops the let. fail: at least one thing stops the let as it stands. review: probably fine, but one or two things need a person to look before deciding.",
      },
      headline: {
        type: "string",
        description: "One short sentence, the answer: e.g. \"I think this is a pass.\" or \"I think this fails on the gas certificate.\"",
      },
      summary: {
        type: "string",
        description: "Two to four sentences: what was sent, what is in order, and what matters. Name certificates, dates and people where it helps.",
      },
      points: {
        type: "array",
        maxItems: 5,
        description: "Only the things that genuinely matter, most serious first. Empty when there are none.",
        items: {
          type: "object",
          properties: {
            checkId: { type: "string", enum: PLC_CHECKS.map((c) => c.id), description: "Which check it is about." },
            level: { type: "string", enum: ["blocker", "query"], description: "blocker: stops the let as it stands. query: worth a look." },
            text: { type: "string", description: "One sentence a colleague can act on." },
          },
          required: ["level", "text"],
        },
      },
      noise: {
        type: "string",
        description: "One sentence on what the reader flagged that does not matter, e.g. \"The 14 name and address lines are formatting differences.\" Empty string when nothing.",
      },
    },
    required: ["verdict", "headline", "summary", "points", "noise"],
  },
};

const longDate = (ymd: string | null | undefined) =>
  ymd ? new Date(`${ymd.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : "not given";

/** The pack, as text for the model. Facts only: no names beyond what the check needs. */
function packText(c: PlcCase): string {
  const lines: string[] = [];
  lines.push(`Property: ${c.address}`);
  lines.push(`Sent by: ${c.agentName}`);
  lines.push(`Move-in date: ${longDate(c.moveInDate)}`);
  lines.push(`Type of let: ${c.letType === "hmo" ? "HMO (shared house)" : c.letType === "home" ? "an ordinary home" : "not said"}`);
  if (c.agentNote.trim()) lines.push(`The agent's note: ${c.agentNote.trim()}`);

  lines.push("", "The checks, and what is filed against each:");
  for (const check of PLC_CHECKS) {
    const gate = gateOf(check, c.letType);
    const files = c.documents.filter((d) => d.checkId === check.id || d.covers?.includes(check.id));
    const waived = (c.waivers ?? []).find((w) => w.checkId === check.id);
    if (!files.length && !waived && (gate === "optional" || gate === "after")) continue;
    const filed = files.length
      ? files
          .map((d) => {
            const bits = [docTitle(d)];
            if (d.read?.expiryDate) bits.push(`valid until ${longDate(d.read.expiryDate)}`);
            if (d.placeholder) bits.push("name only, no file stored");
            if (d.replaces) bits.push(`put on by compliance in place of "${d.replaces.name}"`);
            return bits.join(", ");
          })
          .join("; ")
      : waived
        ? `nothing, marked not needed: "${waived.reason}"`
        : "NOTHING FILED";
    lines.push(`- ${check.label} (${gate}): ${filed}`);
  }

  const anyway = sentAnywayNow(c);
  if (anyway) {
    lines.push("", `The agent sent this past ${anyway.warnings.length} warning(s), saying: "${anyway.reason}"`);
  }

  const replaced = c.documents.filter((d) => d.replaces);
  if (replaced.length) {
    lines.push(
      "",
      `Compliance replaced ${replaced.length} file(s) after the reader ran, so reader lines about ${replaced
        .map((d) => `"${d.replaces!.name}"`)
        .join(", ")} are about a file no longer on the pack.`
    );
  }

  lines.push("", `What the reader noticed (${c.findings.length} lines):`);
  if (!c.findings.length) lines.push("- Nothing.");
  for (const f of c.findings) {
    const label = checkById(f.checkId)?.label ?? f.checkId;
    lines.push(
      `- [${f.waiting ? "not read yet" : f.level}] ${label}${f.documentName ? ` (${f.documentName})` : ""}: ${f.message}`
    );
  }
  return lines.join("\n");
}

const VERDICTS = new Set(["pass", "fail", "review"]);

/** Write the summary. Throws AiUnavailable (a plain sentence) when Claude can't be reached. */
export async function writeSummary(c: PlcCase): Promise<PlcAiSummary> {
  const res = await aiCreate("plc-summary", {
    max_tokens: 2000,
    system: SYSTEM,
    tools: [TOOL],
    tool_choice: { type: "tool", name: TOOL.name },
    messages: [{ role: "user", content: packText(c) }],
  });
  const use = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === TOOL.name);
  const out = (use?.input ?? {}) as {
    verdict?: string;
    headline?: string;
    summary?: string;
    points?: { checkId?: string; level?: string; text?: string }[];
    noise?: string;
  };
  if (!out.verdict || !VERDICTS.has(out.verdict) || !out.headline) {
    throw new Error("The summary came back empty. Try again.");
  }
  /* Em dashes out, whatever the model does (house rule for anything a person reads). */
  const tidy = (s: string | undefined) => String(s ?? "").replace(/\s*[—–]\s*/g, " - ").trim();
  return {
    verdict: out.verdict as PlcAiSummary["verdict"],
    headline: tidy(out.headline),
    summary: tidy(out.summary),
    points: (out.points ?? [])
      .filter((p) => p.text)
      .slice(0, 5)
      .map((p) => ({
        checkId: p.checkId && checkById(p.checkId as CheckId) ? (p.checkId as CheckId) : null,
        level: p.level === "blocker" ? "blocker" : "query",
        text: tidy(p.text),
      })),
    noise: tidy(out.noise),
    basis: summaryBasis(c),
    at: new Date().toISOString(),
    model: res.model || aiModel("plc-summary"),
  };
}
