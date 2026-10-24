"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { Pill } from "@/components/Wire";
import { ROLE_LABEL } from "@/lib/roles";
import { when } from "@/lib/admin-client";
import { useNewLook } from "@/lib/use-new-look";
import PersonFileNew from "@/components/new-look/admin/PersonFileNew";
import { LookLoading } from "@/components/new-look/admin/ScreenBits";

/**
 * One person's file.
 *
 * The counts come from REX by their user id, which is what makes this real
 * rather than decorative: 83 listings under Rhiannon is a fact about her book,
 * not a number on a card.
 *
 * A failed pull says so. It must never render as 0 — "this agent has no
 * properties" is a very different and much more alarming statement than "we
 * could not reach REX", and an owner would act on the first one.
 *
 * ── Everybody has a file now (10 Sep 2026) ───────────────────────────────
 *
 * The route takes a REX id OR an OS account id. Susan, Francesca, Kirstie and
 * Michael are not REX lettings agents, so under the old REX-only address they
 * had no file at all — which meant the four people whose screens most need
 * checking were the four an owner could not open or view as. Where there is
 * no REX record there is no book, and the page says that in a sentence rather
 * than drawing eight zeros.
 */

type Counted = { total: number | null; failed: boolean };
type Data = {
  person: { rexId: string | null; name: string; email: string; photo: string | null; position: string | null; phone: string | null; onRex: boolean };
  account: {
    id: string; role: string; hasPhoto: boolean; createdAt: string; rexUserId: string | null; lastSeenAt: string | null;
    lock: { locked: boolean; lockedAt: string | null; lockedBy: string | null; reason: string } | null;
  } | null;
  book: {
    listings: Counted; onMarket: Counted; managed: Counted;
    properties: Counted; contacts: Counted; leads: Counted;
    appraisals: Counted; applications: Counted;
    recentListings: Array<{ id: string; address: string; status: string | null; rent: number | null }>;
    pulledAt: string;
  } | null;
  audit: Array<{ id: string; kind: string; at: string }>;
};

type Reading = {
  openedHour: number; openedDay: number; openedWeek: number; callsWeek: number; afterHoursWeek: number;
  flags: string[];
  recent: Array<{ at: string; method: string; path: string; query: string; ip: string }>;
};

function Figure({ label, n }: { label: string; n: number }) {
  return (
    <div className="rounded-[22px] border border-line/50 bg-white p-4">
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted">{label}</p>
      <p className="figures mt-1.5 text-[24px] leading-none">{n.toLocaleString("en-GB")}</p>
    </div>
  );
}

function Count({ label, c }: { label: string; c: Counted }) {
  return (
    <div className="rounded-[22px] border border-line/50 bg-white p-4">
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted">{label}</p>
      {c.failed ? (
        <p className="mt-1.5 text-[12px] leading-snug text-accent-dark">Couldn&apos;t load</p>
      ) : (
        <p className="figures mt-1.5 text-[24px] leading-none">{c.total?.toLocaleString("en-GB")}</p>
      )}
    </div>
  );
}

export default function PersonPage({ params }: { params: Promise<{ who: string }> }) {
  const { who } = use(params);
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /* Locking out (lib/lockout): a confirm step, then the press. */
  const [lockOpen, setLockOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [lockBusy, setLockBusy] = useState(false);
  const [lockErr, setLockErr] = useState<string | null>(null);
  /* What they have opened (lib/read-log). null while loading. */
  const [reading, setReading] = useState<Reading | null>(null);
  const [readingErr, setReadingErr] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  /* The new look (lib/new-look "admin", 24 Oct 2026). Null until known. */
  const look = useNewLook("admin");

  useEffect(() => {
    fetch(`/api/admin/person/${who}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(setD)
      .catch(() => setErr("Couldn't load that person."));
  }, [who]);

  const accountId = d?.account?.id ?? null;
  useEffect(() => {
    if (!accountId) return;
    fetch(`/api/admin/reading?user=${encodeURIComponent(accountId)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; reading?: Reading; error?: string }) => {
        if (!j.ok || !j.reading) throw new Error(j.error ?? "We couldn't read the log just now.");
        setReading(j.reading);
      })
      .catch((e) => setReadingErr(e instanceof Error ? e.message : "We couldn't read the log just now."));
  }, [accountId]);

  async function setLock(action: "lock" | "unlock") {
    if (!d?.account) return;
    setLockBusy(true);
    setLockErr(null);
    try {
      const r = await fetch("/api/admin/lock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: d.account.id, action, reason }),
      });
      const j = (await r.json()) as { ok?: boolean; error?: string; lock?: NonNullable<Data["account"]>["lock"] };
      if (!j.ok) throw new Error(j.error ?? "That didn't work.");
      setD({ ...d, account: { ...d.account, lock: j.lock ?? null } });
      setLockOpen(false);
      setReason("");
    } catch (e) {
      setLockErr(e instanceof Error ? e.message : "That didn't work.");
    } finally {
      setLockBusy(false);
    }
  }

  /* Works whether or not they have an OS account. Most of the team has not
     been invited yet, and the people worth testing as are exactly those. */
  async function viewAs() {
    if (!d) return;
    setBusy(true);
    const r = await fetch("/api/admin/view-as", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        d.account ? { userId: d.account.id } : { rexUserId: d.person.rexId }
      ),
    });
    const j = (await r.json()) as { ok?: boolean; error?: string };
    setBusy(false);
    if (j.ok) window.location.href = "/dashboard";
    else setErr(j.error ?? "That didn't work.");
  }

  if (look === null) return <LookLoading what="Loading their file" />;
  if (look && (err || !d)) {
    return (
      <div data-look="new" className="nl-page nl-adm nl-adm-p-tab">
        {err ? (
          <p className="nl-adm-flash is-bad is-first" role="alert">
            {err}
          </p>
        ) : (
          <p className="nl-adm-loading" role="status">
            <span className="nl-adm-spin" aria-hidden /> Loading their book…
          </p>
        )}
      </div>
    );
  }
  if (err) return <p className="mt-6 text-[12.5px] text-accent-dark">{err}</p>;
  if (!d) return <p className="mt-6 text-[12.5px] text-muted">Loading their book…</p>;

  if (look) {
    return (
      <PersonFileNew
        d={d}
        busy={busy}
        viewAs={() => void viewAs()}
        lockOpen={lockOpen}
        setLockOpen={setLockOpen}
        reason={reason}
        setReason={setReason}
        lockBusy={lockBusy}
        lockErr={lockErr}
        clearLockErr={() => setLockErr(null)}
        setLock={(a) => void setLock(a)}
        reading={reading}
        readingErr={readingErr}
        showAll={showAll}
        setShowAll={setShowAll}
      />
    );
  }

  const p = d.person;
  const first = p.name.split(" ")[0];
  const lock = d.account?.lock ?? null;
  const canLock = Boolean(d.account && d.account.role !== "owner");

  return (
    <>
      <Link href="/admin/people" className="text-[12.5px] text-muted underline">← People</Link>

      <header className="fade-up mt-3 flex flex-wrap items-start gap-4 rounded-[22px] border border-line/50 bg-white p-6">
        {p.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.photo} alt="" className="h-16 w-16 shrink-0 rounded-full object-cover" />
        ) : (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[18px]">
            {p.name.slice(0, 1)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="hand text-[24px] leading-tight">{p.name}</h1>
          <p className="mt-1 text-[12.5px] text-muted">
            {p.email}
            {p.rexId ? ` · REX ${p.rexId}` : " · not in REX"}
            {p.position ? ` · ${p.position}` : ""}
            {p.phone ? ` · ${p.phone}` : ""}
          </p>
          <p className="mt-2 flex flex-wrap items-center gap-1.5">
            {d.account ? (
              <>
                <Pill tone="accent">{ROLE_LABEL[d.account.role as keyof typeof ROLE_LABEL] ?? d.account.role}</Pill>
                {!d.account.hasPhoto && <Pill tone="neutral">No headshot</Pill>}
                {d.account.lastSeenAt ? (
                  <span className="text-[11.5px] text-muted">Last in {when(d.account.lastSeenAt)}</span>
                ) : (
                  <Pill tone="accent">Never signed in</Pill>
                )}
                {!d.account.rexUserId && <Pill tone="neutral">Not linked to REX</Pill>}
                {lock?.locked && <Pill tone="accent">Locked out</Pill>}
              </>
            ) : (
              <Pill tone="neutral">Not invited yet</Pill>
            )}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {d.account?.role !== "owner" && (
            <button
              type="button"
              onClick={viewAs}
              disabled={busy}
              className="shrink-0 rounded-lg bg-accent-dark px-4 py-2.5 text-[12.5px] font-semibold text-white disabled:opacity-40"
            >
              {busy ? "Opening…" : `View as ${first}`}
            </button>
          )}
          {canLock && !lock?.locked && !lockOpen && (
            <button
              type="button"
              onClick={() => setLockOpen(true)}
              className="shrink-0 rounded-lg border border-accent-dark/60 px-4 py-2.5 text-[12.5px] font-semibold text-accent-dark"
            >
              Lock out
            </button>
          )}
        </div>
      </header>

      {/* Lock out (lib/lockout): said plainly before it happens, and how to
          undo it, because it ends somebody's working day on the spot. */}
      {lockOpen && !lock?.locked && (
        <section className="fade-up mt-4 rounded-[22px] border border-accent-dark/40 bg-accent-soft/40 p-5">
          <h2 className="hand text-[17px] leading-tight">Lock {first} out of TLE OS?</h2>
          <p className="mt-1.5 text-[12.5px] leading-relaxed">
            Every session {first} has open ends within half a minute, on every device, and
            signing in tells them their access is paused. Their account, their work and their
            history stay exactly as they are, and you can let them back in at any time.
          </p>
          <label htmlFor="lock-reason" className="mt-3 block text-[10px] uppercase tracking-wider text-muted">
            Why (kept in the activity log, not shown to {first})
          </label>
          <textarea
            id="lock-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            rows={2}
            className="mt-1.5 w-full rounded-lg border border-line/80 bg-white px-3 py-2 text-[13px]"
          />
          {lockErr && <p className="mt-2 text-[12px] text-accent-dark">{lockErr}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void setLock("lock")}
              disabled={lockBusy}
              className="rounded-lg bg-accent-dark px-4 py-2.5 text-[12.5px] font-semibold text-white disabled:opacity-40"
            >
              {lockBusy ? "Locking…" : `Lock ${first} out now`}
            </button>
            <button
              type="button"
              onClick={() => {
                setLockOpen(false);
                setLockErr(null);
              }}
              disabled={lockBusy}
              className="rounded-lg border border-line/80 px-4 py-2.5 text-[12.5px]"
            >
              Cancel
            </button>
          </div>
        </section>
      )}

      {lock?.locked && (
        <section className="fade-up mt-4 rounded-[22px] border border-accent-dark/40 bg-accent-soft/40 p-5">
          <h2 className="hand text-[17px] leading-tight">{first} is locked out</h2>
          <p className="mt-1.5 text-[12.5px] leading-relaxed">
            Since {when(lock.lockedAt)}
            {lock.lockedBy ? `, by ${lock.lockedBy}` : ""}. Nothing they had open works, and
            signing in tells them their access is paused.
            {lock.reason ? <span className="text-muted"> Reason: {lock.reason}</span> : null}
          </p>
          {lockErr && <p className="mt-2 text-[12px] text-accent-dark">{lockErr}</p>}
          <button
            type="button"
            onClick={() => void setLock("unlock")}
            disabled={lockBusy}
            className="mt-3 rounded-lg border border-line/80 bg-white px-4 py-2.5 text-[12.5px] font-semibold disabled:opacity-40"
          >
            {lockBusy ? "Letting them in…" : `Let ${first} back in`}
          </button>
        </section>
      )}

      {/* What they have opened (lib/read-log): the counts first, then the
          list, newest first. */}
      {d.account && (
        <section className="fade-up mt-4 rounded-[22px] border border-line/50 bg-white p-5">
          <h2 className="hand text-[17px] leading-tight">What {first} has opened</h2>
          {readingErr ? (
            <p className="mt-2 text-[12.5px] text-accent-dark">{readingErr}</p>
          ) : !reading ? (
            <p className="mt-2 text-[12.5px] text-muted">Reading the log…</p>
          ) : (
            <>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Figure label="Last hour" n={reading.openedHour} />
                <Figure label="Last 24 hours" n={reading.openedDay} />
                <Figure label="Last 7 days" n={reading.openedWeek} />
                <Figure label="10pm-6am, 7 days" n={reading.afterHoursWeek} />
              </div>
              {reading.flags.length > 0 && (
                <p className="mt-3 rounded-xl border border-accent-dark/40 bg-accent-soft/40 p-3 text-[12.5px] leading-relaxed">
                  More than usual: {reading.flags.join(", ")}.
                </p>
              )}
              {reading.recent.length === 0 ? (
                <p className="mt-3 text-[12.5px] text-muted">Nothing opened since the log started on 10 October 2026.</p>
              ) : (
                <ul className="mt-3 space-y-0.5">
                  {(showAll ? reading.recent : reading.recent.slice(0, 40)).map((r, i) => (
                    <li key={`${r.at}-${i}`} className="flex flex-wrap items-baseline gap-x-3 border-b border-line/40 py-1.5 text-[11.5px] last:border-0">
                      <span className="w-[104px] shrink-0 text-muted">{when(r.at)}</span>
                      <span className="min-w-0 flex-1 break-all">
                        {r.method !== "GET" && <span className="mr-1 text-accent-dark">{r.method}</span>}
                        {r.path.replace(/^\/api\//, "")}
                        {r.query && <span className="text-muted">?{r.query}</span>}
                      </span>
                      <span className="shrink-0 text-muted">{r.ip}</span>
                    </li>
                  ))}
                </ul>
              )}
              {!showAll && reading.recent.length > 40 && (
                <button type="button" onClick={() => setShowAll(true)} className="mt-2 text-[12px] underline">
                  Show the last {reading.recent.length}
                </button>
              )}
              <p className="mt-3 border-t border-line/70 pt-2.5 text-[10.5px] leading-relaxed text-muted">
                Counts are the different things opened, not every call: one screen makes several.
                Everything {first} opens is recorded from 10 October 2026 and kept for a year. The
                bell, chats and other calls an open screen makes by itself are left out.
              </p>
            </>
          )}
        </section>
      )}

      {!d.book ? (
        /* No REX record, so there is no book to count. Said in a sentence,
           because eight zeros would read as "this person does nothing". */
        <p className="fade-up mt-4 rounded-[22px] border border-line/50 bg-white p-5 text-[12.5px] text-muted">
          {p.name.split(" ")[0]} isn&apos;t a REX lettings agent, so there is no book of listings,
          leads or appraisals to show. Their work lives on their own screens — press
          &ldquo;View as&rdquo; above to see exactly what they see.
        </p>
      ) : (
      <>
      <div className="fade-up mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Count label="On the market" c={d.book.onMarket} />
        <Count label="Let & managed" c={d.book.managed} />
        <Count label="Listings, all time" c={d.book.listings} />
        <Count label="Properties" c={d.book.properties} />
        <Count label="Leads assigned" c={d.book.leads} />
        <Count label="Appraisals" c={d.book.appraisals} />
        <Count label="Applications" c={d.book.applications} />
        <Count label="Contacts" c={d.book.contacts} />
      </div>

      <section className="fade-up mt-4 rounded-[22px] border border-line/50 bg-white p-5">
        <h2 className="hand text-[17px] leading-tight">Their most recent listings</h2>
        {d.book.recentListings.length === 0 ? (
          <p className="mt-2 text-[12.5px] text-muted">Nothing came back.</p>
        ) : (
          <ul className="mt-3 space-y-1.5">
            {d.book.recentListings.map((l) => (
              <li key={l.id} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line/40 py-1.5 text-[12.5px]">
                <span>{l.address}</span>
                <span className="shrink-0 text-muted">
                  {l.status ?? "—"}
                  {l.rent ? ` · £${l.rent.toLocaleString("en-GB")}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 border-t border-line/70 pt-2.5 text-[10.5px] leading-relaxed text-muted">
          Live from REX. Listings match on owner or selling agent, leads on who they&apos;re
          assigned to, appraisals on agent 1, applications on the application&apos;s agent.
          <br />
          <span className="font-semibold">Viewings aren&apos;t here on purpose</span> — REX
          calendar events carry no owning agent, so a per-person figure can&apos;t be produced.
          Business-wide only.
          <br />
          These are everything this person touches in REX, which is shared across six
          businesses — a partner who also sells for The Property Experts will show that work
          here too.
        </p>
      </section>
      </>
      )}
    </>
  );
}
