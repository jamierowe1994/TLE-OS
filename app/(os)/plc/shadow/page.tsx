"use client";

import { useEffect, useState } from "react";
import type { ShadowStats } from "@/lib/plc-shadow";

/**
 * The scoreboard for the recommendation.
 *
 * One question, answered honestly: how often did the rules say a pack looked
 * fine and a person stop it? Everything else on this page is context for that
 * number.
 *
 * Not linked from the compliance screens on purpose - see the route.
 */

const prettyWhen = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

function Tile({
  n,
  label,
  blurb,
  tone = "plain",
}: {
  n: number;
  label: string;
  blurb: string;
  tone?: "plain" | "bad" | "good";
}) {
  const colour =
    tone === "bad"
      ? "text-rose-600 dark:text-rose-400"
      : tone === "good"
        ? "text-emerald-600 dark:text-emerald-400"
        : "text-neutral-900 dark:text-neutral-100";
  return (
    <div className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
      <p className={`text-3xl ${colour}`}>{n}</p>
      <p className="mt-1 text-sm text-neutral-900 dark:text-neutral-100">{label}</p>
      <p className="mt-1 text-xs text-neutral-500">{blurb}</p>
    </div>
  );
}

export default function ShadowLog() {
  const [s, setS] = useState<ShadowStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/plc/shadow")
      .then((r) => r.json())
      .then((b) => (b.ok ? setS(b) : setError(b.error ?? "Could not read the log.")))
      .catch(() => setError("Could not read the log."));
  }, []);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">Shadow log</p>
      <h1 className="mt-1 text-2xl tracking-normal text-neutral-900 dark:text-neutral-100">
        Has the Scan Earned It Yet
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-neutral-500">
        Every scanned pack records what the rules recommended, before anybody sees it. When a person
        decides, the two are compared. Nothing here changes a decision or is shown to whoever is
        making one.
      </p>

      {error && <p className="mt-4 text-sm text-rose-700 dark:text-rose-300">{error}</p>}
      {!s && !error && <p className="mt-6 text-sm text-neutral-500">Reading the log…</p>}

      {s && (
        <>
          <p className="mt-6 rounded-xl border border-neutral-200 p-4 text-base dark:border-neutral-800">
            {s.verdict}
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Tile
              n={s.missed}
              label="Called fine, stopped by a person"
              blurb="The number that decides everything. Each one is a rule that does not exist yet."
              tone={s.missed ? "bad" : "good"}
            />
            <Tile
              n={s.overFlagged}
              label="Objected, approved anyway"
              blurb="Cheap in itself, but too many and people stop reading the flags."
            />
            <Tile
              n={s.agreedPass + s.agreedStop}
              label="Agreed"
              blurb={`${s.agreedPass} looked fine and were approved, ${s.agreedStop} were flagged and stopped.`}
            />
            <Tile
              n={s.deferredToHuman}
              label="Asked for a person, got one"
              blurb="Working as designed. Not counted either way — the rules never claimed to answer these."
            />
          </div>

          {s.misses.length > 0 && (
            <section className="mt-6 rounded-xl border border-rose-200 dark:border-rose-900">
              <div className="border-b border-rose-200 px-4 py-3 dark:border-rose-900">
                <h2 className="text-base tracking-normal">Read These One by One</h2>
                <p className="mt-0.5 text-xs text-neutral-500">
                  The rules said these looked fine. A person disagreed. Their note is why.
                </p>
              </div>
              <ul>
                {s.misses.map((m) => (
                  <li
                    key={m.caseId}
                    className="border-b border-rose-100 px-4 py-3 last:border-0 dark:border-rose-950"
                  >
                    <p className="text-sm text-neutral-900 dark:text-neutral-100">{m.address}</p>
                    <p className="mt-1 text-sm text-neutral-500">{m.headline}</p>
                    <p className="mt-1 text-sm">
                      <span className="text-neutral-500">{m.decidedBy} {m.decision}:</span>{" "}
                      {m.decisionNote || "no note"}
                    </p>
                    <p className="mt-1 text-xs text-neutral-400">{prettyWhen(m.decidedAt)}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <p className="mt-6 text-xs text-neutral-500">
            {s.compared === 0
              ? "No pack has been both scanned and decided yet."
              : `${s.compared} pack${s.compared === 1 ? "" : "s"} scanned and decided.`}
          </p>
        </>
      )}
    </div>
  );
}
