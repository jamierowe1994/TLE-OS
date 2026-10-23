"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import PickOne from "@/components/PickOne";
import { Pill } from "@/components/Wire";
import { when } from "@/lib/admin-client";
import { searchMatches } from "@/lib/search-match";
import { toast } from "@/lib/toast";

/**
 * People, for a team admin (James, 23 Oct 2026): Kirstie adds people so it
 * isn't all on him. Everybody with an account, a password reset, their role,
 * and add a new person. No files and no "view as" - those stay on the owner's
 * People screen. app/api/team decides what may change; this only draws it.
 */

type RoleOption = { id: string; label: string; blurb: string };
type Person = {
  id: string; name: string; email: string; role: string; roleLabel: string;
  editable: boolean; joinedAt: string; lastSeenAt: string | null; locked: boolean;
};
type Waiting = { email: string; name: string; role: string; roleLabel: string; sentAt: string | null };
type Loaded = { ok: true; me: string; roles: RoleOption[]; people: Person[]; invited: Waiting[] };

async function post(body: Record<string, unknown>): Promise<string> {
  const res = await fetch("/api/team", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; message?: string };
  if (!res.ok || !j.ok) throw new Error(j.error || "That didn't work. Try again.");
  return j.message ?? "Done.";
}

const BUTTON = "rounded-full border border-line/80 bg-card px-3.5 py-1.5 text-[12.5px] font-semibold text-ink transition hover:border-ink/40 disabled:cursor-not-allowed disabled:opacity-50";
const PRIMARY = "rounded-full border border-ink bg-ink px-4 py-2 text-[13px] font-semibold text-white transition hover:border-accent hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40";

export default function TeamPage() {
  const [data, setData] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [find, setFind] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string | null>("agent");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/team", { cache: "no-store" });
      if (!res.ok) throw new Error(res.status === 404 ? "This page is for the people who look after the team." : "The team couldn't be read. Try again in a moment.");
      setData((await res.json()) as Loaded);
      setFailed(null);
    } catch (e) {
      setFailed((e as Error).message);
    }
  }, []);
  useEffect(() => void load(), [load]);

  const act = async (key: string, body: Record<string, unknown>, after?: () => void) => {
    setBusy(key);
    try {
      toast(await post(body));
      after?.();
      await load();
    } catch (e) {
      toast((e as Error).message, "bad");
    } finally {
      setBusy(null);
    }
  };

  const people = useMemo(() => (data?.people ?? []).filter((p) => !find.trim() || searchMatches(find, p.name, p.email, p.roleLabel)), [data, find]);
  const roleOptions = (data?.roles ?? []).map((r) => ({ id: r.id, label: r.label }));
  const blurb = data?.roles.find((r) => r.id === role)?.blurb ?? "";
  const canAdd = name.trim().length > 1 && /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email.trim()) && Boolean(role);

  return (
    <div>
      <PageHeader
        illustration="/illustrations/people/co-workers.svg"
        illustrationAspect={1.0}
        lineBreak="none"
        title="People"
        blurb="Everyone with an account. Send a password reset, set their role, or add somebody new."
      />

      {failed && <p className="mt-6 rounded-[18px] border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-800">{failed}</p>}

      {/* ── Add a person ── */}
      <section className="fade-up mt-6 rounded-[22px] border border-line/70 bg-card p-5">
        <h2 className="text-[16px] font-normal tracking-normal text-ink">Add a Person</h2>
        <p className="mt-1 text-[12.5px] text-muted">They get an email with a link to set their password. The link lasts a week.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_220px_auto] lg:items-start">
          <label className="block">
            <span className="text-[12px] text-muted">Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Jo Bloggs" className="mt-1 w-full rounded-xl border border-line bg-page px-3 py-2 text-[13.5px] outline-none focus:border-ink" />
          </label>
          <label className="block">
            <span className="text-[12px] text-muted">Work email</span>
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="jo.bloggs@thelettingexperts.co.uk" className="mt-1 w-full rounded-xl border border-line bg-page px-3 py-2 text-[13.5px] outline-none focus:border-ink" />
          </label>
          <div>
            <span className="text-[12px] text-muted">Role</span>
            <div className="mt-1">
              <PickOne label="Pick a role" options={roleOptions} value={role} onChange={setRole} clearable={false} />
            </div>
          </div>
          <div className="sm:col-span-2 lg:col-span-1 lg:pt-5">
            <button
              type="button"
              disabled={!canAdd || busy === "add"}
              onClick={() => void act("add", { action: "add", name: name.trim(), email: email.trim(), role }, () => { setName(""); setEmail(""); })}
              className={PRIMARY}
            >
              {busy === "add" ? "Sending…" : "Send Invite"}
            </button>
          </div>
        </div>
        {blurb && <p className="mt-2 text-[12px] text-muted">{blurb}</p>}
      </section>

      {/* ── Invited, not in yet ── */}
      {(data?.invited.length ?? 0) > 0 && (
        <section className="fade-up mt-5 rounded-[22px] border border-line/70 bg-card p-2">
          <h2 className="px-4 pb-1 pt-3 text-[15px] font-normal tracking-normal text-ink">Invited, Not In Yet</h2>
          <ul className="divide-y divide-line/50">
            {data!.invited.map((i) => (
              <li key={i.email} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] text-ink">{i.name}</p>
                  <p className="text-[12px] text-muted">{i.email} · {i.roleLabel} · {i.sentAt ? `sent ${when(i.sentAt)}` : "not sent yet"}</p>
                </div>
                <button type="button" disabled={busy === `resend:${i.email}`} onClick={() => void act(`resend:${i.email}`, { action: "resend", email: i.email, name: i.name })} className={BUTTON}>
                  {busy === `resend:${i.email}` ? "Sending…" : "Send Again"}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Everybody ── */}
      <section className="fade-up mt-5 rounded-[22px] border border-line/70 bg-card p-2">
        <div className="flex flex-wrap items-center gap-3 px-4 pb-2 pt-3">
          <h2 className="text-[15px] font-normal tracking-normal text-ink">Everyone With an Account</h2>
          <span className="text-[12px] text-muted">{data ? `${data.people.length}` : ""}</span>
          <input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find somebody" className="ml-auto w-full rounded-xl border border-line bg-page px-3 py-1.5 text-[13px] outline-none focus:border-ink sm:w-60" />
        </div>
        {!data && !failed ? (
          <div className="flex items-center gap-3 px-4 py-6 text-[13px] text-muted" role="status">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-accent-dark" />
            Reading the team…
          </div>
        ) : (
          <ul className="divide-y divide-line/50">
            {people.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-[14px] text-ink">
                    {p.name}
                    {p.id === data?.me && <Pill tone="accent">You</Pill>}
                    {!p.lastSeenAt && <Pill tone="warn">Never signed in</Pill>}
                    {p.locked && <Pill tone="warn">Locked out</Pill>}
                  </p>
                  <p className="text-[12px] text-muted">{p.email} · {p.lastSeenAt ? `last in ${when(p.lastSeenAt)}` : `account added ${when(p.joinedAt)}`}</p>
                </div>
                <div className="w-full sm:w-52">
                  {p.editable ? (
                    <PickOne
                      label={p.roleLabel}
                      options={roleOptions}
                      value={p.role}
                      clearable={false}
                      onChange={(v) => v && v !== p.role && void act(`role:${p.id}`, { action: "role", userId: p.id, role: v })}
                    />
                  ) : (
                    <span className="block text-[12.5px] text-muted" title={p.id === data?.me ? "You can't change your own role" : "Only James can change this role"}>
                      {p.roleLabel}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  disabled={busy === `reset:${p.id}` || (!p.editable && p.id !== data?.me)}
                  onClick={() => void act(`reset:${p.id}`, { action: "reset", userId: p.id })}
                  className={BUTTON}
                >
                  {busy === `reset:${p.id}` ? "Sending…" : "Send Password Reset"}
                </button>
              </li>
            ))}
            {data && !people.length && <li className="px-4 py-6 text-[13px] text-muted">Nobody matches that.</li>}
          </ul>
        )}
      </section>
    </div>
  );
}
