"use client";

import Link from "next/link";
import { Badge, Ico } from "@/components/new-look/Parts";
import { NlFig, NlLoading } from "@/components/new-look/admin/ScreenBits";
import { ROLE_LABEL } from "@/lib/roles";
import { when } from "@/lib/admin-client";

/**
 * One person's file in the new look (lib/new-look "admin", 24 Oct 2026). The
 * frame gives the way back to People; this is the person, what they've
 * opened, and their book. Every press is the page's own (app/(os)/admin/
 * people/[who]): view as, lock out, let back in.
 *
 * The role is shown, not changed, here: roles are changed on People, in one
 * place, and the link goes there with them already found.
 */

export type Counted = { total: number | null; failed: boolean };
export type PersonData = {
  person: { rexId: string | null; name: string; email: string; photo: string | null; position: string | null; phone: string | null; onRex: boolean };
  account: {
    id: string;
    role: string;
    hasPhoto: boolean;
    createdAt: string;
    rexUserId: string | null;
    lastSeenAt: string | null;
    lock: { locked: boolean; lockedAt: string | null; lockedBy: string | null; reason: string } | null;
  } | null;
  book: {
    listings: Counted;
    onMarket: Counted;
    managed: Counted;
    properties: Counted;
    contacts: Counted;
    leads: Counted;
    appraisals: Counted;
    applications: Counted;
    recentListings: Array<{ id: string; address: string; status: string | null; rent: number | null }>;
    pulledAt: string;
  } | null;
  audit: Array<{ id: string; kind: string; at: string }>;
};
export type Reading = {
  openedHour: number;
  openedDay: number;
  openedWeek: number;
  callsWeek: number;
  afterHoursWeek: number;
  flags: string[];
  recent: Array<{ at: string; method: string; path: string; query: string; ip: string }>;
};

const n = (v: number) => v.toLocaleString("en-GB");

function BookFig({ label, c }: { label: string; c: Counted }) {
  /* A failed pull says so. It must never read as nought. */
  return <NlFig label={label} value={c.failed ? <span className="nl-adm-bad nl-adm-small">Couldn&apos;t load</span> : n(c.total ?? 0)} />;
}

export default function PersonFileNew(props: {
  d: PersonData;
  busy: boolean;
  viewAs: () => void;
  lockOpen: boolean;
  setLockOpen: (v: boolean) => void;
  reason: string;
  setReason: (v: string) => void;
  lockBusy: boolean;
  lockErr: string | null;
  clearLockErr: () => void;
  setLock: (action: "lock" | "unlock") => void;
  reading: Reading | null;
  readingErr: string | null;
  showAll: boolean;
  setShowAll: (v: boolean) => void;
}) {
  const { d, reading, readingErr, lockOpen, lockBusy, lockErr } = props;
  const p = d.person;
  const first = p.name.split(" ")[0];
  const lock = d.account?.lock ?? null;
  const canLock = Boolean(d.account && d.account.role !== "owner");
  const initials = p.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  return (
    <div data-look="new" className="nl-page nl-rise nl-adm nl-adm-p-tab">
      <header className="nl-adm-phead">
        <span className="nl-avatar" aria-hidden>
          {p.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.photo} alt="" />
          ) : (
            initials
          )}
        </span>
        <div className="nl-adm-phead-text">
          <h2 className="nl-section-title">{p.name}</h2>
          <p className="nl-meta nl-adm-mail">
            {p.email}
            {p.rexId ? ` · REX ${p.rexId}` : " · not in REX"}
            {p.position ? ` · ${p.position}` : ""}
            {p.phone ? ` · ${p.phone}` : ""}
          </p>
          <div className="nl-adm-who-line">
            {d.account ? (
              <>
                <Badge tone={d.account.role === "owner" ? "accent" : "neutral"} bare>
                  {ROLE_LABEL[d.account.role as keyof typeof ROLE_LABEL] ?? d.account.role}
                </Badge>
                {d.account.lastSeenAt ? <span className="nl-meta">Last in {when(d.account.lastSeenAt)}</span> : <Badge tone="warning" bare>Never signed in</Badge>}
                {!d.account.hasPhoto && <Badge tone="neutral" bare>No headshot</Badge>}
                {!d.account.rexUserId && <Badge tone="neutral" bare>Not linked to REX</Badge>}
                {lock?.locked && <Badge tone="accent" bare>Locked out</Badge>}
                <Link href={`/admin/people?q=${encodeURIComponent(p.email)}`} className="nl-link">
                  Change role on People
                </Link>
              </>
            ) : (
              <>
                <Badge tone="neutral" bare>No account yet</Badge>
                <Link href="/admin/people/invites" className="nl-link">
                  Invite on Invites
                </Link>
              </>
            )}
          </div>
        </div>
        <div className="nl-adm-phead-acts">
          {d.account?.role !== "owner" && (
            <button type="button" onClick={props.viewAs} disabled={props.busy} className="nl-btn nl-btn--primary">
              {props.busy ? "Opening…" : `View as ${first}`}
            </button>
          )}
          {canLock && !lock?.locked && !lockOpen && (
            <button type="button" onClick={() => props.setLockOpen(true)} className="nl-btn nl-btn--secondary">
              <Ico name="lock" size={14} /> Lock Out
            </button>
          )}
        </div>
      </header>

      {/* Lock out (lib/lockout): said plainly before it happens, and how to undo it. */}
      {lockOpen && !lock?.locked && (
        <section className="nl-adm-flash is-warn is-head">
          <h3 className="nl-block-title">Lock {first} Out of TLE OS?</h3>
          <p>
            Every session {first} has open ends within half a minute, on every device, and signing in tells them their access is paused. Their account, their work and their history stay exactly as they are, and you can let them back in at any time.
          </p>
          <label className="nl-field nl-adm-reason">
            <span>Why (kept in the activity log, not shown to {first})</span>
            <textarea value={props.reason} onChange={(e) => props.setReason(e.target.value)} maxLength={500} rows={2} />
          </label>
          {lockErr && (
            <p className="nl-adm-bad" role="alert">
              {lockErr}
            </p>
          )}
          <div className="nl-adm-card-acts">
            <button type="button" onClick={() => props.setLock("lock")} disabled={lockBusy} className="nl-btn nl-btn--danger nl-btn--sm">
              {lockBusy ? "Locking…" : `Lock ${first} Out Now`}
            </button>
            <button
              type="button"
              onClick={() => {
                props.setLockOpen(false);
                props.clearLockErr();
              }}
              disabled={lockBusy}
              className="nl-btn nl-btn--secondary nl-btn--sm"
            >
              Cancel
            </button>
          </div>
        </section>
      )}

      {lock?.locked && (
        <section className="nl-adm-flash is-warn is-head">
          <h3 className="nl-block-title">{first} Is Locked Out</h3>
          <p>
            Since {when(lock.lockedAt)}
            {lock.lockedBy ? `, by ${lock.lockedBy}` : ""}. Nothing they had open works, and signing in tells them their access is paused.
            {lock.reason ? <span className="nl-adm-muted"> Reason: {lock.reason}</span> : null}
          </p>
          {lockErr && (
            <p className="nl-adm-bad" role="alert">
              {lockErr}
            </p>
          )}
          <div className="nl-adm-card-acts">
            <button type="button" onClick={() => props.setLock("unlock")} disabled={lockBusy} className="nl-btn nl-btn--sage nl-btn--sm">
              {lockBusy ? "Letting them in…" : `Let ${first} Back In`}
            </button>
          </div>
        </section>
      )}

      {/* What they have opened (lib/read-log): the counts first, then the list, newest first. */}
      {d.account && (
        <section className="nl-adm-block is-first">
          <div className="nl-adm-block-head">
            <h2 className="nl-section-title">What {first} Has Opened</h2>
          </div>
          {readingErr ? (
            <p className="nl-adm-flash is-bad is-first" role="alert">
              {readingErr}
            </p>
          ) : !reading ? (
            <NlLoading what="Reading the log" />
          ) : (
            <>
              <ul className="nl-adm-p-figs">
                <NlFig label="Last hour" value={n(reading.openedHour)} />
                <NlFig label="Last 24 hours" value={n(reading.openedDay)} />
                <NlFig label="Last 7 days" value={n(reading.openedWeek)} />
                <NlFig label="10pm-6am, 7 days" value={n(reading.afterHoursWeek)} />
              </ul>
              {reading.flags.length > 0 && <p className="nl-adm-flash is-warn">More than usual: {reading.flags.join(", ")}.</p>}
              {reading.recent.length === 0 ? (
                <p className="nl-empty">Nothing opened since the log started on 10 October 2026.</p>
              ) : (
                <ul className="nl-adm-log nl-adm-p-after">
                  {(props.showAll ? reading.recent : reading.recent.slice(0, 40)).map((r, i) => (
                    <li key={`${r.at}-${i}`}>
                      <span className="nl-mono">{when(r.at)}</span>
                      <span className="min-w-0 flex-1">
                        {r.method !== "GET" && <span className="nl-adm-bad">{r.method} </span>}
                        {r.path.replace(/^\/api\//, "")}
                        {r.query && <span className="nl-adm-muted">?{r.query}</span>}
                      </span>
                      <span className="nl-mono">{r.ip}</span>
                    </li>
                  ))}
                </ul>
              )}
              {!props.showAll && reading.recent.length > 40 && (
                <p className="nl-adm-p-after">
                  <button type="button" onClick={() => props.setShowAll(true)} className="nl-link">
                    Show the last {reading.recent.length}
                  </button>
                </p>
              )}
              <p className="nl-meta nl-adm-foot">
                Counts are the different things opened, not every call: one screen makes several. Everything {first} opens is recorded from 10 October 2026 and kept for a year. The bell, chats and other calls an open screen makes by itself are left out.
              </p>
            </>
          )}
        </section>
      )}

      {!d.book ? (
        /* No REX record, so there is no book to count. Said in a sentence,
           because eight zeros would read as "this person does nothing". */
        <section className={`nl-adm-block${d.account ? "" : " is-first"}`}>
          <p className="nl-empty">
            {first} isn&apos;t a REX lettings agent, so there is no book of listings, leads or appraisals to show. Their work lives on their own screens - press View as to see exactly what they see.
          </p>
        </section>
      ) : (
        <>
          <section className={`nl-adm-block${d.account ? "" : " is-first"}`}>
            <div className="nl-adm-block-head">
              <h2 className="nl-section-title">Their Book</h2>
              <span className="nl-meta">Live from REX</span>
            </div>
            <ul className="nl-adm-p-figs">
              <BookFig label="On the market" c={d.book.onMarket} />
              <BookFig label="Let and managed" c={d.book.managed} />
              <BookFig label="Listings, all time" c={d.book.listings} />
              <BookFig label="Properties" c={d.book.properties} />
              <BookFig label="Leads assigned" c={d.book.leads} />
              <BookFig label="Appraisals" c={d.book.appraisals} />
              <BookFig label="Applications" c={d.book.applications} />
              <BookFig label="Contacts" c={d.book.contacts} />
            </ul>
          </section>

          <section className="nl-adm-block">
            <div className="nl-adm-block-head">
              <h2 className="nl-section-title">Their Most Recent Listings</h2>
            </div>
            {d.book.recentListings.length === 0 ? (
              <p className="nl-empty">Nothing came back.</p>
            ) : (
              <ul className="nl-adm-log">
                {d.book.recentListings.map((l) => (
                  <li key={l.id}>
                    <span className="min-w-0 flex-1">{l.address}</span>
                    <span className="nl-meta">
                      {l.status ?? "-"}
                      {l.rent ? ` · £${l.rent.toLocaleString("en-GB")}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <ul className="nl-adm-bullets">
              <li>Listings match on owner or selling agent, leads on who they&apos;re assigned to, appraisals on agent 1, applications on the application&apos;s agent.</li>
              <li>
                <b>Viewings aren&apos;t here on purpose.</b> REX calendar events carry no owning agent, so a per-person figure can&apos;t be produced. Business-wide only.
              </li>
              <li>These are everything this person touches in REX, which is shared across six businesses. A partner who also sells for The Property Experts will show that work here too.</li>
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
