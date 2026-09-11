import Link from "next/link";
import DoodleIcon from "@/components/DoodleIcon";
import SignTile from "@/components/landlord/SignTile";
import MessageTile from "@/components/landlord/MessageTile";
import type { LandlordView, ViewStep } from "@/lib/landlord-view";

/**
 * A next step, acted on - shared by the home and journey pages. Every form
 * does the real thing behind the step: signing opens DocuSeal, messaging
 * opens the thread, a link goes where it says. A step with nowhere to go is
 * shown quietly rather than as a button that does nothing.
 *
 * `anchorBase` sends in-page links ("#documents") to the home page when the
 * step is shown somewhere else - the journey page has no documents section.
 */

export const CTA =
  "inline-flex items-center gap-3 rounded-full bg-accent-dark px-7 py-3.5 text-[14px] font-semibold text-white transition-opacity hover:opacity-90";

const hrefOf = (s: ViewStep, anchorBase: string) => (s.href && s.href.startsWith("#") ? `${anchorBase}${s.href}` : s.href);

/** The one next step: signing when there is a contract to sign, else the first in the stage's order. */
export function pickHero(v: LandlordView): ViewStep | null {
  return v.steps.find((s) => s.id === "sign" && ((s.action === "sign" && v.appraisalId) || s.href)) ?? v.steps[0] ?? null;
}

/** The big button on the next-step and current-stage cards. */
export function HeroAction({ s, v, anchorBase = "", label }: { s: ViewStep; v: LandlordView; anchorBase?: string; label?: string }) {
  const text = label ?? s.label;
  if (s.action === "sign" && v.appraisalId) {
    return <SignTile variant="button" appraisalId={v.appraisalId} label={text} sub={s.sub} icon={s.icon} />;
  }
  if (s.action === "message") {
    return (
      <MessageTile variant="button" appraisalId={v.appraisalId ?? null} agentName={v.agent?.name ?? null} messages={v.messages ?? []} label={text} sub={s.sub} icon={s.icon} />
    );
  }
  const href = hrefOf(s, anchorBase);
  if (!href) return null;
  return s.external ? (
    <a href={href} target="_blank" rel="noreferrer" className={CTA}>
      {text} <span aria-hidden>→</span>
    </a>
  ) : (
    <Link href={href} className={CTA}>
      {text} <span aria-hidden>→</span>
    </Link>
  );
}

/** One row of "What you can do now". */
export function StepRow({ s, v, anchorBase = "" }: { s: ViewStep; v: LandlordView; anchorBase?: string }) {
  if (s.action === "sign" && v.appraisalId) {
    return <SignTile variant="row" appraisalId={v.appraisalId} label={s.label} sub={s.sub} icon={s.icon} />;
  }
  if (s.action === "message") {
    return (
      <MessageTile variant="row" appraisalId={v.appraisalId ?? null} agentName={v.agent?.name ?? null} messages={v.messages ?? []} label={s.label} sub={s.sub} icon={s.icon} />
    );
  }
  const inner = (
    <>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line/60 text-muted">
        <DoodleIcon name={s.icon} size={16} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-semibold">{s.label}</span>
        <span className="block text-[12px] text-muted">{s.sub}</span>
      </span>
    </>
  );
  const href = hrefOf(s, anchorBase);
  const cls = "flex w-full items-center gap-4 py-3.5 text-left transition-opacity hover:opacity-80";
  if (!href) return <div className={`${cls} opacity-55`}>{inner}</div>;
  const chev = <span aria-hidden className="text-[15px] text-muted">›</span>;
  return s.external ? (
    <a href={href} target="_blank" rel="noreferrer" className={cls}>
      {inner}
      {chev}
    </a>
  ) : (
    <Link href={href} className={cls}>
      {inner}
      {chev}
    </Link>
  );
}
