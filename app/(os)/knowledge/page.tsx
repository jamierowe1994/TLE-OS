"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import DoodleIcon from "@/components/DoodleIcon";
import PageHeader from "@/components/PageHeader";
import { PressButton } from "@/components/Bits";
import { Pill } from "@/components/Wire";
import { whenAgo } from "@/lib/lead-spine";

/**
 * The knowledge hub (item 22).
 *
 * One screen where Susan, Francesca, Michael and Kirstie write down how this
 * business works, and two things happen to every entry the moment it is
 * saved: Steve answers from it on the next question, and - if it is marked
 * as a guide - it goes on the Guides shelf in his panel for the agents to
 * read at their own pace.
 *
 * ── Plain writing ─────────────────────────────────────────────────────────
 *
 * No toolbar, no markup to learn. Type or paste; blank lines make paragraphs,
 * a line starting "-" makes a list, a line starting "#" makes a heading. A
 * .txt or .md file drops straight in. A person who can write an email can
 * write a guide.
 *
 * ── The writing order ─────────────────────────────────────────────────────
 *
 * The list on the right is the questions agents asked Steve that he had to
 * pass on because nothing written covered them. That list is the backlog:
 * every one is a guide somebody needed and could not find. Press one and
 * the editor opens with the question as the title.
 */

interface Entry {
  id: string;
  title: string;
  content: string;
  section: string;
  guide: boolean;
  updatedBy: string;
  updatedAt: string;
}

interface Asked {
  id: string;
  asked: string;
  by: string;
  at: string;
}

const FIELD = "w-full rounded-xl border border-line/80 bg-transparent px-3.5 py-2.5 text-[13px] outline-none focus:border-ink";

export default function KnowledgeHub() {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [sections, setSections] = useState<string[]>([]);
  const [asked, setAsked] = useState<Asked[]>([]);
  const [denied, setDenied] = useState(false);
  const [q, setQ] = useState("");
  const [fSection, setFSection] = useState<string | null>(null);

  const [editing, setEditing] = useState<Entry | "new" | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [section, setSection] = useState("");
  const [guide, setGuide] = useState(false);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(() => {
    fetch("/api/knowledge", { cache: "no-store" })
      .then((r) => (r.status === 403 ? Promise.reject(new Error("denied")) : r.json()))
      .then((j: { entries?: Entry[]; sections?: string[]; unanswered?: Asked[] }) => {
        setEntries(j.entries ?? []);
        setSections(j.sections ?? []);
        setAsked(j.unanswered ?? []);
      })
      .catch((e: Error) => {
        if (e.message === "denied") setDenied(true);
        else setEntries([]);
      });
  }, []);
  useEffect(load, [load]);

  function startNew(prefill?: { title?: string }) {
    setEditing("new");
    setTitle(prefill?.title ?? "");
    setContent("");
    setSection(sections[0] ?? "How we work");
    setGuide(false);
    setNote(null);
  }
  function startEdit(e: Entry) {
    setEditing(e);
    setTitle(e.title);
    setContent(e.content);
    setSection(e.section);
    setGuide(e.guide);
    setNote(null);
  }

  async function save() {
    if (!title.trim() || !content.trim() || saving) return;
    setSaving(true);
    setNote(null);
    try {
      const r = await fetch("/api/knowledge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: editing === "new" || !editing ? undefined : editing.id, title, content, section, guide }),
      });
      const j = (await r.json()) as { entry?: Entry; error?: string };
      if (!r.ok || !j.entry) throw new Error(j.error ?? "Couldn't save that.");
      setEntries((cur) => [j.entry as Entry, ...(cur ?? []).filter((e) => e.id !== (j.entry as Entry).id)]);
      setEditing(null);
      setNote(null);
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Couldn't save that.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(e: Entry) {
    if (!window.confirm(`Delete "${e.title}"? Steve forgets it straight away, and it leaves the shelf.`)) return;
    const r = await fetch(`/api/knowledge?id=${encodeURIComponent(e.id)}`, { method: "DELETE" });
    if (r.ok) {
      setEntries((cur) => (cur ?? []).filter((x) => x.id !== e.id));
      if (editing && editing !== "new" && editing.id === e.id) setEditing(null);
    }
  }

  function onUpload(file: File) {
    if (!/\.(txt|md|markdown)$/i.test(file.name)) {
      setNote("Text files only (.txt or .md). Paste from a PDF or Word document instead.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      setContent((cur) => (cur.trim() ? `${cur}\n\n${text}` : text));
      if (!title.trim()) setTitle(file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " "));
      setNote(null);
    };
    reader.readAsText(file);
  }

  const shelves = useMemo(() => {
    const all = entries ?? [];
    const needle = q.trim().toLowerCase();
    const kept = all.filter((e) => {
      if (fSection && e.section !== fSection) return false;
      if (needle && !`${e.title} ${e.content}`.toLowerCase().includes(needle)) return false;
      return true;
    });
    const names = [...new Set([...sections, ...kept.map((e) => e.section)])];
    return names.map((name) => ({ name, items: kept.filter((e) => e.section === name) })).filter((s) => s.items.length);
  }, [entries, sections, q, fSection]);

  const used = useMemo(() => [...new Set((entries ?? []).map((e) => e.section))], [entries]);

  if (denied) {
    return (
      <>
        <PageHeader title="Knowledge" blurb="This screen belongs to the people who write the guides." search={false} />
        <p className="mt-8 text-[13px] text-muted">Ask James if you should have it.</p>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Knowledge"
        blurb="How this business works, written down once. Steve answers from it on the next question, and anything marked as a guide goes on his shelf for the agents."
        search={false}
        actions={
          <PressButton
            onClick={() => startNew()}
            className="flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-[13px] font-semibold text-page"
          >
            <span className="text-[15px] leading-none">+</span> Write something
          </PressButton>
        }
      />

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* ── the shelves ── */}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <label className="flex min-w-44 flex-1 items-center gap-2.5 rounded-full border border-line/80 px-3.5 py-2 focus-within:border-ink">
              <DoodleIcon name="search" size={14} className="shrink-0 text-muted" />
              <input
                type="text"
                placeholder="Search what is written…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="w-full bg-transparent text-[12px] outline-none placeholder:text-muted/70"
              />
            </label>
            <button
              type="button"
              onClick={() => setFSection(null)}
              className={`rounded-full border px-3.5 py-2 text-[12px] ${fSection === null ? "border-accent-dark bg-accent-soft/50 font-semibold text-accent-dark" : "border-line/80 text-muted hover:border-ink/40"}`}
            >
              Everything
            </button>
            {used.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setFSection(s === fSection ? null : s)}
                className={`rounded-full border px-3.5 py-2 text-[12px] ${fSection === s ? "border-accent-dark bg-accent-soft/50 font-semibold text-accent-dark" : "border-line/80 text-muted hover:border-ink/40"}`}
              >
                {s}
              </button>
            ))}
          </div>

          {entries === null ? (
            <p className="mt-8 text-[12.5px] text-muted">Reading…</p>
          ) : !entries.length ? (
            <div className="fade-up mt-6 rounded-2xl border border-dashed border-line/80 p-8 text-center">
              <p className="hand text-[18px]">Nothing written yet</p>
              <p className="mx-auto mt-2 max-w-md text-[12.5px] leading-relaxed text-muted">
                Start with the thing agents ask most - what we charge, how a viewing is booked, what happens after an
                offer. The questions on the right are the ones Steve could not answer.
              </p>
            </div>
          ) : !shelves.length ? (
            <p className="mt-8 text-[12.5px] text-muted">Nothing matches that.</p>
          ) : (
            shelves.map((shelf) => (
              <section key={shelf.name} className="fade-up mt-6">
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">{shelf.name}</p>
                <ul className="mt-2.5 grid gap-2.5 md:grid-cols-2">
                  {shelf.items.map((e) => (
                    <li key={e.id} className="rounded-2xl border border-line/80 bg-panel p-4">
                      <div className="flex items-start gap-2">
                        <button type="button" onClick={() => startEdit(e)} className="min-w-0 flex-1 text-left">
                          <span className="hand block text-[16px] leading-tight">{e.title}</span>
                          <span className="mt-1 block text-[11.5px] leading-snug text-muted">
                            {e.content.split(/\n/).find((l) => l.trim() && !/^#/.test(l))?.slice(0, 140)}
                          </span>
                        </button>
                        {e.guide && <Pill tone="good">Guide</Pill>}
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-3 text-[10.5px] text-muted">
                        <span>
                          {e.updatedBy ? `${e.updatedBy} · ` : ""}
                          {whenAgo(e.updatedAt)}
                        </span>
                        <button type="button" onClick={() => startEdit(e)} className="font-semibold hover:text-ink">
                          Edit
                        </button>
                        {e.guide && (
                          <Link href={`/knowledge/${e.id}`} className="font-semibold hover:text-ink">
                            Read as an agent
                          </Link>
                        )}
                        <button type="button" onClick={() => void remove(e)} className="ml-auto hover:text-ink">
                          Delete
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>

        {/* ── the writing order ── */}
        <aside className="fade-up h-fit rounded-2xl border border-line/80 bg-panel p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">Steve could not answer</p>
          <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
            What agents asked and nothing written covered. Press one to write it.
          </p>
          {!asked.length ? (
            <p className="mt-3 text-[12px] text-muted">Nothing outstanding.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line/50">
              {asked.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => startNew({ title: a.asked.replace(/[?.!]+$/, "").slice(0, 120) })}
                    className="block w-full py-2.5 text-left transition-colors hover:text-accent-dark"
                  >
                    <span className="block text-[12.5px] leading-snug">{a.asked}</span>
                    <span className="mt-0.5 block text-[10.5px] text-muted">
                      {a.by} · {whenAgo(a.at)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>

      {/* ── the editor ── */}
      {editing && (
        <div className="fixed inset-0 z-[140] flex items-start justify-center overflow-y-auto bg-ink/45 p-4">
          <button type="button" aria-label="Close" onClick={() => setEditing(null)} className="absolute inset-0 cursor-default" />
          <div className="fade-up relative my-auto w-full max-w-3xl rounded-3xl border border-line/80 bg-page p-6 shadow-[0_30px_70px_-20px_rgba(0,0,0,0.5)]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="hand text-[20px]">{editing === "new" ? "Write something down" : "Edit"}</h2>
                <p className="mt-0.5 text-[11.5px] text-muted">
                  {note ?? "Plain writing. Blank lines make paragraphs, a line starting with - makes a list, # makes a heading."}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="rounded-full border border-line/80 px-4 py-2 text-[12.5px] font-medium hover:border-ink/40"
                >
                  Cancel
                </button>
                <PressButton
                  onClick={() => void save()}
                  disabled={saving || !title.trim() || !content.trim()}
                  className={`rounded-full px-5 py-2 text-[12.5px] font-semibold ${
                    !saving && title.trim() && content.trim() ? "bg-accent-dark text-page" : "cursor-not-allowed bg-line/40 text-muted"
                  }`}
                >
                  {saving ? "Saving…" : "Save"}
                </PressButton>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_220px]">
              <input
                className={FIELD}
                autoFocus
                placeholder="What is this about - e.g. Our fees for a fully managed let"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <input
                className={FIELD}
                list="knowledge-sections"
                placeholder="Shelf"
                value={section}
                onChange={(e) => setSection(e.target.value)}
              />
              <datalist id="knowledge-sections">
                {[...new Set([...sections, ...used])].map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>

            <textarea
              className={`${FIELD} mt-3 min-h-[320px] resize-y font-[inherit] leading-relaxed`}
              placeholder="Write it the way you would explain it to somebody on their first morning."
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-[12.5px]">
                <input type="checkbox" checked={guide} onChange={(e) => setGuide(e.target.checked)} className="h-4 w-4 accent-[var(--accent-dark)]" />
                Put it on the Guides shelf for agents to read
              </label>
              <div className="flex items-center gap-3 text-[11.5px] text-muted">
                <span className="figures">{content.length.toLocaleString("en-GB")} / 20,000</span>
                <button type="button" onClick={() => fileRef.current?.click()} className="font-semibold hover:text-ink">
                  Add a .txt or .md file
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".txt,.md,.markdown"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onUpload(f);
                    e.target.value = "";
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
