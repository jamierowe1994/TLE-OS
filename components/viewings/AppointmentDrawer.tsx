"use client";

import { useEffect, useState } from "react";
import { useSlideOver } from "@/lib/use-slide-over";
import { createPortal } from "react-dom";
import Link from "next/link";
import DoodleIcon from "@/components/DoodleIcon";
import { PressButton } from "@/components/Bits";
import { canChangeTime } from "@/components/viewings/ChangeViewing";
import { anchorFromAppt, type BlockAnchor } from "@/components/viewings/AddToBlock";
import { refreshDiary, useDiary } from "@/lib/diary-store";
import { apptStartIso } from "@/components/viewings/ChangeViewing";
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
import { WhatsAppButton } from "@/components/WhatsAppQr";

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
const AT_PROPERTY = new Set(["viewing", "takeon", "movein", "inspection", "slot"]);

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
  onClose: closeNow,
  onOpenViewing,
  onChangeTime,
  onAddToBlock,
  sentExtra,
  onSend,
}: {
  appt: Appt | null;
  outcome?: Outcome;
  onClose: () => void;
  /** The viewing's own file - the full drawer with feedback and offers. */
  onOpenViewing: (a: Appt) => void;
  /** Change time: the booker on this viewing (6 Oct 2026). */
  onChangeTime?: (a: Appt) => void;
  /** "Add another viewing to this slot" (8 Oct 2026): this viewing as the block's first. */
  onAddToBlock?: (anchor: BlockAnchor) => void;
  sentExtra: Set<string>;
  onSend: (apptId: string, label: string) => void;
}) {
  /* A slot: the viewings booked inside it, from the same diary (8 Oct 2026). */
  const { appts: diary } = useDiary();
  const [removing, setRemoving] = useState<"ask" | "busy" | null>(null);
  const [slotSaid, setSlotSaid] = useState<string | null>(null);
  useEffect(() => {
    setRemoving(null);
    setSlotSaid(null);
  }, [appt?.id]);
  /* Every way out plays the card out first (lib/use-slide-over). */
  const { shown, close: onClose } = useSlideOver(Boolean(appt), closeNow, appt?.id);
  useEffect(() => {
    if (!appt) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [appt, onClose]);

  /* The property behind it, and its keys. Live REX entries carry no listing
     link, so the address text is the only join; matched conservatively,
     because a wrong property here would show somebody the wrong keys. */
  const [match, setMatch] = useState<{ listingId: string | null; propertyId: string | null; locality: string } | null | undefined>(undefined);
  const [keys, setKeys] = useState<KeySet[] | null>(null);
  useEffect(() => {
    setMatch(undefined);
    setKeys(null);
    if (!appt || !AT_PROPERTY.has(appt.kind)) return;
    let gone = false;
    const target = `${appt.where} ${appt.what}`.toLowerCase();
    /* Matched on the server with the keys, one round trip (2 Oct 2026) - it
       used to download the whole listing book to find one address. */
    fetch(`/api/listings/match?address=${encodeURIComponent(target)}`)
      .then((r) => r.json())
      .then((j: { ok?: boolean; match?: { listingId?: string | null; propertyId: string | null; locality: string } | null; keysOk?: boolean; keys?: KeySet[] }) => {
        if (gone) return;
        if (!j.ok) return setMatch(null);
        const hit = j.match;
        if (!hit) return setMatch(null);
        setMatch({ listingId: hit.listingId ?? null, propertyId: hit.propertyId ?? null, locality: hit.locality });
        if (!hit.propertyId) return setKeys([]);
        setKeys(j.keysOk ? (j.keys ?? []) : []);
      })
      .catch(() => !gone && setMatch(null));
    return () => {
      gone = true;
    };
  }, [appt]);

  if (!appt) return null;

  const meta = KIND_META[appt.kind];
  const tone = toneOf(appt.kind, appt.unaccompanied);
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
    <div className="so-root fixed inset-0 z-[130]" data-shown={shown} data-steve="appointment.drawer">
      <button
        aria-label="Close"
        onClick={onClose}
        data-shown={shown}
        className="so-scrim absolute inset-0 cursor-default bg-ink/30"
      />
      <aside
        data-shown={shown}
        className="so-panel so-panel-float absolute inset-y-0 right-0 flex w-full max-w-[460px] flex-col overflow-hidden bg-white shadow-[-24px_0_60px_-24px_rgba(0,0,0,0.35)] sm:inset-y-3 sm:right-3 sm:rounded-[22px] sm:border sm:border-line/50"
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

          {/* ── What they wrote on it ── */}
          {appt.notes && (
            <Section icon="note" title="Notes">
              <p className="whitespace-pre-line leading-relaxed">{appt.notes}</p>
            </Section>
          )}

          {/* ── A slot: who is booked in it, in order. ── */}
          {appt.kind === "slot" && (() => {
            const from = new Date(apptStartIso(appt)).getTime();
            const to = from + appt.mins * 60_000;
            const inside = diary
              .filter((a) => a.kind === "viewing" && ((appt.listingId && a.listingId === appt.listingId) || (!!appt.where && a.where === appt.where)))
              .filter((a) => {
                const t = new Date(apptStartIso(a)).getTime();
                return t < to && t + a.mins * 60_000 > from;
              })
              .sort((a, b) => apptStartIso(a).localeCompare(apptStartIso(b)));
            return (
              <Section icon="user" title={`Booked in this slot · ${inside.length}`}>
                {inside.length ? (
                  <ul className="space-y-1.5">
                    {inside.map((a) => (
                      <li key={a.id} className="flex items-center gap-3">
                        <span className="figures w-12 shrink-0 text-[12px] text-muted">{a.start}</span>
                        <span className="min-w-0 flex-1 truncate font-semibold">{a.who || "Viewer"}</span>
                        <span className="text-[11px] text-muted">{a.mins} min</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted">Nobody booked in it yet. Book within slot to add the first tenant.</p>
                )}
                <p className="mt-2 text-[11px] text-muted">Held time - nobody is told about the slot itself.</p>
              </Section>
            );
          })()}

          {/* ── Who ── */}
          {appt.kind !== "slot" && (
          <Section icon="user" title={appt.kind === "viewing" ? (past ? "Who viewed" : "Who's coming") : "Who it's with"}>
            {appt.who ? <p className="font-semibold">{appt.who}</p> : <p className="text-muted">Nobody named on this entry.</p>}
            {appt.contact ? (
              <div className="mt-2 flex flex-wrap gap-2">
                <a href={`tel:${appt.contact.phone.replace(/\s+/g, "")}`} className={secondary}>
                  <DoodleIcon name="call" size={12} />
                  {appt.contact.phone}
                </a>
                <WhatsAppButton phone={appt.contact.phone} name={appt.who || ""} className={secondary}>
                  <DoodleIcon name="message-2" size={12} />
                  WhatsApp
                </WhatsAppButton>
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
          )}

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
          {appt.kind !== "other" && appt.kind !== "travel" && appt.kind !== "slot" && (
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
          {/* WHAT THEY SAID, out of REX.
              This read an `outcome` prop that came from a hardcoded map of
              sample ids, so on a real book it was always empty and every past
              viewing said "nobody has written down what was said" - including
              the ones somebody HAD written up, in REX, that morning. The words
              live in REX's Feedback service; see lib/rex-feedback.ts. */}
          {appt.kind === "viewing" && past && (
            <Section icon="message" title="Feedback">
              {appt.feedback ? (
                <>
                  <p className="flex flex-wrap items-center gap-2">
                    {appt.feedback.interest && (
                      <span className="rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ background: SAGE_WASH, color: SAGE_INK }}>
                        {appt.feedback.interest}
                      </span>
                    )}
                    {appt.feedback.date && (
                      <span className="text-[11px] text-muted">
                        {new Date(`${appt.feedback.date}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                      </span>
                    )}
                  </p>
                  {appt.feedback.note ? (
                    <p className="mt-2 whitespace-pre-line leading-relaxed">{appt.feedback.note}</p>
                  ) : (
                    <p className="mt-2 text-muted">Logged in REX, with nothing written down.</p>
                  )}
                  {appt.feedback.agent && <p className="mt-2 text-[11px] text-muted">Recorded by {appt.feedback.agent}</p>}
                </>
              ) : (
                <p className="text-muted">Nobody has written down what was said. Record it from the viewing file.</p>
              )}
            </Section>
          )}
        </div>

        {/* ── The way in: one button to the file. ── */}
        <div className="shrink-0 border-t border-line/60 px-5 py-4">
          {appt.kind === "slot" ? (
            /* A slot: book tenants within it, or let the time go. */
            <div className="flex flex-wrap gap-2">
              {(() => {
                const anchor = anchorFromAppt({ ...appt, listingId: appt.listingId ?? match?.listingId ?? null });
                return onAddToBlock && anchor ? (
                  <button type="button" data-steve="appointment.book-within-slot" onClick={() => onAddToBlock({ ...anchor, locality: match?.locality })} className={`${primary} flex-1`}>
                    <DoodleIcon name="user" size={13} />
                    Book within slot
                  </button>
                ) : null;
              })()}
              {appt.id.startsWith("os-") && (
                <button
                  type="button"
                  disabled={removing === "busy"}
                  onBlur={() => removing === "ask" && setRemoving(null)}
                  onClick={async () => {
                    if (removing !== "ask") return setRemoving("ask");
                    setRemoving("busy");
                    const j = await fetch("/api/viewings/slot", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ slotId: appt.id }) })
                      .then((r) => r.json() as Promise<{ ok?: boolean; said?: string }>)
                      .catch(() => null);
                    if (!j?.ok) {
                      setRemoving(null);
                      setSlotSaid(j?.said ?? "That didn't remove it. Try again.");
                      return;
                    }
                    await refreshDiary().catch(() => null);
                    onClose();
                  }}
                  className={secondary}
                >
                  {removing === "busy" ? "Removing…" : removing === "ask" ? "Yes, remove the slot" : "Remove slot"}
                </button>
              )}
              {slotSaid && <p className="w-full text-[11.5px] text-accent-dark">{slotSaid}</p>}
            </div>
          ) : appt.kind === "viewing" ? (
            <div className="flex flex-wrap gap-2">
              <button type="button" data-steve="appointment.open-viewing" onClick={() => onOpenViewing(appt)} className={`${primary} flex-1`}>
                <DoodleIcon name="folder" size={13} />
                {past && !appt.feedback ? "Open the viewing and record feedback" : "Open the viewing file"}
              </button>
              {onChangeTime && canChangeTime(appt) && (
                <button type="button" onClick={() => onChangeTime(appt)} className={secondary}>
                  <DoodleIcon name="calendar" size={13} />
                  Change time
                </button>
              )}
              {(() => {
                /* REX entries carry no listing; the address match above finds it. */
                const anchor = anchorFromAppt({ ...appt, listingId: appt.listingId ?? match?.listingId ?? null });
                return onAddToBlock && anchor ? (
                  <button type="button" data-steve="appointment.add-to-block" onClick={() => onAddToBlock({ ...anchor, locality: match?.locality })} className={secondary}>
                    <DoodleIcon name="user" size={13} />
                    Add another viewing to this slot
                  </button>
                ) : null;
              })()}
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
