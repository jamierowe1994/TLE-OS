"use client";

import { useState } from "react";
import Link from "next/link";
import { Tag } from "@/components/ListingTags";

/**
 * THE OFFERS ON ONE HOME (7 Oct 2026).
 *
 * James: an offer is not an application until it is accepted - the home is
 * still taking viewings until then - and the agent must be able to decline an
 * offer as well as accept it. So every offer on the listing is here, open
 * ones first, each with Accept and Decline. Accepting sends it to
 * Applications; declining keeps it here, greyed, and the home carries on.
 *
 * Decisions are kept in the OS (POST /api/offers/decide); REX is still marked
 * by hand, and the application's file says so. A test offer plays its own
 * test file's Accept/Decline. Nothing is sent to the tenant or landlord.
 */

export type ListingOffer = {
  ref: string;
  kind: "os" | "rex" | "test";
  appId: string | null;
  name: string;
  amount: number | null;
  moveIn: string | null;
  at: string | null;
  via: string;
  status: "open" | "accepted" | "declined";
  decided: string | null;
  undoable: boolean;
  href: string;
};

const short = (iso: string) =>
  new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" });

const ORDER = { open: 0, accepted: 1, declined: 2 } as const;

export default function ListingOffers({
  offers,
  canOffer,
  onChanged,
}: {
  offers: ListingOffer[] | null;
  canOffer: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [err, setErr] = useState<{ ref: string; text: string } | null>(null);

  async function act(o: ListingOffer, what: "accepted" | "declined" | "undo") {
    if (busy) return;
    if (what === "declined" && confirming !== o.ref) {
      setConfirming(o.ref);
      return;
    }
    setConfirming(null);
    setBusy(o.ref);
    setErr(null);
    try {
      const r =
        o.kind === "test"
          ? await fetch(`/api/applications/${encodeURIComponent(o.appId ?? "")}/test`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ action: what === "accepted" ? "accept" : "decline" }),
            })
          : await fetch("/api/offers/decide", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ ref: o.ref, decision: what }),
            });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!j.ok) setErr({ ref: o.ref, text: j.error ?? "That didn't save. Try again." });
      else onChanged();
    } catch {
      setErr({ ref: o.ref, text: "That didn't go through. Try again." });
    } finally {
      setBusy(null);
    }
  }

  if (offers === null) {
    return (
      <p className="flex items-center justify-center gap-2 py-6 text-[12px] text-muted">
        <span aria-hidden className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-line border-t-accent-dark" />
        Reading the offers&hellip;
      </p>
    );
  }
  if (!offers.length) {
    return (
      <p className="py-6 text-center text-[12px] leading-relaxed text-muted">
        No offers on this home yet.{canOffer ? " Press Make an offer to put one forward, or share the offer link below." : ""}
      </p>
    );
  }

  const sorted = [...offers].sort((a, b) => ORDER[a.status] - ORDER[b.status]);
  return (
    <ul className="divide-y divide-line/40">
      {sorted.map((o) => {
        const sub = [
          o.via,
          o.at ? `made ${short(o.at)}` : "",
          o.moveIn ? `moving in ${short(o.moveIn)}` : "",
        ].filter(Boolean).join(" · ");
        return (
          <li key={o.ref} className={`py-3 ${o.status === "declined" ? "opacity-60" : ""}`}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <Link href={o.href} className="group min-w-0 flex-1 basis-[220px]">
                <span className="hand block truncate text-[13.5px] group-hover:underline">{o.name}</span>
                <span className="block truncate text-[10.5px] text-muted">{sub}</span>
                {o.decided && <span className="block truncate text-[10.5px] text-muted">{o.decided}</span>}
              </Link>
              <Tag tone={o.status === "accepted" ? "good" : o.status === "declined" ? "neutral" : "accent"}>
                {o.status === "accepted" ? "Accepted" : o.status === "declined" ? "Declined" : "Open"}
              </Tag>
              {o.amount != null && <span className="figures whitespace-nowrap text-[13px]">£{o.amount.toLocaleString("en-GB")}</span>}
              {o.status === "open" ? (
                <span className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void act(o, "accepted")}
                    className="rounded-full bg-[var(--brown)] px-3 py-1.5 text-[11.5px] font-semibold text-white disabled:opacity-50"
                  >
                    {busy === o.ref ? "Saving…" : "Accept"}
                  </button>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void act(o, "declined")}
                    onBlur={() => confirming === o.ref && setConfirming(null)}
                    className={`rounded-full border px-3 py-1.5 text-[11.5px] font-semibold disabled:opacity-50 ${
                      confirming === o.ref ? "border-accent-dark bg-accent-dark text-white" : "border-line text-muted hover:border-ink/50 hover:text-ink"
                    }`}
                  >
                    {confirming === o.ref ? "Yes, decline it" : "Decline"}
                  </button>
                </span>
              ) : o.undoable ? (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void act(o, "undo")}
                  className="shrink-0 rounded-full px-2.5 py-1.5 text-[11.5px] font-semibold text-muted underline-offset-2 hover:text-ink hover:underline disabled:opacity-50"
                >
                  {busy === o.ref ? "Saving…" : "Undo"}
                </button>
              ) : null}
            </div>
            {o.status === "accepted" && o.kind !== "test" && o.undoable && (
              <p className="mt-1.5 text-[11px] leading-snug text-muted">
                {o.kind === "rex"
                  ? "On Applications now. Mark it accepted in REX as well, so the handover can start."
                  : "On Applications now. Create the application in REX and accept it there, so the handover can start."}
              </p>
            )}
            {err?.ref === o.ref && <p className="mt-1.5 text-[11.5px] text-accent-dark">{err.text}</p>}
          </li>
        );
      })}
    </ul>
  );
}
