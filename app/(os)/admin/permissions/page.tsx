"use client";

import { useCallback, useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { Pill } from "@/components/Wire";

/**
 * Who can see what.
 *
 * Every role is shown with what it actually grants, not just its name. "Super
 * admin" tells you nothing on its own, and a permissions screen that makes you
 * guess is one where somebody gets given more than they needed because the
 * label sounded about right.
 */

type RoleDef = { id: string; label: string; blurb: string; can: string[] };
type Person = { id: string; email: string; name: string; role: string; lastSeenAt: string | null };

const CAP_LABEL: Record<string, string> = {
  "admin:open": "Open admin",
  "see:people": "See people",
  "see:business": "Business figures",
  "see:wiring": "Wiring & connections",
  "see:reports": "Reported problems",
  "see:everything": "All data, not just their own",
  "manage:people": "Invite, reset, view as",
  "manage:roles": "Hand out roles",
};

export default function Permissions() {
  const [d, setD] = useState<{ roles: RoleDef[]; people: Person[] } | null>(null);
  const [denied, setDenied] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/admin/permissions")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("no"))))
      .then(setD)
      .catch(() => setDenied(true));
  }, []);
  useEffect(load, [load]);

  async function setRole(userId: string, role: string) {
    setBusy(userId);
    const r = await fetch("/api/admin/permissions", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId, role }),
    });
    const j = (await r.json()) as { ok?: boolean; message?: string; error?: string };
    setBusy(null);
    setFlash(j.ok ? (j.message ?? "Done.") : (j.error ?? "That didn't work."));
    load();
  }

  if (denied) {
    return (
      <div className="py-16 text-center">
        <p className="hand text-[20px]">Nothing here</p>
      </div>
    );
  }
  if (!d) return <p className="text-[12.5px] text-muted">Loading…</p>;

  return (
    <>
      <PageHeader title="Permissions" blurb="Who can see what, and who decides." />

      {flash && (
        <p className="fade-up mt-8 rounded-2xl border border-accent-dark/40 bg-accent-soft/40 p-4 text-[12.5px]">
          {flash}
        </p>
      )}

      <section className="fade-up mt-8 rounded-2xl border border-line/80 bg-panel p-5">
        <h2 className="text-[15px]">People</h2>
        <ul className="mt-3.5 space-y-2">
          {d.people.map((p) => (
            <li key={p.id} className="rounded-xl border border-line/70 p-3.5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-[13.5px]">{p.name}</span>
                <Pill tone={p.role === "agent" ? "neutral" : "accent"}>
                  {d.roles.find((r) => r.id === p.role)?.label ?? p.role}
                </Pill>
              </div>
              <p className="mt-1 text-[11.5px] text-muted">{p.email}</p>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {d.roles
                  .filter((r) => r.id !== p.role)
                  .map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      disabled={busy !== null}
                      onClick={() => setRole(p.id, r.id)}
                      title={r.blurb}
                      className="rounded-lg border border-line/80 px-2.5 py-1 text-[11px] disabled:opacity-40"
                    >
                      Make {r.label.toLowerCase()}
                    </button>
                  ))}
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-3 border-t border-line/70 pt-3 text-[11px] leading-relaxed text-muted">
          The last owner can&apos;t be demoted, and you can&apos;t remove your own owner role —
          a permissions screen whose worst outcome is &ldquo;nobody can administer this any
          more&rdquo; is a trap, not a feature.
        </p>
      </section>

      <section className="fade-up mt-4 rounded-2xl border border-line/80 bg-panel p-5">
        <h2 className="text-[15px]">What each role means</h2>
        <p className="mt-1 text-[11.5px] text-muted">
          Shown in full, because &ldquo;Super admin&rdquo; tells you nothing on its own — and a
          label that sounds about right is how somebody ends up with more than they needed.
        </p>
        <ul className="mt-3.5 space-y-3">
          {d.roles.map((r) => (
            <li key={r.id} className="rounded-xl border border-line/70 p-3.5">
              <p className="text-[13px] font-semibold">{r.label}</p>
              <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted">{r.blurb}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {r.can.length === 0 ? (
                  <span className="text-[11px] text-muted">Their own book only.</span>
                ) : (
                  r.can.map((c) => (
                    <span
                      key={c}
                      className="rounded-full border border-line/70 px-2.5 py-0.5 text-[10.5px] text-muted"
                    >
                      {CAP_LABEL[c] ?? c}
                    </span>
                  ))
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
