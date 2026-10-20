"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";

/**
 * The landlord's answer on a contractor's invoice (Kirstie Mulholland, 20 Oct
 * 2026), from the three buttons in their email: pay it from the rent, pay the
 * contractor direct, or raise a query. Each button lands here with its answer
 * picked; nothing is saved until they press Confirm, so a mail scanner that
 * follows links can't answer for them.
 */

type Answer = "pay" | "direct" | "query";
type Job = { ref: number; title: string; address: string; contractorName: string; invoice: string; invoiceRef: string; hasFile: boolean; answer: Answer | null; closed: boolean };

const CHOICES: { id: Answer; label: string; sub: string }[] = [
  { id: "pay", label: "Authorise to Pay from the Rent", sub: "We pay the contractor and take it from your next rent." },
  { id: "direct", label: "I'll Pay the Contractor Direct", sub: "We won't pay it. You settle it with them yourself." },
  { id: "query", label: "Raise a Query", sub: "Nothing is paid until we've answered you." },
];

const DONE: Record<Answer, { head: string; body: string }> = {
  pay: { head: "Thanks, That's Authorised", body: "We'll pay the contractor and it will show on your next statement." },
  direct: { head: "Thanks, We Won't Pay It", body: "Please settle it with the contractor directly. We've told our accounts team." },
  query: { head: "Thanks, We've Got Your Query", body: "Nothing will be paid until we've come back to you. Your agent has been told." },
};

export default function LandlordInvoicePage() {
  const { token } = useParams<{ token: string }>();
  const params = useSearchParams();
  const [job, setJob] = useState<Job | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pick, setPick] = useState<Answer | null>(null);
  const [note, setNote] = useState("");
  const [done, setDone] = useState<Answer | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/landlord/invoice/${encodeURIComponent(token)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!j?.ok) return setErr(j?.error ?? "That link isn't one of ours.");
        setJob(j.job);
        if (j.job.answer) setDone(j.job.answer);
        const a = params.get("answer");
        if (a === "pay" || a === "direct" || a === "query") setPick(a);
      })
      .catch(() => setErr("This page couldn't load. Try again in a minute."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function confirm() {
    if (!pick) return;
    setBusy(true);
    setErr(null);
    const r = await fetch(`/api/landlord/invoice/${encodeURIComponent(token)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ answer: pick, note }) })
      .then((x) => x.json())
      .catch(() => null);
    setBusy(false);
    if (r?.answer) return setDone(r.answer);
    if (!r?.ok) return setErr(r?.error ?? "That didn't save. Try again in a minute.");
  }

  const ink = "#101014";
  const muted = "#6b6b70";
  const btn: React.CSSProperties = { border: 0, background: ink, color: "#fff", borderRadius: 999, padding: "12px 22px", fontSize: 14, fontWeight: 600, cursor: "pointer" };
  const title: React.CSSProperties = { fontFamily: "var(--font-heading, Manrope, sans-serif)", fontSize: 24, fontWeight: 500, letterSpacing: 0, margin: "10px 0 0", lineHeight: 1.25 };

  return (
    <main style={{ minHeight: "100vh", background: "#fdefec", padding: "24px 16px 48px", fontFamily: "var(--font-body)", color: ink }}>
      <div style={{ maxWidth: 540, margin: "40px auto 0", background: "#fff", border: "1px solid #cdc9c0", borderRadius: 16, padding: "28px 24px" }}>
        <p style={{ fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", color: muted, margin: 0 }}>The Letting Experts</p>

        {!job && !err && (
          <p style={{ display: "flex", alignItems: "center", gap: 8, color: muted, fontSize: 14, marginTop: 16 }}>
            <span style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid #cdc9c0", borderTopColor: ink, display: "inline-block", animation: "spin 0.8s linear infinite" }} />
            Loading the invoice
          </p>
        )}
        {err && <p style={{ color: "#a85a51", marginTop: 14, fontSize: 14, lineHeight: 1.5 }}>{err}</p>}

        {job && (
          <div style={{ marginTop: 14, padding: "14px 16px", background: "#faf7f5", borderRadius: 12, fontSize: 14, lineHeight: 1.55 }}>
            <div style={{ fontSize: 22, fontWeight: 600 }}>{job.invoice}</div>
            <div>{job.contractorName || "The contractor"} · {job.title}</div>
            <div style={{ color: muted }}>{job.address} · job #{job.ref}{job.invoiceRef ? ` · invoice ${job.invoiceRef}` : ""}</div>
            {job.hasFile && (
              <a href={`/api/landlord/invoice/${encodeURIComponent(token)}?file=1`} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 8, color: ink, fontWeight: 600, textDecoration: "underline", textUnderlineOffset: 3 }}>
                View the invoice
              </a>
            )}
          </div>
        )}

        {job && done && (
          <>
            <h1 style={title}>{DONE[done].head}</h1>
            <p style={{ color: muted, fontSize: 14, lineHeight: 1.6 }}>{DONE[done].body} If anything changes, reply to our email or give us a ring.</p>
          </>
        )}

        {job && !done && job.closed && (
          <>
            <h1 style={title}>This Invoice Is Settled</h1>
            <p style={{ color: muted, fontSize: 14, lineHeight: 1.6 }}>There's nothing for you to do. If something isn't right, reply to our email.</p>
          </>
        )}

        {job && !done && !job.closed && (
          <>
            <h1 style={title}>How Would You Like It Paid?</h1>
            <div role="radiogroup" aria-label="How would you like it paid?" style={{ display: "grid", gap: 10, marginTop: 16 }}>
              {CHOICES.map((c) => {
                const on = pick === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setPick(c.id)}
                    style={{ textAlign: "left", background: on ? "#fdefec" : "#fff", border: `1.5px solid ${on ? ink : "#cdc9c0"}`, borderRadius: 12, padding: "12px 14px", cursor: "pointer", color: ink, font: "inherit" }}
                  >
                    <span style={{ display: "block", fontSize: 15, fontWeight: 600 }}>{c.label}</span>
                    <span style={{ display: "block", fontSize: 13, color: muted, marginTop: 2 }}>{c.sub}</span>
                  </button>
                );
              })}
            </div>
            {pick && (
              <div style={{ marginTop: 14 }}>
                <label htmlFor="ll-note" style={{ fontSize: 13, fontWeight: 600 }}>{pick === "query" ? "What's your query?" : "Anything to add? (optional)"}</label>
                <textarea id="ll-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} style={{ display: "block", width: "100%", marginTop: 6, border: "1px solid #cdc9c0", borderRadius: 8, padding: 10, font: "inherit", fontSize: 14, boxSizing: "border-box" }} />
                <button type="button" disabled={busy || (pick === "query" && !note.trim())} onClick={() => void confirm()} style={{ ...btn, marginTop: 12, opacity: busy || (pick === "query" && !note.trim()) ? 0.5 : 1 }}>
                  {busy ? "Sending" : "Confirm"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </main>
  );
}
