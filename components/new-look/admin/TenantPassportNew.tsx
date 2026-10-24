"use client";

import { Badge, Ico } from "@/components/new-look/Parts";
import { NlLoading } from "@/components/new-look/admin/ScreenBits";
import CopyLink from "@/app/(os)/admin/onboarding/CopyLink";

/**
 * Process > Tenant passport in the new look (lib/new-look "admin", 24 Oct
 * 2026): throwaway passports to demo with, on the real public URL, and why
 * real ones are never listed. Making and deleting are the page's own
 * (app/(os)/admin/tenant-passport).
 */

export type DemoPassport = { token: string; name: string; createdAt: string; submittedAt: string | null; filled: number };

export default function TenantPassportNew({
  rows,
  db,
  busy,
  error,
  make,
  remove,
  when,
}: {
  rows: DemoPassport[] | null;
  db: boolean;
  busy: boolean;
  error: string | null;
  make: () => void;
  remove: (token: string) => void;
  when: (iso: string) => string;
}) {
  return (
    <div data-look="new" className="nl-page nl-rise nl-adm nl-adm-tab">
      <p className="nl-adm-lead">The form a tenant fills in once and reuses. Make a throwaway to show somebody, or to send them.</p>

      <section className="nl-adm-card">
        <div className="nl-adm-card-head is-flat">
          <div className="nl-adm-grow">
            <h2 className="nl-adm-card-title">Make One to Demo With</h2>
            <p className="nl-meta nl-adm-measure">Creates an empty passport for a made-up person, on the real public URL. You can open it, type in it, send it to somebody, and delete it after. It belongs to nobody, so nothing you do to it matters.</p>
          </div>
          <button type="button" onClick={make} disabled={busy || !db} className="nl-btn nl-btn--primary">
            <Ico name="plus" size={15} /> {busy ? "Making…" : "New Demo Passport"}
          </button>
        </div>
        {error && (
          <p className="nl-adm-flash is-bad" role="alert">
            {error}
          </p>
        )}
        {!db && <p className="nl-adm-note">There is no database on this environment, so one cannot be made here.</p>}
      </section>

      <section className="nl-adm-block">
        <div className="nl-adm-block-head">
          <h2 className="nl-section-title">
            Your Demo Passports {rows && rows.length > 0 && <span className="nl-count">{rows.length}</span>}
          </h2>
        </div>
        {rows === null ? (
          <NlLoading what="Looking" />
        ) : rows.length === 0 ? (
          <p className="nl-empty">None yet. Make one above and it will appear here with its link.</p>
        ) : (
          <ul className="nl-adm-people">
            {rows.map((p) => (
              <li key={p.token}>
                <div className="nl-adm-who">
                  <div className="nl-adm-who-line">
                    <span className="nl-strong">{p.name || "Sample Tenant"}</span>
                    <span className="nl-meta">made {when(p.createdAt)}</span>
                    {p.submittedAt ? (
                      <Badge tone="good" bare>Submitted</Badge>
                    ) : p.filled > 0 ? (
                      <Badge tone="neutral" bare>{`${p.filled} fields filled in`}</Badge>
                    ) : (
                      <Badge tone="neutral" bare>Blank</Badge>
                    )}
                  </div>
                  <CopyLink path={`/tenant/passport/${p.token}`} />
                </div>
                <button type="button" onClick={() => remove(p.token)} className="nl-btn nl-btn--quiet nl-btn--sm">
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="nl-adm-block">
        <h2 className="nl-section-title">Why Real Tenants Are Not Listed Here</h2>
        <ul className="nl-adm-bullets">
          <li>
            <b>The link is the login.</b> Anyone holding one can read and change that passport: income, savings, adverse credit, guarantor, and the right-to-rent share code, which works against gov.uk.
          </li>
          <li>On a screen-share, a link in the address bar can be copied down by anyone watching, and it does not expire.</li>
          <li>The form saves as you type. Typing into a real passport to show somebody how it works would overwrite that person&apos;s answers.</li>
          <li>So this page can only ever see throwaways. That is enforced in the query, not in a setting somebody can change.</li>
        </ul>
      </section>
    </div>
  );
}
