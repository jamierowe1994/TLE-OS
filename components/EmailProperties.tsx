"use client";

import { useEffect, useRef, useState } from "react";
import { DoneTick, PressButton } from "@/components/Bits";
import DoodleIcon from "@/components/DoodleIcon";
import PropertyPhoto from "@/components/PropertyPhoto";

/**
 * Sending someone properties — the thing an agent does more than anything
 * else, so it costs one click from where the properties already are.
 *
 * Deliberately NOT a compose window. The default path is pick, send. Reviewing
 * the wording is offered, never imposed: an agent sending a shortlist twenty
 * times a day does not want to read the same covering note twenty times.
 *
 * ANY property, not only the shortlist (James, 11 Sep 2026: "we can't send
 * properties unless they're shortlisted... that doesn't make any sense").
 * The shortlist comes first and ticked; under it, the whole live book,
 * searchable, and anything ticked there goes too.
 */

type Listing = {
  id: string; name: string; locality: string; rent: number | null; image: string | null;
};

export default function EmailProperties({
  open,
  onClose,
  lead,
  properties,
}: {
  open: boolean;
  onClose: () => void;
  lead: { name: string; email: string };
  properties: Listing[];
}) {
  const [chosen, setChosen] = useState<string[]>([]);
  /* The live book, loaded when the picker opens, and whatever was ticked from it. */
  const [book, setBook] = useState<Listing[] | null>(null);
  const [bookFailed, setBookFailed] = useState(false);
  const [find, setFind] = useState("");
  const [extra, setExtra] = useState<Listing[]>([]);
  useEffect(() => {
    if (!open || book) return;
    let live = true;
    fetch("/api/listings", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!live) return;
        if (j?.ok && Array.isArray(j.listings)) {
          const rows = (j.listings as Array<Listing & { letAgreed?: boolean; publicationStatus?: string | null }>)
            .filter((l) => !l.letAgreed)
            .map((l) => ({ id: String(l.id), name: l.name, locality: l.locality, rent: l.rent, image: l.image }));
          setBook(rows);
        } else setBookFailed(true);
      })
      .catch(() => live && setBookFailed(true));
    return () => {
      live = false;
    };
  }, [open, book]);
  const [stage, setStage] = useState<"pick" | "review" | "sent">("pick");

  // Seeded on OPEN only — `properties` is built inline by the caller, so
  // depending on it would silently re-tick everything mid-edit.
  const seed = useRef(properties);
  seed.current = properties;
  useEffect(() => {
    if (!open) return;
    // Everything shortlisted is pre-selected — the common case is "send them
    // all", so that should need no clicks at all.
    setChosen(seed.current.map((p) => p.id));
    setExtra([]);
    setFind("");
    setStage("pick");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const all = [...properties, ...extra.filter((e) => !properties.some((p) => p.id === e.id))];
  const picked = all.filter((p) => chosen.includes(p.id));
  const needle = find.trim().toLowerCase();
  const results = (book ?? [])
    .filter((l) => !all.some((p) => p.id === l.id))
    .filter((l) => !needle || `${l.name} ${l.locality}`.toLowerCase().includes(needle))
    .slice(0, needle ? 30 : 8);
  const first = lead.name.split(" ")[0];
  const subject =
    picked.length === 1
      ? `A property for you — ${picked[0].name}`
      : `${picked.length} properties for you`;

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center p-4">
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-ink/45"
      />

      <div className="fade-up relative flex max-h-[86vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-line/80 bg-page shadow-[0_30px_70px_-20px_rgba(0,0,0,0.5)]">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line/70 px-6 py-4">
          <div className="min-w-0">
            <h2 className="text-[19px] leading-tight">
              {stage === "sent" ? "Sent" : stage === "review" ? "Review email" : "Email properties"}
            </h2>
            {stage !== "sent" && (
              <p className="mt-0.5 truncate text-[12px] text-muted">
                To {lead.name} · {lead.email}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line/80 text-[12px] text-muted transition-colors hover:text-ink"
          >
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {stage === "sent" && (
            <div className="flex flex-col items-center py-8 text-center">
              <DoneTick />
              <p className="hand mt-5 text-[20px]">
                {picked.length} propert{picked.length === 1 ? "y" : "ies"} on their way
              </p>
              <p className="mt-1.5 text-[12.5px] text-muted">
                Logged against {first}&apos;s record under Activity.
              </p>
            </div>
          )}

          {stage === "pick" && (
            <>
              {all.length ? (
                <ul className="space-y-2.5">
                  {all.map((p) => {
                    const on = chosen.includes(p.id);
                    return (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() =>
                            setChosen((c) =>
                              on ? c.filter((x) => x !== p.id) : [...c, p.id]
                            )
                          }
                          className={`flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition-colors ${
                            on ? "border-accent-dark bg-accent-soft/40" : "border-line/60"
                          }`}
                        >
                          <span
                            className={`flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-full border-[1.5px] text-[9px] ${
                              on ? "border-accent-dark bg-accent-dark text-page" : "border-line"
                            }`}
                          >
                            {on && "✓"}
                          </span>
                          <PropertyPhoto src={p.image} className="h-10 w-12 shrink-0 rounded-lg" />
                          <span className="min-w-0 flex-1">
                            <span className="hand block truncate text-[13px]">{p.name}</span>
                            <span className="block truncate text-[10.5px] text-muted">
                              {p.locality}
                            </span>
                          </span>
                          <span className="figures shrink-0 text-[13px]">
                            £{p.rent?.toLocaleString("en-GB")}
                            <span className="text-[10px] text-muted"> pcm</span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="pb-2 text-[12.5px] text-muted">Nothing shortlisted - pick any property below.</p>
              )}

              {/* Any property in the live book. */}
              <div className="mt-5 border-t border-line/60 pt-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Add any property</p>
                <input
                  value={find}
                  onChange={(e) => setFind(e.target.value)}
                  placeholder="Search by street, town or postcode"
                  className="mt-2 w-full rounded-xl border border-line/80 bg-transparent px-3 py-2 text-[12.5px] outline-none focus:border-ink"
                />
                {book === null && !bookFailed && <p className="mt-3 text-[12px] text-muted">Loading the live book…</p>}
                {bookFailed && <p className="mt-3 text-[12px] text-muted">REX did not answer, so only the shortlist can be sent just now.</p>}
                {book && (
                  <ul className="mt-3 space-y-2">
                    {results.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setExtra((cur) => [...cur, p]);
                            setChosen((c) => [...c, p.id]);
                          }}
                          className="flex w-full items-center gap-3 rounded-xl border border-dashed border-line/80 p-2.5 text-left transition-colors hover:border-ink/40"
                        >
                          <span className="flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-line text-[10px] text-muted">+</span>
                          <PropertyPhoto src={p.image} className="h-10 w-12 shrink-0 rounded-lg" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-semibold">{p.name}</span>
                            <span className="block truncate text-[10.5px] text-muted">{p.locality}</span>
                          </span>
                          <span className="figures shrink-0 text-[13px]">
                            {p.rent != null ? `£${p.rent.toLocaleString("en-GB")}` : "—"}
                          </span>
                        </button>
                      </li>
                    ))}
                    {!results.length && <li className="text-[12px] text-muted">Nothing matches that.</li>}
                  </ul>
                )}
              </div>
            </>
          )}

          {stage === "review" && (
            /* A rendering of the email, not a rich editor — the point of the
               review step is to check, and checking is a read. */
            <div className="rounded-2xl border border-line/70 bg-card p-5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Subject</p>
              <p className="mt-1 text-[14px] font-semibold">{subject}</p>

              <div className="mt-5 space-y-3 border-t border-line/60 pt-4 text-[13px] leading-relaxed">
                <p>Hi {first},</p>
                <p>
                  Following our conversation, here {picked.length === 1 ? "is" : "are"}{" "}
                  {picked.length === 1 ? "a property" : `${picked.length} properties`} I think
                  would suit you.
                </p>
                <ul className="space-y-2.5 py-1">
                  {picked.map((p) => (
                    <li key={p.id} className="flex items-center gap-3 rounded-xl border border-line/60 p-2.5">
                      <PropertyPhoto src={p.image} className="h-11 w-14 shrink-0 rounded-lg" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{p.name}</span>
                        <span className="block truncate text-[11.5px] text-muted">{p.locality}</span>
                      </span>
                      <span className="figures shrink-0">
                        £{p.rent?.toLocaleString("en-GB")}
                        <span className="text-[10px] text-muted"> pcm</span>
                      </span>
                    </li>
                  ))}
                </ul>
                <p>
                  Just reply to this email or give me a ring if you&apos;d like to arrange a
                  viewing on any of them.
                </p>
                <p className="text-muted">Kind regards,<br />The Letting Experts</p>
              </div>
            </div>
          )}
        </div>

        {stage !== "sent" && (
          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-line/70 px-6 py-4">
            <button
              type="button"
              onClick={() => setStage(stage === "review" ? "pick" : "review")}
              disabled={!picked.length}
              className="rounded-full border border-line/80 px-4 py-2.5 text-[12.5px] font-medium transition-colors hover:border-ink/40 disabled:opacity-40"
            >
              {stage === "review" ? "← Back" : "Review email"}
            </button>
            <PressButton
              onClick={() => picked.length && setStage("sent")}
              className={`rounded-full px-6 py-2.5 text-[13px] font-semibold ${
                picked.length ? "bg-ink text-page" : "cursor-not-allowed bg-ink/30 text-page/60"
              }`}
            >
              <span className="flex items-center gap-2">
                <DoodleIcon name="mail" size={15} />
                Send {picked.length ? `${picked.length} ` : ""}
                {picked.length === 1 ? "property" : "properties"}
              </span>
            </PressButton>
          </div>
        )}
      </div>
    </div>
  );
}
