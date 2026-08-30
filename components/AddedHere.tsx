"use client";

import { useCallback, useEffect, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import { Pill } from "@/components/Wire";

/**
 * Contacts added in the OS, and where each one got to.
 *
 * ── Why this strip exists ─────────────────────────────────────────────────
 *
 * The Leads table below is REX's LEAD book. A contact created here is not a
 * lead, so it never appears there — and a contact saved while the REX write
 * lock is on is in neither place. Without somewhere to show it, the record
 * would be invisible the moment the panel closed, which is barely better than
 * the Save button that saved nothing.
 *
 * ── It is an EXCEPTION list, and that was not always safe ─────────────────
 *
 * The first version filtered out anything that had reached REX, reasoning that
 * it was "in the book below and does not need saying twice". That was wrong at
 * the time: the book below is REX's LEAD book, a contact is not a lead, so a
 * contact that pushed successfully vanished from the OS entirely. James pushed
 * his first record and then could not find it anywhere.
 *
 * The same filter is correct NOW, and only because the thing that made it wrong
 * has been fixed: people added in the OS are mapped into the lead book itself
 * (lib/contacts-as-leads), so a successful one is on screen, in the table, and
 * opens like any other file. This strip is left holding the only records the
 * table cannot explain — the ones that did not sync.
 *
 * If that mapping is ever removed, this filter becomes a bug again. The two
 * belong together.
 */

type Contact = {
  id: string;
  name: string;
  kind: string;
  email: string;
  mobile: string;
  createdAt: string;
  rexId: string | null;
  rexState: "held" | "sent" | "failed" | "linked";
  rexDetail: string;
};

/* Deep link into the REX web app. The listings shape is confirmed against live
   records (see lib/business/rex-links); contacts follow the same pattern but
   have not been opened in anger, so the id is shown as text too — if the link
   ever lands wrong, the number is still there to paste into REX's search. */
const rexContactUrl = (id: string) =>
  `https://app.rexsoftware.com/contacts/#id=${encodeURIComponent(id)}`;

const SHOWN = 10;

export default function AddedHere({ refreshKey }: { refreshKey?: number }) {
  const [rows, setRows] = useState<Contact[] | null>(null);
  const [blocked, setBlocked] = useState<{ detail: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [all, setAll] = useState(false);

  const load = useCallback(() => {
    fetch("/api/contacts", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("no"))))
      .then((j: { contacts: Contact[]; rexBlocked: { detail: string } | null }) => {
        /* Only the ones that did NOT sync. The rest are in the table below,
           opening like any other file — see the note at the top of this file
           for why that was not always true. */
        setRows(j.contacts.filter((c) => c.rexState !== "sent" && c.rexState !== "linked"));
        setBlocked(j.rexBlocked);
      })
      .catch(() => setRows([]));
  }, []);

  useEffect(load, [load, refreshKey]);

  async function push(id: string) {
    setBusyId(id);
    setFlash(null);
    try {
      const r = await fetch(`/api/contacts/${id}/push`, { method: "POST" });
      const j = (await r.json()) as { ok?: boolean; detail?: string };
      setFlash(j.detail ?? (j.ok ? "Pushed." : "That didn't go."));
      load();
    } catch {
      setFlash("That didn't go — the connection dropped.");
    } finally {
      setBusyId(null);
    }
  }

  if (!rows || rows.length === 0) return null;

  const waiting = rows.filter((c) => c.rexState !== "sent" && c.rexState !== "linked").length;
  const shown = all ? rows : rows.slice(0, SHOWN);

  return (
    <div className="fade-up mt-4 rounded-2xl border border-line/80 bg-panel p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="flex items-center gap-2.5 text-[14px]">
          <DoodleIcon name="user" size={16} className="text-accent-dark" />
          Not backed up yet
        </h3>
        <span className="text-[11.5px] text-muted">{rows.length} waiting</span>
      </div>

      <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted">
        These are saved and safe, and they are in the list below like everyone else. They
        just have not reached the backup store yet.
      </p>

      {blocked && waiting > 0 && (
        <p className="mt-2.5 text-[11.5px] leading-relaxed text-muted">{blocked.detail}</p>
      )}
      {flash && (
        <p className="mt-2.5 rounded-xl border border-line/80 bg-card p-2.5 text-[11.5px] leading-relaxed">
          {flash}
        </p>
      )}

      <ul className="mt-3 space-y-1.5">
        {shown.map((c) => {
          const inRex = c.rexState === "sent" || c.rexState === "linked";
          return (
            <li
              key={c.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-line/70 bg-card px-3.5 py-2.5"
            >
              <span className="text-[12.5px] font-medium">{c.name}</span>
              <span className="text-[11.5px] text-muted">
                {[c.kind, c.email || c.mobile].filter(Boolean).join(" · ")}
              </span>
              <Pill tone={c.rexState === "failed" ? "accent" : inRex ? "neutral" : "accent"}>
                {inRex ? "in REX" : c.rexState === "failed" ? "refused" : "held"}
              </Pill>

              {inRex && c.rexId ? (
                <a
                  href={rexContactUrl(c.rexId)}
                  target="_blank"
                  rel="noreferrer"
                  title="Open this contact in REX"
                  className="ml-auto rounded-lg border border-line/80 px-3 py-1.5 text-[11.5px] transition-colors hover:border-ink"
                >
                  REX {c.rexId} ↗
                </a>
              ) : (
                <button
                  type="button"
                  disabled={busyId === c.id || Boolean(blocked)}
                  onClick={() => push(c.id)}
                  title={blocked?.detail ?? "Create this contact in REX"}
                  className="ml-auto rounded-lg border border-line/80 px-3 py-1.5 text-[11.5px] transition-colors hover:border-ink disabled:opacity-40"
                >
                  {busyId === c.id ? "Pushing…" : "Push to REX"}
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {rows.length > SHOWN && (
        <button
          type="button"
          onClick={() => setAll((v) => !v)}
          className="mt-2.5 text-[11.5px] text-muted underline underline-offset-2 transition-colors hover:text-ink"
        >
          {all ? "Show fewer" : `Show all ${rows.length}`}
        </button>
      )}
    </div>
  );
}
