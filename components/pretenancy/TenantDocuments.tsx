"use client";

import { useEffect, useState } from "react";
import { tenantDocLabel } from "@/lib/tenant-documents-kinds";

/** What the tenants have sent in on this deal. The other end of the tenant
 *  portal's "Send us something" - see app/api/tenant/documents. */
type Doc = { id: string; kind: string; name: string; r2Key: string; uploadedAt: string; who: string };

export default function TenantDocuments({ dealId }: { dealId: string }) {
  const [docs, setDocs] = useState<Doc[] | null>(null);
  useEffect(() => {
    let gone = false;
    fetch(`/api/deals/${encodeURIComponent(dealId)}/tenant-documents`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (!gone) setDocs(j.ok ? j.documents : []); })
      .catch(() => { if (!gone) setDocs([]); });
    return () => { gone = true; };
  }, [dealId]);

  return (
    <section className="rounded-2xl border border-line/80 bg-panel p-5">
      <p className="text-[9.5px] font-bold uppercase tracking-wider text-muted">Sent in by the tenant</p>
      {docs == null ? (
        <p className="mt-2 text-[12px] text-muted">Looking…</p>
      ) : docs.length === 0 ? (
        <p className="mt-2 text-[12px] text-muted">Nothing yet. What they send from their portal arrives here.</p>
      ) : (
        <ul className="mt-3 divide-y divide-line/50">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-3 py-2.5 text-[12px]">
              <span className="min-w-0">
                <span className="block truncate font-semibold">{d.name}</span>
                <span className="block text-muted">
                  {tenantDocLabel(d.kind)} · {d.who} ·{" "}
                  {new Date(d.uploadedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                </span>
              </span>
              <a
                href={`/api/r2/file?key=${encodeURIComponent(d.r2Key)}`}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 rounded-full border border-line/60 px-3 py-1.5 text-[11px] font-semibold"
              >
                Open
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
