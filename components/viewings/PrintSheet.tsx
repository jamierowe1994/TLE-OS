"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { KIND_META, type Appt } from "@/lib/diary";
import type { Outcome } from "@/components/ViewingDrawer";
import { endTime, subjectOf } from "@/components/viewings/shared";

/**
 * The run sheet: the diary on paper.
 *
 * James, 11 Sep 2026: "a print button somewhere so they can print it out,
 * and it will print out a really nice view of that... a version of their
 * diary so they can see where they're going." Until the app lands this is
 * how a day goes in the car.
 *
 * Portalled to <body> and hidden on screen. When the page prints, everything
 * else in <body> is switched off and this alone is drawn - so the print is
 * this sheet and nothing but, whatever drawer or dock happens to be open.
 */

export interface PrintGroup {
  heading: string;
  sub?: string;
  list: Appt[];
}

const CSS = `
#os-print { display: none; }
@media print {
  body > * { display: none !important; }
  body > #os-print { display: block !important; }
  @page { margin: 14mm; }
  #os-print { color: #000; font-family: var(--font-inter), system-ui, sans-serif; font-size: 11pt; }
  #os-print h1 { font-family: var(--font-manrope), system-ui, sans-serif; font-size: 20pt; font-weight: 800; letter-spacing: -0.02em; margin: 0; }
  #os-print h2 { font-family: var(--font-manrope), system-ui, sans-serif; font-size: 13pt; font-weight: 800; letter-spacing: -0.01em; margin: 18pt 0 6pt; break-after: avoid; }
  #os-print table { width: 100%; border-collapse: collapse; }
  #os-print th { text-align: left; font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.1em; color: #555; padding: 0 6pt 4pt 0; border-bottom: 1px solid #000; }
  #os-print td { vertical-align: top; padding: 6pt 6pt 6pt 0; border-bottom: 1px solid #ccc; break-inside: avoid; }
  #os-print .t { font-weight: 700; white-space: nowrap; }
  #os-print .m { color: #555; font-size: 9.5pt; }
  #os-print .n { min-width: 34mm; }
}
`;

function accessLine(a: Appt, outcome?: Outcome): string {
  const bits: string[] = [];
  if (a.kind === "viewing") {
    if (a.tenant) bits.push(`Tenanted: ${a.tenant}`);
    else if (a.tenant === null) bits.push("Vacant");
    else bits.push("Occupancy not known");
  }
  if (a.comms.length) {
    const missing = a.comms.filter((c) => !c.done).map((c) => c.label);
    bits.push(missing.length ? `Not sent: ${missing.join(", ")}` : "All confirmations sent");
  } else if (a.fromRex && a.kind === "viewing") {
    bits.push("Confirmations not known");
  }
  if (a.day < 0 && a.kind === "viewing") bits.push(outcome ? `Feedback: ${outcome}` : "Feedback due");
  return bits.join(" · ");
}

export default function PrintSheet({
  owner,
  groups,
  outcomes,
}: {
  /** Whose diary this is, for the top of the page. */
  owner: string;
  groups: PrintGroup[];
  outcomes: Record<string, Outcome>;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const printed = new Date().toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  return createPortal(
    <div id="os-print" aria-hidden>
      <style>{CSS}</style>
      <h1>{owner ? `${owner}'s diary` : "The diary"}</h1>
      <p className="m">The Letting Experts · printed {printed}</p>
      {groups.map((g) => (
        <div key={g.heading}>
          <h2>
            {g.heading}
            {g.sub ? <span className="m"> · {g.sub}</span> : null}
          </h2>
          {g.list.length === 0 ? (
            <p className="m">Nothing booked.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>What</th>
                  <th>Where</th>
                  <th>Who</th>
                  <th>Access &amp; notes</th>
                </tr>
              </thead>
              <tbody>
                {g.list.map((a) => (
                  <tr key={a.id}>
                    <td className="t">{a.allDay ? "All day" : `${a.start}–${endTime(a)}`}</td>
                    <td>
                      {subjectOf(a)}
                      <div className="m">{KIND_META[a.kind].label}</div>
                    </td>
                    <td>{a.where || "—"}</td>
                    <td>
                      {a.who || "—"}
                      {a.contact?.phone ? <div className="m">{a.contact.phone}</div> : null}
                    </td>
                    <td className="n">
                      <div className="m">{accessLine(a, outcomes[a.id])}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}
    </div>,
    document.body
  );
}
