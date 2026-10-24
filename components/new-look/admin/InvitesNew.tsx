"use client";

import { Badge } from "@/components/new-look/Parts";
import { NlFig, NlLoading, NlFailed } from "@/components/new-look/admin/ScreenBits";
import MailboxesCard from "@/components/admin/MailboxesCard";
import { ROLES, ROLE_LABEL } from "@/lib/roles";
import { APP_KIND, CHECKS, SOURCE_LABEL, at, readyCount, type Board, type Person } from "@/components/admin/invites-shared";

/**
 * People > Invites in the new look (lib/new-look "admin", 24 Oct 2026): the
 * one place a person is invited, the invite resent, a link copied, somebody
 * added by hand, and the role they join as chosen. People shows whether
 * somebody has been invited and sends them here to do it.
 *
 * Every press is the page's own (app/(os)/admin/people/invites); this is how
 * it is drawn.
 */

type Progress = { done: number; total: number; failed: Array<{ name: string; error: string }> } | null;

const roleOptions = ROLES.map((r) => (
  <option key={r} value={r}>
    {ROLE_LABEL[r]}
  </option>
));

export default function InvitesNew(props: {
  d: Board | null;
  failed: string | null;
  load: () => void;
  flash: string | null;
  busy: string | null;
  confirming: boolean;
  setConfirming: (v: boolean) => void;
  progress: Progress;
  sending: boolean;
  queue: Person[];
  invited: Person[];
  fullyReady: number;
  onShown: Board["on"];
  preview: boolean;
  setPreview: (fn: (v: boolean) => boolean) => void;
  manual: { name: string; email: string; role: string };
  setManual: (fn: (m: { name: string; email: string; role: string }) => { name: string; email: string; role: string }) => void;
  onlyNotReady: boolean;
  setOnlyNotReady: (v: boolean) => void;
  magic: { email: string; url: string } | null;
  setMagic: (v: { email: string; url: string } | null) => void;
  launch: () => void;
  sendTest: () => void;
  toggle: (p: Person, included: boolean) => void;
  setAll: (included: boolean) => void;
  setRole: (p: Person, role: string) => void;
  addManual: () => void;
  remove: (p: Person) => void;
  resend: (p: Person) => void;
  copyLink: (p: Person) => void;
}) {
  const { d, failed, flash, busy, confirming, progress, sending, queue, manual, magic } = props;

  return (
    <div data-look="new" className="nl-page nl-rise nl-adm nl-adm-tab">
      <p className="nl-adm-lead">Invite new starters, then watch them get set up. The role somebody joins as is chosen here, with their invite.</p>

      {flash && (
        <p className="nl-adm-flash is-first" role="status">
          {flash}
        </p>
      )}

      {failed && !d ? (
        <NlFailed error={failed} onRetry={props.load} first />
      ) : !d ? (
        <NlLoading what="Loading the invite list" />
      ) : (
        <>
          <ul className="nl-adm-figs">
            <NlFig label="Ready to invite" value={queue.length} />
            <NlFig label="Invited, not in yet" value={props.invited.length} />
            <NlFig label="On the OS" value={d.on.length} href="#signed-up" />
            <NlFig label="Fully set up" value={props.fullyReady} />
            <NlFig label="Using the phone app" value={d.on.filter((o) => o.ready.app).length} />
          </ul>

          {/* ── the button ── */}
          <section className="nl-adm-block">
            <div className="nl-adm-card">
              <div className="nl-adm-card-head is-flat">
                <div className="nl-adm-grow">
                  <h2 className="nl-adm-card-title">{d.launchedAt ? "Invite New Starters" : "Launch TLE OS"}</h2>
                  <p className="nl-meta nl-adm-measure">
                    {d.launchedAt
                      ? `Launched ${at(d.launchedAt)}. Anybody ticked below who hasn't had an invite yet goes with the button: their own welcome email, with a one-time link to set up their account and a link to the TLE OS tour.`
                      : "Sends everybody ticked below their own welcome email: a one-time link to set up their account, and a link to the TLE OS tour."}{" "}
                    Each link lasts {d.linkDays} days.
                  </p>
                </div>
                <div className="nl-adm-acts">
                  {sending ? null : confirming ? (
                    <>
                      <button type="button" onClick={props.launch} className="nl-btn nl-btn--primary">
                        Yes, send {queue.length} invite{queue.length === 1 ? "" : "s"} now
                      </button>
                      <button type="button" onClick={() => props.setConfirming(false)} className="nl-btn nl-btn--secondary">
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button type="button" disabled={queue.length === 0 || busy !== null} onClick={() => props.setConfirming(true)} className="nl-btn nl-btn--primary">
                      {queue.length === 0 ? "Nobody left to invite" : d.launchedAt ? `Send to the ${queue.length} not invited yet` : `Launch: invite ${queue.length}`}
                    </button>
                  )}
                </div>
              </div>

              {progress && (
                <div className="nl-adm-after" role="status">
                  <p className="nl-strong">{sending ? `Sending ${progress.done + 1} of ${progress.total}… keep this page open.` : `Done: ${progress.total - progress.failed.length} of ${progress.total} sent.`}</p>
                  <div className="nl-adm-progress">
                    <i style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
                  </div>
                  {progress.failed.length > 0 && (
                    <ul className="nl-adm-bullets">
                      {progress.failed.map((f) => (
                        <li key={f.name} className="nl-adm-bad">
                          {f.name}: {f.error}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <div className="nl-adm-card-acts">
                <button type="button" onClick={() => props.setPreview((v) => !v)} className="nl-btn nl-btn--secondary nl-btn--sm">
                  {props.preview ? "Hide the Email" : "See the Email"}
                </button>
                <button type="button" disabled={busy !== null} onClick={props.sendTest} className="nl-btn nl-btn--secondary nl-btn--sm">
                  {busy === "test" ? "Sending…" : "Send Me a Test"}
                </button>
                <a href={d.tourUrl} target="_blank" rel="noreferrer" className="nl-btn nl-btn--quiet nl-btn--sm">
                  Open the tour
                </a>
              </div>
              {props.preview && <iframe title="The launch email" src="/api/admin/launch?preview=1" className="nl-adm-frame" />}
            </div>

            {magic && (
              <div className="nl-adm-flash is-warn">
                <p>
                  <span className="nl-strong">Link for {magic.email}</span> - works once, expires in 24 hours.
                </p>
                <div className="nl-adm-copy">
                  <code title={magic.url}>{magic.url}</code>
                  <button type="button" onClick={() => void navigator.clipboard?.writeText(magic.url)} className="nl-btn nl-btn--secondary nl-btn--sm">
                    Copy Again
                  </button>
                  <button type="button" onClick={() => props.setMagic(null)} className="nl-btn nl-btn--quiet nl-btn--sm">
                    Hide it
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* ── who gets one ── */}
          <section className="nl-adm-block">
            <div className="nl-adm-block-head">
              <div>
                <h2 className="nl-section-title">
                  Who Gets an Invite <span className="nl-count">{d.toInvite.length}</span>
                </h2>
                <p className="nl-meta">Everybody at The Letting Experts without an account, from REX, the Team Hub and the website. Untick anybody you don&apos;t want on it.</p>
              </div>
              <span className="nl-adm-acts">
                <button type="button" onClick={() => props.setAll(true)} className="nl-link">
                  Tick all
                </button>
                <button type="button" onClick={() => props.setAll(false)} className="nl-link">
                  Untick all
                </button>
              </span>
            </div>

            <div className="nl-adm-card">
              <h3 className="nl-block-title">Add Someone</h3>
              <div className="nl-filters nl-adm-after">
                <input value={manual.name} onChange={(e) => props.setManual((m) => ({ ...m, name: e.target.value }))} placeholder="Name" aria-label="Name" className="nl-input nl-adm-in-name" />
                <input value={manual.email} onChange={(e) => props.setManual((m) => ({ ...m, email: e.target.value }))} placeholder="name@thelettingexperts.co.uk" aria-label="Email" className="nl-input nl-adm-in-mail" />
                <span className="nl-fsel">
                  <select value={manual.role} onChange={(e) => props.setManual((m) => ({ ...m, role: e.target.value }))} aria-label="Joins as">
                    {roleOptions}
                  </select>
                </span>
                <button type="button" disabled={busy !== null || !manual.email.trim()} onClick={props.addManual} className="nl-btn nl-btn--secondary nl-btn--sm">
                  Add to the List
                </button>
              </div>
            </div>

            {d.toInvite.length === 0 ? (
              <p className="nl-empty">Everybody has an account.</p>
            ) : (
              <ul className="nl-adm-people nl-adm-after">
                {d.toInvite.map((p) => {
                  const linkLive = p.linkExpiresAt && Date.parse(p.linkExpiresAt) > Date.now();
                  const on = p.included && p.sendable;
                  return (
                    <li key={p.email}>
                      <label className="nl-adm-who nl-adm-check is-top">
                        <input type="checkbox" checked={on} disabled={!p.sendable || sending} onChange={(e) => props.toggle(p, e.target.checked)} />
                        <span className="min-w-0 nl-adm-lines2">
                          <span className={`nl-strong${p.included ? "" : " nl-adm-muted"}`}>
                            {p.name}
                          </span>
                          <span className="nl-meta nl-adm-mail" title={p.emails.join(", ")}>
                            {p.email}
                            {p.sources.length > 0 && ` · ${p.sources.map((s) => SOURCE_LABEL[s] ?? s).join(", ")}`}
                          </span>
                        </span>
                      </label>
                      <span className="nl-adm-acts">
                        {!p.sendable ? (
                          <Badge tone="warning" bare title="The OS only emails our own domains. Add them by hand on their TLE address.">
                            Can&apos;t email this address
                          </Badge>
                        ) : p.lastError && !p.sentAt ? (
                          <Badge tone="accent" bare title={p.lastError}>
                            Didn&apos;t send
                          </Badge>
                        ) : p.sentAt ? (
                          <Badge tone={linkLive ? "good" : "warning"} bare title={`Invite sent ${at(p.sentAt)}`}>
                            {linkLive ? `Invited · link live until ${at(p.linkExpiresAt as string)}` : "Invited · link expired"}
                          </Badge>
                        ) : (
                          <Badge tone="neutral" bare>Not invited yet</Badge>
                        )}
                        <label className="nl-adm-role" title="What they can see once they join">
                          <span className="nl-meta">Joins as</span>
                          <span className="nl-fsel">
                            <select value={p.role} onChange={(e) => props.setRole(p, e.target.value)} disabled={sending} aria-label={`Joins as, for ${p.name}`}>
                              {roleOptions}
                            </select>
                          </span>
                        </label>
                        {p.sentAt && (
                          <button type="button" disabled={busy !== null || sending} onClick={() => props.resend(p)} className="nl-btn nl-btn--secondary nl-btn--sm">
                            Resend
                          </button>
                        )}
                        {p.sendable && (
                          <button type="button" disabled={busy !== null || sending} onClick={() => props.copyLink(p)} title="A one-time link to send them yourself, if the email doesn't arrive" className="nl-btn nl-btn--quiet nl-btn--sm">
                            Copy link
                          </button>
                        )}
                        {p.custom && !p.sentAt && (
                          <button type="button" disabled={busy !== null || sending} onClick={() => props.remove(p)} className="nl-btn nl-btn--quiet nl-btn--sm">
                            Remove
                          </button>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* ── already on: the checklist ── */}
          <section id="signed-up" className="nl-adm-block nl-adm-anchor">
            <div className="nl-adm-block-head">
              <div>
                <h2 className="nl-section-title">
                  Signed Up and Getting Set <span className="nl-count">{d.on.length}</span>
                </h2>
                <p className="nl-meta">Everybody with an account, and the six things that make them live: photo, REX, email, setup, the tour and the phone app. Each one is also on their own dashboard until it&apos;s done.</p>
              </div>
              <label className="nl-adm-check">
                <input type="checkbox" checked={props.onlyNotReady} onChange={(e) => props.setOnlyNotReady(e.target.checked)} />
                Only people not ready
              </label>
            </div>

            {props.onShown.length === 0 ? (
              <p className="nl-empty">{props.onlyNotReady ? "Everybody signed up is fully set." : "Nobody has an account yet."}</p>
            ) : (
              <ul className="nl-adm-people">
                {props.onShown.map((o) => {
                  const n = readyCount(o.ready);
                  const app = o.ready.app;
                  const ticks: Array<[string, boolean, string?, string?]> = [
                    ["Photo", o.ready.photo],
                    ["REX", o.ready.rex === "live", o.ready.rex === "lapsed" ? "REX sign-in has lapsed" : undefined],
                    ["Email", o.ready.email],
                    ["Setup", o.ready.setup],
                    ["Tour", o.ready.tour],
                    ["App", Boolean(app), undefined, app ? `Phone app: ${APP_KIND[app.kind]}, last ${at(app.at)}` : "Phone app: not opened yet"],
                  ];
                  return (
                    <li key={o.userId}>
                      <div className="nl-adm-who is-narrow">
                        <span className="nl-strong">{o.name}</span>
                        <div className="nl-meta nl-adm-mail">
                          {ROLE_LABEL[o.role as keyof typeof ROLE_LABEL] ?? o.role}
                          {o.createdAt && ` · joined ${at(o.createdAt)}`}
                          {` · ${o.ready.lastSeenAt ? `last in ${at(o.ready.lastSeenAt)}` : "not been in yet"}`}
                          {app && app.kind !== "alerts" && ` · app ${at(app.at)}`}
                        </div>
                      </div>
                      <span className="nl-adm-acts">
                        {ticks.map(([label, ok, why, hover]) => (
                          <Badge key={label} tone={ok ? "good" : why ? "accent" : "neutral"} bare title={why ?? hover ?? (ok ? `${label}: done` : `${label}: not yet`)}>
                            {label}
                          </Badge>
                        ))}
                        <span className="nl-mono">
                          {n}/{CHECKS}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}

      {/* From Pre-launch (15 Oct 2026): seeing what a new starter sees, without
          spending a magic link. These replay the same screens against your own account. */}
      <section className="nl-adm-block">
        <div className="nl-adm-block-head">
          <div>
            <h2 className="nl-section-title">What a New Starter Sees</h2>
            <p className="nl-meta">Replays the joining screens against your own account. Setting up again will not undo your REX or email connection, and running the walkthrough changes nothing at all.</p>
          </div>
        </div>
        <div className="nl-adm-acts">
          <a href="/setup?replay=1" className="nl-btn nl-btn--secondary nl-btn--sm">
            Set Up an Account
          </a>
          <a href="/dashboard?tour=choose" className="nl-btn nl-btn--secondary nl-btn--sm">
            Show Me Round
          </a>
        </div>
      </section>

      <MailboxesCard />
    </div>
  );
}
