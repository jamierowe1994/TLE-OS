"use client";
import { useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { loadAdmin, when, AUDIT_KIND, type AdminData } from "@/lib/admin-client";

/** Sign-ins, failed sign-ins, resets and every view-as. */
export default function AdminActivity() {
  const [d, setD] = useState<AdminData | null>(null);
  const [denied, setDenied] = useState(false);
  useEffect(() => { loadAdmin().then((x) => (x ? setD(x) : setDenied(true))); }, []);
  if (denied) return <div className="py-16 text-center"><p className="hand text-[20px]">Nothing here</p></div>;
  if (!d) return <p className="text-[12.5px] text-muted">Loading…</p>;
  return (
    <>
      <PageHeader title="Activity" blurb="Who's signed in, who couldn't, and every time somebody was viewed as." />
      <div className="fade-up mt-8 rounded-2xl border border-line/80 bg-panel p-5">
        {d.audit.length === 0 ? (
          <p className="text-[12.5px] text-muted">
            Nothing recorded yet. The log was created today, so it starts from here.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {d.audit.map((a) => (
              <li key={a.id} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line/40 py-2 text-[12px]">
                <span>
                  <span className="text-muted">{AUDIT_KIND[a.kind] ?? a.kind}</span>{" "}
                  {a.actorEmail || "(unknown)"}{a.subjectEmail ? ` → ${a.subjectEmail}` : ""}
                  {a.detail ? <span className="text-muted"> · {a.detail}</span> : null}
                </span>
                <span className="shrink-0 text-muted">{when(a.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
