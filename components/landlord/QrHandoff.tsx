"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import DoodleIcon from "@/components/DoodleIcon";

/**
 * "SEND IT FROM YOUR PHONE": the desktop's answer to having no camera.
 *
 * James, 16 Sep 2026: "on desktop view, when they go to upload the documents,
 * we should offer them the option to scan a QR code. They will be taken
 * directly through to their mobile, and then they can scan the documents there
 * without the need to sign in."
 *
 * The moment it serves is specific and common: a landlord at a computer with a
 * paper gas certificate in their hand, no scanner in the house, and the only
 * camera in the room in their pocket. Every alternative - emailing themselves
 * a link, signing in again on the phone, photographing it and airdropping it -
 * is three steps where this is one.
 *
 * ── What is on the screen is a credential, and it is drawn to say so ───────
 *
 * The code is minted on the click, never on page load: an upload token that
 * existed for every landlord who merely opened the page, whether or not they
 * wanted it, would be a credential lying around by default. It carries its own
 * countdown, so the landlord can see that it dies - which is also the honest
 * way to say "do not screenshot this". When it runs out the code is replaced
 * by the button that made it, rather than by a stale square that silently
 * stops working.
 *
 * While it is alive the desktop watches the file, so the moment a photograph
 * lands the list behind them has already caught up. Polling rather than a
 * socket: it runs for twenty minutes at most, on one page, for one person.
 */

/** Slow enough to be free, fast enough that the screen has moved by the time
 *  they put the phone down. */
const POLL_MS = 4000;

export default function QrHandoff({ sample = false }: { sample?: boolean }) {
  const router = useRouter();
  /* The property picked on the portal (?p=), so the phone sends to that one. */
  const pick = useSearchParams().get("p");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [png, setPng] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [left, setLeft] = useState(0);
  const [arrived, setArrived] = useState(0);
  const baseline = useRef<number | null>(null);

  const stop = useCallback(() => {
    setOpen(false);
    setPng(null);
    setUrl(null);
    setLeft(0);
    baseline.current = null;
  }, []);

  async function make() {
    if (sample) {
      setErr("On the sample there is no file to send to. A real landlord's code opens their own phone here.");
      setOpen(true);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/landlord/documents/handoff", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ p: pick }) });
      const j = (await res.json()) as { ok?: boolean; path?: string; expiresAt?: string; error?: string };
      if (!j.ok || !j.path || !j.expiresAt) throw new Error(j.error ?? "Could not make a code.");
      const full = `${window.location.origin}${j.path}`;

      /* The library is loaded on the click rather than with the page: nobody
         reaches this button on most visits, and a QR encoder is not worth
         putting in the bundle of a page that mostly just lists files. */
      const QR = (await import("qrcode")).default;
      setPng(
        await QR.toDataURL(full, {
          width: 480,
          margin: 1,
          errorCorrectionLevel: "M",
          color: { dark: "#2b201d", light: "#ffffff" },
        })
      );
      setUrl(full);
      setLeft(Math.max(0, Math.round((new Date(j.expiresAt).getTime() - Date.now()) / 1000)));
      setArrived(0);
      setOpen(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not make a code.");
      setOpen(true);
    } finally {
      setBusy(false);
    }
  }

  /* The countdown, and the end of it. */
  useEffect(() => {
    if (!open || !png) return;
    const t = window.setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearInterval(t);
  }, [open, png]);
  useEffect(() => {
    if (open && png && left === 0) {
      setPng(null);
      setUrl(null);
    }
  }, [left, open, png]);

  /* Watching for what the phone sends. The first reading is the BASELINE
     rather than a result - otherwise the panel opens claiming that whatever
     was already on the file has just arrived. */
  useEffect(() => {
    if (!open || !png) return;
    let dead = false;
    const look = async () => {
      try {
        const res = await fetch(`/api/landlord/documents/status${pick ? `?p=${encodeURIComponent(pick)}` : ""}`, { cache: "no-store" });
        const j = (await res.json()) as { ok?: boolean; sent?: number };
        if (dead || !j.ok || typeof j.sent !== "number") return;
        if (baseline.current === null) {
          baseline.current = j.sent;
          return;
        }
        const n = j.sent - baseline.current;
        if (n > arrived) {
          setArrived(n);
          router.refresh();
        }
      } catch {
        /* A poll that fails is a poll; the next one is four seconds away. */
      }
    };
    void look();
    const t = window.setInterval(look, POLL_MS);
    return () => {
      dead = true;
      window.clearInterval(t);
    };
  }, [open, png, arrived, router]);

  const mmss = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;

  return (
    <>
      <button
        type="button"
        onClick={() => void make()}
        disabled={busy}
        className="inline-flex items-center gap-2.5 whitespace-nowrap rounded-full border border-line/70 bg-white px-4 py-2 text-[12.5px] font-semibold text-ink transition-colors hover:border-ink/40 disabled:opacity-60"
      >
        <DoodleIcon name="grid" size={14} />
        {busy ? "Making a code…" : "Send from your phone"}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[93] flex items-center justify-center p-6"
          style={{ background: "rgba(43, 32, 29, 0.5)" }}
          onClick={stop}
          role="dialog"
          aria-modal="true"
          aria-label="Send from your phone"
        >
          <div
            className="w-full max-w-[420px] rounded-[26px] bg-white p-7 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            {err ? (
              <>
                <h2 className="text-[20px] leading-tight">Send from your phone</h2>
                <p className="mt-3 text-[13.5px] leading-relaxed text-muted">{err}</p>
              </>
            ) : png ? (
              <>
                <h2 className="text-[20px] leading-tight">Point your phone at this</h2>
                <p className="mx-auto mt-2 max-w-[300px] text-[13px] leading-relaxed text-muted">
                  It opens the camera on your phone, ready to photograph the document. No sign-in.
                </p>

                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={png}
                  alt="Scan this with your phone's camera"
                  className="mx-auto mt-5 h-[220px] w-[220px] rounded-2xl border border-line/60"
                />

                <p className="mt-4 text-[12.5px] text-muted">
                  This code works for <span className="font-semibold text-ink">{mmss}</span>, then it stops. Treat it
                  like a key: anyone who photographs it can add to your file until it runs out.
                </p>

                {arrived > 0 && (
                  <p className="mt-4 rounded-2xl bg-accent-soft px-4 py-3 text-[13px] font-semibold text-accent-dark">
                    {arrived === 1 ? "One document arrived." : `${arrived} documents arrived.`} You can keep going.
                  </p>
                )}

                {url && (
                  <p className="mt-4 break-all text-[10.5px] leading-relaxed text-muted/70">
                    {/* Written out so somebody whose camera will not scan can
                        still type it, and so nobody has to trust a square. */}
                    {url}
                  </p>
                )}
              </>
            ) : (
              <>
                <h2 className="text-[20px] leading-tight">That code has run out</h2>
                <p className="mt-3 text-[13.5px] leading-relaxed text-muted">
                  Codes last {Math.round(20)} minutes. Make a new one whenever you are ready.
                </p>
                <button
                  type="button"
                  onClick={() => void make()}
                  className="mt-5 rounded-full bg-accent-dark px-6 py-3 text-[13.5px] font-semibold text-white"
                >
                  Make a new code
                </button>
              </>
            )}

            <button
              type="button"
              onClick={stop}
              className="mt-5 h-[46px] w-full rounded-full border border-line/70 text-[13.5px] font-semibold text-muted"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </>
  );
}
