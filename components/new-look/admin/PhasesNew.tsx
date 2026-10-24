"use client";

import { Badge, Ico } from "@/components/new-look/Parts";
import { usePhases, LEVEL_WORDS, type Preview } from "@/components/testing/PhasesPanel";
import { ErrorLine, Loading, nd, when } from "@/components/new-look/admin/bits";

/**
 * Admin > Testing > Phases in the new look (24 Oct 2026). The pilot's phases
 * as cards, each with what pressing it changes right now (read by the server),
 * the pilot list for Phase 1, and the typed word. Same hook as the old panel
 * (components/testing/PhasesPanel usePhases), so the same calls and guards.
 */

export default function PhasesNew() {
  const { data, failed, typed, setTyped, ticked, announce, setAnnounce, busy, said, result, savingList, showRest, setShowRest, savePilot, press } = usePhases();

  if (failed) return <div className="nl-pane"><ErrorLine>The phases could not be read. Nothing has been changed.</ErrorLine></div>;
  if (!data) return <div className="nl-pane"><Loading what="Reading the switches and areas…" /></div>;

  const here = data.state.phase;

  return (
    <div className="nl-pane">
      <div className="nl-adm-panel nl-adm-gapb">
        <p className="nl-strong">{here === 0 ? "The pilot has not started." : `The pilot is in Phase ${here}.`}</p>
        <p className="nl-meta">
          {here === 0 ? "Nobody has been moved on by a phase yet. The switches and areas are as you last set them by hand." : `Started ${when(data.state.at)} by ${data.state.by}.`} Each phase sets Admin, Switches for you. You and Howard are owners, so none of this locks either of you out.
        </p>
      </div>

      {said && (
        <div className={`nl-adm-panel nl-adm-gapb${said.ok ? " is-good" : " is-bad"}`} role="status">
          <p className="nl-strong">{nd(said.text)}</p>
          {result && (
            <>
              {result.phase === 1 && <p>{result.invited.length} invited by email.</p>}
              {result.inviteFailed.map((f) => (
                <p key={f.email}>
                  {f.email}: {nd(f.why)}. Use Copy link on People, Invites for this one.
                </p>
              ))}
              {result.phase === 3 && <p>{result.filesRemoved} test files removed.</p>}
              {result.phase !== 1 && <p>{result.announced} people told by email.</p>}
            </>
          )}
        </div>
      )}

      <div className="nl-adm-phases">
        {data.phases.map((p) => {
          const current = here === p.id;
          const nothing = p.preview.areas.length === 0 && p.preview.switches.length === 0;
          const ready = (typed[p.id] ?? "").trim().toUpperCase() === p.confirm;
          return (
            <section key={p.id} className={`nl-adm-card nl-adm-phase${current ? " is-now" : ""}`}>
              <div className="nl-adm-section-head">
                <h3 className="nl-adm-card-title">
                  Phase {p.id}: {p.name}
                </h3>
                {current && <Badge tone="accent">You are here</Badge>}
              </div>
              <p className="nl-meta">{nd(p.says)}</p>
              <ol className="nl-adm-steps">
                {p.steps.map((s, i) => (
                  <li key={i}>{nd(s)}</li>
                ))}
              </ol>

              <div className="nl-adm-panel">
                <p className="nl-meta">What pressing it changes right now</p>
                {nothing ? (
                  <p className="nl-meta">Nothing: every switch and area is already where this phase puts it.</p>
                ) : (
                  <ul className="nl-adm-changes">
                    {p.preview.switches.map((s) => (
                      <li key={s.key}>
                        <span>{s.label}</span>
                        <span className={s.to ? "nl-adm-hot" : undefined}>
                          {s.from ? "On" : "Off"} to {s.to ? "On" : "Off"}
                        </span>
                      </li>
                    ))}
                    {p.preview.areas.map((a) => (
                      <li key={a.id}>
                        <span>{a.label}</span>
                        <span>
                          {LEVEL_WORDS[a.from] ?? a.from} to {LEVEL_WORDS[a.to] ?? a.to}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {p.id === 3 && p.preview.testFiles > 0 && <p className="nl-adm-after">{p.preview.testFiles} test files will be removed, including your own.</p>}
                {p.preview.sendingLocked && p.preview.switches.some((s) => s.to) && (
                  <p className="nl-adm-after nl-adm-warn">SENDING_LOCKED is set on Railway, so this phase will be refused until it is cleared.</p>
                )}
              </div>

              {p.id === 1 &&
                (() => {
                  const row = (r: Preview["roster"][number]) => (
                    <li key={r.email}>
                      <label>
                        <input
                          type="checkbox"
                          checked={Boolean(ticked?.has(r.email))}
                          onChange={(e) => {
                            const next = new Set(ticked ?? []);
                            if (e.target.checked) next.add(r.email);
                            else next.delete(r.email);
                            void savePilot(next);
                          }}
                        />
                        <span>{r.name}</span>
                        <span className="nl-meta">{r.hasAccount ? "Has an account, not emailed" : r.invitedAt ? "Invited before, sent again" : ""}</span>
                      </label>
                    </li>
                  );
                  const inPilot = p.preview.roster.filter((r) => ticked?.has(r.email));
                  const rest = p.preview.roster.filter((r) => !ticked?.has(r.email));
                  const toEmail = inPilot.filter((r) => !r.hasAccount).length;
                  return (
                    <div className="nl-adm-panel">
                      <div className="nl-adm-section-head">
                        <p className="nl-meta">
                          The pilot list ({inPilot.length}), {toEmail} will be emailed
                        </p>
                        <span className="nl-meta">{savingList ? "Saving…" : "Saved"}</span>
                      </div>
                      {p.preview.roster.length === 0 ? (
                        <p className="nl-meta">The lettings roster could not be read, so nobody would be invited.</p>
                      ) : inPilot.length === 0 ? (
                        <p className="nl-adm-warn">Nobody is on the pilot list, so Phase 1 would invite nobody. Tick the people you and Susan agreed, below.</p>
                      ) : (
                        <ul className="nl-adm-roster">{inPilot.map(row)}</ul>
                      )}
                      {rest.length > 0 && (
                        <>
                          <button type="button" onClick={() => setShowRest((v) => !v)} aria-expanded={showRest} className="nl-link nl-adm-after">
                            {showRest ? "Hide" : "Show"} the {rest.length} not in the pilot
                          </button>
                          {showRest && <ul className="nl-adm-roster">{rest.map(row)}</ul>}
                        </>
                      )}
                      <p className="nl-meta nl-adm-after">
                        Only this list is ever invited. Somebody who isn&apos;t a lettings agent in REX is added on People, Invites. Our invitations sometimes land in Microsoft quarantine: for anybody who doesn&apos;t get theirs, People, Invites, Copy link.
                      </p>
                    </div>
                  );
                })()}

              {p.id !== 1 && (
                <label className="nl-adm-check nl-adm-after">
                  <input type="checkbox" checked={announce} onChange={(e) => setAnnounce(e.target.checked)} />
                  Email the {p.preview.announceTo} {p.preview.announceTo === 1 ? "agent" : "agents"} with an account to say it has started
                </label>
              )}

              <div className="nl-adm-arm">
                <input
                  value={typed[p.id] ?? ""}
                  onChange={(e) => setTyped((t) => ({ ...t, [p.id]: e.target.value }))}
                  placeholder={`Type ${p.confirm}`}
                  aria-label={`Type ${p.confirm} to start Phase ${p.id}`}
                  autoComplete="off"
                  className="nl-input is-caps"
                />
                <button type="button" disabled={!ready || busy !== null} onClick={() => void press(p)} className="nl-btn nl-btn--primary">
                  {!ready && <Ico name="lock" size={14} />}
                  {busy === p.id ? (p.id === 1 ? "Locking down, then inviting…" : "Working…") : current ? `Set Phase ${p.id} Again` : `Start Phase ${p.id}`}
                </button>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
