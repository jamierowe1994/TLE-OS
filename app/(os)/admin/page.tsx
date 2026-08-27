"use client";

import { useCallback, useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { Pill } from "@/components/Wire";

/**
 * The admin centre — owner only.
 *
 * The API answers 404 to anybody who isn't an owner, so this page shows the
 * same "nothing here" an agent would get from a wrong URL. A page that says
 * "you are not permitted" confirms there is an admin area to go looking for.
 *
 * Four questions, in the order James asked them:
 *   who is set up, and who isn't
 *   who has signed in, and when
 *   what is connected
 *   what is still to do
 */

type Person = {
  rexId: string; name: string; email: string; userId: string | null;
  role: string | null; hasAccount: boolean; hasPhoto: boolean;
  createdAt: string | null; lastSeenAt: string | null;
};
type Audit = { id: string; kind: string; actorEmail: string; subjectEmail: string; detail: string; at: string };
type Todo = { id: string; title: string; detail: string; area: string; state: string };
type Data = {
  me: { id: string; email: string; name: string };
  people: Person[];
  summary: { staff: number; withAccounts: number; neverSignedIn: number; noPhoto: number; notInvited: number };
  audit: Audit[];
  todos: Todo[];
};

const when = (iso: string | null) =>
  !iso ? "never" : new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const KIND: Record<string, string> = {
  sign_in: "signed in",
  sign_in_failed: "failed sign-in",
  password_reset: "reset sent",
  view_as_start: "started viewing as",
  view_as_end: "stopped viewing as",
};

export default function Admin() {
  const [d, setD] = useState<Data | null>(null);
  const [denied, setDenied] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/admin")
      .then((r) => (r.status === 404 ? Promise.reject(new Error("404")) : r.json()))
      .then(setD)
      .catch(() => setDenied(true));
  }, []);
  useEffect(load, [load]);

  async function viewAs(userId: string) {
    setBusy(userId);
    const r = await fetch("/api/admin/view-as", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    const j = (await r.json()) as { ok?: boolean; error?: string };
    setBusy(null);
    if (j.ok) window.location.href = "/dashboard";
    else setFlash(j.error ?? "That didn't work.");
  }

  async function sendReset(userId: string) {
    setBusy(userId);
    const r = await fetch("/api/admin/reset", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    const j = (await r.json()) as { ok?: boolean; error?: string; message?: string };
    setBusy(null);
    setFlash(j.ok ? (j.message ?? "Sent.") : (j.error ?? "That didn't work."));
    load();
  }

  if (denied) {
    return (
      <div className="py-16 text-center">
        <p className="hand text-[20px]">Nothing here</p>
      </div>
    );
  }
  if (!d) return <p className="mt-8 text-[12.5px] text-muted">Loading…</p>;

  const s = d.summary;

  return (
    <>
      <PageHeader title="Admin" blurb="Who's set up, who's been in, what's connected, and what's left to do." />

      {flash && (
        <p className="fade-up mt-8 rounded-2xl border border-accent-dark/40 bg-accent-soft/40 p-4 text-[12.5px]">
          {flash}
        </p>
      )}

      <div className="fade-up mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ["Staff in REX", s.staff],
          ["With accounts", s.withAccounts],
          ["Never signed in", s.neverSignedIn],
          ["No headshot", s.noPhoto],
          ["Not invited", s.notInvited],
        ].map(([k, v]) => (
          <div key={String(k)} className="rounded-2xl border border-line/80 bg-panel p-4">
            <p className="text-[9.5px] font-bold uppercase tracking-wider text-muted">{k}</p>
            <p className="figures mt-1.5 text-[24px] leading-none">{v}</p>
          </div>
        ))}
      </div>

      <section className="fade-up mt-4 rounded-2xl border border-line/80 bg-panel p-5">
        <h2 className="text-[15px]">People</h2>
        <p className="mt-1 text-[11.5px] text-muted">
          From REX, joined to who actually has an account here.
        </p>
        <ul className="mt-3.5 space-y-2">
          {d.people.map((p) => (
            <li key={p.email} className="rounded-xl border border-line/70 p-3.5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-[13.5px]">{p.name}</span>
                <span className="flex shrink-0 items-center gap-1.5">
                  {p.role === "owner" && <Pill tone="accent">Owner</Pill>}
                  {!p.hasAccount && <Pill tone="neutral">Not invited</Pill>}
                  {p.hasAccount && !p.lastSeenAt && <Pill tone="accent">Never signed in</Pill>}
                  {p.hasAccount && !p.hasPhoto && <Pill tone="neutral">No headshot</Pill>}
                </span>
              </div>
              <p className="mt-1 text-[11.5px] text-muted">
                {p.email}
                {p.rexId ? ` · REX ${p.rexId}` : " · not in REX"}
                {p.hasAccount ? ` · last in ${when(p.lastSeenAt)}` : ""}
              </p>
              {p.hasAccount && p.userId && (
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {p.role !== "owner" && (
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => viewAs(p.userId!)}
                      className="rounded-lg border border-line/80 px-3 py-1.5 text-[11.5px] disabled:opacity-40"
                    >
                      View as
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => sendReset(p.userId!)}
                    className="rounded-lg border border-line/80 px-3 py-1.5 text-[11.5px] disabled:opacity-40"
                  >
                    Send a reset link
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-3 border-t border-line/70 pt-3 text-[11px] leading-relaxed text-muted">
          <span className="font-semibold">View as is read-only.</span> Nothing can be written,
          sent or signed while it&apos;s open, it lasts 30 minutes, and both starting and
          stopping are recorded below. Resetting sends <em>them</em> a link — no password is
          ever set or shown here.
        </p>
      </section>

      <section className="fade-up mt-4 rounded-2xl border border-line/80 bg-panel p-5">
        <h2 className="text-[15px]">What&apos;s been happening</h2>
        {d.audit.length === 0 ? (
          <p className="mt-2 text-[12.5px] text-muted">Nothing recorded yet.</p>
        ) : (
          <ul className="mt-3 space-y-1.5">
            {d.audit.map((a) => (
              <li key={a.id} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line/40 py-1.5 text-[11.5px]">
                <span>
                  <span className="text-muted">{KIND[a.kind] ?? a.kind}</span>{" "}
                  {a.actorEmail}
                  {a.subjectEmail ? ` → ${a.subjectEmail}` : ""}
                </span>
                <span className="shrink-0 text-muted">{when(a.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="fade-up mt-4 rounded-2xl border border-line/80 bg-panel p-5">
        <h2 className="text-[15px]">Still to do</h2>
        {d.todos.length === 0 ? (
          <p className="mt-2 text-[12.5px] text-muted">
            Nothing on the list yet.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {d.todos.map((t) => (
              <li key={t.id} className="rounded-xl border border-line/70 p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[13px]">{t.title}</span>
                  <Pill tone={t.state === "doing" ? "accent" : "neutral"}>{t.state}</Pill>
                </div>
                {t.detail && <p className="mt-1 text-[11.5px] text-muted">{t.detail}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
