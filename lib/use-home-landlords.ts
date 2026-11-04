"use client";

import { useEffect, useState } from "react";

/**
 * EVERY LANDLORD ON A HOME, NOT THE FIRST (Lianna, 1 Nov 2026, 12 South
 * Chesters Lane: "add her partner as per TLE OS who is John Hood, but doesn't
 * appear").
 *
 * A second owner is kept on the home in the OS (lib/property-people,
 * components/HomeLandlords), but the Terms of Business and the listing's
 * Compliance were only ever handed the one landlord the record holds. This
 * reads the joint landlords from the same place HomeLandlords does, so those
 * screens start with all of them: the terms with each as a signer, the
 * compliance with an ID and an AML check for each.
 *
 * `homeKey` is the same key HomeLandlords is given on that screen (the REX
 * property id, else "listing:<id>" or "appraisal:<id>"). null while reading;
 * a failed read is an empty list, so a screen is never held up by it.
 *
 * The server reads every key the home is filed under, not only this one
 * (lib/home-aliases; Lianna Denholm, 4 Nov 2026): a second landlord added on
 * another screen of the same home now starts the terms with the first.
 */

export type HomeLandlord = { name?: string | null; email?: string | null; phone?: string | null };

export function useJointLandlords(homeKey: string | null): HomeLandlord[] | null {
  const [joint, setJoint] = useState<HomeLandlord[] | null>(homeKey ? null : []);
  useEffect(() => {
    let live = true;
    if (!homeKey) {
      setJoint([]);
      return;
    }
    setJoint(null);
    fetch(`/api/portfolio/people?property=${encodeURIComponent(homeKey)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; people?: { kind: string; name: string; email: string | null; phone: string | null }[] }) => {
        if (!live) return;
        const people = j?.ok ? j.people ?? [] : [];
        setJoint(people.filter((p) => p.kind === "joint_landlord").map((p) => ({ name: p.name, email: p.email, phone: p.phone })));
      })
      .catch(() => live && setJoint([]));
    return () => {
      live = false;
    };
  }, [homeKey]);
  return joint;
}

/** The record's landlord(s) first, then the joint ones; one each, by email, else by name. */
export function everyLandlord(...lists: (HomeLandlord | null | undefined)[][]): HomeLandlord[] {
  const out: HomeLandlord[] = [];
  const seen = new Set<string>();
  for (const l of lists.flat()) {
    if (!l || !(l.name?.trim() || l.email?.trim())) continue;
    const email = l.email?.trim().toLowerCase() ?? "";
    const name = l.name?.trim().toLowerCase().replace(/\s+/g, " ") ?? "";
    if ((email && seen.has(`e:${email}`)) || (name && seen.has(`n:${name}`))) continue;
    if (email) seen.add(`e:${email}`);
    if (name) seen.add(`n:${name}`);
    out.push(l);
  }
  return out;
}
