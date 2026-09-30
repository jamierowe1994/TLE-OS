import "server-only";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { R2_BUCKET, r2Configured, withR2 } from "@/lib/r2";
import { msConnectionFor, msSendMail } from "@/lib/microsoft";
import { switchOn } from "@/lib/switches";
import { getCase, recordRlpRequest } from "@/lib/plc-store";
import type { CheckId, PlcCase, PlcDocument, RlpRequest } from "@/lib/plc";

/**
 * The Rent and Legal Protection request, emailed to Legal for Landlords.
 *
 * James, 30 Sep 2026. Today the agent ticks RLP on Propoly's PLC form and it
 * reaches the RLP team without anybody checking the referencing qualifies
 * (Michael's guarantor case: accepted at PLC, refused for RLP). In the OS the
 * agent answers yes or no, compliance approve the pack, and THEN the request
 * goes, from the approver's own mailbox so the reply comes back to them.
 *
 * Email, not an API: neither Propoly (Legal for Landlords own it) nor PayProp
 * has a way to request cover from outside. If Legal for Landlords give us an
 * endpoint, this file is the one place that changes.
 *
 * ── What stops it ─────────────────────────────────────────────────────────
 *
 *   - the "rlp_requests" switch, off until James arms it
 *   - RLP_TEAM_EMAIL, the RLP team's address, unset until he has it
 *   - the approver's Outlook not being connected
 *
 * A test to the approver's own inbox needs only the last one, so the email
 * can be seen before anything goes to Legal for Landlords.
 */

/** The referencing is what RLP is written on, so that is what goes. */
const RLP_CHECKS: CheckId[] = ["tenant-checks", "guarantor-checks"];

/** Graph takes the bytes inline up to about 4MB a message, base64 included. */
const MAX_BYTES = 2_800_000;

export function rlpTeamEmail(): string {
  return (process.env.RLP_TEAM_EMAIL ?? "").trim();
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const day = (ymd: string | null) =>
  ymd ? new Date(`${ymd.slice(0, 10)}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "not set";

export function rlpFiles(c: PlcCase): PlcDocument[] {
  return c.documents.filter((d) => RLP_CHECKS.includes(d.checkId) && !d.placeholder);
}

export function rlpEmail(c: PlcCase): { subject: string; html: string; files: string[] } {
  const files = rlpFiles(c).map((d) => d.name);
  const guarantor = c.documents.some((d) => d.checkId === "guarantor-checks");
  const rows: [string, string][] = [
    ["Property", c.address],
    ["Tenancy starts", day(c.moveInDate)],
    ["Agent", c.agentName],
    ["Guarantor", guarantor ? "Yes, referencing attached" : "No"],
    ["Pre-let check", `Approved by ${c.decidedBy ?? "compliance"}`],
  ];
  const html = `
<p>Hello,</p>
<p>Please set up Rent and Legal Protection on the tenancy below. Our pre-let check has been approved and the referencing is attached.</p>
<table cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-size:14px">
${rows.map(([k, v]) => `<tr><td style="color:#6b6b6b;padding-right:18px">${esc(k)}</td><td>${esc(v)}</td></tr>`).join("\n")}
</table>
<p>${files.length ? `Attached: ${files.map(esc).join(", ")}.` : "No referencing files were on the pack, so nothing is attached. Reply and we will send them."}</p>
<p>Thank you.</p>`.trim();
  return { subject: `RLP request: ${c.address}, starting ${day(c.moveInDate)}`, html, files };
}

async function attachmentsFor(c: PlcCase): Promise<{ filename: string; content: string; contentType: string }[]> {
  const docs = rlpFiles(c);
  if (!docs.length) return [];
  if (!r2Configured) throw new Error("File storage isn't connected here, so the referencing can't be attached.");
  let total = 0;
  const out: { filename: string; content: string; contentType: string }[] = [];
  for (const d of docs) {
    const got = await withR2(async (client) => {
      const res = await client.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: d.key }));
      const bytes = await res.Body?.transformToByteArray();
      if (!bytes) throw new Error(`${d.name} came back empty from storage.`);
      return { bytes, type: res.ContentType || (d.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "application/octet-stream") };
    });
    total += got.bytes.length;
    if (total > MAX_BYTES) {
      throw new Error("The referencing is too large to email in one go (over about 3MB). Send it from Propoly this time.");
    }
    out.push({ filename: d.name, content: Buffer.from(got.bytes).toString("base64"), contentType: got.type });
  }
  return out;
}

/**
 * Send the request, or a copy to the sender's own inbox.
 *
 * Recorded on the case either way, failures too, so "did the RLP go?" has an
 * answer on the pack rather than in somebody's Sent Items. A test is NOT
 * recorded: it proves the email, not the request.
 */
export async function sendRlpRequest(
  id: string,
  sender: { id: string; name: string; email: string },
  opts: { test: boolean }
): Promise<{ case: PlcCase; sentTo: string }> {
  const c = await getCase(id);
  if (!c) throw new Error("That handover no longer exists.");
  if (c.state !== "approved") throw new Error("The RLP request goes after the final approval, not before.");
  if (c.rlpWanted !== true) throw new Error("The agent did not ask for Rent and Legal Protection on this one.");

  /* What stops the real send is said before the mailbox, because that is
     the thing nobody at the desk can fix. */
  if (!opts.test) {
    if (!rlpTeamEmail()) throw new Error("The RLP team's address isn't set yet (RLP_TEAM_EMAIL). Ask James.");
    if (!(await switchOn("rlp_requests"))) {
      throw new Error("RLP requests are switched off. James turns them on in Admin > Switches.");
    }
  }
  const conn = await msConnectionFor(sender.id);
  if (!conn.connected) throw new Error("Connect your Outlook on your Profile first. The request goes from your own mailbox.");
  const to = opts.test ? conn.email || sender.email : rlpTeamEmail();

  const mail = rlpEmail(c);
  const record = (outcome: RlpRequest["outcome"], note: string): RlpRequest => ({
    at: new Date().toISOString(),
    by: sender.name,
    to,
    outcome,
    note,
    files: mail.files,
  });

  try {
    const attachments = await attachmentsFor(c);
    await msSendMail(sender.id, {
      to: { email: to },
      subject: opts.test ? `[Test] ${mail.subject}` : mail.subject,
      body: mail.html,
      attachments,
    });
  } catch (e) {
    const why = e instanceof Error ? e.message : "The send failed.";
    if (!opts.test) await recordRlpRequest(id, record("failed", why));
    throw new Error(why);
  }
  if (opts.test) return { case: c, sentTo: to };
  const saved = await recordRlpRequest(
    id,
    record("sent", mail.files.length ? `${mail.files.length} file${mail.files.length === 1 ? "" : "s"} attached` : "Sent without files")
  );
  return { case: saved, sentTo: to };
}
