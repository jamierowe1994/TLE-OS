"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import DoodleIcon from "@/components/DoodleIcon";

/**
 * Marketing knowledge: everything in the File Store (James, 2 Oct 2026:
 * "Steve's knowledge ... should be pulling everything from the file storage
 * area ... serve them back to the person as a downloadable"). Read here, found
 * by Steve's find_file, added on Marketing hub > File Store.
 */
type File = { key: string; name: string; size: number; uploadedAt: string | null; href: string };

const kb = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

export default function MarketingKnowledge({ q }: { q: string }) {
  const [files, setFiles] = useState<File[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/knowledge/files", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; files?: File[]; error?: string }) => (j.ok ? setFiles(j.files ?? []) : setError(j.error ?? "Could not read the File Store.")))
      .catch(() => setError("Could not read the File Store."));
  }, []);
  const needle = q.trim().toLowerCase();
  const shown = (files ?? []).filter((f) => !needle || f.name.toLowerCase().includes(needle));

  return (
    <section className="fade-up mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-prose text-[12px] leading-relaxed text-muted">
          Everything in the File Store. Steve finds these by name and hands them over as a download when somebody asks for a brochure, a form or a guide.
        </p>
        <Link href="/marketing-hub/storage" className="rounded-full border border-line/80 px-4 py-2 text-[12px] font-semibold hover:border-ink/40">
          Add files in the File Store →
        </Link>
      </div>
      {error ? (
        <p className="mt-6 text-[12.5px] text-accent-dark">{error}</p>
      ) : !files ? (
        <p className="mt-6 flex items-center gap-2 text-[12.5px] text-muted">
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-accent-dark" />
          Reading the File Store…
        </p>
      ) : !shown.length ? (
        <p className="mt-6 text-[12.5px] text-muted">{files.length ? "Nothing matches that." : "Nothing in the File Store yet."}</p>
      ) : (
        <ul className="mt-4 grid gap-2.5 md:grid-cols-2">
          {shown.map((f) => (
            <li key={f.key} className="flex items-center gap-3 rounded-2xl border border-line/80 bg-panel p-3.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-dark">
                <DoodleIcon name="doc" size={15} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold">{f.name}</span>
                <span className="block text-[11px] text-muted">
                  {kb(f.size)}
                  {f.uploadedAt ? ` · added ${new Date(f.uploadedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}` : ""}
                </span>
              </span>
              <a href={f.href} className="shrink-0 rounded-full border border-line/80 px-3.5 py-1.5 text-[11.5px] font-semibold hover:border-ink/40">
                Download
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
