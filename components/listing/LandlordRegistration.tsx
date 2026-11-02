"use client";

import { useEffect, useState } from "react";
import type { ListingDetails } from "@/lib/listing-details";
import { MAX_REG_NUMBERS, isRealDay, joinRegNumbers, regByLandlord, regDay, regNumbers, regState, type RegState } from "@/lib/reg-numbers";

/**
 * The landlord's registration on the listing's Landlord section, with when
 * each one runs out (Lianna Denholm, 30 Oct 2026: "can we add LL reg expiry
 * date to LL screen on the listing which will then pull through to
 * compliance?"). Scottish homes only. One line per owner's number, Edit to
 * change the numbers and their dates together. Saved to the home's record
 * through the listing's details (the numbers still ride on the advert), and
 * the listing's Compliance reads the dates from there.
 *
 * Each number is named by its landlord, and a landlord on the home with no
 * number gets a line asking for it (Lianna, 2 Nov 2026: "No place to add LL
 * reg expiry date on 2nd LL" - the box listed bare numbers and never named
 * John Hood, the additional landlord on South Chesters View).
 */

const STATE_WORDS: Record<RegState, string> = { expired: "Expired", "due-soon": "Due soon", valid: "", "no-date": "" };

type Row = { n: string; d: string; owner: string };

export default function LandlordRegistration({
  listingId,
  record,
  canEdit,
  look,
  onSaved,
  landlordName = null,
  homeKey = null,
  rev = 0,
}: {
  listingId: string;
  record: ListingDetails["record"] | null | undefined;
  canEdit: boolean;
  look?: "new";
  onSaved: (details: ListingDetails) => void;
  /** The landlord on the listing, for naming their number. */
  landlordName?: string | null;
  /** Where the home's additional landlords are kept (HomeLandlords' key). */
  homeKey?: string | null;
  /** Bumped when a landlord is added, changed or taken off, to read them again. */
  rev?: number;
}) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joint, setJoint] = useState<string[]>([]);
  const scotland = Boolean(record?.scotland);

  useEffect(() => {
    if (!scotland || !homeKey) return setJoint([]);
    let live = true;
    fetch(`/api/portfolio/people?property=${encodeURIComponent(homeKey)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; people?: { kind: string; name: string }[] }) => {
        if (live) setJoint(j?.ok ? (j.people ?? []).filter((p) => p.kind === "joint_landlord").map((p) => p.name) : []);
      })
      .catch(() => live && setJoint([]));
    return () => {
      live = false;
    };
  }, [scotland, homeKey, rev]);

  if (!record?.scotland) return null;
  const nl = look === "new";
  const numbers = regNumbers(record.landlordRegistration);
  const expiry = record.landlordRegistrationExpiry ?? {};
  const landlords = [landlordName?.trim(), ...joint].filter((x): x is string => Boolean(x));
  const { rows: owned, missing } = regByLandlord(numbers, record.landlordRegistrationOwner ?? {}, landlords);
  const meta = nl ? "nl-meta" : "text-[12px] text-muted";
  const link = nl ? "nl-link" : "text-[12px] font-semibold text-ink underline";
  const input = nl ? "nl-input" : "rounded-lg border border-line/80 bg-white px-2.5 py-1.5 text-[13px]";

  /* Every number as it stands, then an empty line for each landlord without one. */
  const edit = () => {
    setError(null);
    const have: Row[] = owned.map((r) => ({ n: r.n, d: expiry[r.n] ?? "", owner: r.owner ?? "" }));
    const asks: Row[] = missing.map((owner) => ({ n: "", d: "", owner }));
    const all = [...have, ...asks].slice(0, MAX_REG_NUMBERS);
    setRows(all.length ? all : [{ n: "", d: "", owner: landlords[0] ?? "" }]);
  };

  async function save() {
    if (!rows) return;
    const kept = rows.map((r) => ({ ...r, n: r.n.replace(/\s+/g, " ").trim() })).filter((r) => r.n);
    if (kept.some((r) => r.d && !isRealDay(r.d))) return setError("One of the dates isn't a real date.");
    const joined = joinRegNumbers(kept.map((r) => r.n));
    const body: Record<string, unknown> = {
      id: listingId,
      landlordRegistrationExpiry: Object.fromEntries(kept.map((r) => [r.n, r.d || null])),
      landlordRegistrationOwner: Object.fromEntries(kept.map((r) => [r.n, r.owner || null])),
    };
    if (joined !== (joinRegNumbers(numbers) ?? null)) body.landlordRegistration = joined ?? "";
    setBusy(true);
    setError(null);
    const j = (await fetch("/api/listings/details", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
      .then((r) => r.json())
      .catch(() => null)) as { ok?: boolean; error?: string; details?: ListingDetails | null } | null;
    setBusy(false);
    if (!j?.ok) return setError(j?.error ?? "That didn't save. Try again in a minute.");
    if (j.details) onSaved(j.details);
    setRows(null);
  }

  if (rows) {
    /* A name kept with a number but no longer on the home still shows, so it isn't lost by opening Edit. */
    const names = [...landlords, ...rows.map((r) => r.owner).filter((o) => o && !landlords.includes(o))];
    return (
      <div className="mt-3 flex flex-col gap-2 border-t border-line/50 pt-3">
        <p className={meta}>Landlord registration</p>
        {rows.map((r, i) => (
          <div key={i} className="flex flex-col gap-1.5">
            {names.length > 0 && (
              <label className="flex items-center gap-1.5">
                <span className={meta}>Whose</span>
                <select
                  className={`${input} min-w-0 flex-1`}
                  value={r.owner}
                  aria-label={`Whose registration ${i + 1} is`}
                  onChange={(e) => setRows(rows.map((x, k) => (k === i ? { ...x, owner: e.target.value } : x)))}
                >
                  <option value="">Choose the landlord…</option>
                  {names.map((nm) => (
                    <option key={nm} value={nm}>
                      {nm}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <input
                className={`${input} min-w-0 flex-[1_1_11rem]`}
                value={r.n}
                placeholder="e.g. 123456/230/12345"
                aria-label={`Registration number ${i + 1}`}
                onChange={(e) => setRows(rows.map((x, k) => (k === i ? { ...x, n: e.target.value } : x)))}
              />
              <label className="flex flex-[1_1_9rem] items-center gap-1.5">
                <span className={meta}>Runs to</span>
                <input
                  type="date"
                  className={`${input} min-w-0 flex-1`}
                  value={r.d}
                  aria-label={`Expiry date for registration ${i + 1}`}
                  onChange={(e) => setRows(rows.map((x, k) => (k === i ? { ...x, d: e.target.value } : x)))}
                />
              </label>
              {rows.length > 1 && (
                <button type="button" className={link} onClick={() => setRows(rows.filter((_, k) => k !== i))}>
                  Remove
                </button>
              )}
            </div>
          </div>
        ))}
        {rows.length < MAX_REG_NUMBERS && (
          <button type="button" className={`${link} self-start`} onClick={() => setRows([...rows, { n: "", d: "", owner: "" }])}>
            Add another owner&apos;s number
          </button>
        )}
        {error && <p className="text-[12px] text-accent-dark">{error}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" disabled={busy} onClick={() => void save()} className={nl ? "nl-btn nl-btn--primary nl-btn--sm" : "rounded-full bg-ink px-3.5 py-1.5 text-[12px] font-semibold text-page disabled:opacity-40"}>
            {busy ? "Saving…" : "Save"}
          </button>
          <button type="button" disabled={busy} onClick={() => setRows(null)} className={link}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 flex flex-col gap-1 border-t border-line/50 pt-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className={meta}>Landlord registration</p>
        {canEdit && (
          <button type="button" className={link} onClick={edit}>
            {numbers.length ? "Edit" : "Add"}
          </button>
        )}
      </div>
      {numbers.length === 0 && missing.length === 0 && <p className="text-[12.5px] text-accent-dark">No registration number yet.</p>}
      {owned.map(({ n, owner }) => {
        const day = expiry[n] ?? null;
        const state = regState(day);
        return (
          <p key={n} className="flex flex-wrap items-baseline gap-x-2 text-[12.5px]">
            {owner && <span className="font-semibold text-ink">{owner}</span>}
            <span className="text-ink">{n}</span>
            {day ? (
              <span className={state === "expired" || state === "due-soon" ? "font-semibold text-accent-dark" : "text-muted"}>
                {state === "expired" ? "ran out" : "runs to"} {regDay(day)}
                {STATE_WORDS[state] && state !== "expired" ? ` · ${STATE_WORDS[state]}` : ""}
              </span>
            ) : (
              <span className="text-accent-dark">No expiry date yet</span>
            )}
          </p>
        );
      })}
      {missing.map((owner) => (
        <p key={`missing-${owner}`} className="flex flex-wrap items-baseline gap-x-2 text-[12.5px]">
          <span className="font-semibold text-ink">{owner}</span>
          <span className="text-accent-dark">No registration number yet</span>
          {canEdit && (
            <button type="button" className={link} onClick={edit}>
              Add
            </button>
          )}
        </p>
      ))}
    </div>
  );
}
