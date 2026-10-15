"use client";

import { useEffect, useMemo, useState } from "react";
import { PressButton } from "@/components/Bits";
import DoodleIcon from "@/components/DoodleIcon";
import { registerOpen } from "@/lib/open-record";

/**
 * Writing one email to one person.
 *
 * ── What this replaces ────────────────────────────────────────────────────
 *
 * Every email action in the lead drawer opened EmailProperties, whose own
 * header says "Deliberately NOT a compose window". It is a shortlist picker,
 * and it is right for a tenant. A landlord being invited to book a valuation
 * got sent a property picker, because there was nothing else to open.
 *
 * It also never sent anything: no fetch, no API call, straight to a "sent"
 * screen. So every email an agent believed they had sent from a lead went
 * nowhere at all.
 *
 * ── Sending is off, and the screen says so rather than pretending ─────────
 *
 * The server refuses while "Email to landlords and tenants" is off on Admin,
 * Switches (one of our own addresses goes regardless, as a test), and reports
 * `sendEnabled` on every response. The button reads "Sending is off" and is
 * disabled, instead of looking armed and failing on click. A disabled control
 * that explains itself is honest; one that looks ready and then apologises is
 * how people stop trusting a screen.
 */

type Template = {
  id: string;
  name: string;
  subject: string;
  body: string;
  audience: "landlord" | "tenant" | "any";
  builtin: boolean;
};

export default function Compose({
  open,
  onClose,
  onSent,
  to,
  audience = "any",
  merge,
  language,
}: {
  open: boolean;
  onClose: () => void;
  /** Fired only when something actually left - never on cancel. */
  onSent?: (subject: string) => void;
  to: string;
  audience?: "landlord" | "tenant" | "any";
  /** name, firstName, address, postcode, agent — whatever the caller holds. */
  merge: Record<string, string | undefined>;
  /** The customer's language, when a Translate press found one (lib/translate). */
  language?: string | null;
}) {
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [picked, setPicked] = useState<string>("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [preview, setPreview] = useState<{
    html: string;
    missing: string[];
    sendEnabled: boolean;
  } | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  /* Translate my reply (Amrit Bhogal, 14 Oct 2026): the agent writes in
     English, sees it in the customer's language, checks it, and puts it in
     the message themselves. Nothing sends until they press Send. */
  const [tr, setTr] = useState<{ open: boolean; lang: string; busy: boolean; subject: string; body: string; error: string | null }>({ open: false, lang: "", busy: false, subject: "", body: "", error: null });
  useEffect(() => {
    if (!open) setTr({ open: false, lang: "", busy: false, subject: "", body: "", error: null });
  }, [open]);
  async function translateReply() {
    const lang = tr.lang.trim();
    if (!lang || !body.trim() || tr.busy) return;
    setTr((t) => ({ ...t, busy: true, error: null }));
    const one = async (text: string) => {
      if (!text.trim()) return "";
      const r = await fetch("/api/translate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, to: lang }) });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; translation?: string };
      if (!r.ok || !j.ok) throw new Error(j.error ?? "That couldn't be translated just now.");
      return j.translation ?? "";
    };
    try {
      const [s2, b2] = await Promise.all([one(subject), one(body)]);
      setTr((t) => ({ ...t, busy: false, subject: s2, body: b2 }));
    } catch (e) {
      setTr((t) => ({ ...t, busy: false, error: e instanceof Error ? e.message : "That couldn't be translated just now." }));
    }
  }

  /* ── Tell Steve the composer is open, and to whom ─────────────────────────

     This is the surface he was blindest to, and the one it hurt most on:
     asked to "draft an email to this landlord" with the composer open, he
     asked WHICH landlord — with the address printed at the top of the panel
     he was sitting on.

     The subject and body go too, live. Half a draft is a strong signal about
     what is wanted, and "finish this" is a reasonable thing to say to
     something in the corner of the screen. They are capped because a long
     draft would otherwise crowd out the record underneath it in the prompt. */
  useEffect(() => {
    if (!open) return;
    return registerOpen({
      kind: "compose",
      id: null,
      label: `email to ${to || "nobody yet"}`,
      canFill: true,
      /* Steve types into the boxes; the person reads it and presses send.
         Filling and sending are deliberately different acts, and only one of
         them is his. */
      apply: (draft) => {
        if (draft.subject !== undefined) setSubject(draft.subject);
        if (draft.body !== undefined) setBody(draft.body);
      },
      fields: [
        { label: "To", value: to || "not set" },
        { label: "Audience", value: audience },
        { label: "Subject so far", value: subject || "empty" },
        { label: "Body so far", value: body.slice(0, 400) || "empty" },
        ...Object.entries(merge)
          .filter(([, v]) => v)
          .map(([k, v]) => ({ label: k, value: String(v) })),
      ],
    });
  }, [open, to, audience, subject, body, merge]);

  useEffect(() => {
    if (!open) return;
    fetch("/api/messages/templates", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setTemplates(Array.isArray(j?.templates) ? j.templates : []))
      .catch(() => setTemplates([]));
  }, [open]);

  /* Only what fits this person. A tenant template offered on a landlord is a
     mis-send waiting to happen, and "any" belongs on both. */
  const usable = useMemo(
    () => (templates ?? []).filter((t) => t.audience === audience || t.audience === "any"),
    [templates, audience]
  );

  function choose(id: string) {
    setPicked(id);
    const t = usable.find((x) => x.id === id);
    if (!t) return;
    setSubject(t.subject);
    setBody(t.body);
    setNote(null);
  }

  /* Previewing is a read. It costs nothing and cannot send, so it is asked for
     on demand rather than guarded behind anything. */
  async function refreshPreview(): Promise<void> {
    const r = await fetch("/api/messages/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ to, subject, body, merge, intent: "preview" }),
    });
    const j = await r.json().catch(() => null);
    if (j?.ok) setPreview({ html: j.html, missing: j.missing ?? [], sendEnabled: !!j.sendEnabled });
  }

  useEffect(() => {
    if (!open || !body) return;
    const t = setTimeout(() => void refreshPreview(), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, subject, body, to]);

  if (!open) return null;

  const missing = preview?.missing ?? [];
  const canSend = Boolean(preview?.sendEnabled) && !missing.length && to.includes("@");

  return (
    <div className="fixed inset-0 z-[150] flex justify-end bg-ink/35" onClick={onClose}>
      <aside
        className="flex h-full w-full max-w-[620px] flex-col bg-page shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-line/70 px-5 py-4">
          <div className="min-w-0">
            <p className="hand text-[17px] leading-tight">Write an email</p>
            <p className="truncate text-[11.5px] text-muted">
              To {to || <span className="text-accent-dark">no address on this record</span>}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-[18px] leading-none text-muted hover:text-ink">
            ✕
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {/* TEMPLATES. Pick one, then edit it — the words are a starting
              point, never a cage. */}
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Start from</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {templates === null ? (
              <span className="text-[12px] text-muted">Loading the templates&hellip;</span>
            ) : usable.length === 0 ? (
              <span className="text-[12px] text-muted">No templates for this yet.</span>
            ) : (
              usable.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => choose(t.id)}
                  className={`rounded-full border px-3 py-1.5 text-[11.5px] transition-colors ${
                    picked === t.id
                      ? "border-accent-dark bg-accent-soft/40"
                      : "border-line/80 hover:border-ink/40"
                  }`}
                >
                  {t.name}
                </button>
              ))
            )}
          </div>

          <label className="mt-5 block">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">Subject</span>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-line/80 bg-panel px-3 py-2 text-[13px]"
              placeholder="What it is about"
            />
          </label>

          <label className="mt-4 block">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">Message</span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={14}
              className="mt-1.5 w-full resize-y rounded-xl border border-line/80 bg-panel px-3 py-2.5 text-[13px] leading-relaxed"
              placeholder="Hi…"
            />
          </label>

          <div className="mt-2">
            {!tr.open ? (
              <button
                type="button"
                onClick={() => setTr((t) => ({ ...t, open: true, lang: t.lang || language || "" }))}
                disabled={!body.trim()}
                title={body.trim() ? "Write it in English, then see it in their language" : "Write the message first"}
                className="text-[12px] font-semibold text-accent-dark hover:underline disabled:cursor-not-allowed disabled:text-muted disabled:no-underline"
              >
                Translate my reply{language ? ` into ${language}` : ""}
              </button>
            ) : (
              <div className="rounded-xl border border-line/80 bg-panel p-3">
                <div className="flex flex-wrap items-end gap-2">
                  <label className="min-w-[10rem] flex-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">Into</span>
                    <input
                      value={tr.lang}
                      onChange={(e) => setTr((t) => ({ ...t, lang: e.target.value }))}
                      onKeyDown={(e) => e.key === "Enter" && void translateReply()}
                      placeholder="Their language, e.g. Polish"
                      className="mt-1 w-full rounded-lg border border-line/80 bg-white px-2.5 py-1.5 text-[13px]"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => void translateReply()}
                    disabled={!tr.lang.trim() || !body.trim() || tr.busy}
                    className="inline-flex items-center gap-2 rounded-full bg-accent-dark px-4 py-2 text-[12px] font-semibold text-white disabled:opacity-50"
                  >
                    {tr.busy && <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" aria-hidden />}
                    {tr.busy ? "Translating…" : tr.body ? "Translate again" : "Translate"}
                  </button>
                  <button type="button" onClick={() => setTr((t) => ({ ...t, open: false }))} className="px-2 py-2 text-[12px] text-muted hover:text-ink">
                    Close
                  </button>
                </div>
                {tr.error && <p className="mt-2 text-[12px] text-accent-dark">{tr.error}</p>}
                {tr.body && (
                  <div className="mt-3">
                    <p className="text-[11px] leading-relaxed text-muted">
                      In {tr.lang.trim()}. Read it through and change anything that is not right - it is not sent until you press Send.
                    </p>
                    {tr.subject && (
                      <input
                        value={tr.subject}
                        onChange={(e) => setTr((t) => ({ ...t, subject: e.target.value }))}
                        className="mt-2 w-full rounded-lg border border-line/80 bg-white px-2.5 py-1.5 text-[13px]"
                      />
                    )}
                    <textarea
                      value={tr.body}
                      onChange={(e) => setTr((t) => ({ ...t, body: e.target.value }))}
                      rows={8}
                      className="mt-2 w-full resize-y rounded-lg border border-line/80 bg-white px-2.5 py-2 text-[13px] leading-relaxed"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        /* Theirs first, our English underneath, so both of
                           them - and anybody reading the file later - know
                           what was said. */
                        if (tr.subject) setSubject(tr.subject);
                        setBody(`${tr.body}\n\n----------\nIn English:\n\n${body}`);
                        setTr((t) => ({ ...t, open: false, subject: "", body: "" }));
                      }}
                      className="mt-2 rounded-full border border-accent-dark px-4 py-1.5 text-[12px] font-semibold text-accent-dark hover:bg-accent-soft"
                    >
                      Use this in the message
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* UNFILLED MERGE FIELDS, NAMED. They are left in the text rather
              than blanked, so this is a warning about something visible rather
              than about something that silently vanished. */}
          {missing.length > 0 && (
            <p className="mt-3 rounded-xl border border-accent-dark/40 bg-accent-soft/30 p-3 text-[12px] leading-relaxed">
              Nothing to fill {missing.map((m) => `{{${m}}}`).join(", ")} on this record. Type over
              it, or the landlord will read it exactly as it stands.
            </p>
          )}

          {preview && (
            <div className="mt-4">
              <button
                type="button"
                onClick={() => setShowPreview((v) => !v)}
                className="text-[12px] text-muted underline"
              >
                {showPreview ? "Hide" : "Show"} what they will receive
              </button>
              {showPreview && (
                <iframe
                  title="Email preview"
                  srcDoc={preview.html}
                  sandbox=""
                  className="mt-2 h-[420px] w-full rounded-xl border border-line/70 bg-white"
                />
              )}
            </div>
          )}

          {note && <p className="mt-3 text-[12px] leading-relaxed text-accent-dark">{note}</p>}
        </div>

        {/* Clear of Steve's round button in the corner, which sat on top of Send. */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-line/70 py-3.5 pl-5 pr-24">
          <p className="text-[11px] leading-relaxed text-muted">
            {preview?.sendEnabled
              ? "This will go to the address above."
              : preview
                ? "Email to landlords and tenants is switched off, so this cannot go from here. Send it from Outlook if it cannot wait."
                : "Pick a template or write the message, then send."}
          </p>
          <PressButton
            onClick={async () => {
              const r = await fetch("/api/messages/send", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ to, subject, body, merge, intent: "send" }),
              });
              const j = await r.json().catch(() => null);
              setNote(j?.reason ?? "Something went wrong.");
              if (j?.sent) {
                onSent?.(subject);
                onClose();
              }
            }}
            disabled={!canSend}
            className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-[12px] font-semibold ${
              canSend ? "bg-accent-dark text-white" : "cursor-not-allowed bg-line/40 text-muted"
            }`}
          >
            <DoodleIcon name="mail" size={13} />
            {preview && !preview.sendEnabled ? "Sending is off" : "Send"}
          </PressButton>
        </div>
      </aside>
    </div>
  );
}
