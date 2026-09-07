"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";

/**
 * The tenant's one question, from the "are you happy?" email. A yes closes
 * it; a no asks for a line and goes straight back to the agent.
 */
export default function RepairPage() {
  const { token } = useParams<{ token: string }>();
  const params = useSearchParams();
  const [job, setJob] = useState<{ ref: number; title: string; address: string; contractorName: string; happy: string | null } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [answer, setAnswer] = useState<"yes" | "no" | null>(null);
  const [note, setNote] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/repair/${token}`, { cache: "no-store" }).then((r) => r.json()).then((j) => {
      if (!j.ok) return setErr(j.error ?? "That link isn't one of ours.");
      setJob(j.job);
      if (j.job.happy) setDone(j.job.happy);
      const h = params.get("happy");
      if (h === "yes" && !j.job.happy) void send("yes", "");
      if (h === "no") setAnswer("no");
    }).catch(() => setErr("Could not load."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function send(happy: "yes" | "no", text: string) {
    setBusy(true);
    const r = await fetch(`/api/repair/${token}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ happy, note: text }) }).then((x) => x.json()).catch(() => null);
    setBusy(false);
    if (!r?.ok) return setErr(r?.error ?? "That didn't work.");
    setDone(happy);
  }

  const btn: React.CSSProperties = { border: 0, background: "#101014", color: "#fff", borderRadius: 999, padding: "12px 22px", fontSize: 14, fontWeight: 600, cursor: "pointer" };
  return (
    <main style={{ minHeight: "100vh", background: "#f2f0eb", padding: "24px 12px 48px", fontFamily: "Montserrat, system-ui, sans-serif", color: "#101014" }}>
      <div style={{ maxWidth: 520, margin: "48px auto 0", background: "#fff", border: "1px solid #cdc9c0", borderRadius: 16, padding: 28 }}>
        <p style={{ fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", color: "#6b6b70", margin: 0 }}>The Letting Experts</p>
        {err && <p style={{ color: "#a85a51", marginTop: 12 }}>{err}</p>}
        {job && done === "yes" && (
          <>
            <h1 style={{ fontSize: 24, fontWeight: 500, margin: "10px 0 0" }}>Thanks, that's good to hear</h1>
            <p style={{ color: "#6b6b70", fontSize: 14, lineHeight: 1.6 }}>{job.title} at {job.address} is closed off as sorted. If it comes back, reply to any of our emails and we'll get somebody out.</p>
          </>
        )}
        {job && done === "no" && (
          <>
            <h1 style={{ fontSize: 24, fontWeight: 500, margin: "10px 0 0" }}>Not a problem</h1>
            <p style={{ color: "#6b6b70", fontSize: 14, lineHeight: 1.6 }}>Somebody from the team will be in touch about {job.title} at {job.address}.</p>
          </>
        )}
        {job && !done && (
          <>
            <h1 style={{ fontSize: 24, fontWeight: 500, margin: "10px 0 0" }}>Was it sorted?</h1>
            <p style={{ color: "#6b6b70", fontSize: 14, lineHeight: 1.6 }}>{job.contractorName || "The contractor"} has been out to {job.address} for <strong>{job.title}</strong>. Are you happy with what's been done?</p>
            {answer !== "no" ? (
              <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
                <button type="button" disabled={busy} onClick={() => void send("yes", "")} style={btn}>Yes, all sorted</button>
                <button type="button" disabled={busy} onClick={() => setAnswer("no")} style={{ ...btn, background: "#fff", color: "#101014", border: "1px solid #101014" }}>No, it isn't right</button>
              </div>
            ) : (
              <div style={{ marginTop: 16 }}>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="What's still wrong?" style={{ width: "100%", border: "1px solid #cdc9c0", borderRadius: 8, padding: 10, font: "inherit", fontSize: 14 }} />
                <button type="button" disabled={busy} onClick={() => void send("no", note)} style={{ ...btn, marginTop: 10 }}>{busy ? "Sending…" : "Send that to the team"}</button>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
