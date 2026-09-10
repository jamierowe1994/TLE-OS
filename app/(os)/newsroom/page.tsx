"use client";

import { useCallback, useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { PressButton } from "@/components/Bits";
import { Pill } from "@/components/Wire";
import Segmented from "@/components/Segmented";
import DoodleIcon from "@/components/DoodleIcon";
import { whenAgo } from "@/lib/lead-spine";

/**
 * The newsroom - where the office says something to everybody.
 *
 * James, 10 Sep 2026: "We also need a news section, which we want to launch and
 * say to the news section."
 *
 * ── Why it is its own screen and not a mode of the knowledge hub ──────────
 *
 * They look similar - both are somebody at head office writing something every
 * agent will read - and they are opposites in the one way that matters.
 * Knowledge is permanent and asked for: it sits there until somebody needs it,
 * and nobody is interrupted by it. A post is the other thing entirely. It goes
 * out, it puts a red dot on every agent's screen, and it is stale within the
 * week. Writing those two in the same editor invites the first to be published
 * like the second.
 *
 * ── What is deliberately small ────────────────────────────────────────────
 *
 * A headline, a few lines, a kind, and optionally somewhere to go. No
 * formatting, no images, no scheduling. This is read inside a panel 392px wide
 * on somebody's phone at half past eight in the morning: anything longer than a
 * paragraph belongs in a guide, and the "Take a look" link is how a post points
 * at one.
 */

const KINDS = [
  { id: "announcement", label: "Announcement" },
  { id: "release", label: "New in the OS" },
  { id: "reminder", label: "Reminder" },
] as const;

/* What each kind is FOR, said next to the choice rather than in a help note
   nobody opens. Three kinds only mean something if people pick the right one. */
const KIND_HINT: Record<string, string> = {
  announcement: "Something the business is telling everybody. A change, a result, a new person.",
  release: "Something in the OS is new or works differently. Point it at the screen or the guide.",
  reminder: "Something that has to happen by a date. Give it an until date so it retires itself.",
};

const FIELD =
  "w-full rounded-xl border border-line/80 bg-transparent px-3.5 py-2.5 text-[13px] outline-none focus:border-ink";

interface Post {
  id: string;
  title: string;
  body: string;
  kind: string;
  pinned: boolean;
  link: string;
  author: string;
  publishedAt: string;
  until: string | null;
}

export default function Newsroom() {
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [denied, setDenied] = useState(false);

  const [editing, setEditing] = useState<Post | "new" | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<string>("announcement");
  const [pinned, setPinned] = useState(false);
  const [link, setLink] = useState("");
  const [until, setUntil] = useState("");
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(() => {
    /* ?all=1 is the writer's view: retired posts come back too, so a notice
       that has passed its date can still be edited or deleted rather than
       disappearing from the one screen that could tidy it up. */
    fetch("/api/news/posts?all=1", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { posts?: Post[]; canPublish?: boolean }) => {
        setPosts(j.posts ?? []);
        setDenied(j.canPublish === false);
      })
      .catch(() => setPosts([]));
  }, []);
  useEffect(load, [load]);

  function startNew() {
    setEditing("new");
    setTitle("");
    setBody("");
    setKind("announcement");
    setPinned(false);
    setLink("");
    setUntil("");
    setNote(null);
  }

  function startEdit(p: Post) {
    setEditing(p);
    setTitle(p.title);
    setBody(p.body);
    setKind(p.kind);
    setPinned(p.pinned);
    setLink(p.link);
    /* The input wants yyyy-mm-dd; the store keeps an instant. */
    setUntil(p.until ? p.until.slice(0, 10) : "");
    setNote(null);
  }

  async function publish() {
    if (!title.trim() || saving) return;
    setSaving(true);
    setNote(null);
    try {
      const r = await fetch("/api/news/posts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: editing === "new" || !editing ? undefined : editing.id,
          title,
          body,
          kind,
          pinned,
          link,
          /* End of the day, not the start of it. A notice that is "until
             Thursday" should still be there on Thursday afternoon. */
          until: until ? `${until}T23:59:59` : null,
        }),
      });
      const j = (await r.json()) as { post?: Post; error?: string };
      if (!r.ok || !j.post) throw new Error(j.error ?? "That didn't publish.");
      setEditing(null);
      load();
    } catch (e) {
      setNote(e instanceof Error ? e.message : "That didn't publish.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(p: Post) {
    if (!window.confirm(`Delete "${p.title}"? It comes off everybody's News tab straight away.`)) return;
    const r = await fetch(`/api/news/posts?id=${encodeURIComponent(p.id)}`, { method: "DELETE" });
    if (r.ok) setPosts((cur) => (cur ?? []).filter((x) => x.id !== p.id));
  }

  const retired = (p: Post) => Boolean(p.until && p.until < new Date().toISOString());

  if (denied) {
    return (
      <>
        <PageHeader
          title="Newsroom"
          blurb="This screen belongs to the people who speak for the office."
          search={false}
        />
        <p className="mt-8 text-[13px] text-muted">Ask James if you should have it.</p>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Newsroom"
        blurb="What the office is telling everybody. A post appears in Steve's News tab and puts a dot on his shoulder until it has been read."
        search={false}
        actions={
          <PressButton
            onClick={startNew}
            className="flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-[13px] font-semibold text-page"
          >
            <span className="text-[15px] leading-none">+</span> Write a post
          </PressButton>
        }
      />

      {posts === null ? (
        <p className="mt-8 text-[12.5px] text-muted">Reading the board…</p>
      ) : !posts.length ? (
        <div className="fade-up mt-6 rounded-2xl border border-dashed border-line/80 p-8 text-center">
          <p className="hand text-[18px]">Nothing on the board</p>
          <p className="mx-auto mt-2 max-w-md text-[12.5px] leading-relaxed text-muted">
            The first post is usually the one that says the OS is here. After that: anything that
            changes, anything with a date on it, and anything you would otherwise have emailed
            everybody about.
          </p>
        </div>
      ) : (
        <ul className="mt-6 grid gap-3 md:grid-cols-2">
          {posts.map((p) => (
            <li
              key={p.id}
              className={`fade-up rounded-2xl border bg-panel p-4 ${
                retired(p) ? "border-line/60 opacity-60" : p.pinned ? "border-accent-dark/45" : "border-line/80"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.07em] text-accent-dark">
                  {KINDS.find((k) => k.id === p.kind)?.label ?? "Announcement"}
                </span>
                {p.pinned && <DoodleIcon name="star" size={12} className="text-accent-dark" />}
                {retired(p) && <Pill>Retired</Pill>}
                <span className="ml-auto text-[10.5px] text-muted">{whenAgo(p.publishedAt)}</span>
              </div>
              <button type="button" onClick={() => startEdit(p)} className="mt-2 block w-full text-left">
                <span className="hand block text-[16px] leading-tight">{p.title}</span>
                {p.body && (
                  <span className="mt-1 block text-[11.5px] leading-snug text-muted">
                    {p.body.slice(0, 160)}
                    {p.body.length > 160 ? "…" : ""}
                  </span>
                )}
              </button>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-[10.5px] text-muted">
                <span>
                  {p.author ? `${p.author}` : "Unattributed"}
                  {p.until ? ` · until ${new Date(p.until).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}
                </span>
                <button type="button" onClick={() => startEdit(p)} className="font-semibold hover:text-ink">
                  Edit
                </button>
                <button type="button" onClick={() => void remove(p)} className="ml-auto hover:text-ink">
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* ── the writer ── */}
      {editing && (
        <div className="fixed inset-0 z-[140] flex items-start justify-center overflow-y-auto bg-ink/45 p-4">
          <button
            type="button"
            aria-label="Close"
            onClick={() => setEditing(null)}
            className="absolute inset-0 cursor-default"
          />
          <div className="fade-up relative my-auto w-full max-w-2xl rounded-3xl border border-line/80 bg-page p-6 shadow-[0_30px_70px_-20px_rgba(0,0,0,0.5)]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="hand text-[20px]">{editing === "new" ? "Write a post" : "Edit the post"}</h2>
                <p className="mt-0.5 text-[11.5px] text-muted">
                  {note ??
                    (editing === "new"
                      ? "Everybody signed in sees this the next time they open Steve."
                      : "Editing does not re-date it, so a typo fix will not send it back to the top.")}
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
                  onClick={() => void publish()}
                  disabled={saving || !title.trim()}
                  className={`rounded-full px-5 py-2 text-[12.5px] font-semibold ${
                    !saving && title.trim() ? "bg-accent-dark text-page" : "cursor-not-allowed bg-line/40 text-muted"
                  }`}
                >
                  {saving ? "Publishing…" : editing === "new" ? "Publish" : "Save"}
                </PressButton>
              </div>
            </div>

            <Segmented
              className="mt-4 w-full"
              options={KINDS.map((k) => ({ id: k.id, label: k.label }))}
              value={kind}
              onChange={setKind}
            />
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted">{KIND_HINT[kind]}</p>

            <input
              className={`${FIELD} mt-3`}
              autoFocus
              placeholder="The headline - e.g. Viewings can now be booked straight from a lead"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={160}
            />
            <textarea
              className={`${FIELD} mt-3 min-h-[140px] resize-y font-[inherit] leading-relaxed`}
              placeholder="A few lines. What changed, and what it means for them."
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={4000}
            />

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="block text-[11px] font-semibold uppercase tracking-[0.07em] text-muted">
                  Take a look
                </span>
                <input
                  className={`${FIELD} mt-1.5`}
                  placeholder="/viewings"
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                />
                <span className="mt-1 block text-[10.5px] leading-relaxed text-muted">
                  A screen in the OS, starting with a slash. Outside links are not allowed here -
                  every agent would follow it on our word.
                </span>
              </label>
              <label className="block">
                <span className="block text-[11px] font-semibold uppercase tracking-[0.07em] text-muted">
                  Until
                </span>
                <input
                  type="date"
                  className={`${FIELD} mt-1.5`}
                  value={until}
                  onChange={(e) => setUntil(e.target.value)}
                />
                <span className="mt-1 block text-[10.5px] leading-relaxed text-muted">
                  It takes itself off the board after this. Leave it empty and it stands until you
                  delete it.
                </span>
              </label>
            </div>

            <label className="mt-3 flex items-center gap-2 text-[12.5px]">
              <input
                type="checkbox"
                checked={pinned}
                onChange={(e) => setPinned(e.target.checked)}
                className="h-4 w-4 accent-[var(--accent-dark)]"
              />
              Keep it at the top of the board
            </label>
          </div>
        </div>
      )}
    </>
  );
}
