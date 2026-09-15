"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
/* TYPES ONLY. lib/inspections is "server-only", so importing a VALUE from it
   into this client component breaks the build - which is exactly what happened
   first time round. The page already re-declares its own kindLabel and ACTIONS
   for the same reason, so the two labels this sheet needs are handed in rather
   than copied a third time and left to drift. */
import type { Finding, Inspection } from "@/lib/inspections";

/**
 * THE PROPERTY VISIT REPORT, on paper.
 *
 * The Inspections screen has been admitting this one in its own caveats -
 * "no printable report - the landlord gets the findings in the email" - and it
 * is F2.9 on the master list. An email is fine for a landlord reading it on a
 * phone and useless for the two places a visit report actually gets used: in a
 * folder with the tenancy, and in front of somebody at a deposit dispute.
 *
 * ── It says the same thing the email says ────────────────────────────────
 *
 * Not more. `inspection-landlord-report` sends the address, who visited and
 * when, the overall condition in words, the summary and the findings; so does
 * this. A printout that carried facts the emailed version did not would make
 * two versions of one visit, and the argument at a deposit hearing would be
 * about which is the real one.
 *
 * What it adds is ARRANGEMENT rather than content: the email lists findings as
 * one run-on block ("Kitchen - extractor: grease"), which is all an email can
 * do. On paper they group by room, which is how somebody standing in the
 * property reads them.
 *
 * ── What it deliberately leaves out ──────────────────────────────────────
 *
 * The tenant's access link, their email and their phone number. The drawer
 * shows all three because an agent needs them; none belongs on a document that
 * goes to the landlord and into a folder. The access LINK especially: it is a
 * bearer token that opens the tenant's own page, and printing it would put a
 * working key to their reply in somebody else's filing cabinet.
 *
 * The tenant's NAME stays - a landlord knows who lives in their property, and
 * a visit report that will not say who was home is no use as a record.
 */

/* Two forms, and they are not interchangeable.
   The verdict is a SENTENCE - "Overall, the property is reasonable, with a few
   things to sort" - and reads as one. A table cell is not a sentence: the long
   form wrapped to four lines in a 26mm column against a one-line finding, so
   the eye read the condition as the biggest thing on the row. The short form
   is the agent's own wording from the write-up step. */
const CONDITION_SENTENCE: Record<string, string> = {
  good: "in good order",
  fair: "reasonable, with a few things to sort",
  poor: "not being kept as it should be",
};
const CONDITION_SHORT: Record<string, string> = {
  good: "In good order",
  fair: "Reasonable",
  poor: "Not being kept",
};

/* Same shape as components/viewings/PrintSheet: portalled to <body>, hidden on
   screen, and everything else in <body> switched off at print time - so what
   comes out is this sheet alone, whatever drawer happens to be open behind it. */
const CSS = `
#os-print-report { display: none; }
@media print {
  body > * { display: none !important; }
  body > #os-print-report { display: block !important; }
  @page { margin: 14mm; }
  #os-print-report { color: #000; font-family: var(--font-inter), system-ui, sans-serif; font-size: 11pt; }
  #os-print-report h1 { font-family: var(--font-manrope), system-ui, sans-serif; font-size: 20pt; font-weight: 800; letter-spacing: -0.02em; margin: 0; }
  #os-print-report h2 { font-family: var(--font-manrope), system-ui, sans-serif; font-size: 12pt; font-weight: 800; margin: 16pt 0 5pt; break-after: avoid; }
  #os-print-report .sub { color: #555; margin: 2pt 0 0; }
  #os-print-report .meta { width: 100%; border-collapse: collapse; margin-top: 12pt; }
  #os-print-report .meta th { text-align: left; width: 32mm; font-weight: 400; color: #555; padding: 3pt 8pt 3pt 0; vertical-align: top; }
  #os-print-report .meta td { padding: 3pt 0; vertical-align: top; }
  #os-print-report .verdict { margin-top: 14pt; padding: 8pt 10pt; border: 1px solid #000; break-inside: avoid; }
  #os-print-report .verdict strong { font-size: 12pt; }
  #os-print-report table.f { width: 100%; border-collapse: collapse; }
  #os-print-report table.f th { text-align: left; font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.1em; color: #555; padding: 0 6pt 4pt 0; border-bottom: 1px solid #000; }
  #os-print-report table.f td { vertical-align: top; padding: 5pt 6pt 5pt 0; border-bottom: 1px solid #ccc; break-inside: avoid; }
  #os-print-report .item { font-weight: 700; }
  #os-print-report .m { color: #555; font-size: 9.5pt; }
  #os-print-report .shots { margin-top: 5pt; display: flex; flex-wrap: wrap; gap: 4pt; }
  #os-print-report .shots img { width: 38mm; height: 28mm; object-fit: cover; border: 1px solid #ccc; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  #os-print-report footer { margin-top: 20pt; padding-top: 6pt; border-top: 1px solid #000; color: #555; font-size: 9pt; }
}
`;

const stamp = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : null;

export default function ReportSheet({
  inspection,
  findings,
  kindText,
  actionLabel,
}: {
  inspection: Inspection | null;
  findings: Finding[];
  /** "Interim visit" - the page owns the list of kinds. */
  kindText: string;
  /** A finding's action in words, from the page's own ACTIONS. */
  actionLabel: (id: string) => string;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || !inspection) return null;
  const i = inspection;

  /* By room, in the order the rooms were walked rather than alphabetically -
     a report is read against the property, not against a dictionary. */
  const rooms: { room: string; rows: Finding[] }[] = [];
  for (const f of findings) {
    const room = f.room || "Elsewhere";
    const g = rooms.find((r) => r.room === room);
    if (g) g.rows.push(f);
    else rooms.push({ room, rows: [f] });
  }

  const visited = stamp(i.visitedAt) ?? stamp(i.bookedAt);
  const address = [i.propertyName, i.locality].filter(Boolean).join(", ");

  return createPortal(
    <div id="os-print-report">
      <style>{CSS}</style>

      <h1>{kindText} report</h1>
      <p className="sub">{address}</p>

      <table className="meta">
        <tbody>
          <tr>
            <th scope="row">Visited</th>
            <td>{visited ?? "Not recorded"}</td>
          </tr>
          <tr>
            <th scope="row">Inspector</th>
            <td>{i.inspector || "One of the team"}</td>
          </tr>
          {i.tenant && (
            <tr>
              <th scope="row">Tenant</th>
              <td>{i.tenant}</td>
            </tr>
          )}
          {i.landlord && (
            <tr>
              <th scope="row">Landlord</th>
              <td>{i.landlord}</td>
            </tr>
          )}
          <tr>
            <th scope="row">Reference</th>
            <td>{i.ref}</td>
          </tr>
        </tbody>
      </table>

      {/* The same sentence the landlord's email leads on. */}
      <div className="verdict">
        <strong>Overall, the property is {CONDITION_SENTENCE[i.condition ?? "good"] ?? "in good order"}.</strong>
        {i.summary && <p style={{ margin: "6pt 0 0" }}>{i.summary}</p>}
      </div>

      <h2>What we found</h2>
      {rooms.length === 0 ? (
        <p>Nothing that needs doing.</p>
      ) : (
        rooms.map((g) => (
          <div key={g.room} style={{ breakInside: "avoid", marginTop: "10pt" }}>
            <h2 style={{ fontSize: "11pt", margin: "10pt 0 4pt" }}>{g.room}</h2>
            <table className="f">
              <thead>
                <tr>
                  <th>What</th>
                  <th style={{ width: "26mm" }}>Condition</th>
                  <th style={{ width: "40mm" }}>What happens next</th>
                </tr>
              </thead>
              <tbody>
                {g.rows.map((f) => (
                  <tr key={f.id}>
                    <td>
                      <span className="item">{f.item || "Noted"}</span>
                      {f.note && <div className="m">{f.note}</div>}
                      {/* The pictures, on the page. A deposit is argued over
                          what a room looked like, and a report that holds the
                          photographs but prints only the sentence sends the
                          landlord the weaker half. Printers default to
                          dropping background images, so these are real <img>
                          elements - and print-color-adjust keeps them from
                          being washed out. */}
                      {(f.photos ?? []).length > 0 && (
                        <div className="shots">
                          {(f.photos ?? []).map((ph) => (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img key={ph.key} src={`/api/r2/file?key=${encodeURIComponent(ph.key)}`} alt={ph.name} />
                          ))}
                        </div>
                      )}
                    </td>
                    <td>{CONDITION_SHORT[f.condition] ?? f.condition}</td>
                    <td>
                      {actionLabel(f.action)}
                      {/* Whose job it is, where somebody has said. A report that
                          lists a fault without saying who puts it right is the
                          reason the same fault is on the next one. */}
                      {f.responsible && <div className="m">{f.responsible === "tenant" ? "The tenant" : f.responsible === "landlord" ? "The landlord" : "Us"}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))
      )}

      <footer>
        The Letting Experts · Report {i.ref} · Printed{" "}
        {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
        {i.reportSentAt ? ` · Sent to the landlord ${stamp(i.reportSentAt)}` : " · Not yet sent to the landlord"}
      </footer>
    </div>,
    document.body
  );
}
