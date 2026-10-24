"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge, Ico } from "@/components/new-look/Parts";
import { when, type AdminData, type Person } from "@/lib/admin-client";
import { ROLES, ROLE_BLURB, ROLE_LABEL } from "@/lib/roles";

/**
 * People in the new look (lib/new-look "admin", 24 Oct 2026). The frame draws
 * the area, the title and the tabs, so this starts with the people.
 *
 * Two jobs moved off it, so each happens in one place (James, 24 Oct 2026):
 *
 *   - Inviting is the Invites tab's. Somebody without an account shows as
 *     Not invited or Invited, and the badge goes there; the role they join as
 *     is set on Invites too, with the invite it belongs to.
 *   - Changing a role is this page's. Permissions only reads the map now and
 *     sends anybody wanting a change back here.
 *
 * Password reset and view-as stay here, on the person.
 */

type Order = "recent" | "stale" | "name";
type Chip = { id: string; label: string; n: number };
type Invite = { sentAt: string | null; linkExpiresAt: string | null };

/** Who has had an invite, from the Invites tab's own list. Null while it loads, "error" if it didn't. */
function useInvites(enabled: boolean): Map<string, Invite> | null | "error" | "off" {
  const [m, setM] = useState<Map<string, Invite> | null | "error" | "off">(enabled ? null : "off");
  useEffect(() => {
    if (!enabled) {
      setM("off");
      return;
    }
    let gone = false;
    fetch("/api/admin/launch", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { ok?: boolean; toInvite?: Array<{ email: string; emails?: string[]; sentAt: string | null; linkExpiresAt: string | null }> }) => {
        if (gone) return;
        if (!j.ok || !j.toInvite) throw new Error("no");
        const map = new Map<string, Invite>();
        for (const p of j.toInvite) {
          for (const e of [p.email, ...(p.emails ?? [])]) map.set(e.toLowerCase(), { sentAt: p.sentAt, linkExpiresAt: p.linkExpiresAt });
        }
        setM(map);
      })
      .catch(() => !gone && setM("error"));
    return () => {
      gone = true;
    };
  }, [enabled]);
  return m;
}

export default function PeopleNew(props: {
  d: AdminData;
  rows: Person[];
  chips: Chip[];
  q: string;
  setQ: (v: string) => void;
  roleFilter: string;
  setRoleFilter: (v: string) => void;
  order: Order;
  setOrder: (v: Order) => void;
  busy: string | null;
  flash: string | null;
  tegNote: string | null;
  mayManage: boolean;
  mayInvite: boolean;
  pullTeg: () => void;
  setPersonRole: (p: Person, role: string) => void;
  viewAs: (p: Person) => void;
  sendReset: (userId: string) => void;
}) {
  const { d, rows, chips, q, setQ, roleFilter, setRoleFilter, order, setOrder, busy, flash, tegNote, mayManage, mayInvite } = props;
  const invites = useInvites(mayInvite);
  const roleTone = (r: string | null) => (r === "owner" ? "accent" : "neutral") as "accent" | "neutral";

  /** The invite state of somebody with no account, as a badge that goes to Invites. */
  const inviteBadge = (p: Person) => {
    let badge: React.ReactNode;
    if (invites === "off" || invites === "error" || invites === null) {
      badge = (
        <Badge tone="neutral" bare title={invites === "error" ? "The invite list couldn't be read just now" : undefined}>
          {invites === null ? "No account" : "No account yet"}
        </Badge>
      );
    } else {
      const inv = invites.get(p.email.toLowerCase());
      const live = inv?.linkExpiresAt && Date.parse(inv.linkExpiresAt) > Date.now();
      badge = inv?.sentAt ? (
        <Badge tone={live ? "good" : "warning"} bare title={`Invite sent ${when(inv.sentAt)}`}>
          {live ? "Invited" : "Invited, link expired"}
        </Badge>
      ) : (
        <Badge tone="neutral" bare>Not invited</Badge>
      );
    }
    return mayInvite ? (
      <Link href="/admin/people/invites" className="nl-adm-name" title="Invite, resend or set the role they join as on Invites">
        {badge}
      </Link>
    ) : (
      badge
    );
  };

  return (
    <div data-look="new" className="nl-page nl-rise nl-adm nl-adm-p-tab">
      <p className="nl-adm-lead">Everyone in REX, joined to who has an account. Change a role, send a password reset, or see the OS as they do.</p>

      {/* Re-pull the TEG Team Hub. James fills bios and headshots in there by
          hand, so what's worth showing is how many are still blank. */}
      <section className="nl-adm-card">
        <div className="nl-adm-card-head is-flat">
          <div className="min-w-0">
            <h2 className="nl-adm-card-title">TEG Team Hub</h2>
            <p className="nl-meta">
              {tegNote ?? `${d.people.filter((p) => p.partnerPackage).length} with a package · ${d.people.filter((p) => p.hasBio).length} with a bio, of ${d.people.length}`}
            </p>
          </div>
          <button type="button" onClick={props.pullTeg} disabled={busy === "teg"} className="nl-btn nl-btn--secondary nl-btn--sm">
            {busy === "teg" ? "Pulling…" : "Re-pull from TEG Hub"}
          </button>
        </div>
      </section>

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
              <select aria-label="Order" value={order} onChange={(e) => setOrder(e.target.value as Order)}>
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
                        <Link href={`/admin/people/${file}`} className="nl-strong nl-adm-name">
                          {p.name}
                        </Link>
                      ) : (
                        <span className="nl-strong">{p.name}</span>
                      )}
                      {p.hasAccount && p.role && p.role !== "agent" && (
                        <Badge tone={roleTone(p.role)} bare>
                          {ROLE_LABEL[p.role as keyof typeof ROLE_LABEL] ?? p.role}
                        </Badge>
                      )}
                      {!p.hasAccount && inviteBadge(p)}
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
                    {/* The role, for everybody with an account. The role somebody
                        joins as belongs to their invite, on Invites. */}
                    {p.hasAccount && (
                      <label className="nl-adm-role" title={ROLE_BLURB[(p.role ?? "agent") as keyof typeof ROLE_BLURB]}>
                        <span className="nl-meta">Role</span>
                        <span className="nl-fsel">
                          <select value={p.role ?? "agent"} disabled={busy !== null} onChange={(e) => props.setPersonRole(p, e.target.value)} aria-label={`Role for ${p.name}`}>
                            {ROLES.map((r) => (
                              <option key={r} value={r}>
                                {ROLE_LABEL[r]}
                              </option>
                            ))}
                          </select>
                        </span>
                      </label>
                    )}
                    {mayManage && p.hasAccount && p.userId && (
                      <button type="button" disabled={busy !== null} onClick={() => props.sendReset(p.userId!)} className="nl-btn nl-btn--secondary nl-btn--sm">
                        Send Password Reset
                      </button>
                    )}
                    {/* Not for another owner: view-as refuses it. */}
                    {mayManage && p.role !== "owner" && (p.userId || p.rexId) && (
                      <button data-steve="people.view-as" type="button" disabled={busy !== null} onClick={() => props.viewAs(p)} className="nl-btn nl-btn--quiet nl-btn--sm">
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
        Resetting sends <em>them</em> a link - no password is ever set or shown here. Somebody without an account is invited, and given the role they join as, on{" "}
        {mayInvite ? (
          <Link href="/admin/people/invites" className="nl-link">
            Invites
          </Link>
        ) : (
          "Invites"
        )}
        .
      </p>
    </div>
  );
}
