"use client";

import { useState } from "react";
import FloatSheet, { FloatFoot } from "@/components/new-look/FloatSheet";
import { DATED_CHECKS, PLC_CHECKS, checkById, type CheckId, type PlcCase, type PlcDocument } from "@/lib/plc";

/**
 * One document, opened in front of the check rather than in a new tab
 * (James, 8 Nov 2026: "the image or doc on the left-hand side ... valid until
 * on the right ... why it is or isn't ... edit the date ... put a tick").
 *
 * Left: the file itself. Right: what it is, its dates (editable - the
 * reader is sometimes wrong, the document isn't), why it passes or not
 * against the move-in date, which check it sits under, and "Looks right".
 */

const isImage = (name: string) => /\.(jpe?g|png|gif|webp|heic|jfif)$/i.test(name);
const pretty = (v: string | null | undefined) =>
  v ? new Date(`${v.slice(0, 10)}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : null;

export default function DocViewer({
  kase,
  doc,
  onChanged,
  onMove,
  onRemove,
  onClose,
}: {
  kase: PlcCase;
  doc: PlcDocument;
  onChanged: (c: PlcCase) => void;
  onMove: (d: PlcDocument, to: CheckId) => Promise<void> | void;
  onRemove: (d: PlcDocument) => Promise<void> | void;
  onClose: () => void;
}) {
  const r = doc.read ?? null;
  const dated = DATED_CHECKS.has(doc.checkId);
  const [expiry, setExpiry] = useState(r?.expiryDate?.slice(0, 10) ?? "");
  const [issue, setIssue] = useState(r?.issueDate?.slice(0, 10) ?? "");
  const [busy, setBusy] = useState<null | "dates" | "tick">(null);
  const [err, setErr] = useState<string | null>(null);
  const changed = (dated ? expiry !== (r?.expiryDate?.slice(0, 10) ?? "") : false) || issue !== (r?.issueDate?.slice(0, 10) ?? "");
  const moveIn = kase.moveInDate;
  const runsOut = Boolean(dated && expiry && moveIn && expiry < moveIn);
  const verdict = !dated
    ? doc.agentChecked ? "You've checked it." : "Nothing on this one runs out. Check it's the right document and tick it."
    : !expiry
      ? "No expiry date found. Put it in from the document."
      : runsOut
        ? `Runs out on ${pretty(expiry)}, before the move-in on ${pretty(moveIn)}. A new one is needed.`
        : moveIn
          ? `In date for the move-in on ${pretty(moveIn)}.`
          : `In date until ${pretty(expiry)}.`;
  const ok = dated ? Boolean(expiry) && !runsOut : true;

  async function patch(body: Record<string, unknown>, what: "dates" | "tick") {
    setBusy(what);
    setErr(null);
    const j = (await fetch(`/api/plc/${kase.id}/documents`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: doc.key, ...body }),
    })
      .then((x) => x.json())
      .catch(() => null)) as { ok?: boolean; case?: PlcCase; error?: string } | null;
    setBusy(null);
    if (!j?.ok || !j.case) return setErr(j?.error ?? "That didn't save. Try again.");
    onChanged(j.case);
  }

  const src = !doc.placeholder && doc.url && doc.url !== "#" ? doc.url : null;
  return (
    <FloatSheet
      title={checkById(doc.checkId)?.label ?? "Document"}
      size="xl"
      onClose={onClose}
      dismissible={busy === null}
      foot={
        <FloatFoot left={err ? <span className="text-accent-dark">{err}</span> : <span>{doc.addedBy ? `Added by ${doc.addedBy}` : ""}</span>}>
          <button type="button" className="nl-btn nl-btn--quiet" onClick={() => { void onRemove(doc); onClose(); }}>Take it off</button>
          <button
            type="button"
            className={`nl-btn ${doc.agentChecked ? "nl-btn--secondary" : "nl-btn--primary nl-btn--olive"}`}
            disabled={busy !== null}
            onClick={() => void patch({ checked: !doc.agentChecked }, "tick")}
            data-steve="plc.doc-checked"
          >
            {busy === "tick" ? "Saving…" : doc.agentChecked ? "Untick" : "Looks right"}
          </button>
        </FloatFoot>
      }
    >
      <div className="nl-docv">
        <div className="nl-docv-file">
          {!src ? (
            <p className="nl-docv-none">Recorded by name only - there's no file to show.</p>
          ) : isImage(doc.name) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt={doc.name} />
          ) : (
            <iframe src={src} title={doc.name} />
          )}
          {src && (
            <a href={src} target="_blank" rel="noreferrer" className="nl-docv-open">Open in a new tab</a>
          )}
        </div>
        <div className="nl-docv-side">
          <p className="nl-docv-name" title={doc.name}>{doc.name}</p>
          {r?.what && <p className="nl-docv-what">{r.what}</p>}
          <div className={`nl-docv-verdict${ok ? " is-ok" : " is-bad"}`}>
            <span aria-hidden>{ok ? "✓" : "!"}</span>
            <p>{verdict}</p>
          </div>
          {doc.agentChecked && <p className="nl-docv-checked">Checked by {doc.agentChecked.by}</p>}

          <div className="nl-docv-fields">
            {dated && (
              <label>
                <span>Valid until</span>
                <input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
                {r?.expiryDerived && <small>Worked out from the issue date - check it against the document.</small>}
              </label>
            )}
            <label>
              <span>{dated ? "Issued" : "Dated"}</span>
              <input type="date" value={issue} onChange={(e) => setIssue(e.target.value)} />
            </label>
            {changed && (
              <button type="button" className="nl-btn nl-btn--primary nl-btn--sm" disabled={busy !== null} onClick={() => void patch({ dates: { ...(dated ? { expiryDate: expiry || null } : {}), issueDate: issue || null } }, "dates")}>
                {busy === "dates" ? "Saving…" : "Save the dates"}
              </button>
            )}
          </div>

          {r?.names && r.names.length > 0 && (
            <div className="nl-docv-row"><span>Names on it</span><p>{r.names.join(", ")}</p></div>
          )}
          {r?.note && <div className="nl-docv-row"><span>Note</span><p>{r.note}</p></div>}
          <label className="nl-docv-row">
            <span>Filed under</span>
            <select value={doc.checkId} onChange={(e) => void onMove(doc, e.target.value as CheckId)}>
              {PLC_CHECKS.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </label>
        </div>
      </div>
    </FloatSheet>
  );
}
