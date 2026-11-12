"use client";

import { useCallback, useEffect, useState } from "react";
import { LandlordsBox, PartyContact, sourceWords, type Party, type PeopleAnswer, type Picture } from "@/components/LetPeople";

/**
 * THE TENANTS AND LANDLORDS, CHANGED FROM INSIDE THE PLC (James, 11 Nov 2026:
 * "adjust the details of the plc including the tenants details, documents and
 * landlord details"; and, asked where the change should be made, "edit inside
 * the PLC").
 *
 * The people are not on the pack: they are the let's, read fresh each time the
 * check opens, so the PLC, the let and everything sent to the customer agree.
 * This is the let's own editors (components/LetPeople), not a second copy:
 * each tenant and landlord opens and saves exactly as on the let's page, and
 * Add landlord is here too. Nothing is kept on the pack; the check's first
 * step is handed the people as they now stand.
 */

type Info = { people?: Party[]; homeKey?: string | null; landlordProblem?: string | null };

export default function PlcPeople({
  letId,
  address,
  onPeople,
}: {
  letId: string;
  address: string;
  /** The people as they now stand, after every load and every change. */
  onPeople?: (people: Party[]) => void;
}) {
  const [info, setInfo] = useState<Info | null>(null);
  const [picture, setPicture] = useState<Picture | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const take = useCallback(
    (j: PeopleAnswer) => {
      if (!j.ok) {
        setProblem(j.error ?? "That didn't save. Try again.");
        return;
      }
      setProblem(null);
      if (j.let) {
        setInfo(j.let as Info);
        onPeople?.((j.let as Info).people ?? []);
      }
      if (j.propoly !== undefined) setPicture(j.propoly ?? null);
    },
    [onPeople]
  );

  const load = useCallback(() => {
    fetch(`/api/applications/${encodeURIComponent(letId)}/people`, { cache: "no-store" })
      .then((r) => r.json() as Promise<PeopleAnswer>)
      .then(take)
      .catch(() => setProblem("The people on this let couldn't be read just now."));
  }, [letId, take]);
  useEffect(() => {
    load();
  }, [load]);

  if (!info && !problem) {
    return (
      <p className="flex items-center gap-2 py-3 text-[12.5px] text-muted" role="status">
        <span aria-hidden className="inline-block h-3 w-3 animate-spin rounded-full border-[1.5px] border-line border-t-accent-dark" />
        Reading who is on this let…
      </p>
    );
  }

  const people = info?.people ?? [];
  const tenants = people.filter((p) => p.role === "tenant");

  return (
    <div className="space-y-4">
      {problem && <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12.5px] text-rose-800" role="alert">{problem}</p>}
      <div>
        <p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">{tenants.length === 1 ? "Tenant" : "Tenants"}</p>
        {tenants.length ? (
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {tenants.map((t) => (
              <div key={t.key} className="min-w-0 rounded-xl border border-line/60 bg-white p-3">
                <PartyContact letId={letId} party={t} propertyAddress={address} onAnswer={take} showName homeKey={info?.homeKey ?? null} />
                {sourceWords(t) && <p className="mt-1.5 text-[11px] text-muted">{sourceWords(t)}</p>}
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-[12.5px] text-muted">Nobody is recorded as the tenant on this let.</p>
        )}
      </div>
      <LandlordsBox
        letId={letId}
        homeKey={info?.homeKey ?? null}
        people={info ? people : null}
        picture={picture}
        problem={info?.landlordProblem ?? null}
        propertyAddress={address}
        onAnswer={take}
        reload={load}
      />
      <p className="text-[11.5px] text-muted">Changes save on the let straight away, so the let, this check and anything sent to the customer all read the same.</p>
    </div>
  );
}
