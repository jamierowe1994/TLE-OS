"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";

/**
 * A booking confirmation, as it will arrive, editable in place (17 Sep 2026).
 *
 * The preview IS the editor: click into any sentence and change it. Used by
 * the pop-up (ConfirmSheet) for a booking that already exists, and by the
 * booker's email column for one being made, which is why it takes a booking
 * that is not saved yet and fetches the words again when the time changes.
 *
 * Nothing is sent from here. The caller reads `subject` and `html()` through
 * the ref when the agent presses Send.
 */

export type ViewingBookingInput = {
  leadId: string;
  listingId?: string | number | null;
  applicantName: string;
  applicantEmail?: string | null;
  address: string;
  startsAt: string;
  minutes: number;
  unaccompanied?: boolean;
};

export type AppraisalBookingInput = {
  leadId: string;
  landlord: string;
  email?: string | null;
  address: string;
  startsAt: string;
  minutes: number;
};

export type ConfirmTarget =
  | { kind: "appraisal"; id: string }
  | { kind: "appraisal-new"; appraisal: AppraisalBookingInput }
  | { kind: "viewing"; booking: ViewingBookingInput }
  /** The take-on visit: photographs and the floor plan, on an appraisal. */
  | { kind: "takeon"; id: string; startsAt: string; minutes: number };

export type ConfirmDraft = {
  ok: boolean;
  error?: string;
  to: string | null;
  toName: string;
  subject: string;
  html: string;
  blocked?: string;
  alreadySent?: { at: string; to: string; subject: string };
  moved?: { from: string };
  attachment: string | null;
};

export interface ConfirmEditorHandle {
  subject: string;
  html: () => string | undefined;
  draft: ConfirmDraft | null;
}

export function payloadOf(t: ConfirmTarget): Record<string, unknown> {
  return t.kind === "appraisal"
    ? { kind: "appraisal", id: t.id }
    : t.kind === "appraisal-new"
      ? { kind: "appraisal", appraisal: t.appraisal }
      : t.kind === "takeon"
        ? { kind: "takeon", id: t.id, startsAt: t.startsAt, minutes: t.minutes }
        : { kind: "viewing", booking: t.booking };
}

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" });

const ConfirmEditor = forwardRef<ConfirmEditorHandle, { target: ConfirmTarget; onDraft?: (d: ConfirmDraft | null) => void; fill?: boolean }>(
  function ConfirmEditor({ target, onDraft, fill = true }, ref) {
    const [draft, setDraft] = useState<ConfirmDraft | null>(null);
    const [subject, setSubject] = useState("");
    const frame = useRef<HTMLIFrameElement>(null);
    const key = JSON.stringify(payloadOf(target));

    useEffect(() => {
      let live = true;
      setDraft(null);
      onDraft?.(null);
      /* A short wait, so dragging a booking longer does not fetch the email
         for every step of the drag. */
      const t = window.setTimeout(() => {
        fetch("/api/confirmations", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "draft", ...JSON.parse(key) }),
        })
          .then((r) => r.json())
          .then((d: ConfirmDraft) => {
            if (!live) return;
            setDraft(d);
            setSubject(d.subject ?? "");
            onDraft?.(d);
          })
          .catch(() => {
            if (!live) return;
            const d = { ok: false, error: "Couldn't load the email.", to: null, toName: "", subject: "", html: "", attachment: null };
            setDraft(d);
            onDraft?.(d);
          });
      }, 250);
      return () => {
        live = false;
        window.clearTimeout(t);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);

    function armEditing() {
      const doc = frame.current?.contentDocument;
      if (!doc) return;
      doc.designMode = "on";
      const style = doc.createElement("style");
      style.setAttribute("data-editor", "1");
      style.textContent = "html{cursor:text} a{pointer-events:none}";
      doc.head?.appendChild(style);
    }

    useImperativeHandle(ref, () => ({
      subject,
      draft,
      html: () => {
        const doc = frame.current?.contentDocument;
        if (!doc?.documentElement) return undefined;
        const clone = doc.documentElement.cloneNode(true) as HTMLElement;
        clone.querySelectorAll("style[data-editor]").forEach((n) => n.remove());
        return `<!DOCTYPE html>\n${clone.outerHTML}`;
      },
    }), [subject, draft]);

    if (draft === null) {
      return (
        <div className={`flex items-center justify-center gap-2 text-[12.5px] text-muted ${fill ? "flex-1" : "py-10"}`}>
          <span aria-hidden className="h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-line border-t-accent-dark" />
          Getting the email ready…
        </div>
      );
    }
    if (!draft.ok) {
      return <div className={`flex items-center justify-center p-6 text-center text-[12.5px] text-muted ${fill ? "flex-1" : ""}`}>{draft.error ?? "Couldn't load the email."}</div>;
    }
    return (
      <div className={`flex min-h-0 flex-col gap-3 ${fill ? "flex-1" : ""}`}>
        <p className="truncate text-[12px] text-muted">{draft.to ? `To ${draft.toName} · ${draft.to}` : `To ${draft.toName || "them"} · no email address`}</p>
        {draft.blocked && <p className="rounded-xl bg-accent-soft/70 px-3.5 py-2.5 text-[12px] leading-snug text-accent-dark">{draft.blocked}</p>}
        {draft.alreadySent && (
          <p className="rounded-xl border border-amber-300/70 bg-amber-50 px-3.5 py-2.5 text-[12px] leading-snug text-amber-900">
            <span className="font-semibold">Already sent</span> to {draft.alreadySent.to} on {when(draft.alreadySent.at)}. Sending again sends them a second email.
          </p>
        )}
        {draft.moved && (
          <p className="rounded-xl bg-panel px-3.5 py-2.5 text-[12px] leading-snug text-muted">
            They were confirmed for {when(draft.moved.from)}. The time has changed, so this one says it has moved.
          </p>
        )}
        <label className="block">
          <span className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-muted">Subject</span>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full rounded-xl border border-line/80 bg-card px-3.5 py-2.5 text-[13px] outline-none focus:border-ink"
          />
        </label>
        <div className={`flex min-h-0 flex-col ${fill ? "flex-1" : ""}`}>
          <p className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] font-semibold uppercase tracking-wide text-muted">
            The email
            <span className="font-normal normal-case tracking-normal">Click into any of it to change the words.</span>
          </p>
          <iframe
            ref={frame}
            title="The email, editable"
            srcDoc={draft.html}
            onLoad={armEditing}
            sandbox="allow-same-origin"
            className={`w-full rounded-2xl border border-line/80 bg-white ${fill ? "min-h-[260px] flex-1" : "h-[420px]"}`}
          />
        </div>
        {draft.attachment && (
          <p className="flex items-center gap-1.5 text-[11.5px] text-muted">
            <DoodleIcon name="calendar" size={12} /> The calendar invite goes with it.
          </p>
        )}
      </div>
    );
  }
);

export default ConfirmEditor;
