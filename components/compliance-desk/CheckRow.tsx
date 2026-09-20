"use client";

import { useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";

/**
 * One thing waiting on Michael, and his two answers to it.
 *
 * Shared by To verify and Works orders, because the decision is the same shape
 * on both: it is right (off the list), or something is wrong with it (stays on
 * the list, with what is wrong written on it). A query asks for the reason
 * before it saves - "queried" with no note tells the agent nothing, and he goes
 * through the agent for everything.
 */

export const GREEN = "bg-[#f1f4ec] text-[#56634a]";
export const RED = "bg-[#fdefec] text-[#9d4340]";

export function waited(iso: string): { label: string; days: number } {
  const hours = (Date.now() - new Date(iso).getTime()) / 3_600_000;
  const days = hours / 24;
  if (hours < 1) return { label: "just now", days };
  if (hours < 24) return { label: `${Math.round(hours)} hr${Math.round(hours) === 1 ? "" : "s"}`, days };
  return { label: `${Math.floor(days)} day${Math.floor(days) === 1 ? "" : "s"}`, days };
}

export interface Queried {
  note: string;
  by: string;
  at: string;
}

export default function CheckRow({
  title,
  sub,
  chips,
  files,
  openHref,
  openLabel,
  addedAt,
  lateAfterDays,
  queried,
  okLabel,
  busy,
  onVerify,
  onQuery,
}: {
  title: string;
  sub: string;
  chips: string[];
  files: { key: string; name: string }[];
  /** A second place to look: the job sheet, say. */
  openHref?: string;
  openLabel?: string;
  addedAt: string;
  /** Past this many days waiting, the age goes red. */
  lateAfterDays: number;
  queried: Queried | null;
  okLabel: string;
  busy: boolean;
  onVerify: () => void;
  onQuery: (note: string) => void;
}) {
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState("");
  const w = waited(addedAt);

  return (
    <li className="rounded-[18px] border border-line/70 bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        {/* A floor on the width, so on a phone the buttons drop underneath
            rather than squeezing the chips into a one-word column. */}
        <div className="min-w-[min(100%,260px)] flex-1">
          <p className="text-[14px] font-semibold leading-snug">{title}</p>
          <p className="mt-0.5 text-[12.5px] leading-snug text-muted">{sub}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {chips.filter(Boolean).map((c) => (
              <span key={c} className="rounded-full bg-page px-2.5 py-1 text-[11px] text-muted">{c}</span>
            ))}
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${w.days > lateAfterDays ? RED : GREEN}`}>Waiting {w.label}</span>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {files.map((f) => (
            <a
              key={f.key}
              href={`/api/r2/file?key=${encodeURIComponent(f.key)}`}
              target="_blank"
              rel="noreferrer"
              title={f.name}
              className="flex max-w-[220px] items-center gap-1.5 rounded-full border border-line/80 px-3 py-1.5 text-[12px] font-semibold transition hover:border-ink/40"
            >
              <DoodleIcon name="doc" size={13} className="shrink-0 text-accent-dark" />
              <span className="truncate">{files.length === 1 ? "Open the file" : f.name}</span>
            </a>
          ))}
          {openHref && (
            <a href={openHref} className="rounded-full border border-line/80 px-3 py-1.5 text-[12px] font-semibold transition hover:border-ink/40">
              {openLabel ?? "Open"}
            </a>
          )}
        </div>
      </div>

      {queried && (
        <p className={`mt-3 rounded-xl px-3.5 py-2.5 text-[12.5px] leading-snug ${RED}`}>
          <span className="font-semibold">Queried by {queried.by || "compliance"} on {new Date(queried.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}.</span> {queried.note}
        </p>
      )}

      {asking ? (
        <div className="mt-3">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            autoFocus
            placeholder="What is wrong with it? This is what the agent needs to put right."
            className="w-full rounded-xl border border-line/80 bg-page px-3.5 py-2.5 text-[13px] outline-none focus:border-ink/40"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || !note.trim()}
              onClick={() => { onQuery(note.trim()); setAsking(false); setNote(""); }}
              className="rounded-full bg-accent-dark px-4 py-2 text-[12.5px] font-semibold text-white disabled:opacity-40"
            >
              Save the query
            </button>
            <button type="button" onClick={() => setAsking(false)} className="rounded-full border border-line/80 px-4 py-2 text-[12.5px] font-semibold">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={onVerify} className="rounded-full bg-accent-dark px-4 py-2 text-[12.5px] font-semibold text-white disabled:opacity-40">
            {okLabel}
          </button>
          <button type="button" disabled={busy} onClick={() => { setNote(queried?.note ?? ""); setAsking(true); }} className="rounded-full border border-line/80 px-4 py-2 text-[12.5px] font-semibold disabled:opacity-40">
            {queried ? "Change the query" : "Something is wrong"}
          </button>
        </div>
      )}
    </li>
  );
}
