"use client";

import { Badge, Ico, type Tone } from "@/components/new-look/Parts";
import { Loading, Problem } from "@/components/new-look/admin/content-bits";
import { Reader, type EmailCatalogue, type Row } from "@/components/admin/EmailCatalogue";

/**
 * Admin > Emails > Every email in the new look (lib/new-look "admin",
 * 24 Oct 2026). The same catalogue as the old screen and Marketing's Email
 * templates (components/admin/EmailCatalogue): rows on hairlines, grouped as
 * before, opening the same Reader (preview, edit in the builder, send it to
 * me, details). Send it to me answers owners only, so only owners are offered it.
 */

const AUDIENCE: Record<Row["audience"], { label: string; tone: Tone }> = {
  partner: { label: "Partner", tone: "accent" },
  landlord: { label: "Landlord", tone: "good" },
  tenant: { label: "Tenant", tone: "info" },
  contractor: { label: "Contractor", tone: "warning" },
  internal: { label: "Internal", tone: "neutral" },
};

export default function EmailsNew({ cat }: { cat: EmailCatalogue }) {
  const { rows, state, open, setOpen, editNow, setEditNow, groups, read, role } = cat;

  if (state === "off") {
    return (
      <div data-look="new" className="nl-page nl-adm nl-adm-screen">
        <p className="nl-empty">The email catalogue is for owners and marketing. Ask James if you should have it.</p>
      </div>
    );
  }

  const drafts = rows.filter((r) => r.draft).length;
  const editable = rows.filter((r) => r.editable).length;

  return (
    <>
      <div data-look="new" className="nl-page nl-rise nl-adm nl-adm-screen">
        <p className="nl-meta nl-adm-c-lede">
          Every email the OS sends, as the person receiving it will see it. Open one to read it full size.
          {state === "ready" && rows.length > 0 ? ` ${rows.length} emails, ${editable} editable in the builder${drafts ? `, ${drafts} not wired up yet` : ""}.` : ""}
        </p>

        {state === "error" && <Problem onRetry={read}>We couldn&apos;t read the catalogue just now.</Problem>}
        {state === "loading" && <Loading label="Reading the catalogue…" />}
        {state === "ready" && rows.length === 0 && <p className="nl-empty">No emails in the catalogue.</p>}

        {state === "ready" && rows.length > 0 && (
          <div className="nl-adm-stack">
            {groups.map((g) => {
              const list = rows.filter((r) => r.group === g);
              return (
                <section key={g} className="nl-adm-card">
                  <h2 className="nl-adm-h">
                    {g} <span className="nl-count">{list.length}</span>
                  </h2>
                  <ul className="nl-adm-c-rows is-ruled mt-3">
                    {list.map((r) => (
                      <li key={r.id}>
                        <button type="button" onClick={() => { setEditNow(false); setOpen(r); }} className="nl-adm-c-open nl-adm-c-row-main">
                          <span className="nl-adm-c-row-line">
                            <span className="nl-strong">{r.name}</span>
                            <Badge tone={AUDIENCE[r.audience].tone} bare>{AUDIENCE[r.audience].label}</Badge>
                            {/* Said on the list, not just inside: an email with no
                                send path behind it must not look finished. */}
                            {r.draft && <Badge tone="warning" bare>Not wired up</Badge>}
                          </span>
                          <span className="nl-meta block nl-adm-clamp">{r.summary}</span>
                        </button>
                        <div className="nl-adm-c-row-acts">
                          <button type="button" onClick={() => { setEditNow(false); setOpen(r); }} className="nl-btn nl-btn--quiet nl-btn--sm">
                            Read It
                          </button>
                          {r.editable ? (
                            <button type="button" onClick={() => { setEditNow(true); setOpen(r); }} className="nl-btn nl-btn--secondary nl-btn--sm">
                              <Ico name="pen" size={13} /> Edit
                            </button>
                          ) : (
                            <span className="nl-meta nl-adm-readonly" title="Written by hand rather than in blocks, so the builder cannot open it yet">
                              Read only
                            </span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </div>

      {open && <Reader row={open} startEditing={editNow} onClose={() => setOpen(null)} fresh mayTest={role === "owner"} />}
    </>
  );
}
