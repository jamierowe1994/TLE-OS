"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import DoodleIcon from "@/components/DoodleIcon";
import { PressButton } from "@/components/Bits";
import type { Outcome } from "@/components/ViewingDrawer";
import type { KeySet } from "@/lib/rex-keys";
import { KIND_META, type Appt } from "@/lib/diary";
import {
  SAGE_INK,
  SAGE_WASH,
  bubble,
  dateOfOffset,
  endTime,
  eyebrow,
  fmtFull,
  lengthLabel,
  nearLabel,
  primary,
  secondary,
  subjectOf,
  toneOf,
} from "@/components/viewings/shared";

/**
 * The quick look: what IS this, and what do I need to know before I go.
 *
 * James, 11 Sep 2026: "when they click into appointments, they should be
 * able to click into each individual appointment and see the details of it.
 * If they're unsure of what it is, they should be able to click into it...
 * They'll be able to say, 'Take me to this file.'" And the list of what a
 * busy agent wants on the doorstep: where it is, who is coming, whether the
 * tenant has been told, whether the landlord has confirmed, where the keys
 * are, what the feedback was.
 *
 * So: one narrow drawer for EVERY kind of entry, saying each of those things
 * or saying honestly that it is not known, and one button to the file. A
 * viewing's file is the viewing drawer, which is where feedback is recorded
 * and offers pushed; anything else opens the record it belongs to.
 */

/** Kinds that happen AT a property, and so have keys and an occupier. */
const AT_PROPERTY = new Set(["viewing", "takeon", "movein", "inspection"]);

function Section({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line/50 p-4">
      <p className={`${eyebrow} flex items-center gap-2`}>
        <DoodleIcon name={icon} size={12} className="text-accent-dark" />
        {title}
      </p>
      <div className="mt-2.5 text-[12.5px] leading-relaxed">{children}</div>
    </section>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[76px_minmax(0,1fr)] items-baseline gap-2">
      <span className="text-[11px] text-muted">{label}</span>
      <span className="min-w-0">{children}</span>
    </div>
  );
}

export default function AppointmentDrawer({
  appt,
  outcome,
  onClose,
  onOpenViewing,
  sentExtra,
  onSend,
}: {
  appt: Appt | null;
  outcome?: Outcome;
  onClose: () => void;
  /** The viewing's own file - the full drawer with feedback and offers. */
  onOpenViewing: (a: Appt) => void;
  sentExtra: Set<string>;
  onSend: (apptId: string, label: string) => void;
}) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!appt) {
      setShown(false);
      return;
    }
    const id = requestAnimationFrame(() => setShown(true));
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("keydown", onKey);
    };
  }, [appt, onClose]);

  /* The property behind it, and its keys. Live REX entries carry no listing
     link, so the address text is the only join; matched conservatively,
     because a wrong property here would show somebody the wrong keys. */
  const [match, setMatch] = useState<{ propertyId: string | null; locality: string } | null | undefined>(undefined);
  const [keys, setKeys] = useState<KeySet[] | null>(null);
  useEffect(() => {
    setMatch(undefined);
    setKeys(null);
    if (!appt || !AT_PROPERTY.has(appt.kind)) return;
    let gone = false;
    const target = `${appt.where} ${appt.what}`.toLowerCase();
    fetch("/api/listings")
      .then((r) => r.json())
      .then((j) => {
        if (gone) return;
        if (!j.ok || !Array.isArray(j.listings)) return setMatch(null);
        const hit = j.listings.find((l: { name: string }) => {
          const name = l.name.toLowerCase();
          return name.length > 6 && target.includes(name);
        });
        if (!hit) return setMatch(null);
        setMatch({ propertyId: hit.propertyId ?? null, locality: hit.locality });
        if (!hit.propertyId) return setKeys([]);
        fetch(`/api/keys?propertyIds=${encodeURIComponent(hit.propertyId)}`)
          .then((r) => r.json())
          .then((k) => !gone && setKeys(k.ok ? (k.keys[hit.propertyId] ?? []) : []))
          .catch(() => !gone && setKeys([]));
      })
      .catch(() => !gone && setMatch(null));
    return () => {
      gone = true;
    };
  }, [appt]);

  if (!appt) return null;

  const meta = KIND_META[appt.kind];
  const tone = toneOf(appt.kind);
  const b = bubble(tone);
  const past = appt.day < 0;
  const near = nearLabel(appt.day);
  const when = `${near ? `${near} · ` : ""}${fmtFull(dateOfOffset(appt.day))}`;
  const subject = subjectOf(appt);
  const atProperty = AT_PROPERTY.has(appt.kind);
  const missing = appt.comms.filter((c) => !c.done && !sentExtra.has(`${appt.id}:${c.label}`));
  const told = (needle: RegExp) => {
    const c = appt.comms.find((x) => needle.test(x.label));
    if (!c) return null;
    return c.done || sentExtra.has(`${appt.id}:${c.label}`);
  };
  const tenantTold = told(/heads-up|tenant/i);
  const landlordTold = told(/landlord/i);
  const mapsHref = appt.where
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(appt.where)}`
    : null;

  return createPortal(
    <div className="fixed inset-0 z-[130]">
      <button
        aria-label="Close"
        onClick={onClose}
        className={`absolute inset-0 cursor-default bg-ink/30 transition-opacity duration-300 ${shown ? "opacity-100" : "opacity-0"}`}
      />
      <aside
        className={`absolute inset-y-0 right-0 flex w-full max-w-[460px] flex-col overflow-hidden bg-white shadow-[-24px_0_60px_-24px_rgba(0,0,0,0.35)] transition-transform duration-[420ms] sm:inset-y-3 sm:right-3 sm:rounded-[22px] sm:border sm:border-line/50 ${
          shown ? "translate-x-0" : "translate-x-full"
        }`}
        style={{ transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)" }}
      >
        {/* ── The head: what, when, and the way out. ── */}
        <div className="shrink-0 border-b border-line/60 px-5 pb-4 pt-5">
          <div className="flex items-start gap-3">
            <span className={`flex size-10 shrink-0 items-center justify-center rounded-full ${b.className}`} style={b.style}>
              <DoodleIcon name={meta.icon} size={17} />
            </span>
            <div className="min-w-0 flex-1">
              <p className={eyebrow}>
                {meta.label}
                {past ? " · happened" : ""}
              </p>
              <h2 className="hand mt-1 text-[19px] leading-tight">{subject}</h2>
              <p className="mt-1 text-[12px] text-muted">
                {when}
                <span className="figures ml-2 font-semibold text-ink">
                  {appt.allDay ? "All day" : `${appt.start}–${endTime(appt)}`}
                </span>
                {!appt.allDay && <span> · {lengthLabel(appt.mins)}</span>}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex size-8 shrink-0 items-center justify-center rounded-full border border-line/60 text-[12px] text-muted transition-colors hover:text-ink"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {/* ── Where ── */}
          <Section icon="target" title="Where">
            {appt.where ? (
              <>
                <p className="font-semibold">{appt.where}</p>
                {match?.locality && match.locality !== appt.where && <p className="text-muted">{match.locality}</p>}
                {mapsHref && (
                  <a href={mapsHref} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-accent-dark hover:underline">
                    <DoodleIcon name="target" size={12} />
                    Open in Maps
                  </a>
                )}
              </>
            ) : (
              <p className="text-muted">No address on this entry.</p>
            )}
          </Section>

          {/* ── Who ── */}
          <Section icon="user" title={appt.kind === "viewing" ? (past ? "Who viewed" : "Who's coming") : "Who it's with"}>
            {appt.who ? <p className="font-semibold">{appt.who}</p> : <p className="text-muted">Nobody named on this entry.</p>}
            {appt.contact ? (
              <div className="mt-2 flex flex-wrap gap-2">
                <a href={`tel:${appt.contact.phone.replace(/\s+/g, "")}`} className={secondary}>
                  <DoodleIcon name="call" size={12} />
                  {appt.contact.phone}
                </a>
                <a href={`mailto:${appt.contact.email}`} className={secondary}>
                  <DoodleIcon name="mail" size={12} />
                  Email
                </a>
              </div>
            ) : (
              appt.who && <p className="mt-1 text-muted">No contact details on the calendar entry.</p>
            )}
            <p className="mt-2 text-[11px] text-muted">Diary: {appt.agent || "not recorded"}</p>
          </Section>

          {/* ── Access: stated even when the answer is "we don't know" - an
                 agent on a doorstep needs the blank as much as the fact. ── */}
          {atProperty && (
            <Section icon="key" title="Access">
              <div className="space-y-2">
                <Fact label="Keys">
                  {match === undefined ? (
                    <span className="text-muted">Checking the register…</span>
                  ) : match === null ? (
                    <span className="text-muted">Couldn&apos;t match this entry to a property record, so the key register can&apos;t be checked.</span>
                  ) : keys === null ? (
                    <span className="text-muted">Checking the register…</span>
                  ) : keys.length === 0 ? (
                    <span className="text-muted">No key set on the register for this property.</span>
                  ) : (
                    keys.map((k) => (
                      <span key={k.id} className="block">
                        {k.label}
                        {k.heldBy ? (
                          <span className="text-accent-dark">
                            {" "}— out with {k.heldBy}
                            {k.reason ? ` (${k.reason})` : ""}
                          </span>
                        ) : (
                          <span className="text-muted"> — on the shelf{k.location ? `, ${k.location}` : ""}</span>
                        )}
                      </span>
                    ))
                  )}
                </Fact>
                <Fact label="Occupier">
                  {appt.tenant ? (
                    <>
                      <span className="font-semibold">{appt.tenant}</span> in situ
                      {tenantTold === true && <span style={{ color: SAGE_INK }}> · told</span>}
                      {tenantTold === false && <span className="text-accent-dark"> · NOT yet told</span>}
                    </>
                  ) : appt.tenant === null ? (
                    <span>Vacant — nobody to arrange around.</span>
                  ) : (
                    <span className="text-muted">Not known whether anyone lives here — check before you travel.</span>
                  )}
                </Fact>
                <Fact label="Landlord">
                  {landlordTold === true ? (
                    <span>Told about this appointment.</span>
                  ) : landlordTold === false ? (
                    <span className="text-accent-dark">Not yet told.</span>
                  ) : (
                    <span className="text-muted">No access arrangement recorded.</span>
                  )}
                </Fact>
              </div>
            </Section>
          )}

          {/* ── Confirmations: did the messages actually go? ── */}
          {appt.kind !== "other" && appt.kind !== "travel" && (
            <Section icon="mail" title="Confirmations">
              {appt.comms.length === 0 ? (
                <p className="text-muted">
                  {appt.fromRex
                    ? "REX keeps no record of what was sent for this appointment."
                    : "Nothing to send for this one."}
                </p>
              ) : (
                <ul className="space-y-2">
                  {appt.comms.map((c) => {
                    const done = c.done || sentExtra.has(`${appt.id}:${c.label}`);
                    return (
                      <li key={c.label} className="flex items-center gap-2.5">
                        <span
                          className="flex size-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] text-[9px]"
                          style={done ? { background: SAGE_WASH, borderColor: SAGE_INK, color: SAGE_INK } : { borderColor: "var(--line)", color: "transparent" }}
                        >
                          ✓
                        </span>
                        <span className={`min-w-0 flex-1 ${done ? "" : "text-muted"}`}>{c.label}</span>
                        {done ? (
                          <span className="shrink-0 text-[10px] text-muted">sent</span>
                        ) : past ? (
                          <span className="shrink-0 text-[10px] font-semibold text-accent-dark">NEVER SENT</span>
                        ) : (
                          <PressButton
                            onClick={() => onSend(appt.id, c.label)}
                            className="press-ring shrink-0 rounded-full bg-brown px-3 py-1 text-[10.5px] font-semibold text-white"
                          >
                            Send it now
                          </PressButton>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              {missing.length > 0 && !past && (
                <p className="mt-2 text-[11px] text-accent-dark">
                  {missing.length} still to send.
                </p>
              )}
            </Section>
          )}

          {/* ── Feedback, once it has happened. ── */}
          {appt.kind === "viewing" && past && (
            <Section icon="message" title="Feedback">
              {outcome ? (
                <p>
                  <span className="rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ background: SAGE_WASH, color: SAGE_INK }}>
                    {outcome}
                  </span>
                </p>
              ) : (
                <p className="text-muted">Nobody has written down what was said. Record it from the viewing file.</p>
              )}
            </Section>
          )}
        </div>

        {/* ── The way in: one button to the file. ── */}
        <div className="shrink-0 border-t border-line/60 px-5 py-4">
          {appt.kind === "viewing" ? (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => onOpenViewing(appt)} className={`${primary} flex-1`}>
                <DoodleIcon name="folder" size={13} />
                {past && !outcome ? "Open the viewing and record feedback" : "Open the viewing file"}
              </button>
              {appt.link && (
                <Link href={appt.link.href} className={secondary} title={appt.link.label}>
                  <DoodleIcon name="home" size={13} />
                  Property
                </Link>
              )}
            </div>
          ) : appt.link ? (
            <Link href={appt.link.href} className={`${primary} w-full`}>
              <DoodleIcon name="folder" size={13} />
              Take me to the file — {appt.link.label}
            </Link>
          ) : (
            <p className="text-center text-[11px] text-muted">
              {appt.fromRex ? "A calendar entry in REX, not linked to a record here." : "Not linked to a record."}
            </p>
          )}
        </div>
      </aside>
    </div>,
    document.body
  );
}
