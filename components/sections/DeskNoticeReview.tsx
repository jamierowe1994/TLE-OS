"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import DoodleIcon from "@/components/DoodleIcon";
import { GREEN, RED } from "@/components/compliance-desk/CheckRow";
import { toast } from "@/lib/toast";
import {
  DECISION_LABEL, HEADER, NO_RISKS, SPECS, STATUS_LABEL, dayLabel, increaseOf, money, pounds, s13Warnings, todayIso,
  type CheckLine, type Decision, type FieldLine, type Notice, type PostService, type Review,
} from "@/lib/section-notices-spec";

/**
 * MICHAEL'S REVIEW OF ONE NOTICE (7 Oct 2026).
 *
 * The top half is the agent's checklist as they submitted it, to read: every
 * line, ticked or not, every value, every file against the line it proves.
 * What he must not miss is lifted to the top - on a Section 8, any risk the
 * agent ticked ("Any YES answer must be highlighted to Compliance before
 * approval"), and on a Section 13 the date sums that do not add up.
 *
 * The bottom half is his: Compliance use only, ticked one by one and saved
 * as he goes, then the decision. Approving needs every one of his checks;
 * returning, referring or declining needs his words, which the agent sees.
 * Once approved, he serves it through PayProp himself (nothing here sends)
 * and records how and when, with the served notice and the proof of service
 * on a Section 8.
 */

const card = "rounded-[20px] border border-line/60 bg-white p-4 sm:p-5";
const label = "text-[10.5px] font-semibold uppercase tracking-wide text-muted";
const field = "w-full rounded-xl border border-line/80 bg-page px-3.5 py-2.5 text-[13.5px] outline-none transition-colors focus:border-ink/40";

function Tick({ on, size = 18 }: { on: boolean; size?: number }) {
  return (
    <span style={{ width: size, height: size }} className={`mt-[1px] flex shrink-0 items-center justify-center rounded-md border-[1.5px] ${on ? "border-accent-dark bg-accent-dark text-white" : "border-line bg-white"}`}>
      {on && (
        <svg aria-hidden width={size * 0.6} height={size * 0.6} viewBox="0 0 16 16" fill="none">
          <path d="M3 8.5l3.2 3L13 4.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  );
}

async function send(id: string, body: unknown): Promise<Notice | null> {
  const r = await fetch(`/api/section-notices/${encodeURIComponent(id)}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const j = (await r.json().catch(() => null)) as { ok?: boolean; error?: string; notice?: Notice } | null;
  if (!r.ok || !j?.ok || !j.notice) { toast(j?.error ?? "Not saved.", "bad"); return null; }
  return j.notice;
}

export default function DeskNoticeReview({ notice: initial, me, onClose, onChange }: {
  notice: Notice;
  me: string;
  onClose: () => void;
  onChange: (n: Notice) => void;
}) {
  const [n, setN] = useState(initial);
  const spec = SPECS[n.kind];
  const a = n.answers;
  const [shown, setShown] = useState(false);
  const [review, setReview] = useState<Review>(n.review);
  const [post, setPost] = useState<PostService>(n.postService);
  const [busy, setBusy] = useState<string | null>(null);
  const deciding = n.status === "submitted" || n.status === "legal";
  const serving = n.status === "approved";

  useEffect(() => {
    const t = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(t);
  }, []);
  const close = () => { setShown(false); setTimeout(onClose, 280); };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const adopt = (x: Notice) => { setN(x); onChange(x); };

  /* His ticks save as he goes: a quiet PATCH, a moment after the last one. */
  const tickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tick = (id: string) => {
    if (!deciding) return;
    setReview((r) => {
      const checks = { ...r.checks };
      if (checks[id]) delete checks[id]; else checks[id] = true;
      const next = { ...r, checks };
      if (tickTimer.current) clearTimeout(tickTimer.current);
      tickTimer.current = setTimeout(() => { void send(n.id, { action: "review", review: next }); }, 700);
      return next;
    });
  };
  const postTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const changePost = (fn: (p: PostService) => PostService) => {
    if (!serving) return;
    setPost((p) => {
      const next = fn(p);
      if (postTimer.current) clearTimeout(postTimer.current);
      postTimer.current = setTimeout(() => { void send(n.id, { action: "service", post: next, served: false }).then((x) => x && adopt(x)); }, 900);
      return next;
    });
  };

  async function decide() {
    if (!review.decision) return;
    setBusy("decide");
    if (tickTimer.current) clearTimeout(tickTimer.current);
    const x = await send(n.id, { action: "decide", review });
    setBusy(null);
    if (x) { adopt(x); setReview(x.review); toast(DECISION_LABEL[review.decision]); }
  }

  async function served() {
    setBusy("served");
    if (postTimer.current) clearTimeout(postTimer.current);
    const x = await send(n.id, { action: "service", post, served: true });
    setBusy(null);
    if (x) { adopt(x); toast("Marked as served"); }
  }

  async function upload(lineId: string, list: File[]) {
    if (!list.length) return;
    setBusy(`file:${lineId}`);
    try {
      for (const file of list) {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("line", lineId);
        fd.append("side", "compliance");
        const r = await fetch(`/api/section-notices/${encodeURIComponent(n.id)}/files`, { method: "POST", body: fd });
        const j = (await r.json().catch(() => null)) as { ok?: boolean; error?: string; notice?: Notice } | null;
        if (!r.ok || !j?.ok || !j.notice) { toast(j?.error ?? `${file.name} was not attached.`, "bad"); continue; }
        adopt(j.notice);
        toast(`${file.name} attached`);
      }
    } finally {
      setBusy(null);
    }
  }

  const filesOn = (line: string, side: "agent" | "compliance" = "agent") => n.files.filter((f) => f.lineId === line && f.side === side);
  const fileLinks = (line: string, side: "agent" | "compliance" = "agent") => {
    const list = filesOn(line, side);
    if (!list.length) return null;
    return (
      <span className="mt-1.5 flex flex-wrap gap-1.5">
        {list.map((f) => (
          <a key={f.id} href={f.url} target="_blank" rel="noreferrer" title={`${f.name} · ${f.byName}`} className="flex max-w-full items-center gap-1.5 rounded-full border border-line/80 px-2.5 py-1 text-[11.5px] font-semibold transition hover:border-ink/40">
            <DoodleIcon name="doc" size={12} className="shrink-0 text-accent-dark" />
            <span className="truncate">{f.name}</span>
          </a>
        ))}
      </span>
    );
  };

  /* What must be seen first. */
  const riskSec = spec.sections.find((s) => s.risk);
  const risks = riskSec ? riskSec.lines.filter((l): l is CheckLine => l.type === "check" && Boolean(a.checks[l.id])) : [];
  const warnings = n.kind === "s13" ? s13Warnings(a, (n.submittedAt ?? n.createdAt).slice(0, 10)) : [];
  const changedHeader = HEADER.filter((h) => !a.auto.includes(h.id) && a.fields[h.id]);
  const left = spec.compliance.filter((c) => !review.checks[c.id]);
  const canDecide = review.decision === "approved" ? left.length === 0 : Boolean(review.decision && review.comments.trim());

  const value = (l: FieldLine) => {
    if (l.computed) {
      const inc = increaseOf(a);
      const cur = money(a.fields.current_rent);
      return inc == null ? "" : `${pounds(inc)}${cur ? ` (${inc >= 0 ? "+" : ""}${((inc / cur) * 100).toFixed(1)}%)` : ""}`;
    }
    const v = a.fields[l.id] ?? "";
    if (!v) return "";
    if (l.input === "date") return dayLabel(v);
    if (l.input === "money") { const m = money(v); return m == null ? v : pounds(m); }
    return v;
  };

  const readLine = (l: CheckLine | FieldLine) =>
    l.type === "check" ? (
      <li key={l.id} className="flex items-start gap-2.5 py-1.5">
        <Tick on={Boolean(a.checks[l.id])} />
        <span className="min-w-0 flex-1">
          <span className={`text-[13px] leading-snug ${a.checks[l.id] ? "" : "text-muted"}`}>{l.label}</span>
          {l.evidence && fileLinks(l.id)}
        </span>
      </li>
    ) : (
      <li key={l.id} className="py-1.5">
        <p className={label}>{l.label.replace(/ £$/, "")}</p>
        <p className={`mt-0.5 whitespace-pre-line text-[13.5px] ${value(l) ? "font-semibold" : "text-muted"}`}>{value(l) || "Not given"}</p>
      </li>
    );

  const waitedDays = n.submittedAt ? Math.floor((Date.now() - new Date(n.submittedAt).getTime()) / 86_400_000) : 0;

  /* z-[195]: above Steve and Report a problem (189-191), whose corner the sheet's own buttons share. */
  const body = (
    <div className="fixed inset-0 z-[195]">
      <button aria-label="Close" onClick={close} className={`absolute inset-0 cursor-default bg-ink/40 transition-opacity duration-300 ${shown ? "opacity-100" : "opacity-0"}`} />
      <aside
        className={`absolute inset-y-0 right-0 flex w-full flex-col overflow-hidden bg-page shadow-[-24px_0_60px_-24px_rgba(0,0,0,0.35)] transition-transform duration-[380ms] sm:rounded-l-2xl lg:max-w-[900px] ${shown ? "translate-x-0" : "translate-x-full"}`}
        style={{ transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)" }}
        role="dialog"
        aria-label={`${spec.short} for ${n.propertyLabel}`}
      >
        <div className="shrink-0 border-b border-line/70 px-4 pb-4 pt-4 sm:px-6 sm:pt-5">
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-accent-dark">{spec.short} · {n.kind === "s13" ? "Rent increase" : "Possession"} · {spec.form}</p>
              <h2 className="hand mt-1 text-[22px] leading-tight">{a.fields.address || n.propertyLabel}</h2>
              <p className="mt-0.5 text-[12.5px] text-muted">
                {n.agentName}{n.submittedAt ? ` · submitted ${dayLabel(n.submittedAt.slice(0, 10))}` : ""}{deciding && waitedDays > 0 ? ` · waiting ${waitedDays} day${waitedDays === 1 ? "" : "s"}` : ""}{n.test ? " · test home" : ""}
              </p>
            </div>
            <div className="flex items-center justify-end gap-1.5 sm:shrink-0">
              <span className={`mr-1 whitespace-nowrap rounded-full px-3 py-1.5 text-[11.5px] font-semibold ${n.status === "returned" || n.status === "declined" || n.status === "legal" ? RED : GREEN}`}>{STATUS_LABEL[n.status] === "Returned to you" ? "Returned to the agent" : STATUS_LABEL[n.status]}</span>
              <a href={`/api/section-notices/${encodeURIComponent(n.id)}/pdf`} className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full border border-line/80 px-3.5 text-[12px] font-semibold transition-colors hover:border-ink/40">
                <DoodleIcon name="doc" size={13} /> Download PDF
              </a>
              <button type="button" onClick={close} aria-label="Close" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line/80 text-[13px] text-muted transition-colors hover:text-ink">✕</button>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-6">
          {/* ── first, what must not be missed ── */}
          {n.kind === "s8" && (
            risks.length ? (
              <div className={`rounded-[18px] px-4 py-3.5 text-[13px] leading-snug ${RED}`}>
                <p className="font-semibold">The agent ticked {risks.length} risk{risks.length === 1 ? "" : "s"}: {risks.map((r) => r.label.toLowerCase()).join(", ")}.</p>
                {a.fields.risk_details && <p className="mt-1.5 whitespace-pre-line">{a.fields.risk_details}</p>}
              </div>
            ) : a.checks[NO_RISKS] ? (
              <p className={`rounded-[18px] px-4 py-3 text-[13px] ${GREEN}`}>Risk check: the agent says none of the risks apply.</p>
            ) : null
          )}
          {warnings.length > 0 && (
            <ul className="space-y-1.5">
              {warnings.map((w) => <li key={w} className={`rounded-[18px] px-4 py-3 text-[13px] leading-snug ${RED}`}><span className="font-semibold">Check this: </span>{w}</li>)}
            </ul>
          )}
          {changedHeader.length > 0 && (
            <p className="rounded-[18px] bg-panel px-4 py-3 text-[12.5px] leading-snug text-muted">
              The agent typed over the record for: {changedHeader.map((h) => h.label.toLowerCase()).join(", ")}.
            </p>
          )}

          {/* ── the agent's checklist ── */}
          <section className={card}>
            <h3 className="text-[16px] leading-tight">The Home</h3>
            <ul className="mt-2 grid gap-x-4 sm:grid-cols-2">
              {HEADER.map((h) => (
                <li key={h.id} className="py-1.5">
                  <p className={label}>{h.label}{!a.auto.includes(h.id) && a.fields[h.id] ? <span className="ml-1.5 normal-case tracking-normal text-accent-dark">typed by the agent</span> : null}</p>
                  <p className="mt-0.5 text-[13.5px] font-semibold">{h.input === "date" ? dayLabel(a.fields[h.id]) : a.fields[h.id] || <span className="font-normal text-muted">Not given</span>}</p>
                </li>
              ))}
            </ul>
          </section>

          {spec.sections.map((sec, i) => (
            <section key={sec.id} className={card}>
              <div className="flex items-baseline gap-2.5">
                <span className="figures text-[15px] font-bold text-accent-dark">{i + 1}</span>
                <h3 className="text-[16px] leading-tight">{sec.title}</h3>
              </div>
              {sec.risk ? (
                <ul className="mt-2 grid gap-x-4 sm:grid-cols-2">
                  {sec.lines.filter((l): l is CheckLine => l.type === "check").map((l) => readLine(l))}
                </ul>
              ) : (
                <ul className="mt-2">{sec.lines.map((l) => readLine(l))}</ul>
              )}
            </section>
          ))}

          {filesOn("other").length > 0 && (
            <section className={card}>
              <h3 className="text-[16px] leading-tight">Other Supporting Documents</h3>
              {fileLinks("other")}
            </section>
          )}

          <section className={card}>
            <h3 className="text-[16px] leading-tight">Agent Declaration</h3>
            <ul className="mt-2">{spec.declaration.map((l) => readLine(l))}</ul>
            <p className="mt-2 text-[13px]">
              Signed <span className="font-semibold italic">{a.signature || "-"}</span> by {n.agentName}{n.submittedAt ? ` on ${dayLabel(n.submittedAt.slice(0, 10))}` : ""}.
            </p>
          </section>

          {/* ── his ── */}
          <section className={`${card} border-accent-dark/30`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-[16px] leading-tight">Compliance Use Only</h3>
              <span className="text-[12px] text-muted">{spec.compliance.length - left.length} of {spec.compliance.length} checked</span>
            </div>
            <ul className="mt-2 grid gap-x-4 sm:grid-cols-2">
              {spec.compliance.map((l) => (
                <li key={l.id}>
                  <button type="button" disabled={!deciding} onClick={() => tick(l.id)} className="flex w-full items-start gap-2.5 rounded-xl px-1 py-2 text-left disabled:cursor-default">
                    <Tick on={Boolean(review.checks[l.id])} size={20} />
                    <span className="text-[13.5px] leading-snug">{l.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section className={`${card} border-accent-dark/30`}>
            <h3 className="text-[16px] leading-tight">Decision</h3>
            {deciding ? (
              <>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {spec.decisions.map((d: Decision) => {
                    const on = review.decision === d;
                    const bad = d !== "approved";
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setReview((r) => ({ ...r, decision: d }))}
                        className={`flex items-center gap-2.5 rounded-xl border px-3.5 py-3 text-left text-[13px] font-semibold transition-colors ${on ? (bad ? "border-[#9d4340] bg-[#fdefec] text-[#9d4340]" : "border-[#56634a] bg-[#f1f4ec] text-[#56634a]") : "border-line/80 hover:border-ink/40"}`}
                      >
                        <span className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] ${on ? "border-current" : "border-line"}`}>{on && <span className="h-2 w-2 rounded-full bg-current" />}</span>
                        {DECISION_LABEL[d]}
                      </button>
                    );
                  })}
                </div>
                <p className={`${label} mt-4`}>Comments and requirements{review.decision && review.decision !== "approved" ? <span className="ml-1 text-accent-dark">*</span> : null}</p>
                <textarea
                  value={review.comments}
                  onChange={(e) => setReview((r) => ({ ...r, comments: e.target.value }))}
                  rows={3}
                  placeholder={review.decision && review.decision !== "approved" ? "What is needed? The agent sees exactly this." : "Anything the agent should know. Optional when approving."}
                  className={`${field} mt-1.5 resize-y`}
                />
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div><p className={label}>Compliance approved by</p><p className="mt-1 text-[13.5px] font-semibold">{me || "You"}</p></div>
                  <div><p className={label}>Date</p><p className="mt-1 text-[13.5px] font-semibold">{dayLabel(todayIso())}</p></div>
                </div>
                {review.decision === "approved" && left.length > 0 && (
                  <p className="mt-3 text-[12px] font-semibold text-accent-dark">Tick every compliance check above before approving ({left.length} left).</p>
                )}
                <button
                  type="button"
                  disabled={!canDecide || busy === "decide"}
                  onClick={() => void decide()}
                  className="mt-4 rounded-full bg-accent-dark px-5 py-2.5 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  {busy === "decide" ? "Saving…" : review.decision ? `Save: ${DECISION_LABEL[review.decision].split(" - ")[0].toLowerCase()}` : "Pick a decision"}
                </button>
              </>
            ) : (
              <div className="mt-2 text-[13px] leading-snug">
                <p className="font-semibold">{n.review.decision ? DECISION_LABEL[n.review.decision] : STATUS_LABEL[n.status]}{n.decidedBy ? `, ${n.decidedBy}` : ""}{n.decidedAt ? ` on ${dayLabel(n.decidedAt.slice(0, 10))}` : ""}.</p>
                {n.review.comments && <p className="mt-1 whitespace-pre-line text-muted">{n.review.comments}</p>}
                {n.status === "returned" && <p className="mt-1 text-muted">With the agent to put right. It comes back here when they send it again.</p>}
              </div>
            )}
          </section>

          {/* ── after approval: serving it through PayProp, by hand ── */}
          {(serving || n.status === "served") && (
            <section className={`${card} border-accent-dark/30`}>
              <h3 className="text-[16px] leading-tight">{spec.postService.length ? "Post Service" : "Serving It"}</h3>
              <p className="mt-1 text-[12.5px] text-muted">Serve it through PayProp as usual, then record it here. The PDF above has everything on it.</p>
              {spec.postService.length > 0 && (
                <ul className="mt-2">
                  {spec.postService.map((l) => (
                    <li key={l.id} className="flex flex-wrap items-start gap-2.5 py-1.5">
                      <button type="button" disabled={!serving} onClick={() => changePost((p) => { const checks = { ...p.checks }; if (checks[l.id]) delete checks[l.id]; else checks[l.id] = true; return { ...p, checks }; })} className="flex min-w-0 flex-1 items-start gap-2.5 text-left disabled:cursor-default">
                        <Tick on={Boolean(post.checks[l.id])} size={20} />
                        <span className="min-w-0">
                          <span className="text-[13.5px] leading-snug">{l.label}</span>
                          {l.evidence && fileLinks(l.id, "compliance")}
                        </span>
                      </button>
                      {l.evidence && serving && (
                        <label className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-line/80 px-3 py-1.5 text-[11.5px] font-semibold hover:border-ink/40">
                          <DoodleIcon name="upload" size={12} /> {busy === `file:${l.id}` ? "Uploading" : "Attach"}
                          <input type="file" className="sr-only" onChange={(e) => { void upload(l.id, Array.from(e.target.files ?? [])); e.target.value = ""; }} />
                        </label>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {!spec.postService.length && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {fileLinks("final_notice", "compliance")}
                  {serving && (
                    <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-line/80 px-3 py-1.5 text-[11.5px] font-semibold hover:border-ink/40">
                      <DoodleIcon name="upload" size={12} /> {busy === "file:final_notice" ? "Uploading" : "Attach the served notice (optional)"}
                      <input type="file" className="sr-only" onChange={(e) => { void upload("final_notice", Array.from(e.target.files ?? [])); e.target.value = ""; }} />
                    </label>
                  )}
                </div>
              )}
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <p className={label}>Date served</p>
                  <input type="date" disabled={!serving} value={post.servedOn} onChange={(e) => changePost((p) => ({ ...p, servedOn: e.target.value }))} className={`${field} mt-1.5`} />
                </div>
                <div>
                  <p className={label}>Method of service</p>
                  <input disabled={!serving} value={post.method} onChange={(e) => changePost((p) => ({ ...p, method: e.target.value }))} placeholder="Email, by hand, first class post…" className={`${field} mt-1.5`} />
                </div>
              </div>
              {serving && (
                <button type="button" disabled={busy === "served"} onClick={() => void served()} className="mt-4 rounded-full bg-accent-dark px-5 py-2.5 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40">
                  {busy === "served" ? "Saving…" : "Mark as served"}
                </button>
              )}
            </section>
          )}

          {spec.footer.map((f) => <p key={f} className="px-1 text-[11.5px] text-muted">{f}</p>)}

          {n.history.length > 0 && (
            <details className="px-1 pb-2 text-[12px] text-muted">
              <summary className="cursor-pointer select-none underline-offset-2 hover:underline">History</summary>
              <ul className="mt-2 space-y-1">
                {n.history.map((h, i) => (
                  <li key={i}>{new Date(h.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · {h.what}, {h.by}{h.note ? `: ${h.note}` : ""}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </aside>
    </div>
  );

  return typeof document === "undefined" ? null : createPortal(body, document.body);
}

/** For the list: how many risks a Section 8 carries. */
export function riskCount(n: Notice): number {
  const sec = SPECS[n.kind].sections.find((s) => s.risk);
  return sec ? sec.lines.filter((l) => l.type === "check" && n.answers.checks[l.id]).length : 0;
}
