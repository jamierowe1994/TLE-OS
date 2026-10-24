"use client";

import Link from "next/link";
import { useNewLook } from "@/lib/use-new-look";

/**
 * Small parts the People, Usage and Process tabs share in the new look
 * (lib/new-look "admin", 24 Oct 2026). Styled from app/new-look/admin.css.
 */

/** Waiting: a small turning ring and a line saying what it's reading. */
export function NlLoading({ what = "Loading" }: { what?: string }) {
  return (
    <p className="nl-adm-loading" role="status">
      <span className="nl-adm-spin" aria-hidden /> {what}…
    </p>
  );
}

/** It didn't come back: said, with a way to ask again, and no old figure in its place. */
export function NlFailed({ error, onRetry, first = false }: { error: string; onRetry?: () => void; first?: boolean }) {
  return (
    <div className={`nl-adm-flash is-bad${first ? " is-first" : ""}`} role="alert">
      <p>{error}</p>
      <p className="nl-meta">Nothing is shown rather than an old figure.</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="nl-btn nl-btn--secondary nl-btn--sm">
          Try again
        </button>
      )}
    </div>
  );
}

/** One figure on the hairline row: the number, what it counts, and a line under it. */
export function NlFig({ label, value, sub, href, word = false }: { label: React.ReactNode; value: React.ReactNode; sub?: React.ReactNode; href?: string; word?: boolean }) {
  const body = (
    <>
      <b className={word ? "is-word" : undefined}>{value}</b>
      <span>{label}</span>
      {sub ? <small>{sub}</small> : null}
    </>
  );
  return (
    <li>
      {href ? (
        href.startsWith("#") ? (
          <a href={href} className="nl-adm-fig">
            {body}
          </a>
        ) : (
          <Link href={href} className="nl-adm-fig">
            {body}
          </Link>
        )
      ) : (
        <div className="nl-adm-fig">{body}</div>
      )}
    </li>
  );
}

/** The loading line for the moment before the look is known, in the old type so it never flashes the wrong one. */
export function LookLoading({ what = "Loading" }: { what?: string }) {
  return (
    <p className="flex items-center gap-2 py-16 text-[12.5px] text-muted" role="status">
      <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-ink" aria-hidden />
      {what}…
    </p>
  );
}

/**
 * For a server-rendered Admin page: both looks are drawn on the server and
 * this picks one in the browser. The old look is exactly the page as it was.
 */
export function AdminLookSplit({ fresh, old, what }: { fresh: React.ReactNode; old: React.ReactNode; what?: string }) {
  const look = useNewLook("admin");
  if (look === null) return <LookLoading what={what} />;
  return <>{look ? fresh : old}</>;
}
