"use client";

import { useCallback, useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { Pill } from "@/components/Wire";

/**
 * Your settings — as distinct from your profile.
 *
 * Profile is who you are: name, photo, phone. Settings is how the OS behaves
 * for you. Keeping them apart matters more than it sounds, because the things
 * here are the ones an agent invents and then has to find again a fortnight
 * later, and "it's under your name somewhere" is how a feature stops being
 * used.
 */

const ENTITIES = [
  { id: "leads", label: "Leads" },
  { id: "listings", label: "Listings" },
  { id: "viewings", label: "Viewings" },
  { id: "market_appraisals", label: "Market Appraisals" },
] as const;

const KINDS = [
  { id: "text", label: "Written answer", hint: "A free line of text." },
  { id: "yesno", label: "Yes or no", hint: "A tick, and something to filter on." },
  { id: "select", label: "Pick from a list", hint: "Your own options, chosen once." },
] as const;

type Def = {
  id: string;
  entity: string;
  label: string;
  kind: string;
  options: string[];
  position: number;
};

export default function Settings() {
  const [defs, setDefs] = useState<Def[] | null>(null);
  const [entity, setEntity] = useState<string>("leads");
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<string>("text");
  const [options, setOptions] = useState("");
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/attributes")
      .then((r) => (r.ok ? r.json() : { defs: [] }))
      .then((j: { defs?: Def[] }) => setDefs(j.defs ?? []))
      .catch(() => setDefs([]));
  }, []);
  useEffect(load, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFlash(null);
    const r = await fetch("/api/attributes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        entity,
        label,
        kind,
        options: kind === "select" ? options.split(",").map((o) => o.trim()).filter(Boolean) : [],
      }),
    });
    const j = (await r.json()) as { ok?: boolean; error?: string };
    setBusy(false);
    if (j.ok) {
      setLabel("");
      setOptions("");
      load();
    } else {
      setFlash(j.error ?? "That didn't work.");
    }
  }

  async function remove(defId: string) {
    await fetch("/api/attributes", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ defId }),
    });
    load();
  }

  const byEntity = (id: string) => (defs ?? []).filter((d) => d.entity === id);

  return (
    <>
      <PageHeader
        title="Your settings"
        blurb="Fields you invent, and how the OS behaves for you."
      />

      <section className="fade-up mt-8 rounded-2xl border border-line/80 bg-panel p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[15px]">Custom attributes</h2>
          <Pill tone="neutral">Only you see these</Pill>
        </div>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
          Your own fields on leads, listings, viewings and appraisals — and something to filter
          by. They stay on your account: nobody else gets the column, and you don&apos;t get
          theirs.
        </p>

        {flash && (
          <p className="mt-3 rounded-xl border border-accent-dark/40 bg-accent-soft/40 p-3 text-[12.5px]">
            {flash}
          </p>
        )}

        <form onSubmit={add} className="mt-4 rounded-xl border border-line/70 bg-box p-3.5">
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-[11px]">
              <span className="block text-[9.5px] uppercase tracking-wide text-muted">Where</span>
              <select
                value={entity}
                onChange={(e) => setEntity(e.target.value)}
                className="mt-1 rounded-lg border border-line/80 bg-panel px-2.5 py-1.5 text-[12.5px]"
              >
                {ENTITIES.map((e) => (
                  <option key={e.id} value={e.id}>{e.label}</option>
                ))}
              </select>
            </label>

            <label className="min-w-[180px] flex-1 text-[11px]">
              <span className="block text-[9.5px] uppercase tracking-wide text-muted">
                What to call it
              </span>
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Boiler serviced?"
                className="mt-1 w-full rounded-lg border border-line/80 bg-panel px-2.5 py-1.5 text-[12.5px]"
              />
            </label>

            <label className="text-[11px]">
              <span className="block text-[9.5px] uppercase tracking-wide text-muted">Kind</span>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value)}
                className="mt-1 rounded-lg border border-line/80 bg-panel px-2.5 py-1.5 text-[12.5px]"
              >
                {KINDS.map((k) => (
                  <option key={k.id} value={k.id}>{k.label}</option>
                ))}
              </select>
            </label>

            {kind === "select" && (
              <label className="min-w-[200px] flex-1 text-[11px]">
                <span className="block text-[9.5px] uppercase tracking-wide text-muted">
                  Options, comma separated
                </span>
                <input
                  value={options}
                  onChange={(e) => setOptions(e.target.value)}
                  placeholder="Hot, Warm, Cold"
                  className="mt-1 w-full rounded-lg border border-line/80 bg-panel px-2.5 py-1.5 text-[12.5px]"
                />
              </label>
            )}

            <button
              type="submit"
              disabled={busy || !label.trim()}
              className="rounded-lg bg-accent-dark px-4 py-2 text-[12.5px] font-semibold text-white disabled:opacity-40"
            >
              {busy ? "Adding…" : "Add"}
            </button>
          </div>
          <p className="mt-2 text-[10.5px] text-muted">
            {KINDS.find((k) => k.id === kind)?.hint}
          </p>
        </form>

        {defs === null ? (
          <p className="mt-4 text-[12.5px] text-muted">Loading…</p>
        ) : (
          <div className="mt-4 space-y-4">
            {ENTITIES.map((e) => {
              const mine = byEntity(e.id);
              return (
                <div key={e.id}>
                  <p className="text-[10.5px] font-semibold">{e.label}</p>
                  {mine.length === 0 ? (
                    <p className="mt-1 text-[11.5px] text-muted">Nothing yet.</p>
                  ) : (
                    <ul className="mt-1.5 space-y-1">
                      {mine.map((d) => (
                        <li
                          key={d.id}
                          className="flex flex-wrap items-center justify-between gap-2 border-b border-line/40 py-1.5 text-[12px]"
                        >
                          <span>
                            {d.label}
                            <span className="ml-2 text-[10.5px] text-muted">
                              {KINDS.find((k) => k.id === d.kind)?.label}
                              {d.kind === "select" && d.options.length
                                ? ` · ${d.options.join(", ")}`
                                : ""}
                            </span>
                          </span>
                          <button
                            type="button"
                            onClick={() => remove(d.id)}
                            className="shrink-0 text-[11px] text-muted underline"
                          >
                            Remove
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <p className="mt-4 border-t border-line/70 pt-3 text-[11px] leading-relaxed text-muted">
          Removing a field takes its answers with it — there is nothing left to keep once the
          question is gone, and a stored answer to a question nobody can see is worse than none.
        </p>
      </section>
    </>
  );
}
