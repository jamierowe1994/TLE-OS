"use client";

import { useMemo, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import { SAGE_INK, SAGE_WASH } from "@/components/ListingTags";
import type { Appt } from "@/lib/diary";

/**
 * THE LANDLORD FEEDBACK REPORT, per property.
 *
 * The Viewings screen has admitted for weeks that this was missing - it is
 * written into the screen's own caveats ("The landlord feedback report is not
 * built yet") and sat on the master list as F1.5. It could not be built until
 * the OS could see REX's feedback at all, which it could not: the tile read
 * "Feedback in: 0" on every real book because it was counting a hardcoded map
 * of one sample id. That is fixed, so this can exist.
 *
 * ── What it is for ────────────────────────────────────────────────────────
 *
 * A landlord's question after a fortnight on the market is one question:
 * "people have been round - what did they say?" The diary answers it one
 * appointment at a time, which is the wrong shape: the answer is per PROPERTY,
 * all the viewings together, in the order they happened.
 *
 * ── Grouped by listing id, not by address ────────────────────────────────
 *
 * REX hangs the listing off the calendar event as a linked record, and the
 * diary now carries it. Grouping on the address text instead would split
 * "Flat 1, 26 Garland Road" from "Apartment 1, 26 Garland Road" and merge
 * rooms in a shared house that are separate listings - and the appointment
 * drawer's own note warns where that leads: "a wrong property here would show
 * somebody the wrong keys."
 *
 * ── The copy for the landlord drops the names ────────────────────────────
 *
 * On this screen the agent sees who came, because they were there. What gets
 * COPIED to send on does not name anybody: the landlord portal's rule is
 * "never a full name before an offer", and a report that leaks one while the
 * portal beside it hides it would make the portal's discretion pointless.
 */

/** Copy the landlord's version, and say so. A labelled button rather than
 *  components/Bits' CopyButton, which is deliberately invisible until its row
 *  is hovered - right for a quiet field, wrong for the one thing this screen
 *  exists to let an agent do. */
function CopyForLandlord({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      title="Copy this property's feedback, with no names in it, ready to paste to the landlord"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          window.setTimeout(() => setDone(false), 1600);
        } catch {
          /* clipboard blocked - the words are on screen to select by hand */
        }
      }}
      className={`rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors ${
        done ? "bg-accent-dark text-white" : "border border-line/60 text-muted hover:border-ink/40 hover:text-ink"
      }`}
    >
      {done ? "Copied" : "Copy for the landlord"}
    </button>
  );
}

type Row = { appt: Appt };
type Group = {
  key: string;
  address: string;
  href: string | null;
  rows: Row[];
  written: number;
};

/** "Wed 9 Sept" from a day offset, which is how the diary carries dates. */
function dayLabel(day: number): string {
  const d = new Date();
  d.setDate(d.getDate() + day);
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

/** The address a viewing belongs to, for the heading. */
function addressOf(a: Appt): string {
  return a.link?.label ?? a.what.replace(/^[^—]+—\s*/, "").trim() ?? a.where ?? "The property";
}

export default function FeedbackReport({
  appts,
  loading,
  error,
  onOpen,
  onPrint,
}: {
  appts: Appt[];
  loading: boolean;
  error: string | null;
  onOpen: (a: Appt) => void;
  onPrint: () => void;
}) {
  /* Properties with nothing written up are still worth showing - "four
     viewings and not a word back" is the finding, not the absence of one. */
  const [onlyWritten, setOnlyWritten] = useState(false);

  const groups = useMemo<Group[]>(() => {
    const map = new Map<string, Group>();
    for (const a of appts) {
      if (a.kind !== "viewing" || a.day >= 0) continue;
      /* No listing id means REX never attached one. Falling back to the
         address keeps the viewing in the report rather than dropping it
         silently, and the key is prefixed so it can never collide with a
         real id. */
      const key = a.listingId ? `l:${a.listingId}` : `a:${addressOf(a).toLowerCase()}`;
      const g =
        map.get(key) ??
        map.set(key, { key, address: addressOf(a), href: a.link?.href ?? null, rows: [], written: 0 }).get(key)!;
      g.rows.push({ appt: a });
      if (a.feedback) g.written += 1;
    }
    const out = [...map.values()];
    for (const g of out) g.rows.sort((x, y) => y.appt.day - x.appt.day);
    /* What can be SENT, first - then most recently viewed inside each half.
       Ordering by date alone read badly: the top of a screen headed "ready to
       send to the landlord" was four properties with nothing written up,
       while the ones an agent could actually act on were below the fold. The
       empty ones still show, because "four viewings and not a word back" is a
       finding worth seeing; they just are not the headline. */
    return out.sort(
      (x, y) =>
        Number(y.written > 0) - Number(x.written > 0) ||
        (y.rows[0]?.appt.day ?? -999) - (x.rows[0]?.appt.day ?? -999)
    );
  }, [appts]);

  const shown = onlyWritten ? groups.filter((g) => g.written > 0) : groups;
  const totalViewings = groups.reduce((n, g) => n + g.rows.length, 0);
  const totalWritten = groups.reduce((n, g) => n + g.written, 0);

  /** The text an agent can paste into an email to the landlord. No names. */
  function copyFor(g: Group): string {
    const lines = [`${g.address} - viewing feedback`, ""];
    for (const { appt } of g.rows) {
      const f = appt.feedback;
      lines.push(`${dayLabel(appt.day)} at ${appt.start}`);
      if (!f) {
        lines.push("  We have not had feedback back on this one yet.");
      } else {
        if (f.interest) lines.push(`  Interest: ${f.interest}`);
        lines.push(f.note ? `  ${f.note.replace(/\s+/g, " ").trim()}` : "  Viewing logged, nothing written down.");
      }
      lines.push("");
    }
    return lines.join("\n").trimEnd();
  }

  return (
    <div className="flex h-full flex-col rounded-[22px] border border-line/50 bg-white p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="hand text-[17px]">
            Feedback by property
            <span className="figures ml-2 text-[14px] text-muted">{shown.length}</span>
          </h2>
          <p className="mt-0.5 text-[11.5px] text-muted">
            Every viewing that has been, and what was said. Ready to send to the landlord.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setOnlyWritten((v) => !v)}
            className={`rounded-full border px-3.5 py-2 text-[11.5px] font-semibold transition-colors ${
              onlyWritten
                ? "border-accent-dark bg-accent-soft/50 text-accent-dark"
                : "border-line/60 bg-white text-muted hover:border-ink/40 hover:text-ink"
            }`}
          >
            Only where there is feedback
          </button>
          <button
            type="button"
            onClick={onPrint}
            className="rounded-full border border-line/60 bg-white px-3.5 py-2 text-[11.5px] font-semibold text-muted transition-colors hover:border-ink/40 hover:text-ink"
          >
            <DoodleIcon name="doc" size={12} className="mr-1.5 inline" />
            Print
          </button>
        </div>
      </div>

      {/* The honest headline. Most viewings are never written up, and a report
          that only showed the ones that were would hide that. */}
      {!loading && !error && groups.length > 0 && (
        <p className="mb-3 rounded-xl border border-line/50 bg-page px-3.5 py-2.5 text-[11.5px] leading-relaxed text-muted">
          <span className="figures font-semibold text-ink">{totalWritten}</span> of{" "}
          <span className="figures font-semibold text-ink">{totalViewings}</span> viewings across{" "}
          <span className="figures font-semibold text-ink">{groups.length}</span>{" "}
          {groups.length === 1 ? "property" : "properties"} have feedback written up in REX.
        </p>
      )}

      {loading && <p className="py-6 text-[12.5px] text-muted">Reading the diary…</p>}
      {error && !loading && <p className="py-6 text-[12.5px] text-accent-dark">{error}</p>}
      {!loading && !error && shown.length === 0 && (
        <p className="py-6 text-[12.5px] text-muted">
          {groups.length === 0
            ? "No viewings have been yet, so there is nothing to report."
            : "Nothing has been written up yet. Turn the filter off to see every property that has had a viewing."}
        </p>
      )}

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
        {shown.map((g) => (
          <section key={g.key} className="rounded-2xl border border-line/50 p-4">
            <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-2">
              <div className="min-w-0">
                <h3 className="truncate text-[13.5px] font-semibold">{g.address}</h3>
                <p className="mt-0.5 text-[11px] text-muted">
                  <span className="figures">{g.rows.length}</span>{" "}
                  {g.rows.length === 1 ? "viewing" : "viewings"} ·{" "}
                  {g.written === 0 ? (
                    <span className="text-accent-dark">nothing written up</span>
                  ) : (
                    <>
                      <span className="figures">{g.written}</span> written up
                    </>
                  )}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <CopyForLandlord text={copyFor(g)} />
                {g.href && (
                  <a
                    href={g.href}
                    className="rounded-full border border-line/60 px-3 py-1.5 text-[11px] font-semibold text-muted transition-colors hover:border-ink/40 hover:text-ink"
                  >
                    The listing
                  </a>
                )}
              </div>
            </div>

            <ul className="space-y-1.5">
              {g.rows.map(({ appt }) => {
                const f = appt.feedback;
                return (
                  <li key={appt.id}>
                    <button
                      type="button"
                      onClick={() => onOpen(appt)}
                      className="flex w-full items-start gap-3 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-page"
                    >
                      <span className="w-24 shrink-0 pt-0.5 text-[11px] text-muted">
                        {dayLabel(appt.day)} · {appt.start}
                      </span>
                      <span className="min-w-0 flex-1">
                        {f ? (
                          <>
                            <span className="flex flex-wrap items-center gap-2">
                              {f.interest && (
                                <span
                                  className="rounded-full px-2 py-0.5 text-[10.5px] font-semibold"
                                  style={{ background: SAGE_WASH, color: SAGE_INK }}
                                >
                                  {f.interest}
                                </span>
                              )}
                              {appt.who && <span className="truncate text-[11.5px] text-muted">{appt.who}</span>}
                            </span>
                            <span className="mt-1 block whitespace-pre-line text-[12.5px] leading-relaxed">
                              {f.note ?? <span className="text-muted">Logged in REX, with nothing written down.</span>}
                            </span>
                          </>
                        ) : (
                          <span className="text-[12.5px] text-muted">
                            Feedback due{appt.who ? ` — ${appt.who}` : ""}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
