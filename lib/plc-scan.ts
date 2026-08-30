import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { R2_BUCKET, r2Configured, withR2 } from "@/lib/r2";
import {
  checkById,
  PLC_CHECKS,
  type CheckId,
  type Finding,
  type FindingLevel,
  type PlcCase,
  type PlcDocument,
} from "@/lib/plc";
import { judge, reasonsAsFindings, type DocFacts, type RuleResult } from "@/lib/plc-rules";

/**
 * Reading the pack.
 *
 * ── What this is allowed to do ─────────────────────────────────────────────
 *
 * Report what it saw. A date, a name, a missing page. Nothing here returns a
 * verdict, nothing here changes a case's state past `reviewing`, and the
 * prompt says so in the words the model will be judged against. Kirstie
 * decides; this exists to save her from typing nine expiry dates into a
 * calculator.
 *
 * The strongest thing a finding can be is `blocker`, which means "a person
 * should look at this before letting the property" -- not "refused".
 *
 * ── One call per document, not one call per pack ───────────────────────────
 *
 * A pack is nine-ish PDFs. Sent together they blur: the model attributes a
 * date from the EICR to the gas certificate, and the finding names the wrong
 * document. One call per document means every finding can name the file it
 * came from, which is what makes it checkable -- Kirstie can open the same
 * page and see the same thing.
 *
 * It is also how a single unreadable scan stays local. One 40MB corrupt PDF
 * fails its own check and the other eight still come back.
 *
 * ── Checks the model is not asked about ────────────────────────────────────
 *
 * `scan: "none"` -- Right to Rent -- is never sent. Not "sent and ignored":
 * never sent. A model asked to look at a share code will produce a confident
 * sentence about it, and a confident sentence about a statutory immigration
 * check is exactly the thing that must not appear on this screen.
 */

/**
 * What one document read produces.
 *
 * Three parts, and the separation is the point. `observations` are prose for a
 * person. `facts` are values a rule can act on. `result` is what the rules in
 * lib/plc-rules decided from those facts - never what the model decided.
 */
export type DocRead = {
  facts: DocFacts;
  result: RuleResult;
  observations: Finding[];
  documentName: string;
};

const MODEL = "claude-opus-4-8";

/** Enough for a handful of sentences about one document. */
const MAX_TOKENS = 700;

/** Bytes we will pull out of the bucket for one document. Above this the file
 *  is almost certainly a scan of the whole tenancy pack rather than one
 *  certificate, and it goes to Kirstie unread rather than costing a fortune. */
const MAX_BYTES = 12 * 1024 * 1024;

export const scanConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY);

/* ─────────────────────────────── prompting ─────────────────────────────── */

const SYSTEM = `You are reading one document from a UK lettings compliance pack, on behalf of a
letting agent's compliance officer.

You do NOT decide whether anything is compliant. You report what the document
says. A human reads everything you produce and makes the decision. Never write
"passed", "compliant", "approved", "all good" or any equivalent.

Report only what you can actually see in the document. If a field is not
visible, illegible, or the document is not the type you were told to expect,
say that plainly - that is a useful finding, not a failure.

Never infer a date. If an expiry is not printed, say it is not printed rather
than calculating one from an issue date, unless the certificate type has a
statutory duration and you say explicitly that you derived it.

Be brief. One sentence per finding, in plain British English, addressed to a
colleague who has the document open in front of them.`;

function askFor(doc: PlcDocument, c: PlcCase): string {
  const check = checkById(doc.checkId);
  const moveIn = c.moveInDate ?? "unknown";
  const common = `This document was filed against the check "${check?.label ?? doc.checkId}".
The property is ${c.address}. The tenancy is due to start on ${moveIn}.
The file is named "${doc.name}".`;

  switch (check?.scan) {
    case "dates":
      return `${common}

Read the certificate and report:
- what type of certificate it actually is
- the issue date and the expiry date exactly as printed
- whether it is still in date ON ${moveIn} (state the comparison, do not call it a pass)
- the outcome or rating printed on it, if it has one
- the property address printed on it, and whether it matches ${c.address}`;

    case "reading":
      return `${common}

Read the document and report:
- what it actually is
- every person named on it, and their role
- the key dates, figures and amounts printed on it
- anything left blank, unsigned or inconsistent within the document itself`;

    default:
      return `${common}

Say what this document is, whether it appears to be the thing the check asks
for, and note anything obviously missing, expired or unsigned.`;
  }
}

/* ──────────────────────────── the tool schema ──────────────────────────── */

/**
 * Findings come back through a tool, not as prose.
 *
 * Prose would have to be parsed, and a parser is where "unsatisfactory" turns
 * into a green tick because a regex looked for the word "satisfactory". The
 * schema also refuses a level the product does not have, which is the cheapest
 * possible way to stop the model inventing "pass".
 */
const REPORT_TOOL: Anthropic.Tool = {
  name: "report_findings",
  description:
    "Report what you read in this document. One entry per observation. This is not a verdict.",
  input_schema: {
    type: "object",
    properties: {
      findings: {
        type: "array",
        items: {
          type: "object",
          properties: {
            level: {
              type: "string",
              enum: ["blocker", "query", "ok"],
              description:
                "blocker: a person must resolve this before the property is let (out of date on the move-in date, wrong property, unsigned, a failed outcome). query: worth a human look but not obviously wrong. ok: read cleanly and matched what was expected.",
            },
            message: {
              type: "string",
              description:
                "One sentence a colleague can act on, naming the dates or people you read. Never says passed or compliant.",
            },
            foundDate: {
              type: "string",
              description: "The relevant date as printed, ISO YYYY-MM-DD, if there is one.",
            },
          },
          required: ["level", "message"],
        },
      },

      /* ── The half the rules run on ────────────────────────────────────────

         Findings above are prose for a person to read. These are FACTS for
         lib/plc-rules to decide on, and they are asked for separately on
         purpose: a fact the model has to state as a bare date or an enum is
         far harder to be vague about than the same fact buried in a sentence.

         Nothing here asks for a verdict. There is deliberately no "compliant"
         field, because the moment one exists somebody downstream will read it
         instead of running the rules. */
      facts: {
        type: "object",
        description:
          "The specific values you read off the document. Leave a field out if it is not visible - never guess. These are checked by rules, so a wrong value here is worse than a missing one.",
        properties: {
          documentType: { type: "string", description: "What the document calls itself." },
          isExpectedType: {
            type: "string",
            enum: ["yes", "no", "unclear"],
            description: "Is this the certificate type the check asked for?",
          },
          issueDate: { type: "string", description: "ISO YYYY-MM-DD, as printed." },
          expiryDate: {
            type: "string",
            description:
              "The expiry or next-due date as PRINTED, ISO YYYY-MM-DD. Do not calculate one.",
          },
          expiryWasDerived: {
            type: "boolean",
            description:
              "True if no expiry was printed and you worked it out from the issue date. Be honest: this downgrades the result rather than failing it.",
          },
          addressOnDocument: { type: "string", description: "The property address as printed." },
          addressMatches: {
            type: "string",
            enum: ["yes", "no", "unclear"],
            description:
              "Does it match the property given? A spelling difference or a missing postcode is still yes; a different street is no.",
          },
          outcome: {
            type: "string",
            enum: ["satisfactory", "unsatisfactory", "not stated", "other"],
            description: "The overall result printed on the certificate.",
          },
          ratingLetter: { type: "string", description: "EPC only: the band letter, A to G." },
          outstandingDefects: {
            type: "array",
            items: { type: "string" },
            description:
              "Anything the certificate flags as needing work or being at risk - C1, C2 or FI on an EICR, 'at risk' or 'immediately dangerous' on a CP12, a reading outside the normal range. One short phrase each. Empty if none.",
          },
          signed: {
            type: "string",
            enum: ["yes", "no", "unclear"],
            description: "Signed and dated by whoever issued it.",
          },
          peopleNamed: {
            type: "array",
            items: { type: "string" },
            description: "Every person named on the document, for the people-based checks.",
          },
        },
        required: ["isExpectedType", "addressMatches", "outcome", "signed"],
      },
    },
    required: ["findings", "facts"],
  },
};

/* ───────────────────────────── fetching bytes ──────────────────────────── */

type Fetched = { media: string; base64: string };

async function fetchDocument(doc: PlcDocument): Promise<Fetched> {
  /* A name with no bytes behind it. Reported as unreadable rather than
     skipped, so a placeholder can never pass through the pack unremarked. */
  if (doc.placeholder) throw new Error("it was recorded by name only and never stored");
  if (!r2Configured) throw new Error("file storage isn't configured on this environment");
  const body = await withR2(async (client) => {
    const res = await client.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: doc.key }));
    const bytes = await res.Body?.transformToByteArray();
    if (!bytes) throw new Error("the stored file came back empty");
    return { bytes, type: res.ContentType ?? "" };
  });
  if (body.bytes.byteLength > MAX_BYTES) {
    throw new Error(
      `it is ${(body.bytes.byteLength / 1024 / 1024).toFixed(1)}MB, too big to read automatically`
    );
  }
  /* Trust the stored content type, falling back to the extension. A PDF sent
     as an image block is rejected by the API with a message nobody outside
     this file would understand. */
  const media =
    body.type ||
    (doc.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg");
  return { media, base64: Buffer.from(body.bytes).toString("base64") };
}

function contentBlock(f: Fetched): Anthropic.ContentBlockParam {
  if (f.media === "application/pdf") {
    return {
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: f.base64 },
    };
  }
  return {
    type: "image",
    source: {
      type: "base64",
      media_type: f.media as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
      data: f.base64,
    },
  };
}

/* ──────────────────────────────── the scan ─────────────────────────────── */

/**
 * One document, already in memory, read against one check.
 *
 * Split out from scanOne so the bench at /plc/bench can run THE SAME prompt,
 * the same tool schema and the same model as the real scan. A test harness
 * with its own prompt tests the harness. If this function is changed, both
 * change together, which is the only arrangement in which trying it on a real
 * certificate proves anything about what compliance will see.
 */
export async function readDocument(
  client: Anthropic,
  file: { name: string; media: string; base64: string },
  context: { checkId: CheckId; address: string; moveInDate: string | null }
): Promise<DocRead> {
  const asDoc: PlcDocument = {
    checkId: context.checkId,
    name: file.name,
    key: "",
    url: "",
    addedAt: "",
    addedBy: "",
  };
  const asCase = {
    address: context.address,
    moveInDate: context.moveInDate,
  } as PlcCase;

  const res = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM,
    tools: [REPORT_TOOL],
    tool_choice: { type: "tool", name: "report_findings" },
    messages: [
      {
        role: "user",
        content: [
          contentBlock({ media: file.media, base64: file.base64 }),
          { type: "text", text: askFor(asDoc, asCase) },
        ],
      },
    ],
  });

  const call = res.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "report_findings"
  );
  const input = (call?.input ?? {}) as { findings?: unknown[]; facts?: Record<string, unknown> };

  const observations = (input.findings ?? []).flatMap((r): Finding[] => {
    const f = r as { level?: string; message?: string; foundDate?: string };
    const message = (f.message ?? "").trim();
    if (!message) return [];
    const level: FindingLevel =
      f.level === "blocker" || f.level === "query" || f.level === "ok" ? f.level : "query";
    return [
      {
        checkId: context.checkId,
        level,
        message,
        documentName: file.name,
        foundDate: /^\d{4}-\d{2}-\d{2}$/.test(f.foundDate ?? "") ? f.foundDate! : null,
      },
    ];
  });

  const facts = readFacts(input.facts);
  const result = judge(context.checkId, facts, context.moveInDate);

  return { facts, result, observations, documentName: file.name };
}

/**
 * The model's facts, coerced into the shape the rules expect.
 *
 * Every field is validated rather than cast. A date that is not a date becomes
 * null, and null means REVIEW - so a malformed answer degrades into "a person
 * should look" instead of into a rule silently not firing.
 */
function readFacts(raw: unknown): DocFacts {
  const f = (raw ?? {}) as Record<string, unknown>;
  const str = (k: string) => (typeof f[k] === "string" && f[k] ? (f[k] as string) : null);
  const date = (k: string) => {
    const v = str(k);
    return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
  };
  const oneOf = <T extends string>(k: string, allowed: readonly T[], fallback: T): T => {
    const v = str(k);
    return v && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
  };
  const list = (k: string) =>
    Array.isArray(f[k]) ? (f[k] as unknown[]).filter((x): x is string => typeof x === "string" && !!x.trim()) : [];

  return {
    documentType: str("documentType"),
    isExpectedType: oneOf("isExpectedType", ["yes", "no", "unclear"] as const, "unclear"),
    issueDate: date("issueDate"),
    expiryDate: date("expiryDate"),
    expiryWasDerived: f.expiryWasDerived === true,
    addressOnDocument: str("addressOnDocument"),
    addressMatches: oneOf("addressMatches", ["yes", "no", "unclear"] as const, "unclear"),
    outcome: oneOf(
      "outcome",
      ["satisfactory", "unsatisfactory", "not stated", "other"] as const,
      "not stated"
    ),
    ratingLetter: str("ratingLetter"),
    outstandingDefects: list("outstandingDefects"),
    signed: oneOf("signed", ["yes", "no", "unclear"] as const, "unclear"),
    peopleNamed: list("peopleNamed"),
  };
}

async function scanOne(client: Anthropic, doc: PlcDocument, c: PlcCase): Promise<Finding[]> {
  /* Rule reasons first, then the model's prose. Kirstie should meet the
     decision before the commentary. */
  let fetched: Fetched;
  try {
    fetched = await fetchDocument(doc);
  } catch (e) {
    /* A document we could not open is a finding in its own right, and a query
       rather than a blocker: the file may be perfectly good and the fault
       ours. Silently dropping it would leave a check looking unexamined with
       no explanation. */
    return [
      {
        checkId: doc.checkId,
        level: "query",
        message: `Couldn't read ${doc.name} — ${e instanceof Error ? e.message : "it wouldn't open"}. Worth opening by hand.`,
        documentName: doc.name,
        foundDate: null,
      },
    ];
  }

  const read = await readDocument(
    client,
    { name: doc.name, media: fetched.media, base64: fetched.base64 },
    { checkId: doc.checkId, address: c.address, moveInDate: c.moveInDate }
  );
  return [...reasonsAsFindings(doc.checkId, read.result, doc.name), ...read.observations];
}

/**
 * Read every document in the pack, plus one finding per check with nothing
 * filed against it.
 *
 * The missing-document findings are produced HERE rather than left to the
 * screen, so that what Kirstie reads is one list in one order. A gap noticed
 * by the UI and a gap noticed by the scan should not look like different
 * kinds of thing.
 */
export async function scanCase(c: PlcCase): Promise<Finding[]> {
  const findings: Finding[] = [];

  for (const check of PLC_CHECKS) {
    if (check.scan === "none") continue;
    const filed = c.documents.filter((d) => d.checkId === check.id);
    if (filed.length) continue;
    findings.push({
      checkId: check.id,
      level: check.scan === "presence" ? "query" : "blocker",
      /* Licensing is the one that is council-by-council: its absence is a
         question for a human, not an automatic blocker. That distinction is
         carried by `scan: "presence"` rather than a special case on the id. */
      message: `Nothing filed for ${check.label}. ${check.needs}.`,
      foundDate: null,
    });
  }

  if (!scanConfigured()) {
    findings.push({
      checkId: "tenancy-agreement",
      level: "query",
      message:
        "The document reader isn't switched on in this environment, so nothing was read. Every document below needs checking by hand.",
      foundDate: null,
    });
    return findings;
  }

  const client = new Anthropic();
  const readable = c.documents.filter((d) => checkById(d.checkId)?.scan !== "none");

  /* Sequential on purpose. A pack is under ten documents, and firing them all
     at once buys a couple of seconds at the cost of a rate limit that would
     fail the whole scan rather than one document. */
  for (const doc of readable) {
    try {
      findings.push(...(await scanOne(client, doc, c)));
    } catch (e) {
      findings.push({
        checkId: doc.checkId,
        level: "query",
        message: `The reader failed on ${doc.name} — ${e instanceof Error ? e.message : "unknown error"}. Check it by hand.`,
        documentName: doc.name,
        foundDate: null,
      });
    }
  }

  return findings;
}

/** Which checks the scan genuinely looked at, for the screen to say so. */
export function checksExamined(c: PlcCase): CheckId[] {
  return PLC_CHECKS.filter((k) => k.scan !== "none")
    .filter((k) => c.documents.some((d) => d.checkId === k.id))
    .map((k) => k.id);
}
