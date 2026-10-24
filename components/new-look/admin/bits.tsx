"use client";

/**
 * Small shared pieces for the System and Issues tabs in the new look
 * (24 Oct 2026). Styled from app/new-look/admin.css (nl-adm-*).
 */

/** No em or en dashes on screen (house rule): server text written with them reads with a hyphen. */
export const nd = (s: string | null | undefined): string => (s ?? "").replace(/\s*[—–]\s*/g, " - ");

export const Spin = () => <span className="nl-adm-spin" aria-hidden />;

/** What a tab shows while it reads: a turning ring and what it's reading. */
export function Loading({ what }: { what: string }) {
  return (
    <p className="nl-adm-loading" role="status">
      <Spin /> {what}
    </p>
  );
}

/** A read or a save that failed, said plainly, with a way to try again. */
export function ErrorLine({ children, onRetry }: { children: React.ReactNode; onRetry?: () => void }) {
  return (
    <p className="nl-adm-error" role="alert">
      {children}
      {onRetry && (
        <button type="button" className="nl-link" onClick={onRetry}>
          Try again
        </button>
      )}
    </p>
  );
}

/** A titled part of a tab: Title Case, not bold beyond the heading weight, letter-spacing 0. */
export function Section({ title, aside, children, id }: { title: React.ReactNode; aside?: React.ReactNode; children: React.ReactNode; id?: string }) {
  return (
    <section className="nl-adm-section" id={id}>
      <div className="nl-adm-section-head">
        <h2 className="nl-section-title">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** "24 Oct, 09:15", in London time. */
export const when = (iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = {}) =>
  iso
    ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London", ...opts })
    : "";

/** The frame around a tab's body: the area, title and tabs are drawn above it by the layout. */
export function Tab({ children }: { children: React.ReactNode }) {
  return <div className="nl-page nl-rise nl-adm nl-adm-tab">{children}</div>;
}
