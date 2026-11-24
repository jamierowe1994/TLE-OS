"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ErrorLine, Loading, Section, Spin, when } from "@/components/new-look/admin/bits";
import type { FillRow } from "@/lib/steve-find";

/**
 * FILLED IN BY STEVE (lib/steve-find, James 24 Nov 2026): every missing
 * landlord or tenant detail Steve found and an agent said yes to, newest
 * first, the last fortnight. Each says where it came from and who said yes,
 * and Undo puts the home back as it was. These never became tickets.
 */
export default function SteveFills() {
  const [rows, setRows] = useState<FillRow[] | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(() => {
    setErr("");
    fetch("/api/assistant/find", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; fills?: FillRow[]; error?: string }) => (j.ok ? setRows(j.fills ?? []) : setErr(j.error || "Steve's list couldn't be read.")))
      .catch(() => setErr("Steve's list couldn't be read."));
  }, []);
  useEffect(load, [load]);

  async function undo(id: string) {
    setBusy(id);
    const j = await fetch("/api/assistant/find", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ undo: id }) })
      .then((r) => r.json())
      .catch(() => null);
    setBusy("");
    if (!j?.ok) setErr(j?.error || "That couldn't be undone just now.");
    load();
  }

  const live = rows?.filter((r) => !r.undone).length ?? 0;
  return (
    <Section title={<>Filled In by Steve <span className="nl-count">{rows ? live : "…"}</span></>}>
      {err && <ErrorLine onRetry={load}>{err}</ErrorLine>}
      {!rows && !err ? (
        <Loading what="Reading what Steve filled in" />
      ) : rows && rows.length === 0 ? (
        <p className="nl-empty">Nothing yet. When an agent reports a missing landlord or tenant, Steve looks in PayProp, Propoly and REX, and what they say yes to shows here with Undo.</p>
      ) : rows ? (
        <ul className="nl-adm-rows">
          {rows.map((r) => (
            <li key={r.id} className="nl-adm-row">
              <div className="min-w-0 flex-1">
                <p className="nl-strong">
                  <Link href={r.path} className="nl-link">{r.home}</Link>: {r.who === "landlord" ? "landlord" : "tenant"} {r.name}
                </p>
                <p className="nl-meta">
                  Added {r.added || "their name"} from {r.source}. {r.by} said yes, {when(r.at)}.
                  {r.undone ? ` Undone by ${r.undone}.` : ""}
                </p>
              </div>
              {!r.undone && (
                <button type="button" className="nl-btn nl-btn--secondary nl-btn--sm" disabled={busy === r.id} onClick={() => void undo(r.id)}>
                  {busy === r.id ? <Spin /> : "Undo"}
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </Section>
  );
}
