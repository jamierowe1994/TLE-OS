"use client";

import Link from "next/link";
import { Badge, Ico, Tabs } from "@/components/new-look/Parts";
import { AdmDrawer, Loading, Problem } from "@/components/new-look/admin/bits";
import KnowledgeLinks from "@/components/knowledge/KnowledgeLinks";
import MarketingKnowledge from "@/components/knowledge/MarketingKnowledge";
import { whenAgo } from "@/lib/lead-spine";
import type { KnowledgeHubState } from "@/components/knowledge/KnowledgeHubBody";

/**
 * Knowledge in the new look, under Admin > Content (lib/new-look "admin",
 * 24 Oct 2026). The same hub as /knowledge (components/knowledge/
 * KnowledgeHubBody): one hook reads and writes /api/knowledge for both, so
 * write, edit and delete behave identically from either door.
 */

export default function KnowledgeNew({ hub }: { hub: KnowledgeHubState }) {
  const { entries, sections, asked, denied, loadError, q, setQ, fSection, setFSection, editing, setEditing, title, setTitle, content, setContent, section, setSection, view, setView, feeding, setFeeding, guide, setGuide, saving, note, fileRef, load, startNew, startEdit, save, remove, onUpload, shelves, used } = hub;

  if (denied) {
    return (
      <div data-look="new" className="nl-page nl-adm nl-adm-screen">
        <p className="nl-empty">This screen belongs to the people who write the guides. Ask James if you should have it.</p>
      </div>
    );
  }

  const ready = !saving && title.trim() && content.trim();

  return (
    <>
      <div data-look="new" className="nl-page nl-rise nl-adm nl-adm-screen">
        <div className="nl-adm-bar">
          <p className="nl-meta">
            How this business works, written down once. Steve answers from it on the next question, and anything marked as a guide goes on his shelf for the agents.
          </p>
          <div className="nl-adm-bar-acts">
            <button type="button" onClick={() => { setView("operational"); setFeeding((f) => !f); }} className="nl-btn nl-btn--secondary nl-btn--sm">
              {feeding ? "Close Links" : "Feed Steve Links"}
            </button>
            <button type="button" onClick={() => startNew()} className="nl-btn nl-btn--primary nl-btn--sm">
              <Ico name="plus" size={14} /> Write Something
            </button>
          </div>
        </div>

        <div className="nl-adm-toolbar">
          <Tabs
            label="Knowledge"
            value={view}
            onChange={setView}
            items={[
              { id: "operational", label: "Operational knowledge", count: entries?.length ?? null },
              { id: "marketing", label: "Marketing knowledge" },
            ]}
          />
          <label className="nl-fsearch nl-adm-search">
            <Ico name="search" size={15} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search what is written" aria-label="Search what is written" />
          </label>
        </div>

        {view === "operational" && feeding && (
          <div className="nl-adm-holder">
            <KnowledgeLinks onSaved={load} onClose={() => setFeeding(false)} />
          </div>
        )}
        {view === "marketing" && (
          <div className="nl-adm-holder">
            <MarketingKnowledge q={q} />
          </div>
        )}

        {view === "operational" && (
          <div className="nl-adm-split">
            {/* ── the shelves ── */}
            <section className="nl-adm-card min-w-0">
              {used.length > 0 && (
                <div className="nl-tabs nl-adm-chips" role="tablist" aria-label="Shelf">
                  <button type="button" role="tab" aria-selected={fSection === null} onClick={() => setFSection(null)} className={`nl-tab${fSection === null ? " is-on" : ""}`}>
                    Everything
                  </button>
                  {used.map((s) => (
                    <button key={s} type="button" role="tab" aria-selected={fSection === s} onClick={() => setFSection(s === fSection ? null : s)} className={`nl-tab${fSection === s ? " is-on" : ""}`}>
                      {s}
                    </button>
                  ))}
                </div>
              )}

              {loadError ? (
                <div className="mt-4">
                  <Problem onRetry={load}>{loadError}</Problem>
                </div>
              ) : entries === null ? (
                <Loading label="Reading what's written…" />
              ) : !entries.length ? (
                <div className="nl-adm-blank">
                  <p className="nl-empty">Nothing written yet.</p>
                  <p className="nl-meta">
                    Start with the thing agents ask most: what we charge, how a viewing is booked, what happens after an offer. The questions beside this are the ones Steve could not answer.
                  </p>
                </div>
              ) : !shelves.length ? (
                <p className="nl-empty">Nothing matches that.</p>
              ) : (
                shelves.map((shelf) => (
                  <div key={shelf.name} className="nl-adm-shelf">
                    <p className="nl-eyebrow">
                      {shelf.name} <span className="nl-count">{shelf.items.length}</span>
                    </p>
                    <ul className="nl-adm-rows is-ruled mt-2">
                      {shelf.items.map((e) => (
                        <li key={e.id}>
                          <button type="button" onClick={() => startEdit(e)} className="nl-adm-open nl-adm-row-main">
                            <span className="nl-adm-row-line">
                              <span className="nl-strong">{e.title}</span>
                              {e.guide && <Badge tone="good" bare>Guide</Badge>}
                            </span>
                            <span className="nl-meta block nl-adm-clamp">{e.content.split(/\n/).find((l) => l.trim() && !/^#/.test(l))?.slice(0, 160)}</span>
                            <span className="nl-meta block">
                              {e.updatedBy ? `${e.updatedBy} · ` : ""}
                              {whenAgo(e.updatedAt)}
                            </span>
                          </button>
                          <div className="nl-adm-row-acts">
                            <button type="button" onClick={() => startEdit(e)} className="nl-btn nl-btn--quiet nl-btn--sm">
                              Edit
                            </button>
                            {e.guide && (
                              <Link href={`/knowledge/${e.id}`} className="nl-btn nl-btn--quiet nl-btn--sm">
                                Read as an Agent
                              </Link>
                            )}
                            <button type="button" onClick={() => void remove(e)} className="nl-btn nl-btn--quiet nl-btn--sm nl-adm-danger">
                              Delete
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              )}
            </section>

            {/* ── the writing order ── */}
            <aside className="nl-adm-card">
              <h2 className="nl-adm-h">
                Steve Couldn&apos;t Answer <span className="nl-count">{asked.length}</span>
              </h2>
              <p className="nl-meta nl-adm-sub">What agents asked and nothing written covered. Press one to write it.</p>
              {entries === null && !loadError ? (
                <Loading label="Reading…" />
              ) : !asked.length ? (
                <p className="nl-empty">Nothing outstanding.</p>
              ) : (
                <ul className="nl-adm-rows mt-2">
                  {asked.map((a) => (
                    <li key={a.id} className="is-tight">
                      <button type="button" onClick={() => startNew({ title: a.asked.replace(/[?.!]+$/, "").slice(0, 120) })} className="nl-adm-open">
                        <span className="nl-strong block">{a.asked}</span>
                        <span className="nl-meta block">
                          {a.by} · {whenAgo(a.at)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </aside>
          </div>
        )}
      </div>

      {/* ── the editor ── */}
      {editing && (
        <AdmDrawer
          wide
          eyebrow="Knowledge"
          title={editing === "new" ? "Write Something Down" : "Edit"}
          sub={note ?? "Plain writing. Blank lines make paragraphs, a line starting with - makes a list, # makes a heading. A .txt, .md or .html file drops straight in."}
          onClose={() => setEditing(null)}
          foot={
            <>
              <span className="nl-meta mr-auto">{content.length.toLocaleString("en-GB")} / 20,000</span>
              <button type="button" onClick={() => setEditing(null)} className="nl-btn nl-btn--quiet nl-btn--sm">
                Cancel
              </button>
              <button type="button" onClick={() => void save()} disabled={!ready} className="nl-btn nl-btn--primary nl-btn--sm">
                {saving ? "Saving…" : "Save"}
              </button>
            </>
          }
        >
          <div className="nl-form">
            <div className="nl-form-row nl-adm-titlerow">
              <label className="nl-field">
                <span>Title</span>
                <input autoFocus placeholder="e.g. Our fees for a fully managed let" value={title} onChange={(e) => setTitle(e.target.value)} />
              </label>
              <label className="nl-field">
                <span>Shelf</span>
                <input list="knowledge-sections-new" placeholder="Shelf" value={section} onChange={(e) => setSection(e.target.value)} />
                <datalist id="knowledge-sections-new">
                  {[...new Set([...sections, ...used])].map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </label>
            </div>
            <label className="nl-field">
              <span>What to say</span>
              <textarea className="nl-adm-plain min-h-[320px]" placeholder="Write it the way you would explain it to somebody on their first morning." value={content} onChange={(e) => setContent(e.target.value)} />
            </label>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="nl-adm-check">
                <input type="checkbox" checked={guide} onChange={(e) => setGuide(e.target.checked)} />
                <span>Put it on the Guides shelf for agents to read</span>
              </label>
              <button type="button" onClick={() => fileRef.current?.click()} className="nl-btn nl-btn--secondary nl-btn--sm">
                <Ico name="upload" size={14} /> Add a File
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".txt,.md,.markdown,.html,.htm"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onUpload(f);
                  e.target.value = "";
                }}
              />
            </div>
          </div>
        </AdmDrawer>
      )}
    </>
  );
}
