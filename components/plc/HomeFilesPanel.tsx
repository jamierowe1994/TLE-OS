"use client";

import { useCallback, useEffect, useState } from "react";
import { PLC_CHECKS, gateOf, groupOf, type CheckId, type PlcCase } from "@/lib/plc";
import type { Doc } from "@/components/FileDocuments";

/**
 * What the home already holds, beside the check (James, 8 Nov 2026: "what if
 * we don't find the file ... do they have to go back into the file and
 * upload it? ... bring it up side by side, and if there are any documents
 * that are missed, they can then just map them to it").
 *
 * Every file on the home's Documents tab that isn't in this check yet, each
 * with one choice: which check it is. Picked, it files straight in - the same
 * stored file, nothing uploaded twice. Already-filed ones are counted, not
 * listed, so the column stays about what's left.
 */

const keyOf = (url: string): string | null => {
  const m = /[?&]key=([^&]+)/.exec(url);
  return m ? decodeURIComponent(m[1]) : null;
};

export default function HomeFilesPanel({
  kase,
  step,
  address,
  propertyId,
  onChanged,
}: {
  kase: PlcCase;
  step: "landlord" | "tenant";
  address: string;
  propertyId: string | null;
  onChanged: (c: PlcCase) => void;
}) {
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);

  const load = useCallback(async () => {
    setFailed(false);
    const q = `address=${encodeURIComponent(address)}&property=${encodeURIComponent(propertyId ?? "")}&from=application`;
    const j = (await fetch(`/api/documents?${q}`, { cache: "no-store" })
      .then((r) => r.json())
      .catch(() => null)) as { ok?: boolean; docs?: Doc[] } | null;
    if (!j?.ok) {
      setFailed(true);
      setDocs([]);
      return;
    }
    setDocs(j.docs ?? []);
  }, [address, propertyId]);
  useEffect(() => {
    void load();
  }, [load]);

  const inPack = new Set(kase.documents.map((d) => d.key));
  const usable = (docs ?? []).filter((d) => {
    const k = keyOf(d.url);
    return k && !d.standing;
  });
  const left = usable.filter((d) => !inPack.has(keyOf(d.url)!));
  const already = usable.length - left.length;
  /* This step's checks, the ones this let needs first. */
  const checks = PLC_CHECKS.filter((c) => groupOf(c.id) === step).sort((a, b) => Number(gateOf(b, kase.letType) === "required") - Number(gateOf(a, kase.letType) === "required"));
  const missing = new Set(checks.filter((c) => !kase.documents.some((d) => d.checkId === c.id || d.covers?.includes(c.id))).map((c) => c.id));

  async function file(d: Doc, checkId: CheckId) {
    const key = keyOf(d.url);
    if (!key) return;
    setBusy(d.id);
    setSaid(null);
    const j = (await fetch(`/api/plc/${kase.id}/documents`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ checkId, name: d.name || d.fileName, key, size: d.sizeBytes || undefined }),
    })
      .then((r) => r.json())
      .catch(() => null)) as { ok?: boolean; case?: PlcCase; error?: string } | null;
    setBusy(null);
    if (!j?.ok || !j.case) {
      setSaid(j?.error ?? "That didn't file. Try again.");
      return;
    }
    onChanged(j.case);
    setSaid(`${d.name || d.fileName} is in, as ${PLC_CHECKS.find((c) => c.id === checkId)?.label ?? "that check"}.`);
  }

  return (
    <aside className="nl-plc-files" aria-label="On file for this home">
      <header>
        <h3>On File for This Home</h3>
        <p>From the home&apos;s Documents tab. Anything the check didn&apos;t pick up, put it where it belongs.</p>
      </header>
      {docs === null ? (
        <p className="nl-plc-files-wait">
          <span aria-hidden className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-ink" /> Reading the home&apos;s files…
        </p>
      ) : failed ? (
        <p className="nl-plc-files-wait">The home&apos;s files couldn&apos;t be read just now.</p>
      ) : left.length === 0 ? (
        <p className="nl-plc-files-wait">
          {usable.length ? `All ${usable.length} of the home's files are in this check already.` : "Nothing on the home's Documents tab yet."}
        </p>
      ) : (
        <ul>
          {left.map((d) => (
            <li key={d.id} className={busy === d.id ? "is-busy" : ""}>
              <a href={d.url} target="_blank" rel="noreferrer" className="nl-plc-files-name" title={d.fileName}>
                <span className="nl-plc-files-ext">{(d.fileName.split(".").pop() ?? "").slice(0, 4).toUpperCase() || "FILE"}</span>
                <span className="min-w-0">
                  <b>{d.name || d.fileName}</b>
                  <small>{[d.typeLabel, new Date(d.at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })].filter(Boolean).join(" · ")}</small>
                </span>
              </a>
              <label className="nl-plc-files-use">
                <span className="sr-only">Use {d.name} for</span>
                <select
                  value=""
                  disabled={busy !== null}
                  onChange={(e) => e.target.value && void file(d, e.target.value as CheckId)}
                >
                  <option value="">{busy === d.id ? "Filing…" : "Use for…"}</option>
                  {checks.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}{missing.has(c.id) ? " (missing)" : ""}
                    </option>
                  ))}
                </select>
              </label>
            </li>
          ))}
        </ul>
      )}
      {already > 0 && left.length > 0 && <p className="nl-plc-files-count">{already} more already in this check.</p>}
      {said && <p className="nl-plc-files-said" role="status">{said}</p>}
    </aside>
  );
}
