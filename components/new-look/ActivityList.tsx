"use client";

import { useState } from "react";
import FloatSheet, { FloatCard, FloatFoot } from "@/components/new-look/FloatSheet";

/**
 * A record's activity, where every line opens (James, 8 Nov 2026: "Sean
 * McMahon added a note, and I should be able to click onto it and then see
 * that note ... sent an email, a call ... we should be able to see it").
 *
 * Each line is the short sentence it always was; pressed, it opens in front
 * of the page with everything behind it - the note's words, the email's
 * subject, who did it and exactly when - and a button to the part of the
 * record it belongs to.
 */

export type ActivityItem = {
  key: string;
  /** Shown down the left: "Today 14:02", "3 Nov". */
  when: string;
  /** Exact, for the open view. */
  exact?: string | null;
  text: string;
  by?: string | null;
  /** A note's words, an email's body: shown in full when opened. */
  body?: string | null;
  rows?: [string, string][];
  go?: { label: string; onClick: () => void } | null;
};

export default function ActivityList({ items, empty }: { items: ActivityItem[]; empty: React.ReactNode }) {
  const [open, setOpen] = useState<ActivityItem | null>(null);
  if (!items.length) return <p className="nl-empty">{empty}</p>;
  return (
    <>
      <ul className="nl-timeline nl-actlist">
        {items.map((a) => (
          <li key={a.key}>
            <span className="nl-mono">{a.when}</span>
            <button type="button" className="nl-act-line" onClick={() => setOpen(a)}>
              <span>{a.text}</span>
              {a.by && <span className="nl-meta"> {a.by}</span>}
              {a.body && <span className="nl-act-peek">{a.body.replace(/\s+/g, " ").slice(0, 120)}</span>}
            </button>
          </li>
        ))}
      </ul>
      {open && (
        <FloatSheet
          title="Activity"
          onClose={() => setOpen(null)}
          question={open.text.replace(/\.$/, "")}
          lede={[open.by, open.exact ?? open.when].filter(Boolean).join(" · ")}
          foot={
            <FloatFoot>
              {open.go && (
                <button type="button" className="nl-btn nl-btn--secondary" onClick={() => { const g = open.go!; setOpen(null); g.onClick(); }}>
                  {open.go.label}
                </button>
              )}
              <button type="button" className="nl-btn nl-btn--primary" onClick={() => setOpen(null)}>Close</button>
            </FloatFoot>
          }
        >
          {open.body && (
            <FloatCard>
              <p className="nl-act-body">{open.body}</p>
            </FloatCard>
          )}
          {open.rows && open.rows.length > 0 && (
            <FloatCard>
              <dl className="nl-act-rows">
                {open.rows.map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            </FloatCard>
          )}
          {!open.body && !(open.rows && open.rows.length) && (
            <FloatCard>
              <p className="nl-act-body is-quiet">That&apos;s everything recorded for this one.</p>
            </FloatCard>
          )}
        </FloatSheet>
      )}
    </>
  );
}

/** "Sunday 8 November 2026, 14:02" for the open view. */
export function exactWhen(iso: string | null | undefined): string | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const hasTime = iso.length > 10;
  return d.toLocaleString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", ...(hasTime ? { hour: "2-digit", minute: "2-digit" } : {}), timeZone: "Europe/London" });
}
