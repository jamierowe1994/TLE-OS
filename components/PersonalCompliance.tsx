"use client";

import { useCallback, useEffect, useState } from "react";
import { londonToday } from "@/lib/london-clock";
import DoodleIcon from "@/components/DoodleIcon";
import { PressButton } from "@/components/Bits";
import { Pill } from "@/components/Wire";
import { Badge } from "@/components/new-look/Parts";
import {
  expiryFor,
  KIND_LABEL,
  STATE_WORDS,
  type ComplianceItem,
} from "@/lib/agent-compliance-types";

/**
 * The agent's own compliance, on their profile.
 *
 * What they hold personally, against the list Michael keeps, with the date
 * each runs out and a reminder that lands 30, 14 and 7 days before it does.
 * "Mark it done" is their word - the date they got it and, if they like, a
 * note or a link to where it is - and Michael's check is a separate act on
 * his screen. The two dates are shown as two dates.
 */

const today = () => londonToday();

/** A document or a check is a piece of paper; training and declarations are a date. */
const wantsFile = (i: ComplianceItem) => i.requirement.kind === "document" || i.requirement.kind === "check";

function tone(state: ComplianceItem["state"]): "good" | "accent" | "neutral" {
  if (state === "verified") return "good";
  if (state === "held") return "neutral";
  return "accent";
}

export default function PersonalCompliance({ look }: { look?: "new" } = {}) {
  const [items, setItems] = useState<ComplianceItem[] | null>(null);
  const [stored, setStored] = useState(true);
  const [marking, setMarking] = useState<ComplianceItem | null>(null);
  const [doneAt, setDoneAt] = useState(today());
  const [note, setNote] = useState("");
  const [link, setLink] = useState("");
  /* James, 9 Sep 2026: marking it done was not enough - the certificate has to
     land on their file. The document goes into the agency's own store and the
     link we keep points at it, so "where it is" can be the thing itself rather
     than a Dropbox URL that dies. */
  const [fileName, setFileName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/agent-compliance", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { ok?: boolean; stored?: boolean; items?: ComplianceItem[] } | null) => {
        setItems(j?.items ?? []);
        setStored(j?.stored !== false);
      })
      .catch(() => setItems([]));
  }, []);
  useEffect(load, [load]);

  function open(i: ComplianceItem) {
    setMarking(i);
    setDoneAt(i.doneAt ?? today());
    setNote(i.note);
    setLink(i.link);
    setFileName("");
    setError(null);
  }

  async function save() {
    if (!marking || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/agent-compliance", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ requirementId: marking.requirement.id, doneAt, note, link }),
      });
      const j = (await r.json()) as { ok?: boolean; error?: string; items?: ComplianceItem[] };
      if (!r.ok || !j.ok) throw new Error(j.error ?? "That didn't save.");
      setItems(j.items ?? []);
      setMarking(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't save.");
    } finally {
      setBusy(false);
    }
  }

  const short = (items ?? []).filter((i) => i.requirement.required && i.state !== "verified" && i.state !== "held").length;

  /* Mark it done, with the upload: one sheet for both looks. */
  const sheet = (
    <>
      {marking && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center p-4">
          <button type="button" aria-label="Close" onClick={() => setMarking(null)} className="absolute inset-0 cursor-default bg-ink/45" />
          <div className="fade-up relative w-full max-w-md rounded-3xl border border-line/80 bg-page p-6 shadow-[0_30px_70px_-20px_rgba(0,0,0,0.5)]">
            <h2 className="hand text-[20px]">{marking.requirement.title}</h2>
            <p className="mt-1 text-[12.5px] text-muted">{marking.requirement.what}</p>
            <label className="mt-4 block text-[10.5px] font-semibold uppercase tracking-wide text-muted">
              When you got it
              <input
                type="date"
                value={doneAt}
                max={today()}
                onChange={(e) => setDoneAt(e.target.value)}
                className="mt-1 block w-full rounded-xl border border-line/80 bg-transparent px-3 py-2 text-[13px] font-normal normal-case tracking-normal outline-none focus:border-ink"
              />
            </label>
            {marking.requirement.renewsMonths && doneAt && (
              <p className="mt-1.5 text-[11px] text-muted">
                Runs out {expiryFor(doneAt, marking.requirement.renewsMonths)}.
              </p>
            )}
            <label className="mt-3 flex cursor-pointer items-center gap-2.5 rounded-xl border border-dashed border-line/80 px-3 py-2.5 text-[12.5px] transition-colors hover:border-ink/40">
              <DoodleIcon name="upload" size={14} className="shrink-0 text-accent-dark" />
              <span className="min-w-0 flex-1 truncate">
                {uploading
                  ? "Uploading\u2026"
                  : fileName || (wantsFile(marking) ? "Upload the document (PDF or a photo)" : "Upload a certificate (optional)")}
              </span>
              {fileName && !uploading && (
                <span className="shrink-0 text-[11px] font-semibold text-muted">Replace</span>
              )}
              <input
                type="file"
                accept="application/pdf,image/*"
                className="hidden"
                disabled={uploading}
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (!f || !marking) return;
                  setUploading(true);
                  setError(null);
                  try {
                    const body = new FormData();
                    body.set("file", f);
                    body.set("scope", "document");
                    body.set("ref", `agent-compliance-${marking.requirement.id}`);
                    const j = await fetch("/api/r2/upload", { method: "POST", body }).then((r) => r.json());
                    if (!j.ok) throw new Error(j.error ?? "That did not upload.");
                    setLink(j.url);
                    setFileName(j.name ?? f.name);
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "That did not upload.");
                  } finally {
                    setUploading(false);
                  }
                }}
              />
            </label>
            <input
              value={link}
              onChange={(e) => { setLink(e.target.value); setFileName(""); }}
              placeholder="Or paste a link to where it is (optional)"
              className="mt-2 block w-full rounded-xl border border-line/80 bg-transparent px-3 py-2 text-[13px] outline-none focus:border-ink"
            />
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Anything Michael should know (optional)"
              rows={2}
              className="mt-3 block w-full resize-none rounded-xl border border-line/80 bg-transparent px-3 py-2 text-[13px] outline-none focus:border-ink"
            />
            {error && <p className="mt-3 text-[12px] text-red-700">{error}</p>}
            <div className="mt-5 flex items-center justify-end gap-3">
              <button type="button" onClick={() => setMarking(null)} className="rounded-full border border-line/80 px-5 py-2.5 text-[12.5px] font-medium hover:border-ink/40">
                Cancel
              </button>
              <PressButton onClick={() => void save()} disabled={busy || !doneAt} className="rounded-full bg-accent-dark px-6 py-2.5 text-[13px] font-semibold text-page disabled:opacity-40">
                {busy ? "Saving…" : "Done"}
              </PressButton>
            </div>
          </div>
        </div>
      )}
    </>
  );

  /* ── THE NEW LOOK (lib/new-look "settings", 23 Oct 2026) ─────────────────
     Claude Design's Personal compliance: a summary with the ring and the one
     thing to do next, then each thing as a row with how much life is left on
     it. The same list, dates and Mark it done / upload sheet as below. */
  if (look === "new") {
    const req = (items ?? []).filter((i) => i.requirement.required);
    const fine = req.filter((i) => i.state === "verified" || i.state === "held").length;
    /* The most pressing: expired, then running out soonest, then not on file. */
    const rank = (i: ComplianceItem) => (i.state === "expired" ? 0 : i.state === "due" ? 1 : i.state === "missing" ? 2 : 3);
    const next = [...req].filter((i) => rank(i) < 3).sort((a, b) => rank(a) - rank(b) || (a.daysLeft ?? 9e9) - (b.daysLeft ?? 9e9))[0];
    const name = (i: ComplianceItem) => i.requirement.title;
    const nextSays = !next
      ? "Everything you hold is in date. Reminders come by email a month before anything runs out."
      : next.state === "expired"
        ? `${name(next)} ran out ${Math.abs(next.daysLeft ?? 0)} days ago.`
        : next.state === "due"
          ? `${name(next)} runs out in ${next.daysLeft} ${next.daysLeft === 1 ? "day" : "days"}.`
          : `${name(next)} isn't on file yet.`;
    const others = next ? req.filter((i) => i !== next && rank(i) < 3).length : 0;
    const dayOf = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    const life = (i: ComplianceItem) => {
      if (!i.expiresAt || !i.requirement.renewsMonths || i.daysLeft == null) return i.doneAt ? 1 : 0;
      return Math.max(0, Math.min(1, i.daysLeft / (i.requirement.renewsMonths * 30.44)));
    };
    const word = (i: ComplianceItem): { tone: "good" | "warning" | "accent" | "neutral"; text: string } =>
      i.state === "verified" ? { tone: "good", text: "Checked" }
        : i.state === "held" ? { tone: "good", text: "In date" }
          : i.state === "due" ? { tone: "warning", text: `${i.daysLeft} ${i.daysLeft === 1 ? "day" : "days"} left` }
            : i.state === "expired" ? { tone: "accent", text: "Expired" }
              : { tone: "warning", text: "Not on file" };
    const act = (i: ComplianceItem) => (i.state === "missing" ? (wantsFile(i) ? "Upload" : "Mark it done") : i.state === "due" || i.state === "expired" ? "Renew" : wantsFile(i) ? "Replace" : "Update");
    return (
      <div className="nl-pc">
        {!stored && <p className="nl-meta mb-3">No database on this environment, so nothing here is kept.</p>}
        {items === null ? (
          <p className="nl-meta">Reading…</p>
        ) : !items.length ? (
          <p className="nl-empty">Nothing is asked of you yet. The list is still being written.</p>
        ) : (
          <>
            <section className="nl-pc-summary">
              <span className="nl-pc-ring" style={{ "--p": req.length ? fine / req.length : 1 } as React.CSSProperties}>
                <b>{fine}/{req.length}</b>
              </span>
              <div className="min-w-0">
                <h3 className="nl-block-title">{!next ? "All in Date" : fine === req.length - 1 ? "Nearly There" : `${req.length - fine} Things to Sort`}</h3>
                <p className="nl-meta mt-1">{nextSays}{next && others ? ` ${others} more after that.` : next ? " Everything else is in date." : ""}</p>
              </div>
              {next && (
                <button type="button" className="nl-btn nl-btn--primary" onClick={() => open(next)}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 16V4M7 9l5-5 5 5M4.5 15v3a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3" /></svg>
                  {next.state === "missing" ? (wantsFile(next) ? "Upload it" : "Mark it done") : "Upload the renewal"}
                </button>
              )}
            </section>

            <ul className="nl-pc-list">
              {items.map((i) => {
                const w = word(i);
                const urgent = i.state === "due" || i.state === "expired" || i.state === "missing";
                return (
                  <li key={i.requirement.id}>
                    <div className="min-w-0">
                      <span className="nl-strong block">
                        {i.requirement.title}
                        {!i.requirement.required && <span className="nl-meta"> · optional</span>}
                      </span>
                      <span className="nl-meta block">
                        {i.note || i.requirement.what}
                        {i.requirement.howLink && !i.doneAt && (
                          <> · <a href={i.requirement.howLink} target="_blank" rel="noreferrer" className="underline underline-offset-2">where to get it</a></>
                        )}
                      </span>
                    </div>
                    <div className="nl-pc-life">
                      <span className="nl-pc-bar"><i className={i.state === "due" || i.state === "expired" ? "warn" : ""} style={{ width: `${Math.max(i.doneAt ? 3 : 0, life(i) * 100)}%` }} /></span>
                      <span className="nl-meta">
                        {i.expiresAt ? `${i.state === "expired" ? "Ran out" : "Expires"} ${dayOf(i.expiresAt)}` : i.doneAt ? `Done ${dayOf(i.doneAt)} · does not run out` : `${KIND_LABEL[i.requirement.kind]}${i.requirement.renewsMonths ? ` · every ${i.requirement.renewsMonths} months` : " · once"}`}
                        {i.link && <> · <a href={i.link} target="_blank" rel="noreferrer" className="underline underline-offset-2">View</a></>}
                      </span>
                    </div>
                    <Badge tone={w.tone} title={i.verifiedBy && i.state === "verified" ? `Checked by ${i.verifiedBy}` : undefined}>{w.text}</Badge>
                    <button type="button" className={urgent ? "nl-btn nl-btn--secondary nl-btn--sm" : "nl-link"} onClick={() => open(i)}>{act(i)}</button>
                  </li>
                );
              })}
            </ul>
            <p className="nl-meta mt-5">Reminders go by email 30, 14 and 7 days before something runs out, and once for anything not on file. Michael checks each one from his side.</p>
          </>
        )}
        {sheet}
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <p className="mb-4 text-[12.5px] leading-relaxed text-muted">
        The properties have their page - this one is yours: what a partner agent holds personally, when each runs
        out, and the reminder that lands a month before it does. Mark a thing done with the date you got it;
        Michael checks it from his side.
      </p>
      {!stored && <p className="mb-3 text-[12px] text-muted">No database on this environment, so nothing here is kept.</p>}
      {items === null ? (
        <p className="text-[12.5px] text-muted">Reading…</p>
      ) : !items.length ? (
        <p className="text-[12.5px] text-muted">Nothing is asked of you yet - the list is still being written.</p>
      ) : (
        <>
          {short > 0 && (
            <p className="mb-3 flex items-center gap-2 text-[12.5px] font-medium text-accent-dark">
              <DoodleIcon name="bell" size={14} />
              {short} thing{short === 1 ? "" : "s"} to sort.
            </p>
          )}
          <div className="overflow-x-auto rounded-2xl border border-line/70">
            <table className="w-full min-w-[640px] text-left">
              <thead>
                <tr className="border-b border-line/70 text-[10px] font-semibold uppercase tracking-wide text-muted">
                  <th className="px-4 py-3">What you hold</th>
                  <th className="px-4 py-3">Runs out</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.requirement.id} className="border-b border-line/40 last:border-0">
                    <td className="px-4 py-3.5">
                      <span className="block text-[12.5px] font-semibold">
                        {i.requirement.title}
                        {!i.requirement.required && <span className="ml-1.5 text-[10px] font-normal text-muted">optional</span>}
                      </span>
                      <span className="block text-[11px] leading-snug text-muted">{i.requirement.what}</span>
                      <span className="mt-0.5 block text-[10px] text-muted">
                        {KIND_LABEL[i.requirement.kind]}
                        {i.requirement.renewsMonths ? ` · every ${i.requirement.renewsMonths} months` : " · once"}
                        {i.requirement.howLink && (
                          <>
                            {" · "}
                            <a href={i.requirement.howLink} target="_blank" rel="noreferrer" className="underline decoration-line underline-offset-2 hover:text-ink">
                              where to get it
                            </a>
                          </>
                        )}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5">
                      {i.expiresAt ? (
                        <>
                          <span className="figures block text-[12.5px]">{i.expiresAt}</span>
                          <span className={`block text-[10px] ${i.state === "due" || i.state === "expired" ? "font-semibold text-accent-dark" : "text-muted"}`}>
                            {i.daysLeft != null && i.daysLeft < 0
                              ? `${Math.abs(i.daysLeft)} days ago`
                              : i.daysLeft != null
                                ? `in ${i.daysLeft} days`
                                : ""}
                          </span>
                        </>
                      ) : i.doneAt ? (
                        <span className="text-[11px] text-muted">does not run out</span>
                      ) : (
                        <span className="text-[11px] text-muted">no record</span>
                      )}
                      {/* What they put on file, there to open again. It was
                          stored and then never shown back to them. */}
                      {i.link && (
                        <a
                          href={i.link}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 flex items-center gap-1 text-[10.5px] font-semibold text-accent-dark underline decoration-accent-dark/40 underline-offset-2"
                        >
                          <DoodleIcon name="doc" size={10} />
                          View document
                        </a>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <Pill tone={tone(i.state)}>{STATE_WORDS[i.state]}</Pill>
                      {i.verifiedBy && i.state === "verified" && (
                        <span className="mt-1 block text-[10px] text-muted">by {i.verifiedBy}</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <button
                        type="button"
                        onClick={() => open(i)}
                        className={`rounded-full px-4 py-2 text-[11px] font-semibold transition-colors ${
                          i.state === "missing" || i.state === "expired" || i.state === "due"
                            ? "press-ring bg-accent-dark text-page"
                            : "border border-ink/25 hover:border-ink"
                        }`}
                      >
                        {/* Says what you will actually do (James, 21 Sep 2026:
                            "there's no way of them uploading them themselves").
                            The upload was always in this panel, behind a button
                            that said "Mark it done" and a field that said
                            "optional" - so nobody found it. */}
                        {i.doneAt ? "Update" : wantsFile(i) ? "Upload" : "Mark it done"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-[10.5px] leading-relaxed text-muted">
            Reminders go by email 30, 14 and 7 days before something runs out, and once for anything not on file.
            They stop by themselves when the date is in.
          </p>
        </>
      )}

      {sheet}
    </div>
  );
}
