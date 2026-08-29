"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import type { Funnel, LeadBucket, LeadDetail, MirroredLead } from "@/lib/launchpad";

/**
 * The Launch Pad funnel, worked from inside the OS.
 *
 * ── Tiles, and a panel that can actually do something ─────────────────────
 *
 * James, 29 Aug: "what I don't want to do is click the word, right-click,
 * open, and then have to open it in Launch Pad to then make a note to then
 * see the update in here. Makes no sense."
 *
 * So a tile opens the same three-quarter drawer every other record in the OS
 * opens, and the note is written from there. Notes are SHARED rather than
 * copied — one record lives in Launch Pad and both windows read and write it —
 * so a note left in either place is simply there in the other. Nothing syncs
 * because nothing is duplicated.
 *
 * ── The buckets are still not decided here ────────────────────────────────
 *
 * Uncontacted, Follow-ups and Resting come off the wire already worked out.
 * They depend on the clock, and two codebases deriving them separately is how
 * one window says four to ring and the other says six.
 *
 * ── Desktop only, and it says so ──────────────────────────────────────────
 *
 * The phone gets a real screen pointing at the PWA rather than a squeezed
 * grid. A deliberate small-screen answer, not a missing one.
 */

const BUCKETS: { key: LeadBucket; label: string; blurb: string }[] = [
  { key: "uncontacted", label: "Uncontacted", blurb: "Nobody has tried them yet." },
  { key: "follow-up", label: "Follow-ups", blurb: "Tried, and due back now." },
  { key: "resting", label: "Resting", blurb: "Reminder set for later." },
  { key: "won", label: "Booked", blurb: "Appointment made, or in REX." },
];

const STAGE_LABEL: Record<string, string> = {
  new: "New",
  attempt1: "Try 1",
  attempt2: "Try 2",
  attempt3: "Try 3",
  nurture: "Marketing funnel",
  converted: "Booked",
  pushed: "In REX",
  lost: "Lost",
};

const day = (iso: string | null) => {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  } catch {
    return null;
  }
};
const clock = (iso: string | null) => {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return null;
  }
};
/** Days from now, negative when overdue. */
const daysAway = (iso: string | null): number | null => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.round((t - Date.now()) / 86_400_000);
};

const dueWording = (iso: string | null): string | null => {
  const d = daysAway(iso);
  if (d == null) return null;
  if (d < 0) return `Was due ${day(iso)}`;
  if (d === 0) return "Due today";
  if (d === 1) return "Due tomorrow";
  return `Due ${day(iso)}`;
};

/* Follow-up presets. The same four Launch Pad offers, so an agent who uses
   both is never choosing between different sets of options. */
function preset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(8, 0, 0, 0);
  return d.toISOString();
}

/* ------------------------------- the drawer ------------------------------ */

function LeadPanel({
  lead,
  readOnly,
  onClose,
  onChanged,
}: {
  lead: MirroredLead;
  readOnly: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<LeadDetail | null>(null);
  const [failed, setFailed] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(() => {
    setFailed(false);
    fetch(`/api/tools/launchpad-lead?id=${encodeURIComponent(lead.id)}`, { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json().catch(() => null);
        if (!r.ok || !j?.lead) {
          setFailed(true);
          return;
        }
        setDetail(j.lead as LeadDetail);
      })
      .catch(() => setFailed(true));
  }, [lead.id]);

  useEffect(load, [load]);

  /** True only when the write is CONFIRMED saved. The caller clears the box on
   *  that and nothing else — a note wiped by a failed save is work lost with
   *  no way to get it back. */
  async function act(body: Record<string, unknown>, ok: string): Promise<boolean> {
    setBusy(true);
    setMessage(null);
    try {
      const r = await fetch("/api/tools/launchpad-lead", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: lead.id, ...body }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.lead) {
        /* Say what actually happened. "Saved" over a failed write is how an
           agent loses a note and only finds out on the phone to a landlord. */
        setMessage(j?.error ?? "Couldn't save that. Nothing has been changed.");
        return false;
      }
      setDetail(j.lead as LeadDetail);
      setMessage(ok);
      onChanged();
      return true;
    } catch {
      setMessage("Couldn't save that. Nothing has been changed.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  const due = detail?.followUpAt ?? lead.followUpAt;

  return (
    <div className="fixed inset-0 z-[130]">
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-ink/35"
      />
      <div className="fade-up absolute inset-y-0 right-0 flex w-full flex-col overflow-hidden rounded-l-2xl bg-page shadow-[-24px_0_60px_-24px_rgba(0,0,0,0.35)] lg:w-[76%] xl:w-[68%]">
        <div className="flex items-start justify-between gap-3 border-b border-line/60 px-6 py-4">
          <div className="min-w-0">
            <h2 className="text-[19px]">{lead.name || "No name given"}</h2>
            <p className="mt-0.5 text-[12px] text-muted">
              {[
                STAGE_LABEL[lead.stage] ?? lead.stage,
                lead.adName || lead.source,
                `In ${day(lead.receivedAt)}`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line/80 text-[12px] text-muted transition-colors hover:text-ink"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {failed ? (
            <div className="rounded-2xl border border-dashed border-line/70 p-5">
              <p className="text-[13.5px]">Couldn&apos;t load this lead.</p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
                The lead is safe in Launch Pad. This is the link between the two.
              </p>
              <button
                type="button"
                onClick={load}
                className="mt-3 rounded-lg border border-line/80 px-3 py-1.5 text-[12px] text-muted transition-colors hover:text-ink"
              >
                Try again
              </button>
            </div>
          ) : !detail ? (
            <p className="text-[12.5px] text-muted">Loading…</p>
          ) : (
            <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
              <div className="space-y-4">
                <section className="rounded-2xl border border-line/70 p-4">
                  <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted">
                    Notes
                  </h3>
                  {detail.notes.length === 0 ? (
                    <p className="mt-2 text-[12.5px] text-muted">
                      Nothing written down yet.
                    </p>
                  ) : (
                    <ul className="mt-2.5 space-y-2.5">
                      {detail.notes.map((n, i) => (
                        <li key={`${n.at}-${i}`} className="border-b border-line/40 pb-2.5 last:border-0">
                          <p className="text-[12.5px] leading-relaxed">{n.text}</p>
                          <p className="mt-1 text-[10.5px] text-muted">
                            {day(n.at)} · {clock(n.at)}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}

                  {readOnly ? (
                    <p className="mt-3 border-t border-line/40 pt-3 text-[11.5px] leading-relaxed text-muted">
                      You&apos;re viewing as somebody else, so nothing can be saved. A note
                      written here would appear in their record under their name.
                    </p>
                  ) : (
                    <div className="mt-3 border-t border-line/40 pt-3">
                      <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        rows={3}
                        placeholder="What happened on the call?"
                        className="w-full rounded-lg border border-line bg-card px-3 py-2 text-[12.5px] outline-none focus:border-accent"
                      />
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          disabled={busy || !note.trim()}
                          onClick={() =>
                            act({ action: "note", text: note }, "Saved.").then(
                              (saved) => saved && setNote("")
                            )
                          }
                          className="rounded-lg bg-accent px-3.5 py-1.5 text-[12.5px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {busy ? "Saving…" : "Add note"}
                        </button>
                        <span className="text-[11px] text-muted">
                          Also shows in Launch Pad.
                        </span>
                      </div>
                    </div>
                  )}
                </section>

                <section className="rounded-2xl border border-line/70 p-4">
                  <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted">
                    History
                  </h3>
                  <ul className="mt-2.5 space-y-1.5">
                    {detail.history.length === 0 ? (
                      <li className="text-[12.5px] text-muted">Nothing recorded yet.</li>
                    ) : (
                      detail.history
                        .slice()
                        .reverse()
                        .map((h, i) => (
                          <li key={`${h.at}-${i}`} className="flex justify-between gap-3 text-[12px]">
                            <span>{h.label ?? STAGE_LABEL[h.stage] ?? h.stage}</span>
                            <span className="shrink-0 text-muted">{day(h.at)}</span>
                          </li>
                        ))
                    )}
                  </ul>
                </section>
              </div>

              <div className="space-y-4">
                <section className="rounded-2xl border border-line/70 p-4">
                  <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted">
                    Follow-up
                  </h3>
                  <p className="mt-1.5 text-[13px]">
                    {due ? dueWording(due) : "No reminder set."}
                  </p>
                  {!readOnly && (
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {[
                        ["Tomorrow", 1],
                        ["3 days", 3],
                        ["Next week", 7],
                      ].map(([label, days]) => (
                        <button
                          key={String(label)}
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            act({ action: "follow-up", at: preset(days as number) }, "Reminder set.")
                          }
                          className="rounded-full border border-line/80 px-2.5 py-1 text-[11.5px] text-muted transition-colors hover:text-ink disabled:opacity-40"
                        >
                          {label}
                        </button>
                      ))}
                      {due && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => act({ action: "follow-up", at: null }, "Reminder cleared.")}
                          className="rounded-full border border-line/80 px-2.5 py-1 text-[11.5px] text-muted transition-colors hover:text-ink disabled:opacity-40"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  )}
                </section>

                <section className="rounded-2xl border border-line/70 p-4">
                  <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted">
                    Get in touch
                  </h3>
                  <div className="mt-2 space-y-1.5 text-[12.5px]">
                    {detail.phone ? (
                      <a href={`tel:${detail.phone}`} className="block underline">
                        {detail.phone}
                      </a>
                    ) : (
                      <p className="text-muted">No number given.</p>
                    )}
                    {detail.email ? (
                      <a href={`mailto:${detail.email}`} className="block break-all underline">
                        {detail.email}
                      </a>
                    ) : null}
                    {detail.address || detail.postcode ? (
                      <p className="text-muted">
                        {[detail.address, detail.postcode].filter(Boolean).join(", ")}
                      </p>
                    ) : null}
                  </div>
                  {detail.note ? (
                    <p className="mt-2.5 border-t border-line/40 pt-2.5 text-[12px] leading-relaxed text-muted">
                      {detail.note}
                    </p>
                  ) : null}
                </section>

                <a
                  href={detail.deepLink}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-2xl border border-line/70 p-4 text-[12.5px] text-muted transition-colors hover:text-ink"
                >
                  Open in Launch Pad →
                  <span className="mt-1 block text-[11px]">
                    For booking, marking lost, and sending to REX.
                  </span>
                </a>
              </div>
            </div>
          )}

          {message ? <p className="mt-3 text-[12px] text-muted">{message}</p> : null}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------- the grid ------------------------------- */

function Tile({ lead, onOpen }: { lead: MirroredLead; onOpen: () => void }) {
  const due = dueWording(lead.followUpAt);
  const overdue = (daysAway(lead.followUpAt) ?? 1) < 0;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="fade-up rounded-2xl border border-line/80 bg-panel p-4 text-left transition-colors hover:border-ink"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-[14px]">{lead.name || "No name given"}</p>
        <span className="shrink-0 rounded-full border border-line/70 px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-muted">
          {STAGE_LABEL[lead.stage] ?? lead.stage}
        </span>
      </div>
      <p className="mt-1 text-[11.5px] text-muted">{lead.adName || lead.source}</p>
      <div className="mt-2.5 flex flex-wrap items-baseline justify-between gap-2 border-t border-line/40 pt-2.5 text-[11px]">
        <span className="text-muted">In {day(lead.receivedAt)}</span>
        {due ? (
          <span className={overdue ? "text-accent-dark" : "text-muted"}>{due}</span>
        ) : null}
      </div>
    </button>
  );
}

type Load =
  | { state: "loading" }
  | { state: "denied"; reason: string }
  | { state: "error" }
  | { state: "ready"; funnel: Funnel };

export default function LaunchPadFunnel() {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [tab, setTab] = useState<LeadBucket>("uncontacted");
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState<MirroredLead | null>(null);
  const [readOnly, setReadOnly] = useState(false);

  const fetchFunnel = useCallback(() => {
    fetch("/api/tools/launchpad-leads", { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json().catch(() => null);
        if (r.status === 403) {
          setLoad({ state: "denied", reason: j?.reason ?? "not-pro" });
          return;
        }
        /* A funnel we could not fetch must never render as an empty one. */
        if (!r.ok || !j?.funnel) {
          setLoad({ state: "error" });
          return;
        }
        setLoad({ state: "ready", funnel: j.funnel as Funnel });
      })
      .catch(() => setLoad({ state: "error" }));
  }, []);

  useEffect(fetchFunnel, [fetchFunnel]);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { viewingAs?: boolean } | null) => setReadOnly(Boolean(j?.viewingAs)))
      .catch(() => {});
  }, []);

  const shown = useMemo(() => {
    if (load.state !== "ready") return [];
    const needle = term.trim().toLowerCase();
    return load.funnel.leads
      .filter((l) => l.bucket === tab)
      .filter((l) =>
        !needle
          ? true
          : [l.name, l.phone, l.email, l.adName, l.source]
              .filter(Boolean)
              .some((v) => String(v).toLowerCase().includes(needle))
      );
  }, [load, tab, term]);

  if (load.state === "loading") {
    return <p className="mt-8 text-[12.5px] text-muted">Loading your funnel…</p>;
  }

  if (load.state === "denied") {
    return (
      <div className="fade-up mt-8 rounded-2xl border border-dashed border-line/70 bg-panel p-5">
        <p className="text-[13.5px]">
          {load.reason === "unknown-person"
            ? "We cannot find your licence record."
            : load.reason === "unavailable"
              ? "We cannot check your licence just now."
              : "Launch Pad is not part of your licence."}
        </p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
          {load.reason === "unknown-person"
            ? "Ask the office to check it, and this will open up on its own."
            : load.reason === "unavailable"
              ? "Nothing is wrong with your account. Try again shortly."
              : "Speak to Susan about going Pro."}
        </p>
      </div>
    );
  }

  if (load.state === "error") {
    return (
      <div className="fade-up mt-8 rounded-2xl border border-dashed border-line/70 bg-panel p-5">
        <p className="text-[13.5px]">Couldn&apos;t load your funnel.</p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
          Your leads are safe in Launch Pad. This is the link between the two, not the leads
          themselves. Try again in a moment.
        </p>
      </div>
    );
  }

  const { funnel } = load;

  if (!funnel.found) {
    return (
      <div className="fade-up mt-8 rounded-2xl border border-dashed border-line/70 bg-panel p-5">
        <p className="text-[13.5px]">You have not set Launch Pad up yet.</p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
          Your licence covers it. Once your account is running, your leads appear here
          automatically.
        </p>
      </div>
    );
  }

  const at = clock(funnel.computedAt);

  return (
    <>
      {/* The phone gets a real screen, not a squeezed grid. */}
      <div className="fade-up mt-8 rounded-2xl border border-dashed border-line/70 bg-panel p-5 lg:hidden">
        <div className="flex items-center gap-2.5">
          <DoodleIcon name="rocket" size={18} />
          <p className="text-[13.5px]">Use the app on your phone</p>
        </div>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
          This view is built for a desktop screen. On a phone the Launch Pad app is the better
          place to work leads, and it can tell you the moment one lands.
        </p>
        {funnel.appUrl ? (
          <a
            href={funnel.appUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-block rounded-lg border border-line/80 px-3 py-1.5 text-[12px] text-muted transition-colors hover:text-ink"
          >
            Open Launch Pad
          </a>
        ) : null}
      </div>

      <div className="hidden lg:block">
        <div className="fade-up mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {BUCKETS.map((b) => {
            const on = tab === b.key;
            return (
              <button
                key={b.key}
                type="button"
                onClick={() => setTab(b.key)}
                className={`rounded-2xl border p-4 text-left transition-colors ${
                  on ? "border-ink bg-panel" : "border-line/80 bg-panel hover:border-ink"
                }`}
              >
                <p className="text-[9.5px] font-bold uppercase tracking-wider text-muted">
                  {b.label}
                </p>
                <p className="figures mt-1.5 text-[24px] leading-none">
                  {funnel.counts[b.key] ?? 0}
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted">{b.blurb}</p>
              </button>
            );
          })}
        </div>

        <div className="fade-up mt-4 flex flex-wrap items-center justify-between gap-3">
          <label className="relative min-w-[260px] flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
              <DoodleIcon name="search" size={15} />
            </span>
            <input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Search by name, number, email or ad…"
              className="w-full rounded-full border border-line bg-card py-2 pl-9 pr-3 text-[12.5px] outline-none focus:border-accent"
            />
          </label>
          {at ? (
            <span className="text-[11px] text-muted">As Launch Pad saw it at {at}</span>
          ) : null}
        </div>

        {shown.length === 0 ? (
          <p className="mt-6 text-[12.5px] text-muted">
            {term.trim()
              ? "Nobody here matches that."
              : "Nothing in here right now."}
          </p>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {shown.map((l) => (
              <Tile key={l.id} lead={l} onOpen={() => setOpen(l)} />
            ))}
          </div>
        )}
      </div>

      {open ? (
        <LeadPanel
          lead={open}
          readOnly={readOnly}
          onClose={() => setOpen(null)}
          onChanged={fetchFunnel}
        />
      ) : null}
    </>
  );
}
