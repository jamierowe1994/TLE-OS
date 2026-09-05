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
 * The server refuses while OUTBOUND_COMPOSER_SEND is unset, and reports
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
}: {
  open: boolean;
  onClose: () => void;
  /** Fired only when something actually left - never on cancel. */
  onSent?: (subject: string) => void;
  to: string;
  audience?: "landlord" | "tenant" | "any";
  /** name, firstName, address, postcode, agent — whatever the caller holds. */
  merge: Record<string, string | undefined>;
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
                  className="mt-2 h-[420px] w-full rounded-xl border border-line/70 bg-white"
                />
              )}
            </div>
          )}

          {note && <p className="mt-3 text-[12px] leading-relaxed text-accent-dark">{note}</p>}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-line/70 px-5 py-3.5">
          <p className="text-[11px] leading-relaxed text-muted">
            {preview?.sendEnabled
              ? "This will go to the address above."
              : "Sending is switched off, so nothing leaves the building yet."}
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
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-[12px] font-semibold ${
              canSend ? "bg-accent-dark text-white" : "cursor-not-allowed bg-line/40 text-muted"
            }`}
          >
            <DoodleIcon name="mail" size={13} />
            {preview?.sendEnabled ? "Send" : "Sending is off"}
          </PressButton>
        </div>
      </aside>
    </div>
  );
}
