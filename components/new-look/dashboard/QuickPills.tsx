"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { QUICK_LINKS, type QuickLink } from "@/components/QuickLinks";
import { Ico } from "@/components/new-look/Parts";
import { usePref } from "@/lib/prefs-store";

/**
 * The agent's own quick links, as the pills under the ask box (new look).
 *
 * The design has four sample questions there; those answers were invented, so
 * the row carries the shortcuts the agent picked for themselves instead - the
 * same list, kept in the same setting ("tle-dash-quick-v1", see
 * components/QuickLinks) as the old dashboard's Customise row, so a link added
 * in either look is there in both. "Edit quick links" is that Customise: tick
 * a link on or off.
 */

const STORE = "tle-dash-quick-v1"; // the same key as components/QuickLinks

export default function QuickPills() {
  const [chosen, setChosen, ready] = usePref<string[] | null>(STORE, null);
  const [editing, setEditing] = useState(false);
  const ids = chosen ?? [];
  const links = ids.map((id) => QUICK_LINKS.find((q) => q.id === id)).filter((q): q is QuickLink => Boolean(q));
  /* Through a ref so two quick taps both land: the setter takes a value, not an updater. */
  const idsRef = useRef(ids);
  idsRef.current = ids;
  const toggle = (id: string) => {
    const cur = idsRef.current;
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    idsRef.current = next;
    setChosen(next);
  };

  if (!ready) return <div className="nl-dash-pills" aria-hidden />;

  return (
    <div className="nl-dash-quick">
      <div className="nl-dash-pills">
        {links.map((q) => (
          <Link key={q.id} href={q.href} className="nl-dash-pill">
            {q.label}
          </Link>
        ))}
        <button type="button" className={`nl-dash-pill is-edit${editing ? " is-on" : ""}`} aria-expanded={editing} onClick={() => setEditing((e) => !e)}>
          {editing ? "Done" : links.length ? "Edit quick links" : (<><Ico name="plus" size={13} /> Add quick links</>)}
        </button>
      </div>
      <div className={`nl-collapse${editing ? " is-open" : ""}`}>
        <div>
          <ul className="nl-dash-picker" aria-label="Quick links">
            {QUICK_LINKS.map((q) => {
              const on = ids.includes(q.id);
              return (
                <li key={q.id}>
                  <button type="button" aria-pressed={on} tabIndex={editing ? undefined : -1} className={`nl-dash-pick${on ? " is-on" : ""}`} onClick={() => toggle(q.id)}>
                    <span className="nl-dash-tickmark" aria-hidden>{on && <Ico name="check" size={12} />}</span>
                    <span className="nl-dash-line-text">
                      <span className="nl-dash-strong">{q.label}</span>
                      <span className="nl-meta">{q.hint}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
