"use client";

import { useCallback, useEffect, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import EmailBuilder from "@/components/EmailBuilder";
import type { CampaignStep } from "@/lib/campaigns";

/**
 * Every email the OS sends, in one place, as the recipient will see it.
 *
 * ── Why a catalogue and not a list of files ─────────────────────────────────
 *
 * Email is the only part of this system that leaves the building. A wrong
 * number on a dashboard is embarrassing for an afternoon; a wrong sentence in
 * a launch email is in five hundred inboxes forever. So the point of this
 * screen is not administration, it is READING: titles you can scan, and one
 * click to the real thing at full size.
 *
 * Previews render in an IFRAME rather than inline. Emails carry their own
 * page background, table widths and inline styles, and dropping that into the
 * OS's own document makes both look wrong. The iframe is also honest: what is
 * on screen is the actual document that would be sent, not an approximation
 * of it drawn in the app's stylesheet.
 */

type Row = {
  id: string;
  group: string;
  name: string;
  audience: "partner" | "landlord" | "internal";
  trigger: string;
  fires: string;
  to: string;
  draft: boolean;
  /** Block-authored, so the builder can own it. Hand-rolled ones cannot. */
  editable: boolean;
  summary: string;
};

const AUDIENCE: Record<Row["audience"], { label: string; className: string }> = {
  partner: { label: "Partner", className: "border-accent-dark/40 text-accent-dark" },
  landlord: { label: "Landlord", className: "border-emerald-600/40 text-emerald-700" },
  internal: { label: "Internal", className: "border-line text-muted" },
};

export default function AdminEmails() {
  const [rows, setRows] = useState<Row[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "off">("loading");
  const [open, setOpen] = useState<Row | null>(null);

  useEffect(() => {
    fetch("/api/admin/emails")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("no"))))
      .then((j) => {
        setRows(j.rows ?? []);
        setState("ready");
      })
      .catch(() => setState("off"));
  }, []);

  if (state === "off") {
    return <p className="text-[13px] text-muted">Nothing here.</p>;
  }

  const groups = Array.from(new Set(rows.map((r) => r.group)));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-[22px] leading-tight">Emails</h1>
        <p className="mt-1 max-w-prose text-[12.5px] leading-relaxed text-muted">
          Every email the OS sends, as the person receiving it will see it. Open one to read it
          full size.
        </p>
      </div>

      {state === "loading" && <p className="text-[12.5px] text-muted">Reading the catalogue…</p>}

      {groups.map((g) => (
        <section key={g}>
          <h2 className="mb-2.5 text-[10.5px] font-semibold uppercase tracking-wide text-muted">
            {g}
          </h2>
          <ul className="space-y-2">
            {rows
              .filter((r) => r.group === g)
              .map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => setOpen(r)}
                    className="flex w-full flex-col gap-1.5 rounded-2xl border border-line/70 bg-panel p-4 text-left transition-colors hover:border-ink/40"
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      <DoodleIcon name="mail" size={14} className="text-accent-dark" />
                      <span className="text-[13.5px] font-semibold">{r.name}</span>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${AUDIENCE[r.audience].className}`}
                      >
                        {AUDIENCE[r.audience].label}
                      </span>
                      {/* Said on the LIST, not just inside. An email that
                          looks finished but has no send path behind it is the
                          one thing this screen must not imply. */}
                      {r.draft && (
                        <span className="rounded-full border border-amber-500/50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                          Not wired up
                        </span>
                      )}
                      <span className="ml-auto text-[11px] text-muted">Read it →</span>
                    </span>
                    <span className="text-[11.5px] leading-relaxed text-muted">{r.summary}</span>
                  </button>
                </li>
              ))}
          </ul>
        </section>
      ))}

      {open && <Reader row={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

/** One email, full size, with the facts about it kept out of the way. */
function Reader({ row, onClose }: { row: Row; onClose: () => void }) {
  const [html, setHtml] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [facts, setFacts] = useState(false);
  const [doc, setDoc] = useState<{ subject: string; blocks: Record<string, unknown>[] } | null>(null);
  const [index, setIndex] = useState<number>(-1);
  const [edited, setEdited] = useState(false);
  const [building, setBuilding] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/admin/emails?id=${encodeURIComponent(row.id)}`)
      .then((r) => r.json())
      .then((j) => {
        if (!j.ok) return setError(j.error);
        setHtml(j.html);
        setSubject(j.subject);
        setDoc(j.doc ?? null);
        setIndex(j.index ?? -1);
        setEdited(Boolean(j.edited));
      })
      .catch(() => setError("Couldn't render it."));
  }, [row.id]);

  useEffect(load, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[150] flex flex-col bg-ink/45 backdrop-blur-sm">
      <div className="flex flex-wrap items-center gap-3 border-b border-line/70 bg-page px-5 py-3.5">
        <DoodleIcon name="mail" size={16} className="text-accent-dark" />
        <div className="min-w-0">
          <h3 className="truncate text-[14px]">{row.name}</h3>
          {/* The SUBJECT LINE is the first thing anyone reviewing an email
              needs, and it is the one part a preview pane normally hides. */}
          <p className="truncate text-[11.5px] text-muted">{subject || row.summary}</p>
        </div>
        {edited && (
          <span className="rounded-full border border-amber-500/50 px-2.5 py-0.5 text-[10px] font-semibold text-amber-700">
            Edited here
          </span>
        )}
        {row.editable && doc && (
          <button
            type="button"
            onClick={() => setBuilding(true)}
            className="ml-auto rounded-full bg-accent-dark px-4 py-1.5 text-[11.5px] font-semibold text-page"
          >
            Edit
          </button>
        )}
        <button
          type="button"
          onClick={() => setFacts((f) => !f)}
          className={`${row.editable && doc ? "" : "ml-auto "}rounded-full border border-line/70 px-3.5 py-1.5 text-[11.5px] hover:border-ink/40`}
        >
          {facts ? "Hide details" : "Details"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full bg-ink px-4 py-1.5 text-[11.5px] text-page"
        >
          Close
        </button>
      </div>

      {facts && (
        <dl className="grid gap-x-6 gap-y-2 border-b border-line/70 bg-panel px-5 py-4 text-[11.5px] sm:grid-cols-2">
          <div>
            <dt className="text-muted">Goes to</dt>
            <dd>{row.to}</dd>
          </div>
          <div>
            <dt className="text-muted">Sent when</dt>
            <dd>{row.trigger}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-muted">Sent from</dt>
            <dd className={row.draft ? "text-amber-700" : ""}>{row.fires}</dd>
          </div>
        </dl>
      )}

      <div className="min-h-0 flex-1 overflow-auto bg-[#f6f4f2] p-4 sm:p-8">
        {error ? (
          <p className="mx-auto max-w-xl rounded-xl bg-accent-soft/60 px-4 py-3 text-[12.5px] text-accent-dark">
            {error}
          </p>
        ) : html == null ? (
          <p className="text-center text-[12.5px] text-muted">Rendering…</p>
        ) : (
          /* srcDoc, not src: the document already exists in memory, and a
             route serving raw email HTML would be a second place the same
             thing could be read from. */
          <iframe
            title={`${row.name} preview`}
            srcDoc={html}
            sandbox=""
            className="mx-auto block h-full min-h-[70vh] w-full max-w-[720px] rounded-2xl border border-line/60 bg-white shadow-sm"
          />
        )}
      </div>

      {/* The same drag-and-drop builder the marketing campaigns use. Nothing
          is forked: one editor means one place where a block type or a
          spacing rule is fixed. It is campaign-shaped, so the catalogue hands
          it a stand-in step; `initial` carries the real document and wins. */}
      {building && doc && (
        <EmailBuilder
          campaignId="email-catalog"
          stepIndex={index}
          step={
            {
              day: 0,
              channel: "email",
              subject: doc.subject,
              gist: row.summary,
              body: [],
            } as unknown as CampaignStep
          }
          initial={{ subject: doc.subject, blocks: doc.blocks }}
          onClose={() => setBuilding(false)}
          onSaved={(copy) => {
            setEdited(Boolean(copy));
            if (copy) setDoc({ subject: copy.subject ?? doc.subject, blocks: copy.blocks });
            /* Re-render from the SERVER rather than trusting the editor's
               own canvas: the canvas draws one block at a time without the
               shell, so it is not proof the finished email still works. */
            load();
          }}
        />
      )}
    </div>
  );
}
