"use client";

import Link from "next/link";
import SteveRepertoire from "@/components/SteveRepertoire";
import { Badge } from "@/components/new-look/Parts";
import { Loading, Problem } from "@/components/new-look/admin/content-bits";
import { BRIEF_PLACEHOLDER, when, type SteveConsole } from "@/components/admin/use-steve-console";

/**
 * Steve's console in the new look, under Admin > Content (lib/new-look
 * "admin", 24 Oct 2026). The same reads and the same saves as the old page,
 * from useSteveConsole. Trending, asked for, what he knows, his brief, every
 * conversation and his repertoire, on hairlines; no header, the frame draws
 * Content and its tabs.
 *
 * What he reads lives in three stores on purpose (operational knowledge,
 * his brief, Susan's guidance), and they are not merged here. The line at
 * the top says where each one is edited, so nobody goes looking in the wrong
 * one.
 */

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

export default function SteveNew({ c }: { c: SteveConsole }) {
  const { lines, trends, gaps, brain, brief, setBrief, briefBy, savingBrief, briefFlash, who, setWho, gapBusy, gapErr, showPut, setShowPut, load, markGap, saveBrief, people, shown, logFailed, briefFailed, brainFailed, role } = c;
  const owner = role === "owner";
  const open = gaps.filter((g) => !g.state);
  const put = gaps.filter((g) => g.state);
  const built = put.filter((g) => g.state === "built").length;
  const hidden = put.filter((g) => g.state === "hidden").length;

  if (logFailed === "denied") {
    return (
      <div data-look="new" className="nl-page nl-adm nl-adm-screen">
        <p className="nl-empty">Steve&apos;s console is for the people who run the office. Ask James if you should have it.</p>
      </div>
    );
  }

  const logLoading = lines === null && !logFailed;

  return (
    <div data-look="new" className="nl-page nl-rise nl-adm nl-adm-screen">
      {/* Where each part of what he reads is edited. Three stores, kept apart. */}
      <p className="nl-adm-note">
        What Steve reads is edited in three places: what the business knows on the <Link href="/admin/knowledge">Knowledge tab</Link> (operational and marketing),{" "}
        <a href="#steve-brief">his brief</a> here, and Susan&apos;s guidance on <Link href="/company-figures/assistant">her view&apos;s Assistant tab</Link>.
      </p>

      {logFailed === "error" && <Problem onRetry={load}>We couldn&apos;t read what&apos;s been asked just now. Nothing has been lost.</Problem>}

      <div className="nl-adm-stack">
        {/* ── is he answering ── */}
        <section className="nl-adm-card">
          <div className="nl-adm-card-head">
            <h2 className="nl-adm-h">Is He Answering</h2>
            {brain ? brain.live ? <Badge tone="good">Answering</Badge> : <Badge tone="warning">Can&apos;t answer at the moment</Badge> : null}
          </div>
          {brainFailed ? (
            <Problem onRetry={load}>We couldn&apos;t read his state just now.</Problem>
          ) : !brain ? (
            <Loading label="Reading his state…" />
          ) : brain.live ? (
            <>
              <p className="nl-meta nl-adm-c-sub">
                Claude, over the operational knowledge, and told to say when something isn&apos;t covered rather than guess at a process or a figure. A confident wrong answer about a landlord is worse than no answer.
              </p>
              <p className="nl-meta mt-2">
                {brain.spent.toLocaleString("en-GB")} of {brain.cap.toLocaleString("en-GB")} tokens used today. Over the ceiling he says so and passes the question on rather than stopping.
              </p>
            </>
          ) : (
            <p className="nl-meta nl-adm-c-sub">
              Either no <span className="nl-mono">ANTHROPIC_API_KEY</span> is set, or today&apos;s ceiling has been reached. Questions still land in the lists below, and the panel says which it is rather than pretending.
            </p>
          )}
        </section>

        {/* ── trending ── */}
        <section className="nl-adm-card">
          <div className="nl-adm-card-head">
            <h2 className="nl-adm-h">
              Trending Questions <span className="nl-count">{lines ? trends.length : ""}</span>
            </h2>
            <button type="button" onClick={load} className="nl-btn nl-btn--secondary nl-btn--sm">
              Refresh
            </button>
          </div>
          <p className="nl-meta">What people keep asking, however they word it: the top five, asked more than once. The top of this list is the next thing worth writing down.</p>
          {logLoading ? (
            <Loading label="Reading what's been asked…" />
          ) : logFailed ? null : trends.length === 0 ? (
            <p className="nl-empty">Nothing asked more than once yet. As soon as a question comes up twice, it shows here.</p>
          ) : (
            <ol className="nl-adm-c-rows is-ruled is-ranked mt-3">
              {trends.map((t, i) => (
                <li key={t.question}>
                  <span className="nl-adm-rank">{i + 1}</span>
                  <div className="nl-adm-c-row-main">
                    <span className="nl-strong block">{cap(t.question)}</span>
                    <span className="nl-meta block">
                      Asked {t.times} times{t.people > 1 ? ` by ${t.people} people` : ""} · last {when(t.lastAsked)}
                    </span>
                    {t.notCovered && <Badge tone="accent" bare>He couldn&apos;t answer it</Badge>}
                    {t.wordings.length > 1 && (
                      <details className="nl-adm-more is-tight">
                        <summary>{t.wordings.length} ways it was asked</summary>
                        <ul className="nl-adm-quotes">
                          {t.wordings.map((w) => (
                            <li key={w} className="nl-meta">
                              &ldquo;{w}&rdquo;
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </div>
                  <Link href={`/admin/knowledge?write=${encodeURIComponent(t.question)}`} className={`nl-btn nl-btn--sm ${t.notCovered ? "nl-btn--primary" : "nl-btn--secondary"}`}>
                    Write the Answer
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </section>

        {/* ── asked for, can't do yet ── */}
        <section className="nl-adm-card">
          <h2 className="nl-adm-h">
            Asked For, Can&apos;t Do Yet <span className="nl-count">{lines ? open.length : ""}</span>
          </h2>
          <p className="nl-meta nl-adm-c-sub">
            What people asked Steve to do that he had no way to. What they taught him is on <Link href="/admin/knowledge" className="nl-link">Knowledge</Link>, under Learned from the team.
            {!owner && role !== undefined ? " Owners mark these built or hidden." : ""}
          </p>
          {logLoading ? (
            <Loading label="Reading…" />
          ) : logFailed ? null : open.length === 0 ? (
            <p className="nl-empty">Nothing open. When somebody asks for something he can&apos;t do, it shows here.</p>
          ) : (
            <ul className="nl-adm-c-rows is-ruled mt-3">
              {open.map((g) => (
                <li key={g.at + g.asked}>
                  <div className="nl-adm-c-row-main">
                    <span className="nl-strong block">{cap(g.asked)}</span>
                    <span className="nl-meta block">
                      {g.who} · {when(g.at)}
                      {g.why ? ` · needs ${g.why.charAt(0).toLowerCase()}${g.why.slice(1)}` : ""}
                    </span>
                  </div>
                  {owner && (
                    <div className="nl-adm-c-row-acts">
                      <button type="button" disabled={gapBusy === g.at} onClick={() => markGap(g.at, "built")} className="nl-btn nl-btn--secondary nl-btn--sm">
                        Built
                      </button>
                      <button type="button" disabled={gapBusy === g.at} onClick={() => markGap(g.at, "hidden")} className="nl-btn nl-btn--quiet nl-btn--sm">
                        Hide
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          {gapErr && (
            <div className="mt-3">
              <Problem>{gapErr}</Problem>
            </div>
          )}
          {put.length > 0 && (
            <div className="mt-3">
              <button type="button" onClick={() => setShowPut((v) => !v)} className="nl-link">
                {showPut ? "Hide" : "Show"} {[built && `${built} built`, hidden && `${hidden} hidden`].filter(Boolean).join(" and ")}
              </button>
              {showPut && (
                <ul className="nl-adm-c-rows mt-2">
                  {put.map((g) => (
                    <li key={g.at + g.asked} className="is-tight">
                      <div className="nl-adm-c-row-main nl-adm-c-row-line">
                        <Badge tone={g.state === "built" ? "good" : "neutral"} bare>
                          {g.state === "built" ? "Built" : "Hidden"}
                        </Badge>
                        <span className="nl-adm-muted text-[13px]">{cap(g.asked)}</span>
                      </div>
                      {owner && (
                        <button type="button" disabled={gapBusy === g.at} onClick={() => markGap(g.at, null)} className="nl-btn nl-btn--quiet nl-btn--sm">
                          Back on the List
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>

        {/* ── what he already knows ── */}
        <section className="nl-adm-card">
          <h2 className="nl-adm-h">What He Already Knows</h2>
          <p className="nl-meta nl-adm-c-sub">
            Generated from the system itself every time he answers: the stage names, their order and the wording all come from the same definitions the screens render from. It carries no figures on purpose: a number written into his context is stale the moment it&apos;s written, so he points at the screen that shows it instead.
          </p>
          {brain && (
            <p className="mt-3 text-[14px] leading-[21px]">
              {brain.knowledgeReadable === false ? (
                <>
                  <Badge tone="accent" bare>The knowledge base could not be read</Badge>{" "}
                  <span className="nl-adm-muted">He still explains the platform from the map, but he has no guidance on fees or policy until this is fixed.</span>
                </>
              ) : brain.knowledgeCount ? (
                <>
                  <span className="nl-strong">
                    {brain.knowledgeCount} guidance {brain.knowledgeCount === 1 ? "entry" : "entries"} loaded
                  </span>{" "}
                  <span className="nl-adm-muted">alongside the map.</span>
                </>
              ) : (
                <>
                  <span className="nl-strong">No guidance written yet.</span>{" "}
                  <span className="nl-adm-muted">He explains the platform fully from the map, and says a policy or fee question has gone to you. Writing on the Knowledge tab is what widens that.</span>
                </>
              )}
            </p>
          )}
          <details className="nl-adm-more">
            <summary>
              Read it as he reads it
              {brain?.promptBlocks ? `, all ${brain.promptBlocks} blocks` : ""}
            </summary>
            {brain ? <pre className="nl-adm-pre">{brain.prompt ?? brain.map ?? ""}</pre> : brainFailed ? <p className="nl-meta mt-2">Not read.</p> : <Loading label="Reading…" />}
          </details>
        </section>

        {/* ── the brief ── */}
        <section id="steve-brief" className="nl-adm-card">
          <h2 className="nl-adm-h">His Brief</h2>
          <p className="nl-meta nl-adm-c-sub">
            Who he is and how he behaves: how to talk, how to respond, what he&apos;s here to do. Separate from the knowledge, which is facts about the business. This is read first and overrides his built-in manners, so anything here wins.
          </p>
          {briefFailed ? (
            <div className="mt-3">
              <Problem onRetry={load}>We couldn&apos;t read his brief just now, so it can&apos;t be edited until it has been read.</Problem>
            </div>
          ) : brief === null ? (
            <Loading label="Reading his brief…" />
          ) : (
            <>
              <label className="nl-field mt-4">
                <span className="sr-only">His brief</span>
                <textarea value={brief} onChange={(e) => setBrief(e.target.value)} rows={14} spellCheck placeholder={BRIEF_PLACEHOLDER} className="nl-adm-plain" />
              </label>
              <div className="nl-adm-card-acts items-center">
                <button type="button" onClick={() => void saveBrief()} disabled={savingBrief} className="nl-btn nl-btn--primary nl-btn--sm">
                  {savingBrief ? "Saving…" : "Save Brief"}
                </button>
                <span className="nl-meta">{briefFlash ?? (briefBy ? `Last saved by ${briefBy}.` : "Nothing written yet. He'll use his defaults.")}</span>
              </div>
            </>
          )}
        </section>

        {/* ── every conversation, folded away ── */}
        <section className="nl-adm-card">
          <details>
            <summary className="nl-adm-summary">
              <h2 className="nl-adm-h">
                Every Conversation <span className="nl-count">{lines ? lines.length : ""}</span>
              </h2>
              <span className="nl-meta">Everything anyone has said to him, and everything he said back</span>
            </summary>
            <div className="mt-4">
              {people.length > 1 && (
                <span className={`nl-fsel${who ? " is-set" : ""}`}>
                  <select value={who} onChange={(e) => setWho(e.target.value)} aria-label="Filter by person">
                    <option value="">Everyone</option>
                    {people.map((e) => (
                      <option key={e} value={e}>
                        {e}
                      </option>
                    ))}
                  </select>
                </span>
              )}
              <p className="nl-meta mt-2">Both halves are kept on purpose: a question is only half an exchange, and what we replied is the half that might have been wrong.</p>
              {logLoading ? (
                <Loading label="Reading…" />
              ) : logFailed ? null : shown.length === 0 ? (
                <p className="nl-empty">Nothing said yet.</p>
              ) : (
                <ul className="nl-adm-c-rows is-ruled mt-3">
                  {shown.map((l) => (
                    <li key={l.id} className={`is-block${l.role === "agent" ? "" : " nl-adm-steve-line"}`}>
                      <div className="nl-adm-c-row-line">
                        <span className="nl-meta">
                          {l.role === "agent" ? l.userEmail : "Steve"}
                          {l.kind !== "ask" ? ` · ${l.kind.replace("onboarding-", "intro: ")}` : ""}
                          {l.path ? ` · ${l.path}` : ""}
                        </span>
                        <span className="nl-mono ml-auto">{when(l.createdAt)}</span>
                      </div>
                      <p className="mt-1 text-[14px] leading-[21px]">{l.text}</p>
                      {l.attachments && l.attachments.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {l.attachments.map((a) => (
                            <a key={a.key} href={`/api/r2/file?key=${encodeURIComponent(a.key)}`} target="_blank" rel="noreferrer" className="nl-adm-file">
                              {a.name}
                            </a>
                          ))}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </details>
        </section>

        {/* ── his repertoire ── */}
        <section className="nl-adm-card">
          <h2 className="nl-adm-h">His Repertoire</h2>
          <p className="nl-meta nl-adm-c-sub">Everything he can do with his face, and when he does it. Click one to see it again.</p>
          <SteveRepertoire />
        </section>
      </div>
    </div>
  );
}
