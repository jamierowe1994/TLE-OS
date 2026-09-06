"use client";

import { useEffect, useState } from "react";

/**
 * The certificates the OS holds for one REX property, as one shelf: gas,
 * EICR, EPC, licence and the rest, newest first, each opening out of a
 * signed link. Read from /api/compliance/vault, the same folders the
 * Compliance drawer reads.
 *
 * One component, three homes (6 Sep 2026): the listing's Documents tab, the
 * Portfolio drawer and anywhere else a property is opened. Most of the
 * backlog landed on managed homes with no live listing, so the Documents
 * tab alone would have hidden 1,100 of them.
 */

export interface VaultFile {
  key: string;
  certKey: string;
  label: string;
  name: string;
  size: number;
  uploadedAt: string | null;
  open: string;
}

const days = (iso: string | null) =>
  iso == null ? null : Math.floor((Date.now() - new Date(iso).valueOf()) / 86_400_000);

export function since(iso: string | null): string {
  const d = days(iso);
  if (d == null) return "";
  if (d <= 0) return "today";
  if (d === 1) return "yesterday";
  return `${d} days ago`;
}

export default function CertificatesOnFile({
  propertyId,
  emptyText = "None held here yet. A certificate dropped in, or in an approved PLC pack, lands here and on Compliance both.",
}: {
  propertyId: string | null | undefined;
  emptyText?: string;
}) {
  const [certs, setCerts] = useState<VaultFile[] | null>(null);
  useEffect(() => {
    if (!propertyId) {
      setCerts([]);
      return;
    }
    let gone = false;
    setCerts(null);
    fetch(`/api/compliance/vault?property=${encodeURIComponent(propertyId)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { files?: VaultFile[] } | null) => !gone && setCerts(j?.files ?? []))
      .catch(() => !gone && setCerts([]));
    return () => {
      gone = true;
    };
  }, [propertyId]);

  if (certs === null) return <p className="mt-1.5 text-[12px] text-muted">Reading the vault…</p>;
  if (!certs.length) return <p className="mt-1.5 text-[12px] leading-relaxed text-muted">{emptyText}</p>;
  return (
    <ul className="mt-2 space-y-2">
      {certs.map((f) => (
        <li key={f.key} className="flex flex-wrap items-center gap-3 rounded-xl border border-line/70 bg-card p-3">
          <span className="rounded-full border border-line px-2.5 py-0.5 text-[10.5px] font-semibold text-muted">{f.label}</span>
          <span className="min-w-0 truncate text-[12.5px]">{f.name}</span>
          <span className="text-[11px] text-muted">
            {f.size ? `${(f.size / 1_048_576).toFixed(1)} MB` : ""}
            {f.uploadedAt ? ` · ${since(f.uploadedAt)}` : ""}
          </span>
          <a href={f.open} target="_blank" rel="noreferrer" className="ml-auto rounded-full border border-line/80 px-3.5 py-1.5 text-[11.5px] hover:border-ink/40">
            Open
          </a>
        </li>
      ))}
    </ul>
  );
}
