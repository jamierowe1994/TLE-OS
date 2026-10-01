/**
 * One recipient's copy of a newsletter or event email (lib/newsletters).
 *
 * Its own module, with nothing server-only in it, so the studio's Preview in
 * the browser and the sender on the server run the same code - what she
 * previews is what arrives.
 */
import { renderTemplate, renderTokens, mergeContextFor } from "@/lib/email/render.js";
import { tleBrand, tleSocial } from "@/lib/campaign-mail";

type Recipient = { email: string; name: string };

let seq = 0;
const fid = () => `nlf_${(seq++).toString(36)}`;

/** The standard footer: who sent it. No unsubscribe - this is the team. */
function footer(): Record<string, unknown> {
  return {
    type: "footer",
    id: fid(),
    note: "Sent to the TLE team from TLE OS.",
    address: "The Letting Experts",
    showSocial: false,
    unsubscribe: false,
  };
}

/**
 * One recipient's copy. The team's letterhead (tleBrand "internal": the red
 * off the logo, as every staff email has had since 16 Sep 2026).
 */
export function renderNewsletter(
  n: { subject: string; preheader: string; blocks: Record<string, unknown>[] },
  to: Recipient
): { subject: string; html: string } {
  /* The team letterhead, with the company's social links so a Social block works. */
  const brand = { ...tleBrand("internal"), ...tleSocial() };
  const blocks = n.blocks.some((b) => b?.type === "footer") ? [...n.blocks] : [...n.blocks, footer()];
  const ctx = mergeContextFor({ name: to.name, email: to.email }, brand) as Record<string, unknown>;
  const mergeCtx = { ...ctx, firstName: (ctx.firstName as string) || "there" };
  const subjectLine = n.subject.trim() || "A message from The Letting Experts";
  const out = renderTemplate({ name: subjectLine, subject: subjectLine, preheader: n.preheader, blocks }, { brand, mergeCtx });
  const raw = typeof out === "string" ? out : (out?.html ?? "");
  const subject = typeof out === "string" ? subjectLine : (out?.subject ?? subjectLine);
  return { subject: renderTokens(subject, mergeCtx), html: renderTokens(raw, mergeCtx) };
}


