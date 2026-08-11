// The ported TMKE renderer — plain JS, inferred rather than typed.
import { renderTemplate, renderTokens, defaultBrand, mergeContextFor } from "./email/render.js";
import type { CampaignStep } from "./campaigns";

/**
 * A campaign step, turned into an email.
 *
 * The renderer came from TMKE and still carries TMKE's brand as its default,
 * so the one thing this file must never do is let that default through: a
 * landlord getting a lettings follow-up signed by another company is worse
 * than getting nothing. `tleBrand()` overrides every field that says a name.
 *
 * The template is assembled from the step's paragraphs rather than stored as
 * blocks, because campaigns.ts should stay readable as prose. The moment the
 * editor UI exists it can write real blocks in here instead — the send path
 * won't know the difference.
 */

/**
 * Where the logo can be fetched FROM.
 *
 * An email is opened somewhere else entirely, so the logo needs an absolute
 * URL on a host that answers without a cookie — hence /brand being exempt
 * from the access gate.
 *
 * Resolved at BUILD time (see next.config.ts) rather than from
 * window.location, so the server and the browser produce the same HTML. They
 * did not at first, and React keeps the server's version on hydration — which
 * showed up as a logo that was in the markup and never on the screen.
 *
 * With nothing configured this is "", and the renderer falls back to the
 * wordmark: a missing logo reads as restraint, a broken image reads as a
 * broken company.
 */
function assetOrigin(): string {
  return (process.env.NEXT_PUBLIC_OS_ORIGIN ?? "").replace(/\/+$/, "");
}

export function tleBrand() {
  const origin = assetOrigin();
  return {
    ...defaultBrand(),
    companyName: "The Letting Experts",
    signatureName: "The Letting Experts",
    website: "https://thelettingexperts.co.uk",
    logo: origin ? `${origin}/brand/tle-logo.png` : "",
    // The red off the logo itself, not the OS's clay accent: the OS is where
    // the team works and can be repainted at will, an email is the company.
    accentColor: "#e31f36",
    bgColor: "#f6f4f2",
  };
}

type Recipient = { name?: string; email?: string; address?: string };

let n = 0;
const id = () => `cs_${(n++).toString(36)}`;

/** Copy written in the editor, which overrides whatever the step says in code. */
export type StepCopy = { subject?: string; blocks: Record<string, unknown>[] };

/**
 * The standard footer, added here rather than left to whoever is writing — an
 * unsubscribe nobody can forget to include is the only kind worth having.
 *
 * Marketing gets the unsubscribe; a transactional email does NOT. Offering to
 * unsubscribe someone from the confirmation of the appointment they booked
 * this morning is nonsense, and worse, it teaches people that our unsubscribe
 * link is noise.
 */
export function footerBlock(marketing = true): Record<string, unknown> {
  return {
    type: "footer",
    id: id(),
    note: marketing
      ? "You're getting this because we appraised your property. One reply and we'll stop."
      : "",
    address: "The Letting Experts",
    showSocial: false,
    unsubscribe: marketing,
  };
}

/**
 * The blocks a step starts from: its heading, its paragraphs, its call to
 * action. Also what the editor opens with, so a step written in code and one
 * written in the editor are the same thing from here on.
 */
export function blocksFor(step: CampaignStep): Record<string, unknown>[] {
  if (!step.body?.length) return [];
  const blocks: Record<string, unknown>[] = [
    { type: "heading", id: id(), text: step.subject, align: "left", color: "" },
    ...step.body.map((p) => ({ type: "text", id: id(), text: p, bg: "" })),
  ];
  if (step.cta) {
    blocks.push({ type: "button", id: id(), text: step.cta.text, url: step.cta.url, color: "", align: "left" });
  }
  return blocks;
}

/**
 * The rendered email, or null if there is no copy behind the step at all.
 *
 * `copy` is what the editor saved. It wins over the code — that is the whole
 * point of the editor — but the code is still there underneath, so deleting
 * the stored row puts the original back.
 */
export function renderStep(
  step: CampaignStep,
  to: Recipient,
  copy?: StepCopy | null
): { subject: string; html: string } | null {
  if (step.channel !== "email") return null;

  const written = copy?.blocks?.length ? copy.blocks : blocksFor(step);
  if (!written.length) return null;
  const subjectLine = (copy?.subject || step.subject).trim() || step.subject;

  // The footer is appended unless the writer has already placed one, so it
  // can be positioned deliberately but never dropped by accident.
  const blocks = written.some((b) => b?.type === "footer") ? [...written] : [...written, footerBlock()];

  const brand = tleBrand();
  // Built ON TOP of the renderer's own context, never instead of it: the
  // footer's unsubscribe link is a merge token too, and a hand-rolled context
  // ships an email with a literal {{unsubscribe_url}} in the footer.
  const ctx = mergeContextFor(
    {
      name: to.name ?? "",
      email: to.email ?? "",
      unsubscribeUrl: `mailto:hello@thelettingexperts.co.uk?subject=${encodeURIComponent("Unsubscribe")}`,
    },
    brand
  );
  const out = renderTemplate(
    { name: subjectLine, subject: subjectLine, blocks },
    {
      brand,
      mergeCtx: {
        ...ctx,
        firstName: ctx.firstName || "there",
        // Not one of the renderer's own tokens — ours, because every campaign
        // here is about a specific property, and a letter that can't name it
        // reads like a circular.
        //
        // `||`, not `??` — an empty string is what a missing address actually
        // looks like coming out of the database, and "looking at ." is worse
        // than a vague sentence.
        address: to.address || "your property",
      },
    }
  );

  // One last token pass over the finished HTML. The footer block emits a bare
  // {{unsubscribe_url}} on purpose — TMKE's mailer merges it per recipient at
  // send time, one HTML for the whole list. Ours sends one email at a time
  // through REX, which knows nothing about that token, so if this pass isn't
  // here the landlord gets a literal {{unsubscribe_url}} in the footer.
  const raw = typeof out === "string" ? out : (out?.html ?? "");
  const html = renderTokens(raw, ctx);
  const subject = typeof out === "string" ? subjectLine : (out?.subject ?? subjectLine);
  return html ? { subject, html } : null;
}

/**
 * An email an agent typed, put on the letterhead.
 *
 * The pre-appraisal confirmation is written by hand in the composer, so it
 * arrives here as plain paragraphs. It still leaves under the company's name,
 * and the difference between a branded confirmation and a wall of plain text
 * is most of what a landlord judges us on before anyone turns up.
 */
export function renderPlain(subject: string, text: string): { subject: string; html: string } {
  const paras = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  const blocks: Record<string, unknown>[] = [
    ...paras.map((p) => ({ type: "text", id: id(), text: p, bg: "" })),
    footerBlock(false),
  ];
  const brand = tleBrand();
  const out = renderTemplate({ name: subject, subject, blocks }, { brand, mergeCtx: mergeContextFor({}, brand) });
  const raw = typeof out === "string" ? out : (out?.html ?? "");
  return { subject, html: renderTokens(raw, mergeContextFor({}, brand)) };
}
