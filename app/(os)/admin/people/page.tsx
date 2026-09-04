"use client";

import { useCallback, useEffect, useState } from "react";
import { can } from "@/lib/roles";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { Pill } from "@/components/Wire";
import { loadAdmin, when, type AdminData } from "@/lib/admin-client";
import { ROLES, ROLE_LABEL, ROLE_BLURB } from "@/lib/roles";

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

  /* The ping, by hand. Same endpoint the scheduled one hits, so there is only
     one code path to be wrong. */
  const [tegNote, setTegNote] = useState<string | null>(null);
  /* Whether THIS viewer may act on a person, as opposed to read the census.
     Susan holds see:people from 4 Sep and not manage:people, so she gets the
     list and not the reset button - a control that answers 404 reads as a
     broken page rather than as a boundary. */
  const [mayManage, setMayManage] = useState(false);
  useEffect(() => {
    let gone = false;
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { role?: string | null } | null) => {
        if (!gone) setMayManage(can(j?.role, "manage:people"));
      })
      .catch(() => {});
    return () => {
      gone = true;
    };
  }, []);
  async function pullTeg() {
    setBusy("teg");
    setTegNote(null);
    try {
      const r = await fetch("/api/teg/sync", { method: "POST" });
      const j = (await r.json()) as {
        ok?: boolean; error?: string;
        pulled?: number; withBio?: number; withPhoto?: number; withPackage?: number;
      };
      setTegNote(
        j.ok
          ? `${j.pulled} pulled · ${j.withPackage} with a package · ${j.withBio} with a bio · ${j.withPhoto} with a headshot`
          : (j.error ?? "That didn't work.")
      );
      load();
    } catch {
      setTegNote("Couldn't reach the Hub.");
    } finally {
      setBusy(null);
    }
  }

  /**
   * Set what somebody IS, from the page where you are already looking at them.
   *
   * James, 29 Aug: "if I go on to people and then click on a name, I can't do
   * anything with it. I need to be able to go into pre-tenancy, and then where
   * it says agent, I need to be able to select."
   *
   * Permissions could always do this and Kirstie was never on it, because that
   * screen lists ACCOUNTS and she has not joined yet. She is on this one, which
   * lists everybody in REX — so this is where the control belongs, and the
   * split between "has an account" and "does not" is handled here rather than
   * being something to know about.
   *
   * TWO DESTINATIONS, one control:
   *   · With an account, it changes the role on the account, now.
   *   · Without one, it sets the role on their INVITE, so they arrive as that
   *     rather than as an agent. Which is exactly what went wrong for Susan —
   *     she redeemed her link and could not open a single business screen.
   *
   * The second is the reason this is not simply a link to Permissions: the role
   * usually needs deciding BEFORE somebody joins, and until now there was
   * nowhere to decide it.
   */
  async function setPersonRole(
    p: { userId: string | null; hasAccount: boolean; email: string; name: string; rexId: string },
    role: string
  ) {
    setBusy(p.email);
    setFlash(null);
    try {
      const r =
        p.hasAccount && p.userId
          ? await fetch("/api/admin/permissions", {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ userId: p.userId, role }),
            })
          : await fetch("/api/admin/pilot", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ email: p.email, name: p.name, rexUserId: p.rexId, role }),
            });
      const j = (await r.json()) as { ok?: boolean; error?: string };
      const label = ROLE_LABEL[role as keyof typeof ROLE_LABEL] ?? role;
      setFlash(
        j.ok === false
          ? (j.error ?? "That didn't work.")
          : p.hasAccount
            ? `${p.name} is now ${label}.`
            : `${p.name} will join as ${label}.`
      );
      load();
    } catch {
      setFlash("That didn't work.");
    } finally {
      setBusy(null);
    }
  }

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

      {/* Re-pull the TEG Team Hub. James fills bios and headshots in there by
          hand, so the useful thing to show is not "synced ok" but how many are
          still blank — that is the worklist, and it shrinks as he works. */}
      <div className="fade-up mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-line/70 bg-panel p-3.5">
        <button
          type="button"
          onClick={pullTeg}
          disabled={busy === "teg"}
          className="rounded-lg border border-line/80 px-3 py-1.5 text-[12px] transition-colors hover:border-ink disabled:opacity-50"
        >
          {busy === "teg" ? "Pulling…" : "Re-pull from TEG Hub"}
        </button>
        <span className="text-[11.5px] text-muted">
          {tegNote ??
            `${d.people.filter((p) => p.partnerPackage).length} with a package · ${
              d.people.filter((p) => p.hasBio).length
            } with a bio, of ${d.people.length}`}
        </span>
      </div>
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
                {p.partnerPackage && <Pill tone="accent">{p.partnerPackage}</Pill>}
                {!p.hasBio && <Pill tone="neutral">No bio</Pill>}
              </span>
            </div>
            <p className="mt-1 text-[11.5px] text-muted">
              {p.email}{p.rexId ? ` · REX ${p.rexId}` : " · not in REX"}
              {p.hasAccount ? ` · last in ${when(p.lastSeenAt)}` : ""}
            </p>
            {/* The role, on every person — with an account or not. Someone who
                has not joined yet is precisely who most needs this set, because
                the alternative is inviting them and then remembering to come
                back and fix it. */}
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <label className="text-[11.5px] text-muted" htmlFor={`role-${p.email}`}>
                {p.hasAccount ? "Role" : "Joins as"}
              </label>
              <select
                id={`role-${p.email}`}
                value={p.role ?? "agent"}
                disabled={busy !== null}
                onChange={(e) => setPersonRole(p, e.target.value)}
                title={ROLE_BLURB[(p.role ?? "agent") as keyof typeof ROLE_BLURB]}
                className="rounded-lg border border-line/80 bg-panel px-2.5 py-1.5 text-[11.5px] disabled:opacity-40"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
              {!p.hasAccount && (
                <span className="text-[11px] text-muted">
                  They haven&apos;t joined yet — this is what they&apos;ll arrive as.
                </span>
              )}
            </div>

            {p.hasAccount && p.userId && (
              <div className="mt-2.5 flex flex-wrap gap-2">
                {p.rexId && (
                  <Link href={`/admin/people/${p.rexId}`} className="rounded-lg border border-line/80 px-3 py-1.5 text-[11.5px]">
                    Open their file
                  </Link>
                )}
                {mayManage && (
                  <button type="button" disabled={busy !== null} onClick={() => sendReset(p.userId!)}
                    className="rounded-lg border border-line/80 px-3 py-1.5 text-[11.5px] disabled:opacity-40">
                    Send a reset link
                  </button>
                )}
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
