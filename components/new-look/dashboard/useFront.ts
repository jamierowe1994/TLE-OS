"use client";

import { useMemo } from "react";
import { useShared, type Slot } from "@/components/widgets";
import type { FrontAnswer, FrontAppraisals, FrontLeads, FrontLets, FrontTerms, Part } from "@/lib/front-dash";

/**
 * The front dashboard's figures, read in three goes (25 Oct 2026) so each part
 * shows the moment its own read lands:
 *
 *   quick   the lead ledger, the appraisals, passports and viewings (the database)
 *   lets    lets agreed and applications (REX's applications, held 5 min on the server)
 *   terms   terms out (our own pages, DocuSeal and REX's e-sign requests)
 *
 * It used to be one read that answered when the slowest part did, so every
 * figure waited on REX. The three are asked at once; each figure, chart and
 * step says it is loading until its own part is in.
 *
 * Each answer carries its own 180 London days. Read either side of midnight
 * they can differ by a day, so every series is lined up on the newest set of
 * days before it is used; a day one answer does not cover counts as not read
 * for that part (a zero there is the honest "nothing yet" for today).
 */

export const frontSlots = {
  quick: { p: null } as Slot,
  lets: { p: null } as Slot,
  terms: { p: null } as Slot,
};
const URLS = {
  quick: "/api/dashboard/front?parts=leads,appraisals,passports,viewings",
  lets: "/api/dashboard/front?parts=lets",
  terms: "/api/dashboard/front?parts=terms",
};

/** One part: loading, or read (with its data), or failed (with why). */
export type PartView<T> = { loading: true; data: null; error: null } | { loading: false; data: T; error: null } | { loading: false; data: null; error: string };

export interface FrontView {
  /** The newest set of days any answer has, oldest first; null until one lands. */
  days: string[] | null;
  /** The whole business (true) or one person's own (false); null until known. */
  everything: boolean | null;
  leads: PartView<FrontLeads>;
  appraisals: PartView<FrontAppraisals>;
  lets: PartView<FrontLets>;
  terms: PartView<FrontTerms>;
  passports: PartView<number[]>;
  viewings: PartView<number[]>;
}

const pick = (j: Record<string, unknown>) => (j.ok === true && Array.isArray(j.days) ? (j as unknown as FrontAnswer) : null);

/** Line a per-day series up on `to`, from the days it was counted on. */
function align(series: number[], from: string[], to: string[]): number[] {
  if (from === to || (from.length === to.length && from[from.length - 1] === to[to.length - 1])) return series;
  const at = new Map(from.map((d, i) => [d, i]));
  return to.map((d) => {
    const i = at.get(d);
    return i == null ? 0 : (series[i] ?? 0);
  });
}

export function useFront(): FrontView {
  const quick = useShared<FrontAnswer>(frontSlots.quick, URLS.quick, pick);
  const lets = useShared<FrontAnswer>(frontSlots.lets, URLS.lets, pick);
  const terms = useShared<FrontAnswer>(frontSlots.terms, URLS.terms, pick);

  return useMemo(() => {
    const answers = [quick.data, lets.data, terms.data].filter((a): a is FrontAnswer => Boolean(a));
    const days = answers.reduce<string[] | null>((best, a) => (!best || a.days[a.days.length - 1] > best[best.length - 1] ? a.days : best), null);
    const first = answers[0] ?? null;

    function view<T>(f: { loading: boolean; data: FrontAnswer | null; unlinked: boolean }, part: Part<T> | undefined, shift: (data: T, from: string[], to: string[]) => T): PartView<T> {
      if (f.loading) return { loading: true, data: null, error: null };
      if (!f.data) return { loading: false, data: null, error: f.unlinked ? "Your account isn't linked yet - ask James" : "Couldn't be read just now" };
      if (!part) return { loading: false, data: null, error: "Couldn't be read just now" };
      if (!part.ok) return { loading: false, data: null, error: part.error.replace(/\.$/, "") };
      return { loading: false, data: days ? shift(part.data, f.data.days, days) : part.data, error: null };
    }
    const same = <T,>(d: T) => d;
    const series = (d: number[], from: string[], to: string[]) => align(d, from, to);

    return {
      days,
      everything: first ? first.everything : null,
      leads: view<FrontLeads>(quick, quick.data?.leads, (d, from, to) => ({
        bySource: Object.fromEntries(Object.entries(d.bySource).map(([k, s]) => [k, align(s, from, to)])) as FrontLeads["bySource"],
        tenant: align(d.tenant, from, to),
        fresh: align(d.fresh, from, to),
      })),
      appraisals: view<FrontAppraisals>(quick, quick.data?.appraisals, (d, from, to) => ({ ...d, created: align(d.created, from, to), won: align(d.won, from, to) })),
      lets: view<FrontLets>(lets, lets.data?.lets, (d, from, to) => ({
        agreed: align(d.agreed, from, to),
        rentSum: align(d.rentSum, from, to),
        rentN: align(d.rentN, from, to),
        applied: align(d.applied, from, to),
      })),
      terms: view<FrontTerms>(terms, terms.data?.terms, same),
      passports: view<number[]>(quick, quick.data?.passports, series),
      viewings: view<number[]>(quick, quick.data?.viewings, series),
    };
  }, [quick, lets, terms]);
}
