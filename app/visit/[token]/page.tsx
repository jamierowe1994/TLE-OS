"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

/**
 * The tenant's page: may we come, and when?
 *
 * Their home and their decision, so the page reads as an ask rather than a
 * notification. The three answers are equal weight - yes to a time, another
 * time, or no - because a page that makes "no" hard to find is a page that
 * collects permissions nobody actually gave.
 *
 * Same plain, self-contained styling as /repair: no shell, no session, works
 * on a phone in a hallway.
 */
type Visit = {
  kind: string;
  address: string;
  tenant: string;
  offered: string[];
  noticeHours: number;
  reply: "yes" | "no" | "other_time" | null;
  bookedAt: string | null;
  /* Booked straight away by the agent (3 Oct 2026). */
  mins?: number;
  inspector?: string;
  ackAt?: string | null;
  open?: boolean;
};

const pretty = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

export default function VisitPage() {
  const { token } = useParams<{ token: string }>();
  const [visit, setVisit] = useState<Visit | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [asking, setAsking] = useState<"other_time" | "no" | null>(null);
  const [note, setNote] = useState("");
  const [done, setDone] = useState<{ reply: string; at: string | null } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/visit/${token}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!j.ok) return setErr(j.error ?? "That link isn't one of ours.");
        setVisit(j.visit);
        if (j.visit.reply) setDone({ reply: j.visit.reply, at: j.visit.bookedAt });
        else if (j.visit.ackAt) setDone({ reply: "confirm", at: j.visit.bookedAt });
      })
      .catch(() => setErr("Could not load."));
  }, [token]);

  async function send(reply: "yes" | "no" | "other_time" | "confirm", at: string | null, text: string) {
    setBusy(true);
    const r = await fetch(`/api/visit/${token}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reply, at, note: text }),
    })
      .then((x) => x.json())
      .catch(() => null);
    setBusy(false);
    if (!r?.ok) return setErr(r?.error ?? "That didn't work.");
    setDone({ reply, at });
  }

  const btn: React.CSSProperties = { border: 0, background: "#101014", color: "#fff", borderRadius: 999, padding: "12px 22px", fontSize: 14, fontWeight: 600, cursor: "pointer" };
  const ghost: React.CSSProperties = { ...btn, background: "#fff", color: "#101014", border: "1px solid #101014" };
  const slot = (on: boolean): React.CSSProperties => ({
    display: "block", width: "100%", textAlign: "left", marginTop: 8, padding: "12px 14px", borderRadius: 12, cursor: "pointer",
    border: on ? "2px solid #101014" : "1px solid #cdc9c0", background: on ? "#f7f5f1" : "#fff", font: "inherit", fontSize: 14, fontWeight: on ? 600 : 400,
  });

  return (
    <main style={{ minHeight: "100vh", background: "#fdefec", padding: "24px 12px 48px", fontFamily: "var(--font-body)", color: "#101014" }}>
      <div style={{ maxWidth: 520, margin: "48px auto 0", background: "#fff", border: "1px solid #cdc9c0", borderRadius: 16, padding: 28 }}>
        <p style={{ fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", color: "#6b6b70", margin: 0 }}>The Letting Experts</p>
        {err && <p style={{ color: "#a85a51", marginTop: 12 }}>{err}</p>}

        {visit && done?.reply === "yes" && (
          <>
            <h1 style={{ fontSize: 24, fontWeight: 800, margin: "10px 0 0", letterSpacing: "-0.02em" }}>Thanks, that's booked</h1>
            <p style={{ color: "#6b6b70", fontSize: 14, lineHeight: 1.6 }}>
              We'll call at {visit.address}{done.at ? ` on ${pretty(done.at)}` : ""}. You'll get it in writing by email as well. If it stops working, reply to that email and we'll move it.
            </p>
          </>
        )}
        {visit && done?.reply === "confirm" && (
          <>
            <h1 style={{ fontSize: 24, fontWeight: 800, margin: "10px 0 0", letterSpacing: "-0.02em" }}>Thanks, see you then</h1>
            <p style={{ color: "#6b6b70", fontSize: 14, lineHeight: 1.6 }}>
              {visit.inspector || "We"} will call at {visit.address}{done.at ? ` on ${pretty(done.at)}` : ""}. If anything changes, reply to our email and we'll move it.
            </p>
          </>
        )}
        {visit && done?.reply === "other_time" && (
          <>
            <h1 style={{ fontSize: 24, fontWeight: 800, margin: "10px 0 0", letterSpacing: "-0.02em" }}>No problem</h1>
            <p style={{ color: "#6b6b70", fontSize: 14, lineHeight: 1.6 }}>We'll come back to you with some other times for {visit.address}.</p>
          </>
        )}
        {visit && done?.reply === "no" && (
          <>
            <h1 style={{ fontSize: 24, fontWeight: 800, margin: "10px 0 0", letterSpacing: "-0.02em" }}>That's understood</h1>
            <p style={{ color: "#6b6b70", fontSize: 14, lineHeight: 1.6 }}>Nobody will come to {visit.address}. Somebody from the team will be in touch to talk it through.</p>
          </>
        )}

        {visit && !done && visit.bookedAt && visit.open && visit.offered.length === 0 && (
          <>
            <h1 style={{ fontSize: 24, fontWeight: 800, margin: "10px 0 6px", letterSpacing: "-0.02em" }}>Your visit is booked</h1>
            <p style={{ color: "#6b6b70", fontSize: 14, lineHeight: 1.6 }}>
              {visit.inspector || "One of the team"} will call at <strong>{visit.address}</strong> for a quick look round the property.
            </p>
            <p style={{ margin: "14px 0 0", padding: "14px 16px", borderRadius: 12, background: "#f7f5f1", fontSize: 16, fontWeight: 700 }}>
              {pretty(visit.bookedAt)}
              <span style={{ display: "block", fontSize: 13, fontWeight: 400, color: "#6b6b70", marginTop: 2 }}>About {visit.mins ?? 30} minutes</span>
            </p>
            {asking === null ? (
              <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
                <button type="button" disabled={busy} onClick={() => void send("confirm", visit.bookedAt, "")} style={btn}>
                  {busy ? "Sending…" : "That time works"}
                </button>
                <button type="button" onClick={() => setAsking("other_time")} style={ghost}>I need another time</button>
              </div>
            ) : (
              <div style={{ marginTop: 16 }}>
                <p style={{ fontSize: 14, lineHeight: 1.6, margin: "0 0 8px" }}>When would suit you better?</p>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  placeholder="Evenings after 6, or weekends…"
                  style={{ width: "100%", border: "1px solid #cdc9c0", borderRadius: 8, padding: 10, font: "inherit", fontSize: 14 }}
                />
                <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                  <button type="button" disabled={busy} onClick={() => void send("other_time", null, note)} style={btn}>{busy ? "Sending…" : "Send that to the team"}</button>
                  <button type="button" onClick={() => { setAsking(null); setNote(""); }} style={ghost}>Back</button>
                </div>
              </div>
            )}
            <p style={{ color: "#6b6b70", fontSize: 12.5, lineHeight: 1.6, marginTop: 18 }}>You don&apos;t need to be in if you&apos;d rather not be. Press I need another time and tell us, and we&apos;ll sort out how we get in.</p>
          </>
        )}

        {/* Been, or called off: nothing left to answer on this link. */}
        {visit && !done && visit.open === false && (
          <>
            <h1 style={{ fontSize: 24, fontWeight: 800, margin: "10px 0 0", letterSpacing: "-0.02em" }}>Nothing to answer here</h1>
            <p style={{ color: "#6b6b70", fontSize: 14, lineHeight: 1.6 }}>
              This visit to {visit.address} has already happened or been called off. If we need to come round again, we&apos;ll send you a new link.
            </p>
          </>
        )}

        {visit && !done && visit.open !== false && !(visit.bookedAt && visit.open && visit.offered.length === 0) && (
          <>
            <h1 style={{ fontSize: 24, fontWeight: 800, margin: "10px 0 6px", letterSpacing: "-0.02em" }}>Can we pop round?</h1>
            <p style={{ color: "#6b6b70", fontSize: 14, lineHeight: 1.6 }}>
              We look after <strong>{visit.address}</strong> and we'd like to call in for a quick look round the property. Pick whichever of these suits you best.
            </p>

            {asking === null && (
              <>
                {visit.offered.map((o) => (
                  <button key={o} type="button" onClick={() => setChosen(o)} style={slot(chosen === o)}>
                    {pretty(o)}
                  </button>
                ))}
                <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
                  <button type="button" disabled={!chosen || busy} onClick={() => chosen && void send("yes", chosen, "")} style={{ ...btn, opacity: chosen ? 1 : 0.45 }}>
                    {busy ? "Sending…" : "That time works"}
                  </button>
                  <button type="button" onClick={() => setAsking("other_time")} style={ghost}>None of these suit</button>
                </div>
                <p style={{ color: "#6b6b70", fontSize: 12.5, lineHeight: 1.6, marginTop: 18 }}>
                  You'll get at least {visit.noticeHours} hours' notice, and we won't come without your say-so.{" "}
                  <button type="button" onClick={() => setAsking("no")} style={{ border: 0, background: "none", padding: 0, font: "inherit", fontSize: 12.5, color: "#6b6b70", textDecoration: "underline", cursor: "pointer" }}>
                    I'd rather you didn't come
                  </button>
                </p>
              </>
            )}

            {asking !== null && (
              <div style={{ marginTop: 16 }}>
                <p style={{ fontSize: 14, lineHeight: 1.6, margin: "0 0 8px" }}>
                  {asking === "other_time" ? "When would suit you better?" : "Could you tell us why? It goes straight to the team."}
                </p>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  placeholder={asking === "other_time" ? "Evenings after 6, or weekends…" : "Anything you'd like us to know"}
                  style={{ width: "100%", border: "1px solid #cdc9c0", borderRadius: 8, padding: 10, font: "inherit", fontSize: 14 }}
                />
                <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                  <button type="button" disabled={busy} onClick={() => void send(asking, null, note)} style={btn}>{busy ? "Sending…" : "Send that to the team"}</button>
                  <button type="button" onClick={() => { setAsking(null); setNote(""); }} style={ghost}>Back</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
