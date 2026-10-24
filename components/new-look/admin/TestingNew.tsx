"use client";

import { Badge, Tabs, type Tone } from "@/components/new-look/Parts";
import TestFilesNew from "@/components/new-look/admin/TestFilesNew";
import PhasesNew from "@/components/new-look/admin/PhasesNew";
import {
  KITS,
  LIGHT_WORDS,
  TEST_AREAS,
  WHO_WORDS,
  lightFor,
  type Journey,
  type KitId,
  type Light,
  type TestAreaId,
  type TestMark,
  type TestRun,
  type TestStep,
  type TestWho,
} from "@/lib/testing-journeys";
import { ErrorLine, Loading, Section, Tab, nd, when } from "@/components/new-look/admin/bits";

/**
 * Admin > System > Testing in the new look (24 Oct 2026).
 *
 * The same list as the old page - every step of every journey, grouped by the
 * area it belongs to - with in-page tabs for Core for Launch, Everything,
 * Test Files and Phases. The state and every handler are the page's own
 * (app/(os)/admin/testing), so a mark, a Create a test, a relink or a Clear
 * my tests goes through the same calls as the old look. These walks are also
 * what Wiring now reads to say whether a connection is tested.
 */

export interface Payload {
  ok: boolean;
  error?: string;
  journeys?: Journey[];
  marks?: TestMark[];
  /** Every occasion anybody walked a step, newest first. The marks are the newest of these. */
  runs?: TestRun[];
  switches?: Record<string, { on: boolean; label: string }>;
}

export interface KitLink {
  who: TestWho;
  label: string;
  href: string;
}

export interface KitRun {
  id: string;
  kit: KitId;
  createdAt: string;
  byName: string;
  links: KitLink[];
  said: string;
  canRelink: boolean;
}

export interface Row {
  journey: Journey;
  step: TestStep;
  area: TestAreaId;
  who: TestWho[];
  kit?: KitId;
}

type Scope = "core" | "all" | "files" | "phases";

export const LIGHT_TONE: Record<Light, Tone> = { green: "good", amber: "warning", red: "accent", grey: "neutral" };
const WHO_TONE: Record<TestWho, Tone> = { agent: "neutral", landlord: "warning", tenant: "info", compliance: "accent", office: "neutral" };

function Dots({ counts }: { counts: Record<Light, number> }) {
  return (
    <span className="nl-adm-dots">
      {(["green", "amber", "red", "grey"] as Light[]).map((l) => (
        <Badge key={l} tone={LIGHT_TONE[l]} bare title={LIGHT_WORDS[l]}>
          {`${counts[l]} ${LIGHT_WORDS[l].toLowerCase()}`}
        </Badge>
      ))}
    </span>
  );
}

function Doors({ links }: { links: KitLink[] }) {
  return (
    <div className="nl-adm-doors">
      {links.map((l) => (
        <a key={l.href} href={l.href} target="_blank" rel="noreferrer" className="nl-adm-chip">
          <Badge tone={WHO_TONE[l.who]}>{WHO_WORDS[l.who]}</Badge>
          <span>{l.label}</span>
        </a>
      ))}
    </div>
  );
}

export default function TestingNew(p: {
  data: Payload | null;
  error: string | null;
  scope: Scope;
  setScope: (s: Scope) => void;
  leftOnly: boolean;
  setLeftOnly: (v: boolean) => void;
  open: string | null;
  setOpen: (v: string | null) => void;
  note: Record<string, string>;
  setNote: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  busy: string | null;
  journeys: Journey[];
  marks: Map<string, TestMark>;
  runsByStep: Map<string, TestRun[]>;
  rows: Row[];
  kits: KitRun[];
  fresh: Record<string, KitRun>;
  latestKit: Map<KitId, KitRun>;
  mark: (r: Row, result: "pass" | "fail" | "clear") => Promise<void>;
  createKit: (r: Row) => Promise<void>;
  relink: (run: KitRun, key: string) => Promise<void>;
  clearAll: () => Promise<void>;
}) {
  const { data, error, scope, setScope, leftOnly, setLeftOnly, open, setOpen, note, setNote, busy, journeys, marks, runsByStep, rows, kits, fresh, latestKit, mark, createKit, relink, clearAll } = p;

  const lightOf = (r: Row) => lightFor(r.step, marks.get(`${r.journey.id}/${r.step.id}`) ?? null);
  const areas = TEST_AREAS.filter((a) => scope === "all" || a.core);
  const inScope = rows.filter((r) => areas.some((a) => a.id === r.area));
  const total: Record<Light, number> = { green: 0, amber: 0, red: 0, grey: 0 };
  for (const r of inScope) total[lightOf(r).light] += 1;
  const testable = total.green + total.amber;
  const fails = (data?.runs ?? []).filter((r) => r.result === "fail").slice(0, 40);
  const titleOf = (r: TestRun) => {
    const j = journeys.find((x) => x.id === r.journey);
    return { journey: j?.title ?? r.journey, step: j?.steps.find((s) => s.id === r.step)?.title ?? r.step };
  };
  const list = scope === "core" || scope === "all";

  return (
    <Tab>
      <p className="nl-meta nl-adm-lede">
        Go down the list. Where there is a Create a Test button, press it: it makes a test record with your own email as the customer&apos;s, so every email comes to you. Open it, check it works and looks right, then mark it.
      </p>
      <Tabs<Scope>
        label="Which tests"
        className="nl-ltabs"
        value={scope}
        onChange={setScope}
        items={[
          { id: "core", label: "Core for Launch" },
          { id: "all", label: "Everything" },
          { id: "files", label: "Test Files" },
          /* Last: pressed three times ever, the others daily. */
          { id: "phases", label: "Phases" },
        ]}
      />

      {error && <ErrorLine>{nd(error)}</ErrorLine>}

      {scope === "phases" && <PhasesNew />}
      {scope === "files" && <TestFilesNew />}

      {list && (
        <div className="nl-pane">
          <div className="nl-adm-bar">
            <label className="nl-adm-check">
              <input id="testing-left-only-new" type="checkbox" checked={leftOnly} onChange={(e) => setLeftOnly(e.target.checked)} />
              Only what is left to test
            </label>
            {data && (
              <span className="nl-fcount">
                {total.green} of {testable} tested
              </span>
            )}
            {data && <Dots counts={total} />}
          </div>

          {!data && !error && <Loading what="Reading the marks…" />}

          {data && fails.length > 0 && (
            <Section title="What the Testers Found" aside={<span className="nl-meta">{fails.length} reported, newest first</span>}>
              <ul className="nl-adm-rows">
                {fails.map((r) => {
                  const t = titleOf(r);
                  return (
                    <li key={r.id}>
                      <div className="nl-adm-row-main">
                        <button type="button" className="nl-link" onClick={() => setOpen(`${r.journey}/${r.step}`)}>
                          {t.step}
                        </button>
                        <p className="nl-meta">
                          {t.journey}. {r.by}, {when(r.at)}
                        </p>
                        {r.note && <p className="nl-adm-quote">&ldquo;{nd(r.note)}&rdquo;</p>}
                      </div>
                      <div className="nl-adm-row-side">
                        <Badge tone="accent">Failed</Badge>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Section>
          )}

          {kits.length > 0 && (
            <Section
              title="Your Tests"
              aside={
                <button type="button" disabled={busy !== null} onClick={() => void clearAll()} className="nl-btn nl-btn--secondary nl-btn--sm">
                  {busy === "clear" ? "Clearing…" : "Clear My Tests"}
                </button>
              }
            >
              <p className="nl-meta">{kits.length} made and not cleared. They are yours alone, kept out of REX, and every email on them goes to you.</p>
              <ul className="nl-adm-rows">
                {kits.map((k) => (
                  <li key={k.id}>
                    <div className="nl-adm-row-main">
                      <div className="nl-adm-row-line">
                        <span className="nl-strong">{KITS[k.kit].label.replace(/^Create an? /, "").replace(/^./, (c) => c.toUpperCase())}</span>
                        <span className="nl-mono">{when(k.createdAt)}</span>
                      </div>
                      <div className="nl-adm-row-acts">
                        <Doors links={k.links} />
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {data &&
            areas.map((area) => {
              const all = rows.filter((r) => r.area === area.id);
              const shown = all.filter((r) => {
                if (!leftOnly) return true;
                const l = lightOf(r);
                return l.light === "amber" || l.stale;
              });
              const counts: Record<Light, number> = { green: 0, amber: 0, red: 0, grey: 0 };
              for (const r of all) counts[lightOf(r).light] += 1;
              if (!shown.length && leftOnly) return null;
              return (
                <Section key={area.id} title={<>{area.label}{!area.core && <span className="nl-meta"> After launch</span>}</>} aside={<Dots counts={counts} />}>
                  <ul className="nl-adm-rows">
                    {shown.map((r) => {
                      const key = `${r.journey.id}/${r.step.id}`;
                      const mk = marks.get(key) ?? null;
                      const { light, stale } = lightFor(r.step, mk);
                      const sw = r.step.switchKey ? data.switches?.[r.step.switchKey] : null;
                      const isOpen = open === key || open === r.step.id;
                      const kit = r.kit ? KITS[r.kit] : null;
                      const run = fresh[key] ?? (r.kit ? latestKit.get(r.kit) : undefined);
                      const history = (runsByStep.get(key) ?? []).slice(1);
                      return (
                        <li key={key} id={`step-${key.replace(/\W+/g, "-")}`}>
                          <button type="button" className="nl-adm-open" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : key)}>
                            <span className="nl-adm-row-main">
                              <span className="nl-strong">{r.step.title}</span>
                              <span className="nl-adm-row-line nl-adm-mt">
                                {r.who.map((w) => (
                                  <Badge key={w} tone={WHO_TONE[w]} bare>
                                    {WHO_WORDS[w]}
                                  </Badge>
                                ))}
                                {kit && light !== "red" && light !== "grey" && <span className="nl-meta">Has a test to create</span>}
                              </span>
                            </span>
                            <span className="nl-adm-row-side">
                              <span className="nl-adm-stack">
                                <Badge tone={LIGHT_TONE[light]}>{LIGHT_WORDS[light]}</Badge>
                                {mk && (
                                  <span className="nl-meta">
                                    {mk.result === "pass" ? "OK" : "Failed"}, {mk.by}, {when(mk.at)}
                                  </span>
                                )}
                                {stale && <span className="nl-meta nl-adm-warn">Rebuilt since. Test it again.</span>}
                                {sw && <span className="nl-meta">Switch {sw.on ? "on" : "off"}</span>}
                              </span>
                            </span>
                          </button>

                          {isOpen && (
                            <div className="nl-adm-open-body">
                              <p className="nl-meta">{nd(r.step.what)}</p>

                              {r.step.state === "blocked" && r.step.blocked && (
                                <div className="nl-adm-panel is-bad">
                                  <p>Can&apos;t do this yet.</p>
                                  <p>{nd(r.step.blocked.why)}</p>
                                  <p>Needs: {nd(r.step.blocked.who)}</p>
                                </div>
                              )}
                              {r.step.state === "notbuilt" && (
                                <div className="nl-adm-panel">
                                  <p className="nl-strong">Not built yet.</p>
                                  <p>{nd(r.step.todo)}</p>
                                </div>
                              )}

                              {r.step.state === "built" && (
                                <>
                                  {kit && (
                                    <div className="nl-adm-panel">
                                      <div className="nl-adm-row-acts">
                                        <button type="button" disabled={busy !== null} onClick={() => void createKit(r)} className="nl-btn nl-btn--primary nl-btn--sm">
                                          {busy === `kit:${key}` ? "Making it…" : run ? kit.label.replace(/^Create an? /, "Create another ") : kit.label}
                                        </button>
                                        <span className="nl-meta">{nd(kit.makes)}</span>
                                      </div>
                                      {run && (
                                        <>
                                          <p className="nl-adm-after">{fresh[key] ? nd(run.said) : `Your test from ${when(run.createdAt)}.`}</p>
                                          <div className="nl-adm-row-acts">
                                            <Doors links={run.links} />
                                            {run.canRelink && !run.links.some((l) => l.who === "landlord") && (
                                              <button type="button" disabled={busy !== null} onClick={() => void relink(run, key)} className="nl-btn nl-btn--quiet nl-btn--sm">
                                                {busy === `relink:${run.id}` ? "Making a link…" : "Get a Landlord Portal Link"}
                                              </button>
                                            )}
                                          </div>
                                        </>
                                      )}
                                    </div>
                                  )}

                                  {mk?.result === "fail" && mk.note && (
                                    <div className="nl-adm-panel is-warn">
                                      <p>Failed last time: {nd(mk.note)}</p>
                                    </div>
                                  )}

                                  <h3 className="nl-adm-sub">How to Test It</h3>
                                  <ol className="nl-adm-steps">
                                    {r.step.how.map((h, k) => (
                                      <li key={k}>{nd(h)}</li>
                                    ))}
                                  </ol>
                                  {r.step.notes && r.step.notes.length > 0 && (
                                    <ul className="nl-adm-steps">
                                      {r.step.notes.map((n, k) => (
                                        <li key={k} className="nl-meta">
                                          {nd(n)}
                                        </li>
                                      ))}
                                    </ul>
                                  )}

                                  <div className="nl-adm-arm">
                                    {r.step.where && !r.step.where.includes("{") && (
                                      <a href={r.step.where} target="_blank" rel="noreferrer" className="nl-btn nl-btn--secondary nl-btn--sm">
                                        Open the Screen
                                      </a>
                                    )}
                                    <input
                                      id={`testing-note-new-${key.replace(/\W+/g, "-")}`}
                                      value={note[key] ?? ""}
                                      onChange={(e) => setNote((n) => ({ ...n, [key]: e.target.value }))}
                                      placeholder="What you saw (needed for Failed)"
                                      aria-label={`What you saw on ${r.step.title}`}
                                      className="nl-input"
                                    />
                                    <button type="button" disabled={busy === key} onClick={() => void mark(r, "pass")} className="nl-btn nl-btn--sage nl-btn--sm">
                                      Tested OK
                                    </button>
                                    <button type="button" disabled={busy === key} onClick={() => void mark(r, "fail")} className="nl-btn nl-btn--secondary nl-btn--sm">
                                      Failed
                                    </button>
                                    {mk && (
                                      <button type="button" disabled={busy === key} onClick={() => void mark(r, "clear")} className="nl-btn nl-btn--quiet nl-btn--sm">
                                        Take Back My Mark
                                      </button>
                                    )}
                                  </div>

                                  {/* Every time it was walked, not just the last: a step somebody fixed shows the failure it used to have. */}
                                  {history.length > 0 && (
                                    <>
                                      <h3 className="nl-adm-sub">Walked {history.length + 1} Times</h3>
                                      <ul className="nl-lines">
                                        {history.map((h) => (
                                          <li key={h.id}>
                                            <Badge tone={h.result === "fail" ? "accent" : "good"} bare>
                                              {h.result === "pass" ? "OK" : "Failed"}
                                            </Badge>
                                            <span>
                                              <span className="nl-meta">
                                                {h.by}, {when(h.at)}
                                              </span>
                                              {h.note && <span className="nl-adm-quote nl-adm-blockmeta">&ldquo;{nd(h.note)}&rdquo;</span>}
                                            </span>
                                          </li>
                                        ))}
                                      </ul>
                                    </>
                                  )}
                                </>
                              )}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </Section>
              );
            })}
        </div>
      )}
    </Tab>
  );
}
