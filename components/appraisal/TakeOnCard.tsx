"use client";

import { useCallback, useEffect, useState } from "react";
import ViewingBooker from "@/components/ViewingBooker";
import Link from "next/link";
import DoodleIcon from "@/components/DoodleIcon";
import { fetchMe } from "@/lib/me";
import type { MarketAppraisal } from "@/lib/market-appraisal";

/**
 * BOOKING THE TAKE-ON VISIT, from the appraisal (James, 17 Sep 2026).
 *
 * "There's no way to actually book it." Now there is, and it is the booker
 * the appraisal itself was booked in: the diary, the confirmation beside it,
 * Book and send.
 *
 * Above it, two things the agent needs before they pick a time: how we get
 * in (from the landlord's own answers - confirm with the tenant, with the
 * landlord, or vacant) and any times the landlord has offered from their
 * file. Neither is required: a re-let may keep its photographs, and a
 * landlord who suggested nothing is simply booked the usual way.
 */
type Times = { slots: Array<{ day: string; part: string }>; note: string; at: string } | null;
type Access = { label: string; detail: string } | null;
type Booking = { startsAt: string; minutes: number; by: string; at: string } | null;

const dayWords = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
const partWords = (p: string) => (p === "morning" ? "morning" : p === "afternoon" ? "afternoon" : "any time");
const minuteWords = (m: number) => (m % 60 === 0 ? (m === 60 ? "An hour" : `${m / 60} hours`) : m === 90 ? "An hour and a half" : `${m} minutes`);
const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" });

export default function TakeOnCard({ ma, primary, ghost }: { ma: MarketAppraisal; primary: string; ghost: string }) {
  /* Whose diary the grid shows: the agent on the file, or whoever is looking
     at it when nobody is named. */
  const [me, setMe] = useState<string>("");
  useEffect(() => {
    fetchMe()
      .then((j) => setMe(j?.user?.name ?? ""))
      .catch(() => {});
  }, []);
  const [times, setTimes] = useState<Times>(null);
  const [access, setAccess] = useState<Access>(null);
  const [booking, setBooking] = useState<Booking>(null);
  const [open, setOpen] = useState(false);
  const [said, setSaid] = useState<string | null>(null);

  const read = useCallback(async () => {
    try {
      const r = await fetch(`/api/appraisals/${encodeURIComponent(ma.id)}/takeon`, { cache: "no-store" });
      const j = (await r.json()) as { ok?: boolean; times?: Times; access?: Access; booking?: Booking };
      if (!j.ok) return;
      setTimes(j.times ?? null);
      setAccess(j.access ?? null);
      setBooking(j.booking ?? null);
    } catch {
      /* the button still works */
    }
  }, [ma.id]);

  useEffect(() => {
    void read();
  }, [read]);

  /* Straight from the landlord's email about their times. */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("takeon") !== "1") return;
    params.delete("takeon");
    const qs = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
    setOpen(true);
  }, []);

  const suggested = times?.slots.map((s) => `${dayWords(s.day)}, ${partWords(s.part)}`) ?? null;
  /* The visit has happened: the next thing is the photographs off the camera. */
  const been = Boolean(booking && new Date(booking.startsAt).getTime() + booking.minutes * 60000 < Date.now());

  return (
    <div>
      {access && (
        <p className="mb-2 flex items-start gap-2 text-[11.5px] leading-relaxed text-muted">
          <DoodleIcon name="key" size={12} className="mt-[2px] shrink-0" />
          <span>
            <span className="font-semibold text-ink">{access.label}</span>
            {access.detail ? ` · ${access.detail}` : ""}
          </span>
        </p>
      )}
      {suggested?.length ? (
        <div className="mb-3 rounded-xl border border-line/60 bg-white/70 px-3.5 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">{ma.landlord.split(/\s+/)[0]} can do</p>
          <ul className="mt-1 space-y-0.5">
            {suggested.map((s) => (
              <li key={s} className="text-[12px]">{s}</li>
            ))}
          </ul>
          {times?.note && <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted">{times.note}</p>}
        </div>
      ) : null}

      {booking ? (
        <ul className="mb-3 space-y-1 text-[12.5px] leading-relaxed">
          <li className="font-semibold">{when(booking.startsAt)}</li>
          <li className="text-muted">{minuteWords(booking.minutes)} · in your Outlook calendar</li>
          <li className="text-muted">Photographs, floor plan and the details for the advert</li>
          {been && <li className="font-semibold text-ink">That visit has been. The photos come next.</li>}
        </ul>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {been ? (
          <>
            <Link href={`/market-appraisals/${ma.id}?photos=1`} className={primary}>
              Upload the photos <span aria-hidden>→</span>
            </Link>
            <button type="button" onClick={() => setOpen(true)} className={ghost}>
              Book another visit
            </button>
          </>
        ) : (
          <button type="button" onClick={() => setOpen(true)} className={booking ? ghost : primary}>
            {booking ? "Move the take-on visit" : suggested?.length ? "Book one of their times" : "Book take-on visit"}
            {!booking && <span aria-hidden>→</span>}
          </button>
        )}
      </div>
      {said && <p className="mt-2.5 text-[11.5px] leading-relaxed">{said}</p>}

      <ViewingBooker
        open={open}
        onClose={() => setOpen(false)}
        mode="takeon"
        address={[ma.address, ma.postcode].filter(Boolean).join(", ")}
        lead={{ name: ma.landlord, email: ma.landlordEmail ?? "", phone: ma.landlordMobile ?? "" }}
        properties={[]}
        agent={ma.agent || me}
        appraisalId={ma.id}
        suggested={suggested}
        onBooked={async (v) => {
          const parts: string[] = [];
          if (v.startsAt) {
            const j = await fetch(`/api/appraisals/${encodeURIComponent(ma.id)}/takeon`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ startsAt: v.startsAt, minutes: v.minutes }),
            })
              .then((r) => r.json() as Promise<{ ok?: boolean; said?: string }>)
              .catch(() => null);
            parts.push(j?.said ?? "Couldn't reach the server: check your calendar.");
            if (j?.ok && v.confirmation?.send) {
              const c = await fetch("/api/confirmations", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  action: "send",
                  kind: "takeon",
                  id: ma.id,
                  startsAt: v.startsAt,
                  minutes: v.minutes,
                  subject: v.confirmation.subject,
                  html: v.confirmation.html,
                  again: v.confirmation.again,
                }),
              })
                .then((r) => r.json() as Promise<{ sent?: boolean; detail?: string; error?: string }>)
                .catch(() => null);
              parts.push(c?.sent ? `Confirmation sent. ${c.detail ?? ""}`.trim() : `The confirmation did not send: ${c?.detail ?? c?.error ?? "the connection dropped"}.`);
            } else if (j?.ok) {
              parts.push("No confirmation sent.");
            }
          }
          const line = parts.join(" ");
          setSaid(line);
          void read();
          return { said: line };
        }}
      />
    </div>
  );
}
