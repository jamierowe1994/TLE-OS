"use client";

import { Badge, Ico } from "@/components/new-look/Parts";
import { AdmDrawer, Loading, Problem } from "@/components/new-look/admin/content-bits";
import { whenAgo } from "@/lib/lead-spine";
import { KIND_HINT, KINDS, type NewsroomState } from "@/components/newsroom/NewsroomBody";

/**
 * The newsroom in the new look, under Admin > Content (lib/new-look "admin",
 * 24 Oct 2026). The same board as /newsroom (components/newsroom/
 * NewsroomBody): one hook reads and publishes through /api/news/posts for
 * both, behind the same edit:knowledge check.
 */

const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

export default function NewsroomNew({ nr }: { nr: NewsroomState }) {
  const { posts, denied, loadError, editing, setEditing, title, setTitle, body, setBody, kind, setKind, pinned, setPinned, link, setLink, until, setUntil, saving, note, load, startNew, startEdit, publish, remove, retired } = nr;

  if (denied) {
    return (
      <div data-look="new" className="nl-page nl-adm nl-adm-screen">
        <p className="nl-empty">This screen belongs to the people who speak for the office. Ask James if you should have it.</p>
      </div>
    );
  }

  const live = (posts ?? []).filter((p) => !retired(p));

  return (
    <>
      <div data-look="new" className="nl-page nl-rise nl-adm nl-adm-screen">
        <div className="nl-adm-bar">
          <p className="nl-meta">What the office is telling everybody. A post appears in Steve&apos;s News tab and puts a dot on his shoulder until it has been read.</p>
          <div className="nl-adm-bar-acts">
            <button type="button" onClick={startNew} className="nl-btn nl-btn--primary nl-btn--sm">
              <Ico name="plus" size={14} /> Write a Post
            </button>
          </div>
        </div>

        <section className="nl-adm-card">
          <div className="nl-adm-card-head">
            <h2 className="nl-adm-h">
              The Board <span className="nl-count">{posts && !loadError ? posts.length : ""}</span>
            </h2>
            {posts && !loadError && posts.length > 0 && (
              <span className="nl-meta">
                {live.length} up · {posts.length - live.length} retired
              </span>
            )}
          </div>

          {loadError ? (
            <Problem onRetry={load}>We couldn&apos;t read the board just now. Nothing has been lost.</Problem>
          ) : posts === null ? (
            <Loading label="Reading the board…" />
          ) : !posts.length ? (
            <div className="nl-adm-blank">
              <p className="nl-empty">Nothing on the board.</p>
              <p className="nl-meta">
                The first post is usually the one that says the OS is here. After that: anything that changes, anything with a date on it, and anything you would otherwise have emailed everybody about.
              </p>
            </div>
          ) : (
            <ul className="nl-adm-rows is-ruled">
              {posts.map((p) => (
                <li key={p.id} className={retired(p) ? "is-quiet" : undefined}>
                  <button type="button" onClick={() => startEdit(p)} className="nl-adm-open nl-adm-row-main">
                    <span className="nl-adm-row-line">
                      <Badge tone={p.kind === "release" ? "info" : p.kind === "reminder" ? "warning" : "accent"} bare>
                        {KINDS.find((k) => k.id === p.kind)?.label ?? "Announcement"}
                      </Badge>
                      {p.pinned && <Badge tone="good" bare>Pinned</Badge>}
                      {retired(p) && <Badge tone="neutral" bare>Retired</Badge>}
                    </span>
                    <span className="nl-strong block mt-1">{p.title}</span>
                    {p.body && (
                      <span className="nl-meta block nl-adm-clamp">
                        {p.body.slice(0, 200)}
                        {p.body.length > 200 ? "…" : ""}
                      </span>
                    )}
                    <span className="nl-meta block">
                      {p.author || "Unattributed"} · {whenAgo(p.publishedAt)}
                      {p.until ? ` · until ${shortDate(p.until)}` : ""}
                      {p.link ? ` · points to ${p.link}` : ""}
                    </span>
                  </button>
                  <div className="nl-adm-row-acts">
                    <button type="button" onClick={() => startEdit(p)} className="nl-btn nl-btn--quiet nl-btn--sm">
                      Edit
                    </button>
                    <button type="button" onClick={() => void remove(p)} className="nl-btn nl-btn--quiet nl-btn--sm nl-adm-danger">
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* ── the writer ── */}
      {editing && (
        <AdmDrawer
          eyebrow="Newsroom"
          title={editing === "new" ? "Write a Post" : "Edit the Post"}
          sub={note ?? (editing === "new" ? "Everybody signed in sees this the next time they open Steve." : "Editing does not re-date it, so a typo fix will not send it back to the top.")}
          onClose={() => setEditing(null)}
          foot={
            <>
              <button type="button" onClick={() => setEditing(null)} className="nl-btn nl-btn--quiet nl-btn--sm">
                Cancel
              </button>
              <button type="button" onClick={() => void publish()} disabled={saving || !title.trim()} className="nl-btn nl-btn--primary nl-btn--sm">
                {saving ? "Publishing…" : editing === "new" ? "Publish" : "Save"}
              </button>
            </>
          }
        >
          <div className="nl-form">
            <div className="nl-field">
              <span>Kind</span>
              <div className="nl-toggle self-start" role="radiogroup" aria-label="Kind">
                {KINDS.map((k) => (
                  <button key={k.id} type="button" role="radio" aria-checked={kind === k.id} className={kind === k.id ? "is-on" : ""} onClick={() => setKind(k.id)}>
                    {k.label}
                  </button>
                ))}
              </div>
              <small>{KIND_HINT[kind]}</small>
            </div>
            <label className="nl-field">
              <span>Headline</span>
              <input autoFocus placeholder="e.g. Viewings can now be booked straight from a lead" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} />
            </label>
            <label className="nl-field">
              <span>A few lines</span>
              <textarea className="nl-adm-plain min-h-[140px]" placeholder="What changed, and what it means for them." value={body} onChange={(e) => setBody(e.target.value)} maxLength={4000} />
            </label>
            <div className="nl-form-row">
              <label className="nl-field">
                <span>Take a look</span>
                <input placeholder="/viewings" value={link} onChange={(e) => setLink(e.target.value)} />
                <small>A screen in the OS, starting with a slash. Outside links are not allowed here: every agent would follow it on our word.</small>
              </label>
              <label className="nl-field">
                <span>Until</span>
                <input type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
                <small>It takes itself off the board after this. Leave it empty and it stands until you delete it.</small>
              </label>
            </div>
            <label className="nl-adm-check">
              <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
              <span>Keep it at the top of the board</span>
            </label>
          </div>
        </AdmDrawer>
      )}
    </>
  );
}
