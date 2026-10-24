"use client";

import { ExpectedPackEmail, PropolyMailView } from "@/components/MoveInPack";
import { Badge } from "@/components/new-look/Parts";
import { Loading, Problem } from "@/components/new-look/admin/content-bits";
import { at, day, OUTCOME, type PropolyAdmin, type Plan, type Sender } from "@/components/admin/use-propoly-admin";

/**
 * Propoly in the new look (lib/new-look "admin", 24 Oct 2026): the same
 * reads and the same actions as the old page, all from usePropolyAdmin, so
 * every button here posts exactly what the old one does. Owner-only sections
 * stay owner-only (the API's own `owner` answer decides, as before).
 */

const who = (mailbox: string) => mailbox.split("@")[0].replace(/\./g, " ");

export default function PropolyNew({ p }: { p: PropolyAdmin }) {
  const { data, error, busy, said, senders, setSenders, words, setWords, watch, setWatch, found, setFound, open, setOpen, fileDeal, setFileDeal, deal, setDeal, plan, setPlan, kinds, setKinds, confirming, setConfirming, load, act } = p;

  const attention = data ? data.unfiled.length + data.gaps.length : 0;

  return (
    <>
      <div data-look="new" className="nl-page nl-rise nl-adm nl-adm-screen">
        <p className="nl-meta nl-adm-lede">
          The move-in pack Propoly emails the tenant, read from each agent&apos;s own Outlook and kept on the let as proof it went. And a let&apos;s certificates pushed into its Propoly deal, for deals started before the OS went live.
        </p>

        {error && <Problem onRetry={data ? undefined : () => void load()}>{error}</Problem>}
        {said && (
          <p className="nl-adm-flash mb-4" role="status">
            {said}
          </p>
        )}
        {!data && !error && <Loading label="Reading what's been kept…" />}

        {data && (
          <div className="nl-adm-stack">
            {/* ── needs attention ── */}
            <section className={`nl-adm-card${attention ? " is-hot" : ""}`}>
              <div className="nl-adm-card-head">
                <h2 className="nl-adm-h">Needs Attention</h2>
                {attention ? <Badge tone="accent">{attention} to look at</Badge> : <Badge tone="good">All clear</Badge>}
              </div>
              {!attention && <p className="nl-meta">Every email is on its let, and everybody who gets Propoly&apos;s copies has Outlook connected.</p>}

              {data.unfiled.length > 0 && (
                <div className="mt-2">
                  <p className="nl-strong">
                    On no let yet <span className="nl-count">{data.unfiled.length}</span>
                  </p>
                  <p className="nl-meta">
                    The reader couldn&apos;t tell which deal these are about, and tries again every few minutes. Paste the deal&apos;s Propoly link, or the address, to put one on its let now.
                  </p>
                  <ul className="nl-adm-rows is-ruled mt-3">
                    {data.unfiled.map((m) => (
                      <li key={m.id}>
                        <button type="button" onClick={() => setOpen(m)} className="nl-adm-open nl-adm-row-main">
                          <span className="nl-strong">{m.kind === "move-in" ? "Move-in pack" : "Propoly email"}</span>
                          <span className="nl-meta block">
                            {m.subject} · {at(m.at)} · {m.mailboxes.join(", ")}
                          </span>
                        </button>
                        <div className="nl-adm-row-acts nl-adm-match">
                          <input
                            value={fileDeal[m.id] ?? ""}
                            onChange={(e) => setFileDeal((f) => ({ ...f, [m.id]: e.target.value }))}
                            placeholder="Deal link or address"
                            aria-label={`Deal for ${m.subject}`}
                            className="nl-input nl-adm-input-sm"
                          />
                          <button
                            type="button"
                            disabled={busy !== null || !fileDeal[m.id]}
                            onClick={() => act(`file-${m.id}`, { action: "file", id: m.id, deal: fileDeal[m.id] }, () => { void load(); return "Put on the let."; })}
                            className="nl-btn nl-btn--secondary nl-btn--sm"
                          >
                            {busy === `file-${m.id}` ? "Matching…" : "Match to a Deal"}
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => act("rematch", { action: "rematch" }, (j) => { void load(); return Number(j.placed) ? `${j.placed} put on ${Number(j.placed) === 1 ? "its let" : "their lets"}.` : "Still no deal for these. Match them by hand."; })}
                    className="nl-link mt-3"
                  >
                    {busy === "rematch" ? "Trying…" : "Try Them Again Now"}
                  </button>
                </div>
              )}

              {data.gaps.length > 0 && (
                <div className="mt-5">
                  <p className="nl-strong">
                    Outlook not connected <span className="nl-count">{data.gaps.length}</span>
                  </p>
                  <p className="nl-meta">Propoly&apos;s copies to these people, the move-in pack included, aren&apos;t being caught. They connect it on their Profile.</p>
                  <ul className="nl-adm-rows is-ruled mt-3">
                    {data.gaps.map((g) => (
                      <li key={g.email}>
                        <div className="nl-adm-row-main">
                          <span className="nl-strong">{g.name}</span>
                          <span className="nl-meta block">{g.why}</span>
                        </div>
                        {g.alwaysWatch && <Badge tone="warning" bare>Always watched</Badge>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <p className="nl-meta mt-4">
                {data.total ? `${data.onlyOneBox} of ${data.total} emails were found in one mailbox only` : "Nothing kept yet"}
                {data.total && data.onlyOneBox === data.total ? ": Propoly copies only the agent on the let, so nothing else in the office holds a second copy. Add a mailbox under Always Watch once one gets them." : "."}
              </p>
            </section>

            {/* ── what we are looking for ── */}
            <section className="nl-adm-card">
              <h2 className="nl-adm-h">The Email We Look For</h2>
              <p className="nl-meta nl-adm-sub mb-4">The move-in pack, as Propoly sends it. A let shows it as sent once a copy reaches any connected Outlook.</p>
              <ExpectedPackEmail />
            </section>

            {/* ── the setting (owners) ── */}
            {data.owner && (
              <section className="nl-adm-card">
                <h2 className="nl-adm-h">Move-in Pack Emails</h2>
                <p className="nl-meta nl-adm-sub">
                  Only mail from these addresses is read: every Propoly email from {day(data.goLive)}, and move-in packs from {day(data.backfillFrom)}. A pack&apos;s files go on its home&apos;s Documents. A whole domain can be written as @propoly.com.
                </p>
                <div className="nl-form mt-5">
                  <label className="nl-field">
                    <span>Propoly&apos;s sender address</span>
                    <input value={senders} onChange={(e) => setSenders(e.target.value)} placeholder="Not set yet" />
                  </label>
                  <label className="nl-field">
                    <span>What marks the move-in pack (subject or file names)</span>
                    <input value={words} onChange={(e) => setWords(e.target.value)} className="nl-adm-monoin" />
                  </label>
                  <label className="nl-field">
                    <span>Always watch these mailboxes</span>
                    <input value={watch ?? ""} onChange={(e) => setWatch(e.target.value)} placeholder="e.g. kirstie.mulholland@thelettingexperts.co.uk" />
                    <small>Read every run, and named first if they disconnect.</small>
                  </label>
                  <label className="nl-adm-check">
                    <input
                      type="checkbox"
                      checked={data.settings.fileOnHomes}
                      disabled={busy !== null}
                      onChange={(e) => act("filing", { action: "settings", senders, moveInWords: words, alwaysWatch: watch ?? "", fileOnHomes: e.target.checked }, () => { void load(); return e.target.checked ? "Packs' files will go on their homes' Documents at the next read." : "Packs' files stay in this log only."; })}
                    />
                    <span>
                      Put each move-in pack&apos;s files on its home&apos;s Documents
                      <span className="nl-meta block">They then show on the home, the let and the deal for everyone who can see the home.</span>
                    </span>
                  </label>
                </div>
                <div className="nl-adm-card-acts">
                  <button type="button" disabled={busy !== null} onClick={() => act("save", { action: "settings", senders, moveInWords: words, alwaysWatch: watch ?? "" }, () => { void load(); return "Saved."; })} className="nl-btn nl-btn--primary nl-btn--sm">
                    {busy === "save" ? "Saving…" : "Save"}
                  </button>
                  <button type="button" disabled={busy !== null} onClick={() => act("discover", { action: "discover" }, (j) => { setFound((j.senders as Sender[]) ?? []); return `Looked in ${j.mailboxes} mailboxes${Number(j.problems) ? `, ${j.problems} couldn't be read` : ""}.`; })} className="nl-btn nl-btn--secondary nl-btn--sm">
                    {busy === "discover" ? "Looking…" : "Find the Sender"}
                  </button>
                  <button type="button" disabled={busy !== null || !data.settings.senders.length} onClick={() => act("scan", { action: "scan" }, (j) => { void load(); const r = j.run as Record<string, unknown>; return r.skipped ? String(r.skipped) : `Read ${r.mailboxes} mailboxes: ${r.read} emails, ${r.logged} new kept.`; })} className="nl-btn nl-btn--secondary nl-btn--sm">
                    {busy === "scan" ? "Reading…" : "Read Now"}
                  </button>
                  <button type="button" disabled={busy !== null || !data.settings.senders.length} onClick={() => act("backfill", { action: "scan", backfill: true }, (j) => { void load(); const r = j.run as Record<string, unknown>; return r.skipped ? String(r.skipped) : `Read again from ${day(data.backfillFrom)}: ${r.read} emails, ${r.logged} new kept, ${r.filed ?? 0} files put on their homes.`; })} className="nl-btn nl-btn--secondary nl-btn--sm">
                    {busy === "backfill" ? "Reading…" : `Read Move-in Packs From ${day(data.backfillFrom)}`}
                  </button>
                </div>

                {found && (
                  <div className="mt-5">
                    <p className="nl-strong">
                      Who sends Propoly&apos;s mail <span className="nl-count">{found.length}</span>
                    </p>
                    {found.length === 0 ? (
                      <p className="nl-empty">No mail mentioning Propoly since go-live in any connected mailbox.</p>
                    ) : (
                      <ul className="nl-adm-rows is-ruled mt-2">
                        {found.map((s) => (
                          <li key={s.address}>
                            <div className="nl-adm-row-main">
                              <span className="nl-strong">{s.address}</span>
                              <span className="nl-meta block">
                                {s.name} · {s.count} {s.count === 1 ? "email" : "emails"} in {s.mailboxes} {s.mailboxes === 1 ? "box" : "boxes"}
                              </span>
                              {s.subjects.length > 0 && <span className="nl-meta block nl-adm-clamp">{s.subjects.join(" · ")}</span>}
                            </div>
                            <button type="button" onClick={() => setSenders((v) => [...new Set([...v.split(/[\s,;]+/).filter(Boolean), s.address])].join(", "))} className="nl-btn nl-btn--quiet nl-btn--sm">
                              Use
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </section>
            )}

            {/* ── what was kept ── */}
            <section className="nl-adm-card">
              <h2 className="nl-adm-h">
                Kept From Outlook <span className="nl-count">{data.recent.length}</span>
              </h2>
              {data.recent.length === 0 ? (
                <p className="nl-empty">{data.settings.senders.length ? "Nothing yet." : "Set Propoly's sender address first."}</p>
              ) : (
                <ul className="nl-adm-rows is-ruled mt-3">
                  {data.recent.map((m) => {
                    const filed = m.attachments.filter((f) => f.key).length;
                    return (
                      <li key={m.id}>
                        <button type="button" onClick={() => setOpen(m)} className="nl-adm-open nl-adm-mailrow">
                          <span className="nl-mono">{at(m.at)}</span>
                          <span className="min-w-0">
                            <span className="nl-strong block">{m.kind === "move-in" ? "Move-in pack" : "Propoly email"}</span>
                            <span className="nl-meta block">{m.subject}</span>
                          </span>
                          <span className="min-w-0">
                            {m.address ? <span className="block text-[13px]">{m.address}</span> : <Badge tone="accent" bare>Not on a let</Badge>}
                            <span className="nl-meta block">
                              {m.matchedOn === "tenant" ? "by the tenant's email" : m.matchedOn === "address" ? "by the address" : m.matchedOn === "hand" ? `by ${m.matchedBy}` : ""}
                            </span>
                          </span>
                          <span className="min-w-0">
                            <span className="nl-meta block">Caught in {m.mailboxes.map(who).join(", ")}</span>
                            {m.mailboxes.length <= 1 && <Badge tone="warning" bare>Only copy</Badge>}
                          </span>
                          <span className="nl-adm-mailfiles">
                            <span className="text-[13px]">
                              {filed} of {m.attachments.length} files
                            </span>
                            {m.kind === "move-in" && (m.missing?.length ?? 0) > 0 && <span className="nl-meta block">Not attached: {m.missing!.join(", ")}</span>}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              <details className="nl-adm-more">
                <summary>
                  Mailboxes read · {data.boxes.length}, most Propoly email first
                </summary>
                <ul className="nl-adm-rows mt-2">
                  {data.boxes.map((b) => (
                    <li key={b.email} className="is-tight">
                      <div className="nl-adm-row-main">
                        <span className="text-[13px]">{b.email}</span>
                        <span className="nl-meta block">{b.lastRunAt ? `read ${at(b.lastRunAt)}, ${b.kept} ${b.kept === 1 ? "email" : "emails"} found here` : "not read yet"}</span>
                        {b.note && <span className="nl-meta block nl-adm-warn">{b.note}</span>}
                      </div>
                      {data.settings.alwaysWatch.includes(b.email) && <Badge tone="info" bare>Always watched</Badge>}
                    </li>
                  ))}
                </ul>
              </details>
            </section>

            {/* ── missing documents on a deal (owners) ── */}
            {data.owner && (
              <section className="nl-adm-card">
                <h2 className="nl-adm-h">Missing Documents on a Deal</h2>
                <p className="nl-meta nl-adm-sub">
                  For a deal started before go-live. Check finds the home&apos;s newest gas safety, EICR and EPC in the OS, REX and any PLC pack, and writes nothing. Push puts them into the deal&apos;s document slots.
                </p>
                <div className="nl-adm-inline mt-4">
                  <input
                    value={deal}
                    onChange={(e) => { setDeal(e.target.value); setPlan(null); setConfirming(false); }}
                    placeholder="Propoly deal or property link, or the address"
                    aria-label="Propoly deal"
                    className="nl-input"
                  />
                  <button type="button" disabled={busy !== null || !deal.trim()} onClick={() => act("check", { action: "docs-check", deal }, (j) => { setPlan(j.plan as Plan); setConfirming(false); })} className="nl-btn nl-btn--secondary">
                    {busy === "check" ? "Checking…" : "Check"}
                  </button>
                </div>

                {plan && (
                  <div className="nl-adm-pane mt-4">
                    <p className="nl-strong">{plan.address}</p>
                    <p className="nl-meta">
                      {plan.status}
                      {plan.moveIn ? ` · moves in ${day(plan.moveIn)}` : ""}
                    </p>
                    {plan.rexNote && <p className="nl-meta nl-adm-warn mt-1">{plan.rexNote}</p>}
                    <ul className="nl-adm-rows mt-2">
                      {plan.docs.map((d) => (
                        <li key={d.kind} className="is-tight">
                          <label className="nl-adm-check nl-adm-row-main">
                            <input type="checkbox" aria-label={d.label} disabled={!d.found} checked={Boolean(d.found) && kinds.includes(d.kind)} onChange={(e) => setKinds((k) => (e.target.checked ? [...k, d.kind] : k.filter((x) => x !== d.kind)))} />
                            <span className="min-w-0">
                              <span className="nl-strong">{d.label}</span>
                              {d.found ? (
                                <span className="nl-meta block">
                                  {d.found.name} · {d.found.where} · expires {day(d.found.expiry)}
                                </span>
                              ) : (
                                <span className="nl-meta block">{d.note}</span>
                              )}
                            </span>
                          </label>
                          <span className="nl-adm-row-acts">
                            {d.found?.expired && <Badge tone="accent" bare>Expired</Badge>}
                            {d.outcome && (
                              <Badge tone={d.outcome === "failed" ? "accent" : d.outcome === "uploaded" ? "good" : "neutral"} title={d.note}>
                                {OUTCOME[d.outcome] ?? d.outcome}
                              </Badge>
                            )}
                          </span>
                          {d.outcome && d.note && <span className="nl-meta w-full">{d.note}</span>}
                        </li>
                      ))}
                    </ul>
                    {plan.docs.some((d) => d.found && kinds.includes(d.kind) && !d.outcome) && (
                      <div className="nl-adm-card-acts items-center">
                        {!confirming ? (
                          <button type="button" disabled={busy !== null} onClick={() => setConfirming(true)} className="nl-btn nl-btn--primary nl-btn--sm">
                            Push to Propoly
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              disabled={busy !== null}
                              onClick={() => act("push", { action: "docs-push", deal, kinds, includeExpired: true }, (j) => { setPlan(j.plan as Plan); setConfirming(false); void load(); return "Pushed. Each document's answer from Propoly is above."; })}
                              className="nl-btn nl-btn--danger nl-btn--sm"
                            >
                              {busy === "push" ? "Pushing…" : `Yes, Push ${kinds.filter((k) => plan.docs.find((d) => d.kind === k)?.found).length} Into Propoly`}
                            </button>
                            <button type="button" onClick={() => setConfirming(false)} className="nl-btn nl-btn--quiet nl-btn--sm">
                              Cancel
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {data.pushes.length > 0 && (
                  <details className="nl-adm-more">
                    <summary>Pushes made · {data.pushes.length}</summary>
                    <ul className="nl-adm-rows mt-2">
                      {data.pushes.map((x) => (
                        <li key={x.id} className="is-tight">
                          <div className="nl-adm-row-main">
                            <span className="text-[13px]">{x.address}</span>
                            <span className="nl-meta block">
                              {at(x.at)} · {x.by}
                            </span>
                            <span className="nl-meta block">{x.results.map((r) => `${r.label}: ${OUTCOME[r.outcome ?? ""] ?? "-"}`).join(" · ")}</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </section>
            )}
          </div>
        )}
      </div>
      {open && <PropolyMailView mail={open} onClose={() => setOpen(null)} />}
    </>
  );
}
