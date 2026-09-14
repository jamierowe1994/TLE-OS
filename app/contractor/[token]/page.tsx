"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

/**
 * The contractor's page for one job. No sign-in: the link in their works
 * order is the key. Four things, one at a time: the date they've agreed with
 * the tenant, marking it done, their photos, the certificate, and the invoice.
 *
 * THE CERTIFICATE BOX IS NOT A SECOND UPLOAD BUTTON (14 Sep 2026). A photo is
 * a file on a job; a certificate is a compliance record, so this one asks for
 * the two facts the PDF cannot be trusted to give - what it is, and the date
 * it runs out - and the OS then files it on the property, writes it into REX
 * and sends it to the landlord and the tenant. Asking the contractor for the
 * expiry is right: they are holding the certificate, and the alternative is
 * somebody in the office reading it off a scan a week later.
 */

type Job = {
  ref: number; title: string; category: string; description: string; status: string; step: string; address: string; access: string; tenant: string;
  contractorName: string; scheduledAt: string | null; completedAt: string | null; invoicePence: number | null; invoiceRef: string; files: { name: string; at: string }[];
};

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) : "");

/* The same vocabulary REX uses, in the words a contractor would use. Gas and
   electrical first because they are most of what comes back this way. */
const CERT_TYPES: { id: string; label: string }[] = [
  { id: "gas_safety", label: "Gas safety (CP12)" },
  { id: "eicr", label: "Electrical safety (EICR)" },
  { id: "epc", label: "EPC" },
  { id: "portable_appliance_testing", label: "PAT test" },
  { id: "legionella_risk_assessment", label: "Legionella risk assessment" },
  { id: "smoke_alarms", label: "Smoke alarms" },
  { id: "co_alarms", label: "CO alarms" },
  { id: "emergency_lighting_fire_exit", label: "Fire safety" },
];

export default function ContractorPage() {
  const { token } = useParams<{ token: string }>();
  const [job, setJob] = useState<Job | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");
  const [amount, setAmount] = useState("");
  const [ref, setRef] = useState("");
  const [certType, setCertType] = useState("");
  const [certExpiry, setCertExpiry] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/contractor/${token}`, { cache: "no-store" }).then((r) => r.json()).then((j) => { if (j.ok) setJob(j.job); else setErr(j.error ?? "That link isn't one of ours."); }).catch(() => setErr("Could not load the job."));
  }, [token]);

  async function post(body: Record<string, unknown>, label: string) {
    setBusy(label);
    setErr(null);
    const r = await fetch(`/api/contractor/${token}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((x) => x.json()).catch(() => null);
    setBusy(null);
    if (!r?.ok) return setErr(r?.error ?? "That didn't work.");
    setJob(r.job);
    setFlash(label === "date" ? "Thanks - the date's on the job and the tenant and landlord have been told." : "Thanks - marked done.");
  }
  async function upload(file: File, kind: "photo" | "invoice" | "certificate") {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("kind", kind);
    if (kind === "invoice") { fd.append("amount", amount); fd.append("ref", ref); fd.append("note", note); }
    if (kind === "certificate") { fd.append("type", certType); fd.append("expiry", certExpiry); }
    setBusy(kind);
    setErr(null);
    const r = await fetch(`/api/contractor/${token}`, { method: "POST", body: fd }).then((x) => x.json()).catch(() => null);
    setBusy(null);
    if (!r?.ok) return setErr(r?.error ?? "The file did not upload.");
    setJob(r.job);
    if (kind === "certificate") {
      setCertType(""); setCertExpiry("");
      /* What actually happened, not "thanks": a contractor who has just
         handed over a legal document wants to know it landed somewhere. */
      return setFlash("Thanks - the certificate is on the property's record and the landlord and tenant are being sent a copy.");
    }
    setFlash(kind === "invoice" ? "Thanks - your invoice is on the job and accounts have been told." : "Photo added.");
  }

  const box: React.CSSProperties = { background: "#fff", border: "1px solid #cdc9c0", borderRadius: 16, padding: 20, marginTop: 16 };
  const field: React.CSSProperties = { width: "100%", border: "1px solid #cdc9c0", borderRadius: 8, padding: "10px 12px", font: "inherit", fontSize: 14 };
  const btn: React.CSSProperties = { border: 0, background: "#101014", color: "#fff", borderRadius: 999, padding: "10px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer" };
  const label: React.CSSProperties = { display: "block", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#6b6b70", marginBottom: 4 };

  return (
    <main style={{ minHeight: "100vh", background: "#f2f0eb", padding: "24px 12px 48px", fontFamily: "var(--font-body)", color: "#101014" }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <p style={{ fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", color: "#6b6b70", margin: 0 }}>The Letting Experts · works order</p>
        {err && !job && <p style={{ color: "#a85a51", marginTop: 12 }}>{err}</p>}
        {!job && !err && <p style={{ color: "#6b6b70", marginTop: 12 }}>Loading the job…</p>}
        {job && (
          <>
            <h1 style={{ fontSize: 26, fontWeight: 800, margin: "8px 0 0", letterSpacing: "-0.02em" }}>#{job.ref} · {job.title}</h1>
            <p style={{ margin: "6px 0 0", color: "#6b6b70", fontSize: 14 }}>{job.address}</p>
            <div style={box}>
              <span style={label}>The job</span>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>{job.description || job.category}</p>
              <p style={{ margin: "10px 0 0", fontSize: 13, color: "#6b6b70" }}><strong>Access:</strong> {job.access || "none recorded"}<br /><strong>Tenant:</strong> {job.tenant || "on the works order"}</p>
            </div>
            {flash && <p style={{ ...box, borderColor: "#3f8f5f", color: "#3f8f5f", fontSize: 14 }}>{flash}</p>}
            {err && job && <p style={{ color: "#a85a51", marginTop: 12, fontSize: 13 }}>{err}</p>}

            {!job.scheduledAt && !job.completedAt && (
              <div style={box}>
                <span style={label}>When have you agreed with the tenant?</span>
                <input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} style={field} />
                <button type="button" disabled={!date || busy === "date"} onClick={() => void post({ action: "date", scheduledAt: new Date(date).toISOString() }, "date")} style={{ ...btn, marginTop: 10 }}>{busy === "date" ? "Saving…" : "That's the date"}</button>
              </div>
            )}
            {job.scheduledAt && !job.completedAt && (
              <div style={box}>
                <span style={label}>Booked</span>
                <p style={{ margin: 0, fontSize: 14 }}>{when(job.scheduledAt)}. If it moves, set the new time here.</p>
                <input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} style={{ ...field, marginTop: 8 }} />
                <button type="button" disabled={!date || busy === "date"} onClick={() => void post({ action: "date", scheduledAt: new Date(date).toISOString() }, "date")} style={{ ...btn, marginTop: 10, background: "#fff", color: "#101014", border: "1px solid #101014" }}>Move it</button>
              </div>
            )}

            {!job.completedAt && (
              <div style={box}>
                <span style={label}>All done?</span>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="What you did, in a line or two" style={field} />
                <button type="button" disabled={busy === "done"} onClick={() => void post({ action: "done", note }, "done")} style={{ ...btn, marginTop: 10 }}>{busy === "done" ? "Saving…" : "Mark it done"}</button>
              </div>
            )}

            <div style={box}>
              <span style={label}>Photos of the work</span>
              <label style={{ ...btn, display: "inline-block", background: "#fff", color: "#101014", border: "1px solid #101014" }}>
                {busy === "photo" ? "Uploading…" : "Add a photo"}
                <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f, "photo"); e.target.value = ""; }} disabled={busy === "photo"} />
              </label>
              {job.files.length > 0 && <p style={{ margin: "8px 0 0", fontSize: 12, color: "#6b6b70" }}>{job.files.length} file{job.files.length === 1 ? "" : "s"} on the job.</p>}
            </div>

            <div style={box}>
              <span style={label}>A certificate from the visit</span>
              <p style={{ margin: "0 0 10px", fontSize: 13, color: "#6b6b70" }}>Gas, electrical, PAT, anything with an expiry date. It goes on the property&apos;s record and we send a copy to the landlord and the tenant.</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <select value={certType} onChange={(e) => setCertType(e.target.value)} style={field}>
                  <option value="">What is it?</option>
                  {CERT_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
                <input type="date" value={certExpiry} onChange={(e) => setCertExpiry(e.target.value)} style={field} aria-label="The date it runs out" />
              </div>
              <label style={{ ...btn, display: "inline-block", marginTop: 10, opacity: certType && certExpiry ? 1 : 0.5 }}>
                {busy === "certificate" ? "Filing…" : "Choose the certificate"}
                <input type="file" accept="application/pdf,image/*" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f, "certificate"); e.target.value = ""; }} disabled={busy === "certificate" || !certType || !certExpiry} />
              </label>
              {!(certType && certExpiry) && <p style={{ margin: "6px 0 0", fontSize: 12, color: "#6b6b70" }}>Say what it is and when it runs out, then choose the file.</p>}
            </div>

            {job.invoicePence == null ? (
              <div style={box}>
                <span style={label}>Your invoice</span>
                <p style={{ margin: "0 0 10px", fontSize: 13, color: "#6b6b70" }}>Quote job #{job.ref} on it. It goes straight to accounts.</p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="£ total" style={field} />
                  <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Invoice number" style={field} />
                </div>
                <label style={{ ...btn, display: "inline-block", marginTop: 10, opacity: amount ? 1 : 0.5 }}>
                  {busy === "invoice" ? "Uploading…" : "Choose the invoice file"}
                  <input type="file" accept="application/pdf,image/*" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f, "invoice"); e.target.value = ""; }} disabled={busy === "invoice" || !amount} />
                </label>
                {!amount && <p style={{ margin: "6px 0 0", fontSize: 12, color: "#6b6b70" }}>Put the total in first, then choose the file.</p>}
              </div>
            ) : (
              <div style={box}>
                <span style={label}>Your invoice</span>
                <p style={{ margin: 0, fontSize: 14 }}>Received: £{(job.invoicePence / 100).toFixed(2)}{job.invoiceRef ? ` (${job.invoiceRef})` : ""}. Accounts have it.</p>
              </div>
            )}
            <p style={{ marginTop: 24, fontSize: 12, color: "#6b6b70" }}>Anything else, reply to the works order email.</p>
          </>
        )}
      </div>
    </main>
  );
}
