"use client";

import Link from "next/link";
import { Badge } from "@/components/new-look/Parts";

/**
 * Permissions in the new look (lib/new-look "admin", 24 Oct 2026): the map,
 * not the controls. What each role means, in full, and who holds it.
 *
 * Changing a role happens on People only (James, 24 Oct 2026: one place for
 * each job). Every holder here has a way to their file, and for somebody
 * who may hand out roles, a link to People with that person already found.
 */

type RoleDef = { id: string; label: string; blurb: string; can: string[] };
type Holder = { id: string; email: string; name: string; role: string; lastSeenAt: string | null };

export default function PermissionsNew({
  d,
  capLabel,
  noScreenYet,
}: {
  d: { roles: RoleDef[]; people: Holder[]; mayEdit?: boolean };
  capLabel: (c: string) => string;
  noScreenYet: Set<string>;
}) {
  const known = new Set(d.roles.map((r) => r.id));
  const stray = d.people.filter((p) => !known.has(p.role));

  return (
    <div data-look="new" className="nl-page nl-rise nl-adm nl-adm-tab">
      <p className="nl-adm-lead">
        What each role means, and who holds it.{" "}
        {d.mayEdit ? (
          <>
            Roles are changed on{" "}
            <Link href="/admin/people" className="nl-link">
              People
            </Link>
            , beside each person.
          </>
        ) : (
          "Handing out roles stays with the owner, so nobody can quietly promote themselves. Ask James if something here needs changing."
        )}
      </p>

      <ul className="nl-adm-roles">
        {d.roles.map((r) => {
          const holders = d.people.filter((p) => p.role === r.id);
          return (
            <li key={r.id}>
              <div className="nl-adm-roles-head">
                <h2 className="nl-block-title">{r.label}</h2>
                <Badge tone="neutral" plain bare>
                  {holders.length === 0 ? "Nobody holds it" : holders.length === 1 ? "1 person" : `${holders.length} people`}
                </Badge>
              </div>
              <p>{r.blurb}</p>
              {noScreenYet.has(r.id) && (
                <p className="nl-adm-note is-care">
                  <span className="nl-strong">Don&apos;t hand this out yet.</span> The capabilities work, but the screens they open still live in your admin area, which nobody else can reach. Lift them out first.
                </p>
              )}
              <div className="nl-adm-caps">
                {r.can.length === 0 ? (
                  <span className="nl-meta">Their own book only.</span>
                ) : (
                  r.can.map((c) => (
                    <Badge key={c} tone="neutral" plain>
                      {capLabel(c)}
                    </Badge>
                  ))
                )}
              </div>
              {holders.length > 0 && (
                <ul className="nl-adm-holders">
                  {holders.map((p) => (
                    <li key={p.id}>
                      <span>
                        <Link href={`/admin/people/${p.id}`} className="nl-adm-name">
                          {p.name}
                        </Link>
                        <span className="nl-meta"> · {p.email}</span>
                      </span>
                      {d.mayEdit && (
                        <Link href={`/admin/people?q=${encodeURIComponent(p.email)}`} className="nl-link">
                          Change on People
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
        {stray.length > 0 && (
          <li>
            <div className="nl-adm-roles-head">
              <h2 className="nl-block-title">A Role This List Doesn&apos;t Know</h2>
            </div>
            <ul className="nl-adm-holders">
              {stray.map((p) => (
                <li key={p.id}>
                  <span>
                    <Link href={`/admin/people/${p.id}`} className="nl-adm-name">
                      {p.name}
                    </Link>
                    <span className="nl-meta">
                      {" "}
                      · {p.email} · {p.role}
                    </span>
                  </span>
                  {d.mayEdit && (
                    <Link href={`/admin/people?q=${encodeURIComponent(p.email)}`} className="nl-link">
                      Change on People
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </li>
        )}
      </ul>

      {d.mayEdit && (
        <p className="nl-meta nl-adm-foot">
          The last owner can&apos;t be demoted, and you can&apos;t remove your own owner role - a permissions screen whose worst outcome is &ldquo;nobody can administer this any more&rdquo; is a trap, not a feature.
        </p>
      )}
    </div>
  );
}
