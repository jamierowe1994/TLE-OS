"use client";

import { useEffect, useRef, useState } from "react";

/**
 * GENERATE REPORT, from the Write an Email window to a landlord (Stuart Roper,
 * 18 Nov 2026; switch "quickreport"). Three short steps in James's form style:
 * which report, your view (optional), check it - then Attach puts the PDF on the
 * email. Nothing is sent from here. The figures are read live by
 * /api/quick-report (lib/quick-report) when Make the Report is pressed.
 */

export interface MadeReport {
  filename: string;
  content: string;
  contentType: string;
  size: number;
}

const PC = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i;
const pcIn = (s: string) => {
  const m = PC.exec(s);
  return m ? `${m[1]} ${m[2]}`.toUpperCase() : "";
};

const STEPS = [
  { title: "Which Report", blurb: "A Rental Report is about their home. A Market Report is about their area." },
  { title: "Your View", blurb: "Optional. Your own early figure, before seeing inside, and a line from you." },
  { title: "Check It", blurb: "Two pages, read live from today's adverts. Attach it, then send the email as normal." },
] as const;

export default function QuickReportSheet({
  address: startAddress,
  landlordName,
  onAttach,
  onClose,
}: {
  address?: string | null;
  landlordName?: string | null;
  onAttach: (r: MadeReport) => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [kind, setKind] = useState<"rental" | "market">("rental");
  const [address, setAddress] = useState(startAddress ?? "");
  const [postcode, setPostcode] = useState(pcIn(startAddress ?? ""));
  const [beds, setBeds] = useState<number | null>(null);
  const [type, setType] = useState<"house" | "flat" | null>(null);
  const [low, setLow] = useState("");
  const [high, setHigh] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [made, setMade] = useState<(MadeReport & { url: string; thin: boolean; noPhone: boolean }) | null>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [onClose]);

  const pcOk = Boolean(pcIn(postcode));
  const ready0 = pcOk && (kind === "market" || beds != null);

  function go(n: number) {
    setDir(n > step ? 1 : -1);
    setError(null);
    setStep(n);
  }

  async function make() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/quick-report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, address, postcode, beds, type, landlordName, view: kind === "rental" ? { low, high } : null, note }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) throw new Error(j?.error ?? "The report couldn't be made just now.");
      const bin = Uint8Array.from(atob(j.content), (c) => c.charCodeAt(0));
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      const url = URL.createObjectURL(new Blob([bin], { type: "application/pdf" }));
      urlRef.current = url;
      setMade({ filename: j.filename, content: j.content, contentType: j.contentType, size: j.size, url, thin: !!j.thin, noPhone: !!j.noPhone });
      setDir(1);
      setStep(2);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The report couldn't be made just now.");
    } finally {
      setBusy(false);
    }
  }

  const s = STEPS[step];

  return (
    <div className="nl-qr-wrap" onClick={onClose}>
      <section className="nl-qr" role="dialog" aria-label="Generate a report" onClick={(e) => e.stopPropagation()}>
        <header className="nl-qr-head">
          <div className="nl-qr-bar" aria-hidden><span style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} /></div>
          <p className="nl-qr-count">{step + 1} of {STEPS.length}</p>
          <h2 className="nl-qr-title">{s.title}</h2>
          <p className="nl-qr-blurb">{s.blurb}</p>
          <button type="button" className="nl-compose-x nl-qr-x" onClick={onClose} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </header>

        <div key={step} className="nl-qr-body" style={{ ["--from" as string]: `${dir * 28}px` }}>
          {step === 0 && (
            <>
              <div className="nl-qr-kinds">
                {([
                  ["rental", "Rental Report", "Their home: what homes its size are advertised for nearby."],
                  ["market", "Market Report", "Their area: typical rent, how much is advertised, how fast it goes."],
                ] as const).map(([k, t, d]) => (
                  <button key={k} type="button" className={`nl-qr-kind${kind === k ? " is-on" : ""}`} onClick={() => setKind(k)} aria-pressed={kind === k}>
                    <b>{t}</b>
                    <span>{d}</span>
                  </button>
                ))}
              </div>
              <label className="nl-qr-field">
                <span>Address</span>
                <input value={address} onChange={(e) => { setAddress(e.target.value); if (!postcode || !pcOk) setPostcode(pcIn(e.target.value)); }} placeholder="12 Dover Close, Northampton NN5 4WJ" />
              </label>
              <label className="nl-qr-field nl-qr-pc">
                <span>Postcode</span>
                <input value={postcode} onChange={(e) => setPostcode(e.target.value.toUpperCase())} placeholder="NN5 4WJ" />
                {postcode && !pcOk && <em>Type the full postcode.</em>}
              </label>
              {kind === "rental" && (
                <div className="nl-qr-row">
                  <div className="nl-qr-field">
                    <span>Bedrooms</span>
                    <div className="nl-qr-pills">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button key={n} type="button" className={beds === n ? "is-on" : ""} onClick={() => setBeds(n)} aria-pressed={beds === n}>{n === 5 ? "5+" : n}</button>
                      ))}
                    </div>
                  </div>
                  <div className="nl-qr-field">
                    <span>Type</span>
                    <div className="nl-qr-pills">
                      {(["house", "flat"] as const).map((t) => (
                        <button key={t} type="button" className={type === t ? "is-on" : ""} onClick={() => setType(type === t ? null : t)} aria-pressed={type === t}>{t === "house" ? "House" : "Flat"}</button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {step === 1 && (
            <>
              {kind === "rental" && (
                <div className="nl-qr-row">
                  <label className="nl-qr-field">
                    <span>From (£ pcm)</span>
                    <input inputMode="numeric" value={low} onChange={(e) => setLow(e.target.value.replace(/[^\d,]/g, ""))} placeholder="1,100" />
                  </label>
                  <label className="nl-qr-field">
                    <span>To (£ pcm)</span>
                    <input inputMode="numeric" value={high} onChange={(e) => setHigh(e.target.value.replace(/[^\d,]/g, ""))} placeholder="1,200" />
                  </label>
                </div>
              )}
              <label className="nl-qr-field">
                <span>A line from you</span>
                <textarea rows={4} maxLength={400} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Two bedroom homes near the station are letting quickly at the moment." />
              </label>
              <p className="nl-qr-hint">
                {kind === "rental" ? "Leave both blank to show only what the adverts say. " : ""}The market&apos;s figures are read live when you press Make the Report.
              </p>
            </>
          )}

          {step === 2 && made && (
            <div className="nl-qr-check">
              <iframe title="The report" src={`${made.url}#view=FitH&toolbar=0`} />
              <div className="nl-qr-meta">
                <span>{made.filename}</span>
                <a href={made.url} download={made.filename}>Download</a>
              </div>
              {made.thin && <p className="nl-qr-warn">Only a few homes that size are advertised nearby, so the page says it is a rough guide.</p>}
              {made.noPhone && <p className="nl-qr-warn">There is no mobile number on your record, so the report gives only your email.</p>}
            </div>
          )}

          {error && <p className="nl-qr-error" role="alert">{error}</p>}
        </div>

        <footer className="nl-qr-foot">
          {step > 0 ? <button type="button" className="nl-btn" onClick={() => go(step - 1)}>Back</button> : <span />}
          {step === 0 && <button type="button" className="nl-btn nl-btn--primary" disabled={!ready0} onClick={() => go(1)}>Continue</button>}
          {step === 1 && (
            <button type="button" className="nl-btn nl-btn--primary" disabled={busy} onClick={() => void make()}>
              {busy && <span className="nl-qr-spin" aria-hidden />}
              {busy ? "Reading the adverts…" : "Make the Report"}
            </button>
          )}
          {step === 2 && made && (
            <button type="button" className="nl-btn nl-btn--primary" onClick={() => { onAttach({ filename: made.filename, content: made.content, contentType: made.contentType, size: made.size }); onClose(); }}>
              Attach to the Email
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}
