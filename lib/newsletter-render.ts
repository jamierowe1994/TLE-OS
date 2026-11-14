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
 * The footer of a mail-out to landlords and tenants (James, 14 Nov 2026): who
 * it is from, why they got it, and the unsubscribe. Always this one - a footer
 * placed in the designer is replaced, so the unsubscribe can be moved by
 * nobody and forgotten by nobody.
 */
function customerFooter(): Record<string, unknown> {
  return {
    type: "footer",
    id: fid(),
    note: "You are getting this because you are a landlord or tenant with The Letting Experts, or have been in touch with us about a home.",
    address: "The Letting Experts",
    showSocial: true,
    unsubscribe: true,
  };
}

/** What stands in for the real link in a preview, where there is nobody to unsubscribe. */
export const PREVIEW_UNSUBSCRIBE = "https://thelettingexperts.co.uk/#unsubscribe-link-goes-here";

/**
 * One recipient's copy. The team's letterhead (tleBrand "internal") for a
 * staff newsletter; the customer look and the unsubscribe footer for a
 * mail-out (`customers`), with that person's own unsubscribe link.
 */
export function renderNewsletter(
  n: { subject: string; preheader: string; blocks: Record<string, unknown>[]; audience?: "team" | "customers" },
  to: Recipient,
  opts: { unsubscribeUrl?: string } = {}
): { subject: string; html: string } {
  const customers = n.audience === "customers";
  /* The letterhead, with the company's social links so a Social block works. */
  const brand = { ...tleBrand(customers ? "landlord" : "internal"), ...tleSocial() };
  const blocks = customers
    ? [...n.blocks.filter((b) => b?.type !== "footer"), customerFooter()]
    : n.blocks.some((b) => b?.type === "footer") ? [...n.blocks] : [...n.blocks, footer()];
  const ctx = mergeContextFor(
    { name: to.name, email: to.email, ...(customers ? { unsubscribeUrl: opts.unsubscribeUrl || PREVIEW_UNSUBSCRIBE } : {}) },
    brand
  ) as Record<string, unknown>;
  const mergeCtx = { ...ctx, firstName: (ctx.firstName as string) || "there" };
  const subjectLine = n.subject.trim() || "A message from The Letting Experts";
  const out = renderTemplate({ name: subjectLine, subject: subjectLine, preheader: n.preheader, blocks }, { brand, mergeCtx });
  const raw = typeof out === "string" ? out : (out?.html ?? "");
  const subject = typeof out === "string" ? subjectLine : (out?.subject ?? subjectLine);
  return { subject: renderTokens(subject, mergeCtx), html: renderTokens(raw, mergeCtx) };
}


