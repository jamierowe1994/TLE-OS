"use client";

import { useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import {
  describe,
  isLive,
  settle,
  unlink,
  UNLINK_REASONS,
  type TenancyLink,
  type UnlinkReason,
} from "@/lib/tenancy-link";

/**
 * Who is attached to this property, and the only two doors out.
 *
 * Deliberately hard to break by accident: unlinking is behind a second click
 * and always takes a reason, because this record is the answer to "who lives
 * here" and everything downstream reads it.
 */
export default function TenancyLinkPanel({
  value,
  onChange,
}: {
  value: TenancyLink;
  onChange: (l: TenancyLink) => void;
}) {
  const link = settle(value);
  const [ending, setEnding] = useState(false);
  const [reason, setReason] = useState<UnlinkReason>("moved_out");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const live = isLive(link);

  async function push(next: TenancyLink) {
    onChange(next);
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/tenancy-link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(next),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "REX refused the link.");
      if (j.rexApplicationId) onChange({ ...next, rexApplicationId: j.rexApplicationId });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't reach REX.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-line/80 bg-panel p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <DoodleIcon name="link" size={17} className="text-accent-dark" />
          <h3 className="text-[14px]">Linked to this property</h3>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
            live ? "bg-accent-soft text-accent-dark" : "border border-line/80 text-muted"
          }`}
        >
          {link.state === "accepted"
            ? "Offer accepted"
            : link.state === "active"
              ? "Living here"
              : link.state === "ended"
                ? "Ended"
                : "Fell through"}
        </span>
      </div>

      <p className="max-w-xl text-[12.5px] leading-relaxed text-muted">{describe(link)}</p>

      <div className="mt-3.5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-line/60 p-3">
          <p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">Landlord</p>
          <p className="mt-1 text-[12.5px]">{link.landlord?.name ?? "Not on the listing"}</p>
        </div>
        <div className="rounded-xl border border-line/60 p-3">
          <p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">
            {link.tenants.length === 1 ? "Tenant" : "Tenants"}
          </p>
          {link.tenants.length ? (
            <ul className="mt-1 space-y-0.5">
              {link.tenants.map((t) => (
                <li key={t.contactId ?? t.name} className="text-[12.5px]">
                  {t.name}
                  {t.isPrimary && link.tenants.length > 1 && (
                    <span className="ml-1.5 text-[10px] text-muted">lead</span>
                  )}
                  {!t.contactId && (
                    <span className="ml-1.5 text-[10px] text-accent-dark">not in REX yet</span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-[12.5px] text-muted">Nobody attached</p>
          )}
        </div>
      </div>

      {error && (
        <p className="mt-3 rounded-lg bg-accent-soft/60 px-3 py-2 text-[11.5px] text-accent-dark">
          {error}
        </p>
      )}

      {live && !ending && (
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line/60 pt-3.5">
          <button
            type="button"
            onClick={() => setEnding(true)}
            className="rounded-full border border-line/80 px-3.5 py-1.5 text-[12px] transition-colors hover:border-ink/40"
          >
            Unlink…
          </button>
          <p className="text-[10.5px] leading-relaxed text-muted">
            Referencing, deposit and signing all happen under this link — none of them break it.
          </p>
        </div>
      )}

      {ending && (
        <div className="mt-4 rounded-xl border border-accent-dark/40 bg-accent-soft/30 p-4">
          <p className="text-[12.5px] font-semibold">Why is the link ending?</p>
          <div className="mt-2.5 space-y-2">
            {UNLINK_REASONS.map((r) => (
              <label key={r.id} className="flex cursor-pointer items-start gap-2.5">
                <input
                  type="radio"
                  name="unlink"
                  checked={reason === r.id}
                  onChange={() => setReason(r.id)}
                  className="mt-1"
                />
                <span>
                  <span className="block text-[12.5px]">{r.label}</span>
                  <span className="block text-[11px] leading-snug text-muted">{r.detail}</span>
                </span>
              </label>
            ))}
          </div>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything worth recording"
            className="mt-3 w-full resize-y rounded-lg border border-line/80 bg-transparent px-3 py-2 text-[12.5px] outline-none focus:border-ink"
          />
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                push(unlink(link, reason, notes));
                setEnding(false);
              }}
              className="rounded-full bg-ink px-4 py-2 text-[12.5px] text-page disabled:opacity-50"
            >
              {saving ? "Saving…" : "Unlink"}
            </button>
            <button
              type="button"
              onClick={() => setEnding(false)}
              className="rounded-full border border-line/80 px-4 py-2 text-[12.5px]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {!live && (
        <p className="mt-3 border-t border-line/60 pt-3 text-[11px] text-muted">
          {link.endedReason
            ? UNLINK_REASONS.find((r) => r.id === link.endedReason)?.label
            : "Closed"}
          {link.endedOn ? ` · ${link.endedOn}` : ""}
          {link.endedNotes ? ` · ${link.endedNotes}` : ""}
        </p>
      )}
    </div>
  );
}
