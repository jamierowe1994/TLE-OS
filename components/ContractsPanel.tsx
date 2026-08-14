"use client";

import { useCallback, useEffect, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";

/**
 * Terms of business on a property — what has gone out, what came back.
 *
 * Sent through REX's own DocuSign connection, so the envelope lands on the
 * REX record and the next person to open that landlord can see it. Nothing
 * here talks to DocuSign directly and nothing needs a DocuSign key.
 *
 * The screen is built around the question an agent actually has, which is not
 * "what is the status" but "who am I still waiting on, and for how long".
 * So an outstanding contract leads with its age, and a signed one leads with
 * the document.
 */

type Signer = { role: string; name: string; email: string };
type Request = {
  id: number;
  status: "completed" | "partially_signed" | "incomplete" | "unknown";
  statusText: string;
  templateName: string;
  sentBy: string;
  sentAt: string | null;
  completedAt: string | null;
  envelopeId: string | null;
  error: string | null;
  signers: Signer[];
};
type Doc = { id: number; name: string; sizeMb: number; createdAt: string | null; open: string };
type Template = { id: number; name: string; module: string | null };

const days = (iso: string | null) =>
  iso == null ? null : Math.floor((Date.now() - new Date(iso).valueOf()) / 86_400_000);

/** "3 days ago", and "today" rather than "0 days ago". */
function since(iso: string | null): string {
  const d = days(iso);
  if (d == null) return "";
  if (d <= 0) return "today";
  if (d === 1) return "yesterday";
  return `${d} days ago`;
}

const TONE: Record<Request["status"], { label: string; className: string }> = {
  completed: { label: "Signed", className: "border-emerald-600/40 text-emerald-700" },
  partially_signed: { label: "Part signed", className: "border-amber-500/50 text-amber-700" },
  incomplete: { label: "Waiting", className: "border-line text-muted" },
  unknown: { label: "Unknown", className: "border-line text-muted" },
};

export default function ContractsPanel({
  listingId,
  contactId,
  landlordName,
  /* NOT called `ref`. React treats that name specially, and even where it is
     allowed as a plain prop it is exactly the kind of thing that silently
     stops arriving after an upgrade. */
  recordRef,
}: {
  listingId: string | number;
  /** The REX contact who signs. Without one we can show but not send. */
  contactId?: string | number | null;
  landlordName?: string;
  recordRef?: string;
}) {
  const [requests, setRequests] = useState<Request[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "off">("loading");
  const [pick, setPick] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(`/api/esign?listingId=${encodeURIComponent(String(listingId))}`)
      .then((r) => r.json())
      .then((j) => {
        if (!j.ok) return setState("off");
        setRequests(j.requests ?? []);
        setDocs(j.documents ?? []);
        setState("ready");
      })
      .catch(() => setState("off"));
  }, [listingId]);

  useEffect(() => {
    load();
    fetch("/api/esign/templates")
      .then((r) => r.json())
      .then((j) => {
        const t: Template[] = j.templates ?? [];
        setTemplates(t);
        // One template is the common case, so don't make anybody choose it.
        if (t.length === 1) setPick(t[0].id);
      })
      .catch(() => {});
  }, [load]);

  async function send() {
    if (!pick || !contactId) return;
    setSending(true);
    setNote(null);
    try {
      const res = await fetch("/api/esign/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ listingId, contactId, templateId: pick, ref: recordRef ?? "" }),
      });
      const j = await res.json();
      // A locked environment is the EXPECTED answer today, not an error —
      // say what it is and what unlocks it rather than "Send failed".
      setNote(j.ok ? "Sent — it will show as Waiting until they sign." : (j.error ?? "That didn't send."));
      if (j.ok) load();
    } catch {
      setNote("That didn't send.");
    } finally {
      setSending(false);
    }
  }

  if (state === "off") return null;

  const outstanding = requests.filter((r) => r.status !== "completed");
  const signed = requests.filter((r) => r.status === "completed");

  return (
    <div className="rounded-2xl border border-line/80 bg-panel p-5">
      <div className="flex flex-wrap items-center gap-3">
        <DoodleIcon name="checklist" size={16} className="text-accent-dark" />
        <div className="min-w-0">
          <h3 className="text-[14px]">Terms of business</h3>
          <p className="text-[11.5px] text-muted">
            {state === "loading"
              ? "Asking REX…"
              : requests.length > 0
                ? `${signed.length} signed · ${outstanding.length} outstanding`
                : docs.length > 0
                  ? /* A signed contract on the record with no request behind it.
                       Real and common: the request only joins to a listing when
                       it was sent against that listing, and plenty were sent
                       from the property or the contact instead. Saying "nothing
                       sent" over the top of a signed PDF is the one thing this
                       line must never do. */
                    `${docs.length} signed contract${docs.length === 1 ? "" : "s"} on file — sent from another record, so there's no request to track here.`
                  : "Nothing sent for signature on this property yet."}
          </p>
        </div>
      </div>

      {/* ── What's still out. Age first: that is the thing worth acting on. ── */}
      {outstanding.length > 0 && (
        <ul className="mt-4 space-y-2">
          {outstanding.map((r) => {
            const age = days(r.sentAt);
            const stale = age != null && age >= 7;
            return (
              <li key={r.id} className="rounded-xl border border-line/70 bg-card p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-[10.5px] font-semibold ${TONE[r.status].className}`}
                  >
                    {TONE[r.status].label}
                  </span>
                  <span className="text-[12.5px]">{r.templateName}</span>
                  <span className={`ml-auto text-[11.5px] ${stale ? "text-accent-dark" : "text-muted"}`}>
                    sent {since(r.sentAt)}
                    {r.sentBy ? ` by ${r.sentBy}` : ""}
                  </span>
                </div>
                {r.signers.length > 0 && (
                  <p className="mt-1.5 text-[11.5px] text-muted">
                    {r.signers.map((s) => `${s.role}: ${s.name}`).join(" · ")}
                  </p>
                )}
                {r.error && <p className="mt-1.5 text-[11.5px] text-accent-dark">{r.error}</p>}
                {stale && (
                  <p className="mt-1.5 text-[11.5px] text-accent-dark">
                    Out for {age} days with no signature — worth a call.
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* ── What came back. The document leads; the status is already implied. ── */}
      {(signed.length > 0 || docs.length > 0) && (
        <ul className="mt-3 space-y-2">
          {docs.map((d) => (
            <li
              key={d.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-line/70 bg-card p-3"
            >
              <span className="rounded-full border border-emerald-600/40 px-2.5 py-0.5 text-[10.5px] font-semibold text-emerald-700">
                Signed
              </span>
              <span className="min-w-0 truncate text-[12.5px]">{d.name}</span>
              <span className="text-[11px] text-muted">
                {d.sizeMb ? `${d.sizeMb} MB` : ""} {d.createdAt ? `· ${since(d.createdAt)}` : ""}
              </span>
              {/* Opens through the OS, never the CDN address underneath — see
                  app/api/esign/document for why that distinction matters. */}
              <a
                href={d.open}
                target="_blank"
                rel="noreferrer"
                className="ml-auto rounded-full border border-line/80 px-3.5 py-1.5 text-[11.5px] hover:border-ink/40"
              >
                Open
              </a>
            </li>
          ))}
          {signed.length > 0 && docs.length === 0 && (
            <li className="text-[11.5px] leading-relaxed text-muted">
              Signed in DocuSign, but the completed document hasn&rsquo;t been written back to the
              REX record yet. It usually lands within seconds.
            </li>
          )}
        </ul>
      )}

      {/* ── Sending ── */}
      <div className="mt-4 flex flex-wrap items-center gap-2.5">
        {templates.length > 1 && (
          <select
            value={pick ?? ""}
            onChange={(e) => setPick(Number(e.target.value) || null)}
            className="rounded-lg border border-line/80 bg-card px-3 py-2 text-[12.5px] outline-none focus:border-ink"
          >
            <option value="">Which terms…</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}
        <button
          type="button"
          onClick={send}
          disabled={sending || !pick || !contactId}
          className="rounded-full bg-ink px-4 py-2 text-[12.5px] text-page disabled:opacity-50"
        >
          {sending ? "Sending…" : outstanding.length ? "Send again" : "Send the terms"}
        </button>
        {!contactId && (
          <span className="text-[11px] text-muted">
            No REX contact on this record{landlordName ? ` for ${landlordName}` : ""} — the landlord
            has to exist in REX to be a signer.
          </span>
        )}
      </div>

      {note && <p className="mt-2.5 text-[11.5px] leading-relaxed text-muted">{note}</p>}
    </div>
  );
}
