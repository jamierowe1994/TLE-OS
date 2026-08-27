"use client";

import { useCallback, useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { Pill } from "@/components/Wire";
import { SANDBOX_EMAIL_DOMAIN, SANDBOX_PREFIX, type SandboxKind } from "@/lib/sandbox";

/**
 * The sandbox — seed fake records, drive them through the process, rewind.
 *
 * Seed and rewind are the same button on purpose. Seeding clears that kind
 * first, so pressing it twice replaces rather than accumulates and there is
 * never a half-state to reason about.
 */

type Kind = {
  id: SandboxKind;
  label: string;
  blurb: string;
  count: number;
  willCreate: string;
};

export default function Sandbox() {
  const [kinds, setKinds] = useState<Kind[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/sandbox")
      .then((r) => r.json())
      .then((d: { kinds?: Kind[]; error?: string }) => {
        if (d.error) setError(d.error);
        else setKinds(d.kinds ?? []);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(load, [load]);

  async function act(kind: SandboxKind | null, action: "seed" | "clear") {
    setBusy(`${kind ?? "all"}-${action}`);
    setError(null);
    try {
      const r = await fetch("/api/sandbox", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, action }),
      });
      const d = (await r.json()) as { ok?: boolean; error?: string };
      if (!d.ok) setError(d.error ?? "That didn't work.");
      else load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const total = (kinds ?? []).reduce((n, k) => n + k.count, 0);

  return (
    <>
      <PageHeader
        title="Sandbox"
        blurb="Fake records you can drive through the whole process, and rewind whenever you like."
      />

      {/* The guarantee, stated where the buttons are rather than buried in a
          file nobody opens. It is the reason the feature is safe to use. */}
      <div className="fade-up mt-8 rounded-2xl border border-line/80 bg-panel p-5">
        <p className="text-[9.5px] font-bold uppercase tracking-wider text-muted">
          Nothing here can email anybody
        </p>
        <ul className="mt-2.5 space-y-1.5 text-[12.5px] leading-relaxed">
          <li>
            Every sandbox id starts <code className="font-semibold">{SANDBOX_PREFIX}</code>, so a
            send path can refuse it in one line — and you can see it in the URL.
          </li>
          <li>
            Every address ends <code className="font-semibold">@{SANDBOX_EMAIL_DOMAIN}</code>.
            That domain is reserved and can never resolve, so even a send that slipped
            through would go nowhere.
          </li>
          <li>
            Phone numbers use Ofcom&apos;s drama range (07700 900xxx), which cannot ring a
            real phone.
          </li>
        </ul>
        <p className="mt-3 text-[11px] leading-relaxed text-muted">
          Two independent things have to fail before a real person hears from us. The
          records live in their own table and are never counted in a live figure.
        </p>
      </div>

      {error && (
        <p className="fade-up mt-4 rounded-2xl border border-accent-dark/40 bg-accent-soft/40 p-4 text-[12.5px]">
          {error}
        </p>
      )}

      {!kinds && !error && (
        <p className="fade-up mt-4 rounded-2xl border border-line/80 bg-panel p-5 text-[12.5px] text-muted">
          Loading…
        </p>
      )}

      {kinds && (
        <>
          <div className="fade-up mt-4 grid gap-3 lg:grid-cols-2">
            {kinds.map((k) => (
              <div key={k.id} className="rounded-2xl border border-line/80 bg-panel p-5">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="text-[15px]">{k.label}</h2>
                  {k.count > 0 ? (
                    <Pill tone="accent">{k.count} seeded</Pill>
                  ) : (
                    <Pill tone="neutral">none</Pill>
                  )}
                </div>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">{k.blurb}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted/80">{k.willCreate}</p>

                <div className="mt-3.5 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => act(k.id, "seed")}
                    className="rounded-lg bg-accent-dark px-3.5 py-2 text-[12px] font-semibold text-white transition-opacity disabled:opacity-40"
                  >
                    {busy === `${k.id}-seed`
                      ? "Working…"
                      : k.count > 0
                        ? "Rewind to the start"
                        : "Seed"}
                  </button>
                  {k.count > 0 && (
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => act(k.id, "clear")}
                      className="rounded-lg border border-line/80 px-3.5 py-2 text-[12px] transition-opacity disabled:opacity-40"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {total > 0 && (
            <div className="fade-up mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line/80 bg-panel p-5">
              <p className="text-[12.5px]">
                <span className="figures font-semibold">{total}</span> sandbox record
                {total === 1 ? "" : "s"} in play.
              </p>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => act(null, "clear")}
                className="rounded-lg border border-line/80 px-3.5 py-2 text-[12px] transition-opacity disabled:opacity-40"
              >
                {busy === "all-clear" ? "Clearing…" : "Remove all sandbox data"}
              </button>
            </div>
          )}
        </>
      )}

      <ul className="mt-4 space-y-1.5 text-[11px] leading-relaxed text-muted">
        <li>
          <span className="font-semibold">Rewind and seed are the same button.</span> Seeding
          clears that kind first, so pressing it twice replaces rather than piles up — there
          is never a half-state to untangle.
        </li>
        <li>
          Rewinding one kind never touches another. You can reset market appraisals mid-
          experiment without losing the leads you were driving them with.
        </li>
        <li>
          Postcodes are <span className="font-semibold">real</span>, and chosen because our
          book has comparables near them — an appraisal whose research panel comes back empty
          teaches nothing. Everything identifying a person is fiction.
        </li>
      </ul>
    </>
  );
}
