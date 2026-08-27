"use client";
import { useCallback, useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { Pill } from "@/components/Wire";
import { loadAdmin, type AdminData } from "@/lib/admin-client";

/** The system tracker — kept in the product, not in a document nobody opens. */
export default function AdminTodo() {
  const [d, setD] = useState<AdminData | null>(null);
  const [denied, setDenied] = useState(false);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => { loadAdmin().then((x) => (x ? setD(x) : setDenied(true))); }, []);
  useEffect(load, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    await fetch("/api/admin/todos", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ title }),
    });
    setTitle(""); setBusy(false); load();
  }

  async function setState(id: string, state: string) {
    await fetch("/api/admin/todos", {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, state }),
    });
    load();
  }

  if (denied) return <div className="py-16 text-center"><p className="hand text-[20px]">Nothing here</p></div>;
  if (!d) return <p className="text-[12.5px] text-muted">Loading…</p>;

  return (
    <>
      <PageHeader title="To do" blurb="Everything still to build, tracked where you'll actually see it." />
      <form onSubmit={add} className="fade-up mt-8 flex gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What needs doing?"
          className="flex-1 rounded-lg border border-line/80 bg-box px-3 py-2.5 text-[13px]"
        />
        <button type="submit" disabled={busy || !title.trim()}
          className="rounded-lg bg-accent-dark px-4 py-2.5 text-[12.5px] font-semibold text-white disabled:opacity-40">
          Add
        </button>
      </form>

      {d.todos.length === 0 ? (
        <p className="mt-4 text-[12.5px] text-muted">Nothing on the list.</p>
      ) : (
        <ul className="fade-up mt-4 space-y-2">
          {d.todos.map((t) => (
            <li key={t.id} className="rounded-xl border border-line/70 bg-panel p-3.5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className={`text-[13px] ${t.state === "done" ? "text-muted line-through" : ""}`}>{t.title}</span>
                <Pill tone={t.state === "doing" ? "accent" : "neutral"}>{t.state}</Pill>
              </div>
              {t.detail && <p className="mt-1 text-[11.5px] text-muted">{t.detail}</p>}
              <div className="mt-2 flex gap-2">
                {(["open", "doing", "done"] as const).filter((s) => s !== t.state).map((s) => (
                  <button key={s} type="button" onClick={() => setState(t.id, s)}
                    className="rounded-lg border border-line/80 px-2.5 py-1 text-[11px]">
                    Mark {s}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
