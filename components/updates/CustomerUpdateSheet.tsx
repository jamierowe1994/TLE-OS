"use client";

import { useMemo, useRef, useState } from "react";
import FloatSheet, { FloatCard, FloatCardHead, FloatChoice, FloatFoot } from "@/components/new-look/FloatSheet";
import ConfirmSheet from "@/components/ConfirmSheet";
import DoodleIcon from "@/components/DoodleIcon";
import { usePref } from "@/lib/prefs-store";

/**
 * CUSTOMER UPDATE, as a pop-out in steps (James, 8 Nov 2026: the drawer
 * "clashes with Steve ... make it a little bit of a process: who do you want
 * to email, call, what's it about ... a Custom button ... Do you want to
 * save this as a template?").
 *
 *   1. Who        - everyone on the let with a way to reach them
 *   2. How        - email, or a call (logged on the let as a note)
 *   3. About what - the written emails, your own saved templates, or Custom
 *   4. Write it   - Custom and saved templates: subject and message, with
 *                   First name and The property as fill-ins
 *   5. Sent       - and, for a message written from scratch, Save as a
 *                   template, kept against your account
 *
 * The written emails still open the reviewed email (ConfirmSheet) exactly as
 * before. A custom one goes the same road: an update is made on the let
 * (kind "general") so it is logged, then sent from the agent's own address
 * with their words (/api/confirmations, kind "update").
 */

export type UpdateTemplate = { kind: string; label: string; what: string; to: Array<"tenant" | "landlord"> };

export const UPDATES: UpdateTemplate[] = [
  { kind: "general", label: "A quick update", what: "A short note in your own words, written for you to change", to: ["tenant", "landlord"] },
  { kind: "reference_failed", label: "References not accepted", what: "Sorry, and do they have a guarantor? If not the let may not go ahead", to: ["tenant", "landlord"] },
  { kind: "guarantor_needed", label: "A guarantor is needed", what: "References passed, but a guarantor is needed", to: ["tenant"] },
  { kind: "agreement_out", label: "Agreement on its way", what: "The tenancy agreement is out for signing", to: ["tenant", "landlord"] },
  { kind: "cancelled", label: "The let won't go ahead", what: "Sorry it isn't going ahead, and what happens next", to: ["tenant", "landlord"] },
];
export const REMINDERS: UpdateTemplate[] = [
  { kind: "nudge_holding_fee", label: "Pay the holding deposit", what: "The home stays on the market until it's paid", to: ["tenant"] },
  { kind: "nudge_referencing", label: "Finish the references", what: "Fill in the referencing form", to: ["tenant"] },
  { kind: "nudge_sign_agreement", label: "Sign the agreement", what: "The tenancy agreement is waiting for a signature", to: ["tenant", "landlord"] },
  { kind: "nudge_move_in_money", label: "Send the move-in money", what: "Deposit and first month's rent before the keys", to: ["tenant"] },
  { kind: "nudge_documents", label: "Documents we still need", what: "Send them over or upload them in the portal", to: ["tenant", "landlord"] },
];

/** A message an agent saved for next time. Fill-ins are {{firstName}} and {{property}}. */
type Saved = { id: string; label: string; subject: string; body: string };

export type UpdateParty = { key: string; role: "tenant" | "landlord"; index: number; name: string; email: string | null; phone: string | null; tag: string };

type Step = "who" | "how" | "what" | "write" | "call" | "sent";

const FILL_INS = [
  { token: "{{firstName}}", label: "First name" },
  { token: "{{property}}", label: "The property" },
];

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/** Their words as a plain email: a paragraph per blank line, line breaks kept. */
const asHtml = (text: string) =>
  text
    .trim()
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#141413">${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("");

export default function CustomerUpdateSheet({
  letId,
  mode,
  parties,
  loading,
  address,
  start,
  scotland,
  landlordProblem,
  onClose,
  onLog,
}: {
  letId: string;
  mode: "update" | "reminder";
  parties: UpdateParty[];
  loading: boolean;
  address: string;
  start?: { kind: string; to: string } | null;
  scotland?: boolean;
  landlordProblem?: string | null;
  onClose: () => void;
  /** A call, written up as a note on the let. */
  onLog: (text: string) => Promise<boolean>;
}) {
  const list = mode === "update" ? UPDATES : scotland ? REMINDERS.filter((t) => t.kind !== "nudge_holding_fee") : REMINDERS;
  const [step, setStep] = useState<Step>(start?.to ? (start.kind ? "what" : "how") : "who");
  const [to, setTo] = useState<string>(start?.to ?? "");
  const [kind, setKind] = useState<string | null>(start?.kind ?? null);
  const [portal, setPortal] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sheet, setSheet] = useState<{ id: number; index: number; portal: boolean } | null>(null);
  const sent = useRef(false);
  const [done, setDone] = useState<string | null>(null);
  /* Custom and saved: the words. */
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [fromSaved, setFromSaved] = useState<Saved | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  /* Save as a template, after a custom one has gone. */
  const [saved, setSaved, savedReady] = usePref<Saved[]>("update-templates", []);
  const [tplName, setTplName] = useState("");
  const [tplState, setTplState] = useState<"ask" | "naming" | "saved" | "no">("ask");
  /* A call. */
  const [callNote, setCallNote] = useState("");
  /* Attachments (8 Nov 2026): from the home's file, or from their computer
     (which goes onto the file too, so it's kept). */
  const [attached, setAttached] = useState<{ key: string; name: string }[]>([]);
  const [attachOpen, setAttachOpen] = useState<null | "choose" | "file">(null);
  const [fileDocs, setFileDocs] = useState<{ key: string; name: string; label: string }[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const pickInput = useRef<HTMLInputElement | null>(null);
  const keyOf = (url: string) => {
    const m = /[?&]key=([^&]+)/.exec(url);
    return m ? decodeURIComponent(m[1]) : null;
  };
  type HomeDoc = { name: string; fileName: string; typeLabel: string; url: string; at: string; standing?: unknown };
  const asItems = (docs: HomeDoc[]) =>
    docs
      .filter((d) => !d.standing && keyOf(d.url))
      .map((d) => ({ key: keyOf(d.url)!, name: d.name || d.fileName, label: [d.typeLabel, new Date(d.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })].filter(Boolean).join(" · ") }));
  async function openFromFile() {
    setAttachOpen("file");
    if (fileDocs) return;
    const j = (await fetch(`/api/documents?address=${encodeURIComponent(address)}&property=&from=application`, { cache: "no-store" })
      .then((r) => r.json())
      .catch(() => null)) as { ok?: boolean; docs?: HomeDoc[] } | null;
    setFileDocs(j?.ok ? asItems(j.docs ?? []) : []);
  }
  async function uploadFromComputer(file: File) {
    setUploading(true);
    setErr(null);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("type", "other");
    fd.append("name", file.name.replace(/\.[^.]+$/, ""));
    fd.append("address", address);
    fd.append("property", "");
    fd.append("from", "application");
    fd.append("fromId", letId);
    const j = (await fetch("/api/documents", { method: "POST", body: fd })
      .then((r) => r.json())
      .catch(() => null)) as { ok?: boolean; docs?: HomeDoc[]; error?: string } | null;
    setUploading(false);
    if (!j?.ok) return setErr(j?.error ?? "That didn't upload. Try again.");
    const items = asItems(j.docs ?? []);
    setFileDocs(items);
    const mine = [...(j.docs ?? [])].filter((d) => d.fileName === file.name || d.name === file.name.replace(/\.[^.]+$/, "")).sort((a, b) => b.at.localeCompare(a.at))[0];
    const k = mine ? keyOf(mine.url) : null;
    if (k) setAttached((a) => (a.some((x) => x.key === k) ? a : [...a, { key: k, name: mine!.name || mine!.fileName }]));
    setAttachOpen(null);
  }

  const party = parties.find((p) => p.key === to) ?? null;
  const first = (party?.name ?? "").split(/\s+/)[0] || "there";
  const fill = (s: string) => s.replace(/\{\{firstName\}\}/g, first).replace(/\{\{property\}\}/g, address);
  const tpl = list.find((t) => t.kind === kind) ?? null;

  /* The written emails: made on the let, read and changed in the reviewed sheet. */
  async function writeWritten(k: string) {
    if (!party || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/applications/${encodeURIComponent(letId)}/message`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: k, role: party.role, index: party.index }),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; update?: { id: number }; index?: number };
      if (!j.ok || !j.update) throw new Error(j.error ?? "The email couldn't be written.");
      sent.current = false;
      setSheet({ id: j.update.id, index: j.index ?? 0, portal });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "The email couldn't be written.");
    } finally {
      setBusy(false);
    }
  }

  function sheetClosed() {
    const s = sheet;
    setSheet(null);
    if (s && !sent.current) {
      void fetch("/api/customer-updates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: s.id, index: s.index, action: "skip", note: "Written on the let's page and not sent." }),
      }).catch(() => null);
    }
  }

  /* Custom: logged on the let as an update, then sent with their words. */
  async function sendCustom() {
    if (!party || busy || !subject.trim() || !body.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/applications/${encodeURIComponent(letId)}/message`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "general", role: party.role, index: party.index }),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; update?: { id: number }; index?: number };
      if (!j.ok || !j.update) throw new Error(j.error ?? "It couldn't be logged on the let, so nothing was sent.");
      const s = await fetch("/api/confirmations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "send", kind: "update", id: j.update.id, index: j.index ?? 0, ...(portal ? { portal: true } : {}), subject: fill(subject.trim()), html: asHtml(fill(body)), ...(attached.length ? { attachments: attached } : {}) }),
      });
      const k = (await s.json().catch(() => ({}))) as { sent?: boolean; detail?: string; error?: string };
      if (!k.sent) throw new Error(k.detail ?? k.error ?? "It didn't send.");
      setDone(`Sent to ${party.name}${party.email ? ` (${party.email})` : ""}. It's on the let's activity.`);
      setTplState(fromSaved ? "no" : "ask");
      setStep("sent");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "It didn't send.");
    } finally {
      setBusy(false);
    }
  }

  async function logCall() {
    if (!party || busy || !callNote.trim()) return;
    setBusy(true);
    const ok = await onLog(`Called ${party.name} (${party.role}): ${callNote.trim()}`);
    setBusy(false);
    if (!ok) return setErr("The note didn't save. Try again.");
    setDone(`The call with ${party.name} is noted on the let.`);
    setTplState("no");
    setStep("sent");
  }

  /* Save the words as a template: their name and the address become fill-ins. */
  function saveTemplate() {
    const label = tplName.trim() || subject.trim() || "My template";
    const tokenise = (s: string) => {
      let out = s;
      if (address) out = out.split(address).join("{{property}}");
      if (first && first !== "there") out = out.replace(new RegExp(`\\b${first.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g"), "{{firstName}}");
      return out;
    };
    setSaved([...(saved ?? []), { id: `t${Date.now().toString(36)}`, label, subject: tokenise(subject.trim()), body: tokenise(body.trim()) }]);
    setTplState("saved");
  }

  const insert = (token: string) => {
    const el = bodyRef.current;
    if (!el) return setBody((b) => `${b}${token}`);
    const a = el.selectionStart ?? body.length;
    const b = el.selectionEnd ?? body.length;
    const next = `${body.slice(0, a)}${token}${body.slice(b)}`;
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(a + token.length, a + token.length);
    });
  };

  const stepsFor: Step[] = mode === "reminder" ? ["who", "what"] : ["who", "how", "what", "write"];
  const n = Math.max(1, stepsFor.indexOf(step === "call" ? "how" : step === "sent" ? stepsFor[stepsFor.length - 1] : step) + 1);
  const question =
    step === "who" ? (mode === "update" ? "Who do you want to update?" : "Who needs reminding?")
    : step === "how" ? `Email ${first}, or call?`
    : step === "what" ? (mode === "update" ? "What's it about?" : "What are you reminding them about?")
    : step === "write" ? (fromSaved ? fromSaved.label : "Write it your way")
    : step === "call" ? `Call ${first}`
    : "Done";
  const back = () => {
    setErr(null);
    if (step === "how") setStep("who");
    else if (step === "what") setStep(mode === "reminder" ? "who" : "how");
    else if (step === "write") setStep("what");
    else if (step === "call") setStep("how");
  };

  const mine = useMemo(() => saved ?? [], [saved]);

  return (
    <>
      <FloatSheet
        title={mode === "update" ? "Customer Update" : "Send a Reminder"}
        size="lg"
        step={step === "sent" ? undefined : n}
        steps={step === "sent" ? undefined : stepsFor.length}
        onBack={step !== "who" && step !== "sent" ? back : undefined}
        onClose={onClose}
        dismissible={!busy}
        screenKey={step}
        question={question}
        lede={
          step === "who" ? "Nothing goes until you've seen it and pressed Send, from your own address."
          : step === "write" ? `To ${party?.name ?? ""}${party?.email ? `, ${party.email}` : ""}. It goes as a plain email from you and is logged on the let.`
          : undefined
        }
        foot={
          <FloatFoot left={err ? <span className="text-accent-dark">{err}</span> : step === "write" ? <span>Fill-ins are swapped for the real thing as it goes.</span> : undefined}>
            {step === "write" && (
              <button type="button" className="nl-btn nl-btn--primary" disabled={busy || !subject.trim() || !body.trim()} onClick={() => void sendCustom()}>
                {busy ? "Sending…" : "Send"}
              </button>
            )}
            {step === "call" && (
              <button type="button" className="nl-btn nl-btn--primary" disabled={busy || !callNote.trim()} onClick={() => void logCall()}>
                {busy ? "Saving…" : "Save the note"}
              </button>
            )}
            {step === "sent" && (
              <button type="button" className="nl-btn nl-btn--primary" onClick={onClose}>
                Close
              </button>
            )}
          </FloatFoot>
        }
      >
        {step === "who" && (
          loading ? (
            <p className="nl-fs-reading"><span aria-hidden className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-line border-t-ink" /> Reading who is on the let…</p>
          ) : parties.length ? (
            <div className="nl-fs-choices is-2">
              {parties.map((p) => (
                <FloatChoice
                  key={p.key}
                  icon={<DoodleIcon name={p.role === "landlord" ? "home" : "user"} size={18} />}
                  title={p.name}
                  text={[p.tag, p.email ? null : "no email", p.phone ? null : "no number"].filter(Boolean).join(" · ")}
                  on={to === p.key}
                  onClick={() => {
                    setTo(p.key);
                    setStep(mode === "reminder" ? "what" : "how");
                  }}
                />
              ))}
              {landlordProblem && <p className="nl-fs-say">{landlordProblem}</p>}
            </div>
          ) : (
            <FloatCard><p>Nobody with contact details is held on this let.</p></FloatCard>
          )
        )}

        {step === "how" && party && (
          <div className="nl-fs-choices is-2">
            <FloatChoice icon={<DoodleIcon name="mail" size={18} />} title="Email" text={party.email ?? "No email on file"} disabled={!party.email} onClick={() => setStep("what")} />
            <FloatChoice icon={<DoodleIcon name="call" size={18} />} title="Call" text={party.phone ?? "No number on file"} disabled={!party.phone} onClick={() => setStep("call")} />
          </div>
        )}

        {step === "call" && party && (
          <>
            <FloatCard>
              <div className="nl-cu-call">
                <a href={`tel:${(party.phone ?? "").replace(/\s+/g, "")}`} className="nl-btn nl-btn--primary">
                  <DoodleIcon name="call" size={14} /> Call {party.phone}
                </a>
                <span className="nl-meta">Then jot down what was said, so the team can see it.</span>
              </div>
            </FloatCard>
            <FloatCard>
              <FloatCardHead title="What Was Said" />
              <textarea className="nl-fs-input nl-cu-text" rows={4} value={callNote} onChange={(e) => setCallNote(e.target.value)} placeholder="e.g. Told her the agreement goes out tomorrow. She'll sign by Friday." />
            </FloatCard>
          </>
        )}

        {step === "what" && party && (
          <>
            <div className="nl-fs-choices">
              {list.map((t) => {
                const ok = t.to.includes(party.role);
                return (
                  <FloatChoice
                    key={t.kind}
                    title={t.label}
                    text={ok ? t.what : `For the ${t.to.join(" or ")} only`}
                    disabled={!ok || busy}
                    on={kind === t.kind && busy}
                    aside={kind === t.kind && busy ? "Writing it…" : undefined}
                    onClick={() => {
                      setKind(t.kind);
                      void writeWritten(t.kind);
                    }}
                  />
                );
              })}
              {mode === "update" && savedReady && mine.map((s) => (
                <FloatChoice
                  key={s.id}
                  icon={<DoodleIcon name="star" size={16} />}
                  title={s.label}
                  text="Your template"
                  onClick={() => {
                    setFromSaved(s);
                    setSubject(s.subject);
                    setBody(s.body);
                    setStep("write");
                  }}
                />
              ))}
              {mode === "update" && (
                <FloatChoice
                  icon={<DoodleIcon name="pencil" size={16} />}
                  title="Custom"
                  text="Write it from scratch and send"
                  onClick={() => {
                    setFromSaved(null);
                    setSubject("");
                    setBody(`Hi {{firstName}},\n\n`);
                    setStep("write");
                  }}
                />
              )}
            </div>
            <label className="nl-cu-portal">
              <input type="checkbox" checked={portal} onChange={(e) => setPortal(e.target.checked)} />
              <span>
                <b>Also put it in their portal</b>
                <small>A copy under Messages, if they have a portal account. It goes to their email either way.</small>
              </span>
            </label>
          </>
        )}

        {step === "write" && party && (
          <FloatCard>
            <label className="nl-fs-label" htmlFor="cu-subject">Subject</label>
            <input id="cu-subject" className="nl-fs-input mt-1.5" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Your move-in on Friday" data-autofocus />
            <div className="nl-cu-bodyhead">
              <label className="nl-fs-label" htmlFor="cu-body">Message</label>
              <span className="nl-cu-fills">
                Add:
                {FILL_INS.map((f) => (
                  <button key={f.token} type="button" onClick={() => insert(f.token)}>{f.label}</button>
                ))}
              </span>
            </div>
            <textarea id="cu-body" ref={bodyRef} className="nl-fs-input nl-cu-text" rows={10} value={body} onChange={(e) => setBody(e.target.value)} />
            <p className="nl-fs-hint">As it goes: &ldquo;{fill(body).split("\n")[0].slice(0, 80)}&rdquo;. Your email signature is added as usual.</p>
            {/* Attach (8 Nov 2026): from the home's file, or from this computer. */}
            <div className="nl-cu-attach">
              {attached.map((a) => (
                <span key={a.key} className="nl-cu-chip">
                  <DoodleIcon name="doc" size={13} /> {a.name}
                  <button type="button" aria-label={`Take ${a.name} off`} onClick={() => setAttached((x) => x.filter((y) => y.key !== a.key))}>×</button>
                </span>
              ))}
              {attached.length < 5 && (
                <button type="button" className="nl-cu-attach-btn" onClick={() => setAttachOpen(attachOpen ? null : "choose")} disabled={uploading}>
                  <DoodleIcon name="link" size={13} /> {uploading ? "Uploading…" : "Attach"}
                </button>
              )}
              <input ref={pickInput} type="file" className="hidden" accept="application/pdf,image/*,.doc,.docx" onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadFromComputer(f); e.target.value = ""; }} />
            </div>
            {attachOpen === "choose" && (
              <div className="nl-cu-attach-pick">
                <button type="button" onClick={() => void openFromFile()}>
                  <b>From the file</b>
                  <span>Anything on this home&apos;s Documents tab</span>
                </button>
                <button type="button" onClick={() => pickInput.current?.click()}>
                  <b>From your computer</b>
                  <span>Your Downloads or anywhere else. It&apos;s kept on the file too.</span>
                </button>
              </div>
            )}
            {attachOpen === "file" && (
              <div className="nl-cu-filelist">
                {fileDocs === null ? (
                  <p className="nl-fs-reading"><span aria-hidden className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-ink" /> Reading the file…</p>
                ) : fileDocs.length === 0 ? (
                  <p className="nl-meta">Nothing on this home&apos;s Documents tab yet.</p>
                ) : (
                  <ul>
                    {fileDocs.map((d) => {
                      const on = attached.some((a) => a.key === d.key);
                      return (
                        <li key={d.key}>
                          <label>
                            <input type="checkbox" checked={on} disabled={!on && attached.length >= 5} onChange={(e) => setAttached((a) => (e.target.checked ? [...a, { key: d.key, name: d.name }] : a.filter((x) => x.key !== d.key)))} />
                            <span><b>{d.name}</b><small>{d.label}</small></span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <button type="button" className="nl-btn nl-btn--secondary nl-btn--sm" onClick={() => setAttachOpen(null)}>Done</button>
              </div>
            )}
          </FloatCard>
        )}

        {step === "sent" && (
          <>
            <div className="nl-fs-card nl-fs-done" role="status">
              <span className="nl-fs-tick" aria-hidden>
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
              </span>
              <b>{done}</b>
            </div>
            {tplState !== "no" && (
              <FloatCard>
                <FloatCardHead title="Save This as a Template?" />
                {tplState === "saved" ? (
                  <p className="nl-cu-saved">Saved. It&apos;s under What&apos;s it about next time, with {first !== "there" ? `${first}'s name` : "their name"} and the address as fill-ins.</p>
                ) : tplState === "naming" ? (
                  <div className="nl-cu-save">
                    <input className="nl-fs-input" value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder="Call it something, e.g. Keys ready" autoFocus />
                    <button type="button" className="nl-btn nl-btn--primary" onClick={saveTemplate}>Save template</button>
                  </div>
                ) : (
                  <div className="nl-cu-save">
                    <span className="nl-meta">Use it again with any tenant or landlord. Their name and the address fill themselves in.</span>
                    <button type="button" className="nl-btn nl-btn--secondary" onClick={() => setTplState("naming")}>Save as a template</button>
                    <button type="button" className="nl-btn nl-btn--quiet" onClick={() => setTplState("no")}>No thanks</button>
                  </div>
                )}
              </FloatCard>
            )}
          </>
        )}
      </FloatSheet>
      {sheet && tpl && (
        <ConfirmSheet
          target={{ kind: "update", id: sheet.id, index: sheet.index, portal: sheet.portal }}
          title={tpl.label}
          onSent={(detail) => {
            sent.current = true;
            setDone(`${tpl.label} sent to ${party?.name ?? "them"}. ${detail}`);
            setTplState("no");
            setStep("sent");
          }}
          onClose={sheetClosed}
        />
      )}
    </>
  );
}
