"use client";

import { Badge, type Tone } from "@/components/new-look/Parts";
import type { Todo } from "@/lib/admin-client";
import { ErrorLine, Loading, Section, Tab, nd } from "@/components/new-look/admin/bits";

/**
 * Admin > Issues > To do in the new look (24 Oct 2026). The system tracker,
 * as rows on hairlines. Adding and moving go through the page's own calls
 * (app/(os)/admin/todo), so nothing about the list changes but its look.
 */

const STATE: Record<string, { word: string; tone: Tone }> = {
  open: { word: "Open", tone: "neutral" },
  doing: { word: "Doing", tone: "warning" },
  done: { word: "Done", tone: "good" },
};

export default function TodoNew({
  todos,
  denied,
  failed,
  retry,
  title,
  setTitle,
  busy,
  add,
  setState,
}: {
  todos: Todo[] | null;
  denied: boolean;
  failed: boolean;
  retry: () => void;
  title: string;
  setTitle: (v: string) => void;
  busy: boolean;
  add: (e: React.FormEvent) => void;
  setState: (id: string, state: string) => void;
}) {
  if (denied) {
    return (
      <Tab>
        <p className="nl-empty">Nothing here.</p>
      </Tab>
    );
  }
  if (failed) {
    return (
      <Tab>
        <ErrorLine onRetry={retry}>The list could not be read. The connection dropped before it arrived.</ErrorLine>
      </Tab>
    );
  }
  if (!todos) {
    return (
      <Tab>
        <Loading what="Reading the list…" />
      </Tab>
    );
  }
  const left = todos.filter((t) => t.state !== "done").length;
  return (
    <Tab>
      <p className="nl-meta nl-adm-lede">Everything still to build, tracked where you&apos;ll actually see it.</p>
      <form onSubmit={add} className="nl-adm-form">
        <label className="nl-field">
          <span>Add to the list</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs doing?" />
        </label>
        <button type="submit" disabled={busy || !title.trim()} className="nl-btn nl-btn--primary">
          {busy ? "Adding…" : "Add"}
        </button>
      </form>

      <Section title={<>On the List <span className="nl-count">{todos.length}</span></>} aside={<span className="nl-meta">{left} not done</span>}>
        {todos.length === 0 ? (
          <p className="nl-empty">Nothing on the list.</p>
        ) : (
          <ul className="nl-adm-rows">
            {todos.map((t) => {
              const st = STATE[t.state] ?? { word: t.state, tone: "neutral" as Tone };
              return (
                <li key={t.id}>
                  <div className="nl-adm-row-main">
                    <span className={`nl-strong${t.state === "done" ? " nl-adm-done" : ""}`}>{nd(t.title)}</span>
                    {t.detail && <p className="nl-meta">{nd(t.detail)}</p>}
                    <div className="nl-adm-row-acts">
                      {(["open", "doing", "done"] as const)
                        .filter((x) => x !== t.state)
                        .map((x) => (
                          <button key={x} type="button" onClick={() => setState(t.id, x)} className="nl-btn nl-btn--quiet nl-btn--sm">
                            Mark {STATE[x].word}
                          </button>
                        ))}
                    </div>
                  </div>
                  <div className="nl-adm-row-side">
                    <Badge tone={st.tone}>{st.word}</Badge>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </Tab>
  );
}
