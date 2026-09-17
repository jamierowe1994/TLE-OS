import Link from "next/link";
import DoodleIcon from "@/components/DoodleIcon";
import SignTile from "@/components/landlord/SignTile";
import MessageTile from "@/components/landlord/MessageTile";
import PresentTile from "@/components/landlord/PresentTile";
import OffersTile from "@/components/landlord/OffersTile";
import PhotoTimesTile from "@/components/landlord/PhotoTimesTile";
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

/**
 * Where this landlord's contract is, for the button under the presentation.
 * The live portal mints against the appraisal; the harness already holds a
 * drafted one on the sign step. Both end up in the same sheet.
 */
export const signSource = (v: LandlordView) => ({
  appraisalId: v.appraisalId ?? null,
  url: v.appraisalId ? null : (v.contractUrl ?? v.steps.find((s) => s.id === "sign")?.href ?? null),
});

/**
 * The one next step: the first in the stage's order. The order already puts
 * the presentation ahead of the contract until it has been read, and the
 * contract ahead once it has (stepsForStage) - picking signing out first
 * here is what put Sign your contract on top of an unread deck.
 */
export function pickHero(v: LandlordView): ViewStep | null {
  return v.steps[0] ?? null;
}

/** The big button on the next-step and current-stage cards. */
export function HeroAction({ s, v, anchorBase = "", label }: { s: ViewStep; v: LandlordView; anchorBase?: string; label?: string }) {
  const text = label ?? s.label;
  /* The modal, whether the contract is minted on demand (the real portal) or
     already drafted (the harness). Either way it opens on our page. */
  if (s.action === "sign" && (v.appraisalId || s.href)) {
    return <SignTile variant="button" appraisalId={v.appraisalId ?? null} url={v.appraisalId ? null : s.href} label={text} sub={s.sub} icon={s.icon} />;
  }
  if (s.action === "message") {
    return (
      <MessageTile variant="button" appraisalId={v.appraisalId ?? null} agentName={v.agent?.name ?? null} messages={v.messages ?? []} label={text} sub={s.sub} icon={s.icon} />
    );
  }
  if (s.action === "presentation" && v.presentation) {
    return <PresentTile variant="button" deck={v.presentation} readToken={v.presentationToken ?? null} sign={signSource(v)} label={text} sub={s.sub} icon={s.icon} />;
  }
  if (s.action === "offers") {
    return <OffersTile v={v} label={text} sub={s.sub} icon={s.icon} variant="button" />;
  }
  if (s.action === "photos") {
    return <PhotoTimesTile appraisalId={v.appraisalId ?? null} label={text} sub={s.sub} icon={s.icon} variant="button" />;
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
  if (s.action === "sign" && (v.appraisalId || s.href)) {
    return <SignTile variant="row" appraisalId={v.appraisalId ?? null} url={v.appraisalId ? null : s.href} label={s.label} sub={s.sub} icon={s.icon} />;
  }
  if (s.action === "photos") {
    return <PhotoTimesTile appraisalId={v.appraisalId ?? null} label={s.label} sub={s.sub} icon={s.icon} variant="row" />;
  }
  if (s.action === "message") {
    return (
      <MessageTile variant="row" appraisalId={v.appraisalId ?? null} agentName={v.agent?.name ?? null} messages={v.messages ?? []} label={s.label} sub={s.sub} icon={s.icon} />
    );
  }
  if (s.action === "presentation" && v.presentation) {
    return <PresentTile variant="row" deck={v.presentation} readToken={v.presentationToken ?? null} sign={signSource(v)} label={s.label} sub={s.sub} icon={s.icon} />;
  }
  if (s.action === "offers") {
    return <OffersTile v={v} label={s.label} sub={s.sub} icon={s.icon} variant="row" />;
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
