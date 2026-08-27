"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { Pill } from "@/components/Wire";
import { loadAdmin, when, type AdminData } from "@/lib/admin-client";

/** Everyone in REX, joined to who actually has an account here. */
export default function AdminPeople() {
  const [d, setD] = useState<AdminData | null>(null);
  const [denied, setDenied] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const load = useCallback(() => {
    loadAdmin().then((x) => (x ? setD(x) : setDenied(true)));
  }, []);
  useEffect(load, [load]);

  async function sendReset(userId: string) {
    setBusy(userId);
    const r = await fetch("/api/admin/reset", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    const j = (await r.json()) as { ok?: boolean; error?: string; message?: string };
    setBusy(null);
    setFlash(j.ok ? (j.message ?? "Sent.") : (j.error ?? "That didn't work."));
    load();
  }

  if (denied) return <div className="py-16 text-center"><p className="hand text-[20px]">Nothing here</p></div>;
  if (!d) return <p className="text-[12.5px] text-muted">Loading…</p>;

  return (
    <>
      <PageHeader title="People" blurb="From REX, joined to who's actually got in." />
      {flash && <p className="fade-up mt-8 rounded-2xl border border-accent-dark/40 bg-accent-soft/40 p-4 text-[12.5px]">{flash}</p>}

      <ul className="fade-up mt-8 space-y-2">
        {d.people.map((p) => (
          <li key={p.email} className="rounded-xl border border-line/70 bg-panel p-3.5 transition-colors hover:border-ink">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              {p.rexId ? (
                <Link href={`/admin/people/${p.rexId}`} className="text-[13.5px] underline">{p.name}</Link>
              ) : (
                <span className="text-[13.5px]">{p.name}</span>
              )}
              <span className="flex shrink-0 items-center gap-1.5">
                {p.role === "owner" && <Pill tone="accent">Owner</Pill>}
                {!p.hasAccount && <Pill tone="neutral">Not invited</Pill>}
                {p.hasAccount && !p.lastSeenAt && <Pill tone="accent">Never signed in</Pill>}
                {p.hasAccount && !p.hasPhoto && <Pill tone="neutral">No headshot</Pill>}
              </span>
            </div>
            <p className="mt-1 text-[11.5px] text-muted">
              {p.email}{p.rexId ? ` · REX ${p.rexId}` : " · not in REX"}
              {p.hasAccount ? ` · last in ${when(p.lastSeenAt)}` : ""}
            </p>
            {p.hasAccount && p.userId && (
              <div className="mt-2.5 flex flex-wrap gap-2">
                {p.rexId && (
                  <Link href={`/admin/people/${p.rexId}`} className="rounded-lg border border-line/80 px-3 py-1.5 text-[11.5px]">
                    Open their file
                  </Link>
                )}
                <button type="button" disabled={busy !== null} onClick={() => sendReset(p.userId!)}
                  className="rounded-lg border border-line/80 px-3 py-1.5 text-[11.5px] disabled:opacity-40">
                  Send a reset link
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-4 text-[11px] leading-relaxed text-muted">
        Resetting sends <em>them</em> a link — no password is ever set or shown here.
        &ldquo;View as&rdquo; lives on each person&apos;s own file.
      </p>
    </>
  );
}
