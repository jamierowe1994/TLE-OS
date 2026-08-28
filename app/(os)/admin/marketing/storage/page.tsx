"use client";
import { useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
export default function Storage() {
  const [n, setN] = useState<number | null | undefined>(undefined);
  useEffect(() => {
    fetch("/api/r2/list").then((r) => (r.ok ? r.json() : null))
      .then((j: { objects?: unknown[]; files?: unknown[] } | null) =>
        setN(j ? (j.objects ?? j.files ?? []).length : null))
      .catch(() => setN(null));
  }, []);
  return (
    <>
      <PageHeader title="File storage" blurb="Brochures, PDFs and assets." />
      <div className="fade-up mt-8 rounded-2xl border border-line/80 bg-panel p-5">
        <p className="text-[12.5px] leading-relaxed">
          Cloudflare R2, EU jurisdiction — the same bucket the rest of the OS uses, so a
          brochure uploaded here is the one a deck reaches for.
        </p>
        <p className="mt-2 text-[12.5px]">
          {n === undefined ? "Counting…" : n === null ? "Couldn't reach the bucket." : `${n} file${n === 1 ? "" : "s"} stored.`}
        </p>
      </div>
    </>
  );
}
