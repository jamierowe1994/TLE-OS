"use client";

import { useRouter } from "next/navigation";

/**
 * One thing the assistant said, with the screens he mentioned turned into
 * buttons that actually go there.
 *
 * ── Why links at all ──────────────────────────────────────────────────────
 *
 * James, 29 Aug: asked for booking a market appraisal, he should be able to
 * "show/tell us". Telling somebody the answer is on Market Appraisals and
 * leaving them to find Market Appraisals is half an answer — the person asking
 * is mid-task and stuck, and the rail is the thing they were already failing to
 * navigate. So every screen he names becomes a way of getting to it.
 *
 * ── Why the routes are allowlisted ────────────────────────────────────────
 *
 * He writes them as ordinary markdown links, which models are near-perfect at.
 * But near-perfect is not perfect, and an invented route is a button that
 * confidently lands on a 404 — which is a worse experience than the plain text
 * it replaced, because the agent now believes the OS is broken rather than that
 * the help was vague.
 *
 * So a link only becomes a button if its href is one of the screens the server
 * actually has (see AGENT_NAV in lib/nav.ts, handed over by the ask route).
 * Anything else degrades to its own label as plain text. The failure mode is a
 * slightly flatter sentence, which nobody notices.
 *
 * That allowlist is a safety boundary as well as a correctness one: it is the
 * reason model output can never navigate this app somewhere off-site.
 */

export type Screen = { href: string; label: string };

/** `[Market Appraisals](/market-appraisals)` — nothing more exotic. */
const LINK = /\[([^\]]+)\]\((\/[^)\s]*)\)/g;

export default function AssistantSays({
  text,
  screens,
  onNavigate,
}: {
  text: string;
  screens: Screen[];
  onNavigate?: () => void;
}) {
  const router = useRouter();

  /* Split the sentence into text and links in one pass, and collect the ones
     that survive the allowlist. Order preserved and de-duplicated: he often
     names the same screen twice in three sentences, and two identical buttons
     reads as a bug. */
  const parts: string[] = [];
  const targets: Screen[] = [];
  let last = 0;

  for (const m of text.matchAll(LINK)) {
    const [whole, label, href] = m;
    const at = m.index ?? 0;
    parts.push(text.slice(last, at));
    /* Compared bare, so a query string on the end (?side=landlord) still
       matches the screen it belongs to and still gets to keep it. */
    const known = screens.find((s) => s.href === href || href.startsWith(`${s.href}?`));
    parts.push(label);
    if (known && !targets.some((t) => t.href === href)) {
      targets.push({ href, label });
    }
    last = at + whole.length;
  }
  parts.push(text.slice(last));

  const go = (href: string) => {
    router.push(href);
    onNavigate?.();
  };

  return (
    <div className="mr-6 rounded-2xl rounded-bl-md bg-box px-3 py-2">
      <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed">{parts.join("")}</p>
      {targets.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {targets.map((t) => (
            <button
              key={t.href}
              type="button"
              onClick={() => go(t.href)}
              className="rounded-full border border-accent-dark/40 bg-accent-soft px-2.5 py-1 text-[11.5px] text-accent-dark transition-colors hover:bg-accent-dark hover:text-white"
            >
              {t.label}
              <span aria-hidden className="ml-1">
                &rarr;
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
