"use client";

import { useCallback, useEffect, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import FieldSelect from "@/components/FieldSelect";
import { useSaveReporter } from "@/components/SaveChip";
import { CHOICES, NO_FACTS, heatingWithoutGas, type FactKey, type HomeFacts as Facts } from "@/lib/home-facts-shared";

/**
 * ABOUT THIS HOME: the facts that decide its certificates (19 Oct 2026).
 *
 * Rhiannon could see her flat was being treated as an HMO and had no way to
 * say so; Dan had a flat with no gas being asked for a gas certificate, and a
 * new build's EIC that the file only knew as an EICR. The agent on the home
 * is usually the one who knows, so the answer is theirs to give, here, with
 * what it changes said under it. It saves as it is chosen (the screen's Auto
 * save chip), carries their name, and stays in the OS: REX is not changed.
 */

type Book = { hmo: boolean; hasGas: boolean; gasAnswered: boolean | null } | null;

const SHORT = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" });

/** What each answer changes, in the words the certificate list uses. */
function effect(k: FactKey, f: Facts, book: Book): string | null {
  switch (k) {
    case "homeType":
      if (f.homeType === "single") return "Not an HMO, so no licence, fire risk assessment, PAT or alarm checks are asked for.";
      if (f.homeType === "hmo") return "An HMO also needs its licence, a fire risk assessment, PAT and alarm checks.";
      return book?.hmo ? "The records treat this home as an HMO. If it is not, say so here." : null;
    case "gasSupply":
      if (f.gasSupply === "none") return "No gas, so no gas safety certificate is asked for.";
      if (f.gasSupply === "gas") return "A gas safety certificate is needed every 12 months.";
      return book && !book.hasGas && book.gasAnswered ? "The records say there is no gas here." : null;
    case "hotWater":
      return f.hotWater ? "For the engineer. It changes no certificate." : null;
    case "electrical":
      if (f.electrical === "eic") return "The EIC answers the electrical check for 5 years from the day it was issued. After that an EICR is due.";
      if (f.electrical === "eicr") return "An EICR every 5 years.";
      return null;
    default:
      return null;
  }
}

const LABEL: Record<FactKey, string> = {
  homeType: "Type of home",
  gasSupply: "Gas",
  hotWater: "Hot water",
  electrical: "Electrical certificate",
  eicReason: "Why an EIC",
};

export default function HomeFacts({
  homeKey,
  show = ["homeType", "gasSupply", "hotWater", "electrical"],
  heating = null,
  onChanged,
  className = "",
}: {
  /** The book's home id: the REX property id, or the OS's pm- id. */
  homeKey: string | null;
  /** Which facts to ask. A listing asks its type of let in its own line of facts. */
  show?: FactKey[];
  /** What the advert says heats the home, to prompt the gas question. */
  heating?: string | null;
  /** Something changed what the home has to hold: read it again. */
  onChanged?: () => void;
  className?: string;
}) {
  const [facts, setFacts] = useState<Facts | null>(null);
  const [book, setBook] = useState<Book>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const reporter = useSaveReporter();

  useEffect(() => {
    let live = true;
    setFacts(null);
    setProblem(null);
    if (!homeKey) return;
    /* What the book makes of the home is only said beside the type of home. */
    fetch(`/api/home-facts?home=${encodeURIComponent(homeKey)}${show.includes("homeType") ? "&book=1" : ""}`, { cache: "no-store" })
      .then(async (r) => (await r.json().catch(() => null)) as { ok?: boolean; error?: string; facts?: Facts; book?: Book; canEdit?: boolean } | null)
      .then((j) => {
        if (!live) return;
        if (!j?.ok) return setProblem(j?.error ?? "The home's facts did not load.");
        setFacts(j.facts ?? NO_FACTS);
        setBook(j.book ?? null);
        setCanEdit(Boolean(j.canEdit));
      })
      .catch(() => live && setProblem("The home's facts did not load."));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `show` is fixed per screen
  }, [homeKey]);

  const save = useCallback(
    async (change: Partial<Record<FactKey, string>>) => {
      if (!homeKey || !facts) return;
      const was = facts;
      setFacts({ ...facts, ...(change as Partial<Facts>) });
      const settle = reporter.begin("About this home");
      try {
        const r = await fetch("/api/home-facts", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ home: homeKey, ...change }) });
        const j = (await r.json().catch(() => null)) as { ok?: boolean; error?: string; facts?: Facts; book?: Book } | null;
        if (!r.ok || !j?.ok || !j.facts) throw new Error(j?.error ?? "That did not save.");
        setFacts(j.facts);
        setBook(j.book ?? null);
        settle({ ok: true });
        onChanged?.();
      } catch (e) {
        setFacts(was);
        settle({ ok: false, problem: e instanceof Error ? e.message : "That did not save.", retry: () => void save(change) });
      }
    },
    [facts, homeKey, onChanged, reporter]
  );

  if (!homeKey) return null;

  const rows = show.filter((k) => k !== "eicReason");
  const askGas = facts && !facts.gasSupply && heatingWithoutGas(heating);

  return (
    <section className={`rounded-[22px] border border-line/50 bg-white p-5 ${className}`}>
      <h3 className="flex items-center gap-2.5 text-[14px]">
        <DoodleIcon name="home" size={17} className="text-accent-dark" />
        About This Home
      </h3>
      <p className="mt-1 text-[12px] text-muted">What decides the certificates this home needs. Change one and the list changes with it.</p>

      {problem ? (
        <p className="mt-3 text-[12px] text-accent-dark">{problem}</p>
      ) : !facts ? (
        <p className="mt-3 flex items-center gap-2 text-[12px] text-muted">
          <span className="block h-3 w-3 animate-spin rounded-full border-[1.5px] border-line border-t-accent-dark" />
          Reading the home…
        </p>
      ) : (
        <>
          {askGas && (
            <p className="mt-3 flex items-start gap-2 rounded-xl bg-accent-soft/50 px-3.5 py-2.5 text-[12px] leading-snug">
              <DoodleIcon name="info" size={14} className="mt-0.5 shrink-0 text-accent-dark" />
              <span>
                The advert says {heating}. If nothing at the property runs on gas (no boiler, hob or fire), choose No gas supply and
                the gas safety certificate stops being asked for.
              </span>
            </p>
          )}
          <div className="mt-3 grid gap-x-4 gap-y-3 sm:grid-cols-2">
            {rows.map((k) => {
              const value = (facts[k] as string | null) ?? "";
              const who = facts.setBy[k];
              const said = effect(k, facts, book);
              return (
                <div key={k} className="min-w-0">
                  <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted">{LABEL[k]}</p>
                  {canEdit ? (
                    <FieldSelect value={value} placeholder="Not answered" options={CHOICES[k].map((c) => ({ ...c }))} onChange={(v) => void save({ [k]: v })} />
                  ) : (
                    <p className="text-[13px] font-semibold">{CHOICES[k].find((c) => c.value === value)?.label ?? "Not answered"}</p>
                  )}
                  {k === "electrical" && facts.electrical === "eic" && (
                    <div className="mt-2">
                      {canEdit ? (
                        <FieldSelect value={facts.eicReason ?? ""} placeholder="New build or full rewire?" options={CHOICES.eicReason.map((c) => ({ value: c.value, label: c.label }))} onChange={(v) => void save({ eicReason: v })} />
                      ) : (
                        <p className="text-[12px] text-muted">{CHOICES.eicReason.find((c) => c.value === facts.eicReason)?.label ?? "Reason not given"}</p>
                      )}
                    </div>
                  )}
                  {said && <p className="mt-1.5 text-[11.5px] leading-snug text-muted">{said}</p>}
                  {who && <p className="mt-0.5 text-[10.5px] text-muted">Set by {who.by}, {SHORT(who.at)}</p>}
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
