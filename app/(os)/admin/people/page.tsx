"use client";

import { useEffect, useState } from "react";
import { can } from "@/lib/roles";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import PeopleTabs from "@/components/admin/PeopleTabs";
import { Pill } from "@/components/Wire";
import AdminLoadFailed from "@/components/AdminLoadFailed";
import { useAdmin, when, type Person } from "@/lib/admin-client";
import { ROLES, ROLE_LABEL, ROLE_BLURB } from "@/lib/roles";
import PickOne from "@/components/PickOne";
import { fetchMe } from "@/lib/me";
import { searchMatches } from "@/lib/search-match";
import { useNewLook } from "@/lib/use-new-look";
import { Mast, Badge, Ico } from "@/components/new-look/Parts";
import PeopleTabsNew from "@/components/new-look/admin/PeopleTabsNew";

/**
 * The list, filtered and ordered. Pure, so the rules are readable in one
 * place rather than spread through the JSX.
 *
 * "Never signed in" sorts to the TOP under "longest since", not the bottom:
 * somebody who has never been in is the most stale person on the list, and
 * burying them under everybody who came in last month is how an account sits
 * unused until the day it matters.
 */
function shown(
  people: Person[],
  q: string,
  role: string,
  order: "recent" | "stale" | "name"
): Person[] {
  const needle = q.trim();
  const out = people.filter((p) => {
    if (needle && !searchMatches(needle, p.name, p.email)) return false;
    if (role === "all") return true;
    if (role === "none") return !p.hasAccount;
    return p.hasAccount && p.role === role;
  });
  const seen = (p: Person) => (p.lastSeenAt ? new Date(p.lastSeenAt).getTime() : null);
  return out.sort((a, b) => {
    if (order === "name") return a.name.localeCompare(b.name);
    /* Somebody who has never been invited has no sign-in story at all, so
       they sort last under BOTH orders. They led "longest since" on the first
       cut, which put twenty-three people who have never had an account above
       the one person with an account who has not been in for nine days -
       burying the answer under the people the question was not about. */
    if (!a.hasAccount !== !b.hasAccount) return a.hasAccount ? -1 : 1;
    if (!a.hasAccount && !b.hasAccount) return a.name.localeCompare(b.name);
    const x = seen(a);
    const y = seen(b);
    if (x === null && y === null) return a.name.localeCompare(b.name);
    if (order === "recent") {
      /* Never signed in has no date to sort by, so it goes after everybody
         who has been in - the question is "who has been in lately". */
      if (x === null) return 1;
      if (y === null) return -1;
      return y - x;
    }
    /* And first under "longest since", because an account that has never been
       used is the stalest thing on the list, not the newest. */
    if (x === null) return -1;
    if (y === null) return 1;
    return x - y;
  });
}

/**
 * Everyone in REX, joined to who actually has an account here.
 *
 * ── The filters, and why each one is here (James, 10 Sep 2026) ───────────
 *
 * The list had grown past the point where an owner could find one person in
 * it, and the two questions he actually asks of it were both unanswerable:
 * "who is this person" and "has anybody been in lately".
 *
 *   SEARCH   name or email. Nothing clever, and no debounce - the list is
 *            already in the browser.
 *   ROLE     what somebody IS, using the same labels Permissions uses, plus
 *            "No account yet" - which is a state rather than a role, and the
 *            one most worth filtering to.
 *   ORDER    last signed in, first or last, or by name. Default is the most
 *            recent, because that is the question the screen gets opened for.
 *
 * All three are held in this component only. A filter that survives a reload
 * is a filter somebody forgets is on, and then the list "loses" people.
 */
export default function AdminPeople() {
  const { d, denied, failed, load } = useAdmin();
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [order, setOrder] = useState<"recent" | "stale" | "name">("recent");
  /* ?filter=none lands on the people with no account yet; ?filter=stale puts
     the longest-absent first. The overview's tiles link here with them. */
  useEffect(() => {
    const f = new URLSearchParams(window.location.search).get("filter");
    if (f === "none") setRoleFilter("none");
    if (f === "stale") setOrder("stale");
  }, []);


  /* The ping, by hand. Same endpoint the scheduled one hits, so there is only
     one code path to be wrong. */
  const [tegNote, setTegNote] = useState<string | null>(null);
  /* Whether THIS viewer may act on a person, as opposed to read the census.
     Susan holds see:people from 4 Sep and not manage:people, so she gets the
     list and not the reset button - a control that answers 404 reads as a
     broken page rather than as a boundary. */
  const [mayManage, setMayManage] = useState(false);
  /* Whether Invites is theirs, for the new look's "Add a Person" card, which
     goes to that tab rather than inviting from here. */
  const [mayInvite, setMayInvite] = useState(false);
  /* The new look (lib/new-look "admin", 23 Oct 2026). Null until known. */
  const look = useNewLook("admin");
  useEffect(() => {
    let gone = false;
    fetchMe()
      .then((j) => {
        if (gone) return;
        setMayManage(can(j?.role, "manage:people"));
        setMayInvite(can(j?.role, "see:prelaunch"));
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

  /**
   * View as, from the list.
   *
   * It has always lived on the person's own file, which was a click away and
   * - until today - impossible to reach at all for anybody who is not a REX
   * agent. This is the same call, from the row, so checking four people's
   * screens is four presses rather than twelve.
   *
   * Read-only for the next thirty minutes, audited both ends. An owner may
   * not wear another owner's face, so the button is not drawn for one.
   */
  async function viewAs(p: { userId: string | null; rexId: string; name: string }) {
    setBusy(p.userId ?? p.rexId);
    setFlash(null);
    const r = await fetch("/api/admin/view-as", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(p.userId ? { userId: p.userId } : { rexUserId: p.rexId }),
    });
    const j = (await r.json()) as { ok?: boolean; error?: string };
    setBusy(null);
    if (j.ok) window.location.href = "/dashboard";
    else setFlash(j.error ?? "That didn't work.");
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
  if (failed) return <AdminLoadFailed onRetry={load} />;
  if (look === null || (look && !d)) {
    return (
      <div data-look={look ? "new" : undefined} className={look ? "nl-page nl-adm" : undefined}>
        <p className={look ? "nl-adm-loading" : "flex items-center gap-2 py-16 text-[12.5px] text-muted"}>
          {look ? <span className="nl-adm-spin" aria-hidden /> : <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-ink" aria-hidden />}
          Reading the team…
        </p>
      </div>
    );
  }
  if (!d) return <p className="text-[12.5px] text-muted">Loading…</p>;

  const rows = shown(d.people, q, roleFilter, order);
  /* The role chips, in the order the business reads: the owner, then Susan,
     then the specialists, then everybody else - and only the ones somebody
     actually holds, so the bar does not offer a filter that finds nobody.
     "No account yet" is last because it is a state, not a role. */
  const held = ROLES.filter((r) => d.people.some((p) => p.hasAccount && p.role === r));
  const chips: { id: string; label: string; n: number }[] = [
    { id: "all", label: "Everyone", n: d.people.length },
    ...held.map((r) => ({ id: r, label: ROLE_LABEL[r], n: d.people.filter((p) => p.hasAccount && p.role === r).length })),
    { id: "none", label: "No account yet", n: d.people.filter((p) => !p.hasAccount).length },
  ];

  /* ── THE NEW LOOK (lib/new-look "admin", 23 Oct 2026) ─────────────────────
     The design's People: a type-only header, the cards on a white page, and
     everybody as rows on hairlines with their role and a reset beside them.
     Every control the list below has is here, calling the same functions. */
  if (look) {
    const roleTone = (r: string | null) => (r === "owner" ? "accent" : "neutral") as "accent" | "neutral";
    return (
      <div data-look="new" className="nl-page nl-rise nl-adm">
        <Mast title="People" blurb="Everyone in REX, joined to who's actually got in. Set their role, send a password reset, or see the OS as they do." />
        <PeopleTabsNew />

        <div className={`nl-adm-pcards${mayInvite ? "" : " is-one"}`}>
          {mayInvite && (
            <section className="nl-adm-card">
              <h2 className="nl-adm-card-title">Add a Person</h2>
              <p className="nl-meta">They get an email with a link to set their password. Invites have their own tab, with who&apos;s been asked and who&apos;s joined.</p>
              <div className="nl-adm-card-acts">
                <Link href="/admin/people/invites" className="nl-btn nl-btn--secondary nl-btn--sm">
                  <Ico name="mail" size={14} /> Go to Invites
                </Link>
              </div>
            </section>
          )}
          {/* Re-pull the TEG Team Hub. James fills bios and headshots in there by
              hand, so what's worth showing is how many are still blank. */}
          <section className="nl-adm-card">
            <h2 className="nl-adm-card-title">TEG Team Hub</h2>
            <p className="nl-meta">
              {tegNote ??
                `${d.people.filter((p) => p.partnerPackage).length} with a package · ${d.people.filter((p) => p.hasBio).length} with a bio, of ${d.people.length}`}
            </p>
            <div className="nl-adm-card-acts">
              <button type="button" onClick={pullTeg} disabled={busy === "teg"} className="nl-btn nl-btn--secondary nl-btn--sm">
                {busy === "teg" ? "Pulling…" : "Re-pull from TEG Hub"}
              </button>
            </div>
          </section>
        </div>

        {flash && (
          <p className="nl-adm-flash" role="status">
            {flash}
          </p>
        )}

        <section className="nl-adm-card nl-adm-everyone">
          <div className="nl-adm-card-head">
            <h2 className="nl-adm-card-title">
              Everyone <span className="nl-count">{d.people.length}</span>
            </h2>
            <div className="nl-filters nl-adm-find">
              <label className="nl-fsearch">
                <Ico name="search" size={15} />
                <input data-steve="people.search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find somebody by name or email" aria-label="Find somebody" />
              </label>
              <span className={`nl-fsel${order !== "recent" ? " is-set" : ""}`}>
                <select aria-label="Order" value={order} onChange={(e) => setOrder(e.target.value as "recent" | "stale" | "name")}>
                  <option value="recent">Signed in most recently</option>
                  <option value="stale">Longest since they signed in</option>
                  <option value="name">Name, A to Z</option>
                </select>
              </span>
            </div>
          </div>

          <div className="nl-tabs nl-adm-chips" role="tablist" aria-label="Role">
            {chips.map((c) => (
              <button key={c.id} type="button" role="tab" aria-selected={roleFilter === c.id} onClick={() => setRoleFilter(c.id)} className={`nl-tab${roleFilter === c.id ? " is-on" : ""}`}>
                {c.label}
                <span className="nl-tab-n">{c.n}</span>
              </button>
            ))}
          </div>
          <p className="nl-meta nl-adm-shown">
            {rows.length} of {d.people.length} · {d.summary.neverSignedIn} never signed in
          </p>

          {rows.length === 0 ? (
            <p className="nl-empty">Nobody matches that.</p>
          ) : (
            <ul className="nl-adm-people">
              {rows.map((p) => {
                const file = p.rexId || p.userId;
                return (
                  <li key={p.email}>
                    <div className="nl-adm-who">
                      <div className="nl-adm-who-line">
                        {file ? (
                          <Link href={`/admin/people/${file}`} className="nl-strong nl-adm-name">{p.name}</Link>
                        ) : (
                          <span className="nl-strong">{p.name}</span>
                        )}
                        {p.hasAccount && p.role && p.role !== "agent" && (
                          <Badge tone={roleTone(p.role)} bare>{ROLE_LABEL[p.role as keyof typeof ROLE_LABEL] ?? p.role}</Badge>
                        )}
                        {!p.hasAccount && <Badge tone="neutral" bare>Not invited</Badge>}
                        {p.hasAccount && !p.lastSeenAt && <Badge tone="warning" bare>Never signed in</Badge>}
                        {p.hasAccount && !p.hasPhoto && <Badge tone="neutral" bare>No headshot</Badge>}
                        {p.partnerPackage && <Badge tone="info" bare>{p.partnerPackage}</Badge>}
                        {!p.hasBio && <Badge tone="neutral" bare>No bio</Badge>}
                      </div>
                      <div className="nl-meta nl-adm-mail">
                        {p.email}
                        {p.rexId ? ` · REX ${p.rexId}` : " · not in REX"}
                        {p.hasAccount ? ` · last in ${when(p.lastSeenAt)}` : ""}
                      </div>
                    </div>
                    <div className="nl-adm-acts">
                      {/* The role, on every person - with an account or not. Somebody who
                          has not joined yet is who most needs it set. */}
                      <label className="nl-adm-role" title={ROLE_BLURB[(p.role ?? "agent") as keyof typeof ROLE_BLURB]}>
                        <span className="nl-meta">{p.hasAccount ? "Role" : "Joins as"}</span>
                        <span className="nl-fsel">
                          <select value={p.role ?? "agent"} disabled={busy !== null} onChange={(e) => setPersonRole(p, e.target.value)} aria-label={`${p.hasAccount ? "Role" : "Joins as"} for ${p.name}`}>
                            {ROLES.map((r) => (
                              <option key={r} value={r}>
                                {ROLE_LABEL[r]}
                              </option>
                            ))}
                          </select>
                        </span>
                      </label>
                      {mayManage && p.hasAccount && p.userId && (
                        <button type="button" disabled={busy !== null} onClick={() => sendReset(p.userId!)} className="nl-btn nl-btn--secondary nl-btn--sm">
                          Send Password Reset
                        </button>
                      )}
                      {/* Not for another owner: view-as refuses it. */}
                      {mayManage && p.role !== "owner" && (p.userId || p.rexId) && (
                        <button data-steve="people.view-as" type="button" disabled={busy !== null} onClick={() => viewAs(p)} className="nl-btn nl-btn--quiet nl-btn--sm">
                          {busy === (p.userId ?? p.rexId) ? "Opening…" : `View as ${p.name.split(" ")[0]}`}
                        </button>
                      )}
                      {file && (
                        <Link href={`/admin/people/${file}`} className="nl-btn nl-btn--quiet nl-btn--sm">
                          Open their file
                        </Link>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <p className="nl-meta nl-adm-foot">
          Resetting sends <em>them</em> a link - no password is ever set or shown here. Somebody who hasn&apos;t joined yet arrives as the role set beside their name.
        </p>
      </div>
    );
  }

  return (
    <>
      <PageHeader illustration="/illustrations/people/co-workers.svg" illustrationAspect={1.0} lineBreak="none" title="People" blurb="From REX, joined to who's actually got in." />
      <PeopleTabs />

      {/* Re-pull the TEG Team Hub. James fills bios and headshots in there by
          hand, so the useful thing to show is not "synced ok" but how many are
          still blank — that is the worklist, and it shrinks as he works. */}
      <div className="fade-up mt-6 flex flex-wrap items-center gap-3 rounded-[18px] border border-line/50 bg-white p-3.5">
        <button
          type="button"
          onClick={pullTeg}
          disabled={busy === "teg"}
          className="rounded-lg border border-line/80 px-3 py-1.5 text-[12px] transition-colors hover:border-ink/40 disabled:opacity-50"
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

      {/* ── Find one person, or one kind of person. ── */}
      <div className="fade-up mt-6 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <input data-steve="people.search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search a name or an email…"
            /* Full width on a phone, sharing the line with Order only when
               there is room for both: at 375px the two on one row squeezed
               the search box down to about sixty pixels. */
            className="w-full min-w-0 rounded-[18px] border border-line/50 bg-white px-3.5 py-2 text-[12.5px] sm:w-auto sm:flex-1"
          />
          <PickOne
            label="Order"
            value={order}
            onChange={(v) => setOrder((v ?? "recent") as "recent" | "stale" | "name")}
            clearable={false}
            options={[
              { id: "recent", label: "Signed in most recently" },
              { id: "stale", label: "Longest since they signed in" },
              { id: "name", label: "Name, A to Z" },
            ]}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {chips.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setRoleFilter(c.id)}
              className={`rounded-full px-3.5 py-1.5 text-[11.5px] font-semibold transition-colors ${
                roleFilter === c.id ? "bg-ink text-page" : "border border-line/80 text-muted hover:border-ink/40 hover:text-ink"
              }`}
            >
              {c.label}<span className="ml-1.5 opacity-70">{c.n}</span>
            </button>
          ))}
          <span className="ml-auto text-[11px] text-muted">
            {rows.length} of {d.people.length} · {d.summary.neverSignedIn} never signed in
          </span>
        </div>
      </div>

      {rows.length === 0 && (
        <p className="fade-up mt-6 rounded-2xl border border-dashed border-line/80 bg-white p-8 text-center text-[12.5px] text-muted">
          Nobody matches that.
        </p>
      )}

      <ul className="fade-up mt-8 space-y-2">
        {rows.map((p) => (
          <li key={p.email} className="rounded-[18px] border border-line/50 bg-white p-3.5 transition-colors hover:border-ink/40">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              {/* A file for EVERYBODY, addressed by REX id where there is one
                  and by their account id where there is not. Susan, Francesca,
                  Kirstie and Michael are not REX lettings agents, and until
                  10 Sep their names were plain text - the four people whose
                  screens most need checking were the four with no way in. */}
              {p.rexId || p.userId ? (
                <Link href={`/admin/people/${p.rexId || p.userId}`} className="text-[13.5px] underline">{p.name}</Link>
              ) : (
                <span className="text-[13.5px]">{p.name}</span>
              )}
              <span className="flex shrink-0 items-center gap-1.5">
                {p.hasAccount && p.role && p.role !== "agent" && (
                  <Pill tone={p.role === "owner" ? "accent" : "neutral"}>
                    {ROLE_LABEL[p.role as keyof typeof ROLE_LABEL] ?? p.role}
                  </Pill>
                )}
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
                className="rounded-lg border border-line/80 bg-white px-2.5 py-1.5 text-[11.5px] disabled:opacity-40"
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

            <div className="mt-2.5 flex flex-wrap gap-2">
              {(p.rexId || p.userId) && (
                <Link href={`/admin/people/${p.rexId || p.userId}`} className="rounded-lg border border-line/80 px-3 py-1.5 text-[11.5px]">
                  Open their file
                </Link>
              )}
              {/* Not for another owner: view-as refuses it, and a button that
                  answers 403 reads as a fault rather than as a boundary. */}
              {mayManage && p.role !== "owner" && (p.userId || p.rexId) && (
                <button data-steve="people.view-as"
                  type="button"
                  disabled={busy !== null}
                  onClick={() => viewAs(p)}
                  className="rounded-lg border border-line/80 px-3 py-1.5 text-[11.5px] disabled:opacity-40"
                >
                  {busy === (p.userId ?? p.rexId) ? "Opening…" : `View as ${p.name.split(" ")[0]}`}
                </button>
              )}
              {mayManage && p.hasAccount && p.userId && (
                <button type="button" disabled={busy !== null} onClick={() => sendReset(p.userId!)}
                  className="rounded-lg border border-line/80 px-3 py-1.5 text-[11.5px] disabled:opacity-40">
                  Send a reset link
                </button>
              )}
            </div>
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
