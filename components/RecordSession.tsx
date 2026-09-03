"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import DoodleIcon from "@/components/DoodleIcon";
import type { WelcomeVideo } from "@/lib/present";

/**
 * Record your welcome - the whole page.
 *
 * James, 3 Sep: "when they click that button, it will take them directly
 * through to the thing that they need to do... a save button and a
 * re-record button. Once they've saved it, it will then say 'Saving to 12
 * Dover Close valuation', and then 'All done. This will be presented in your
 * pre-presentation that gets sent out on this date.'"
 *
 * ── The order of things ───────────────────────────────────────────────────
 *
 *  1. Read the appraisal. If it has no pre-appraisal deck yet, mint one -
 *     the same call the appraisal track makes, so this IS the deck.
 *  2. Reserve a recording slot on that deck and open Flow's recorder in a
 *     frame. Camera, microphone, stop, and the upload all live in there.
 *  3. When the frame says the upload is in: "Saving to …", and poll our own
 *     API until Flow says ready (the webhook usually gets there first).
 *  4. "All done", with the date the deck goes out, a re-record, and a look
 *     at the page the landlord will open.
 *
 * On a laptop, a code to carry on by phone sits beside the recorder - a
 * fresh single-use link into this page, so the phone signs in the same way
 * the email did. On a phone the recorder takes the whole screen.
 *
 * Every failure is soft and said in words. A page that cannot reach Flow
 * says so and offers the appraisal; it never spins.
 */

type Context = {
  ok: boolean;
  error?: string;
  appraisal?: {
    id: string;
    ref: string;
    address: string;
    postcode: string;
    landlord: string;
    landlordFirst: string;
    appointmentAt: string | null;
  };
  deck?: { token: string; url: string } | null;
  video?: WelcomeVideo | null;
  goesOut?: string | null;
};

type Phase = "loading" | "ready" | "saving" | "done" | "failed" | "error";

const dayWords = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })
    : null;

/** The street, as an agent would say it: "12 Dover Close", not the postcode. */
const shortAddress = (address: string) => address.split(",")[0]?.trim() || address;

export default function RecordSession({ appraisalId }: { appraisalId: string }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [note, setNote] = useState<string>("Getting things ready…");
  const [ctx, setCtx] = useState<Context["appraisal"] | null>(null);
  const [deck, setDeck] = useState<{ token: string; url: string } | null>(null);
  const [goesOut, setGoesOut] = useState<string | null>(null);
  const [video, setVideo] = useState<WelcomeVideo | null>(null);
  const [recorderUrl, setRecorderUrl] = useState<string | null>(null);
  const [flowOrigin, setFlowOrigin] = useState<string | null>(null);
  const [frameSays, setFrameSays] = useState<string | null>(null);
  const [phone, setPhone] = useState(false);
  const [qr, setQr] = useState<{ svg: string; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const polling = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (polling.current) clearInterval(polling.current);
    polling.current = null;
  }, []);

  /* Phone or laptop decides the layout, not the width alone: an iPad in a
     hand is a phone for this purpose, a narrow laptop window is not. */
  useEffect(() => {
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    setPhone(coarse || window.innerWidth < 720);
  }, []);

  /** Reserve a slot on the deck and open the recorder. */
  const openRecorder = useCallback(
    async (token: string, replace = false) => {
      const d = (await fetch("/api/video", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, replace }),
      }).then((r) => r.json())) as {
        ok?: boolean;
        error?: string;
        video?: WelcomeVideo;
        recorderUrl?: string;
        origin?: string;
        alreadyRecorded?: boolean;
      };
      if (d.alreadyRecorded && d.video) {
        setVideo(d.video);
        setPhase("done");
        return;
      }
      if (!d.ok || !d.recorderUrl) throw new Error(d.error ?? "Flow wouldn't start a recording.");
      setRecorderUrl(d.recorderUrl);
      setFlowOrigin(d.origin ?? null);
      if (d.video) setVideo(d.video);
      setFrameSays(null);
      setPhase("ready");
    },
    []
  );

  /* 1 and 2: the appraisal, its deck (minted if missing), the recorder. */
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const c = (await fetch(`/api/record?id=${encodeURIComponent(appraisalId)}`).then((r) => r.json())) as Context;
        if (!live) return;
        if (!c.ok || !c.appraisal) throw new Error(c.error ?? "Couldn't find that appraisal.");
        setCtx(c.appraisal);
        setGoesOut(c.goesOut ?? null);

        let d = c.deck ?? null;
        if (!d) {
          setNote(`Building ${c.appraisal.landlordFirst}'s page…`);
          const made = (await fetch("/api/presentations", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              ref: c.appraisal.ref,
              recipientName: c.appraisal.landlord,
              address: c.appraisal.address,
              postcode: c.appraisal.postcode,
              whenPretty: c.appraisal.appointmentAt
                ? new Date(c.appraisal.appointmentAt).toLocaleString("en-GB", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "",
              startsAt: c.appraisal.appointmentAt,
              minutes: 45,
            }),
          }).then((r) => r.json())) as { ok?: boolean; token?: string; url?: string; error?: string };
          if (!made.ok || !made.token || !made.url) throw new Error(made.error ?? "Couldn't build the landlord's page.");
          d = { token: made.token, url: made.url };
        }
        if (!live) return;
        setDeck(d);

        if (c.video?.status === "ready") {
          setVideo(c.video);
          setPhase("done");
          return;
        }
        setNote("Opening the recorder…");
        await openRecorder(d.token);
      } catch (e) {
        if (!live) return;
        setError((e as Error).message);
        setPhase("error");
      }
    })();
    return () => {
      live = false;
      stopPolling();
    };
  }, [appraisalId, openRecorder, stopPolling]);

  /* The code for carrying on by phone - only where there is a laptop to
     hold it up to. */
  useEffect(() => {
    if (phone || phase !== "ready" || qr) return;
    fetch("/api/record", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: appraisalId }),
    })
      .then((r) => r.json())
      .then((j: { ok?: boolean; qrSvg?: string | null; url?: string }) => {
        if (j.ok && j.qrSvg && j.url) setQr({ svg: j.qrSvg, url: j.url });
      })
      .catch(() => {
        /* No code is fine; the laptop recorder still works. */
      });
  }, [phone, phase, qr, appraisalId]);

  /* 3: our own API, until Flow settles. Roughly four minutes at most. */
  const watch = useCallback(
    (token: string) => {
      stopPolling();
      let tries = 0;
      polling.current = setInterval(async () => {
        if (++tries > 80) {
          stopPolling();
          setNote("Flow is still working on it. It will appear on the page when it's done - you can close this.");
          return;
        }
        try {
          const d = (await fetch(`/api/video?token=${encodeURIComponent(token)}`).then((r) => r.json())) as {
            video?: WelcomeVideo | null;
          };
          if (!d.video) return;
          setVideo(d.video);
          if (d.video.status === "ready") {
            stopPolling();
            setPhase("done");
          } else if (d.video.status === "failed") {
            stopPolling();
            setPhase("failed");
          }
        } catch {
          /* Transient. Next tick. */
        }
      }, 3000);
    },
    [stopPolling]
  );

  /* What the frame says, origin-checked. Presentation only - the poll above
     is what decides anything. */
  useEffect(() => {
    if (!flowOrigin || !deck) return;
    const token = deck.token;
    function onMessage(e: MessageEvent) {
      if (e.origin !== flowOrigin) return;
      const type = (e.data as { type?: string; message?: string } | null)?.type;
      switch (type) {
        case "flow:recording:started":
          setFrameSays("Recording…");
          break;
        case "flow:recording:stopped":
          setFrameSays("Stopped. Sending it over…");
          break;
        case "flow:recording:uploaded":
          setFrameSays(null);
          setPhase("saving");
          watch(token);
          break;
        case "flow:recording:failed":
          setFrameSays((e.data as { message?: string }).message ?? "The recorder hit a problem.");
          break;
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [flowOrigin, deck, watch]);

  async function reRecord() {
    if (!deck) return;
    stopPolling();
    setPhase("loading");
    setNote("Opening the recorder…");
    try {
      await openRecorder(deck.token, true);
    } catch (e) {
      setError((e as Error).message);
      setPhase("error");
    }
  }

  const street = ctx ? shortAddress(ctx.address) : "";
  const outWords = dayWords(goesOut);

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-5xl flex-col px-4 py-5 sm:px-8 sm:py-8">
      {/* ── Head: what this is, in a line ─────────────────────────────── */}
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Welcome video</p>
          <h1 className="hand mt-1 text-[24px] leading-tight sm:text-[28px]">
            {ctx ? `Record your welcome for ${street}` : "Record your welcome"}
          </h1>
          {ctx && (
            <p className="mt-1 text-[12.5px] text-muted">
              {ctx.landlord}
              {ctx.appointmentAt ? ` · visit ${dayWords(ctx.appointmentAt)}` : ""}
              {outWords ? ` · their page goes out ${outWords}` : ""}
            </p>
          )}
        </div>
        {ctx && (
          <Link
            href={`/market-appraisals/${encodeURIComponent(ctx.id)}`}
            className="text-[12px] text-muted underline-offset-2 hover:underline"
          >
            Back to the appraisal
          </Link>
        )}
      </header>

      {/* ── Body ─────────────────────────────────────────────────────── */}
      <section className="fade-up mt-5 flex-1">
        {phase === "loading" && (
          <div className="flex items-center gap-3 rounded-2xl border border-line/80 bg-panel px-5 py-6 text-[13px] text-muted">
            <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-accent-dark" />
            {note}
          </div>
        )}

        {phase === "error" && (
          <div className="rounded-2xl border border-line/80 bg-panel px-5 py-6">
            <p className="text-[14px] font-semibold">That didn&rsquo;t open.</p>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">{error}</p>
            {ctx && (
              <Link
                href={`/market-appraisals/${encodeURIComponent(ctx.id)}`}
                className="mt-4 inline-block rounded-full bg-ink px-4 py-2 text-[12.5px] font-semibold text-white"
              >
                Open the appraisal instead
              </Link>
            )}
          </div>
        )}

        {phase === "ready" && recorderUrl && (
          <div className={phone ? "" : "grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px]"}>
            <div className="overflow-hidden rounded-2xl border border-line/80 bg-panel">
              <div className="flex items-center justify-between gap-3 border-b border-line/70 px-4 py-3">
                <p className="text-[12.5px] text-muted">
                  {frameSays ?? "Up to two and a half minutes. Say who you are and one thing you already know about the place."}
                </p>
                <button
                  type="button"
                  onClick={reRecord}
                  className="shrink-0 text-[11.5px] font-semibold text-muted transition-colors hover:text-ink"
                  title="Throw this take away and start a fresh one"
                >
                  Start again
                </button>
              </div>
              {/* `allow` is REQUIRED - without it the browser refuses the
                  camera inside the frame and the recorder cannot recover. */}
              <iframe
                src={recorderUrl}
                allow="camera; microphone; display-capture"
                className={phone ? "h-[70dvh] w-full border-0" : "h-[520px] w-full border-0"}
                title="Flow recorder"
              />
            </div>

            {!phone && (
              <aside className="rounded-2xl border border-line/80 bg-panel p-4">
                <p className="text-[12.5px] font-semibold">Rather use your phone?</p>
                <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
                  Scan this and the same page opens there, signed in. The phone is usually the
                  better camera, and always the better angle.
                </p>
                {qr ? (
                  <span
                    className="mt-3 block rounded-lg bg-white p-2 [&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
                    /* Server-generated by the qrcode package from a link we
                       minted - a fixed SVG, no markup from anywhere else. */
                    dangerouslySetInnerHTML={{ __html: qr.svg }}
                  />
                ) : (
                  <p className="mt-3 text-[11.5px] text-muted">Making the code…</p>
                )}
                <p className="mt-2 text-[10.5px] leading-relaxed text-muted">
                  Good for a week, one use. Whichever device you finish on, the recording lands on
                  the same page.
                </p>
              </aside>
            )}
          </div>
        )}

        {phase === "saving" && (
          <div className="rounded-2xl border border-line/80 bg-panel px-5 py-8 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent-dark">
              <DoodleIcon name="upload" size={20} />
            </span>
            <p className="hand mt-4 text-[22px]">Saving to {street} valuation…</p>
            <p className="mt-1 text-[12.5px] text-muted">
              {video?.status === "processing"
                ? "Flow is processing it. Usually under a minute."
                : "Sending it over. Keep this open a moment."}
            </p>
          </div>
        )}

        {phase === "done" && (
          <div className="rounded-2xl border border-emerald-600/40 bg-panel px-5 py-8 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
              <DoodleIcon name="checklist" size={20} />
            </span>
            <p className="hand mt-4 text-[24px]">All done.</p>
            <p className="mx-auto mt-1 max-w-md text-[13px] leading-relaxed text-muted">
              {ctx
                ? `This will be at the top of ${ctx.landlordFirst}'s pre-appraisal page${outWords ? `, which goes out ${outWords}` : ""}.`
                : "It's on the landlord's page."}
              {video?.durationSecs ? ` ${Math.round(video.durationSecs)} seconds.` : ""}
            </p>

            {video?.embedUrl && (
              <div className="mx-auto mt-5 max-w-xl">
                <iframe
                  src={`${video.embedUrl}?theme=light`}
                  allow="autoplay; fullscreen; picture-in-picture"
                  className="w-full rounded-xl border-0"
                  style={{ aspectRatio: "16 / 9" }}
                  title="Your welcome"
                />
              </div>
            )}

            <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
              {deck && (
                <a
                  href={deck.url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full bg-ink px-4 py-2 text-[12.5px] font-semibold text-white"
                >
                  See the page they&rsquo;ll open
                </a>
              )}
              <button
                type="button"
                onClick={reRecord}
                className="rounded-full border border-line/80 px-4 py-2 text-[12.5px] font-semibold transition-colors hover:border-ink/40"
              >
                Re-record
              </button>
              {ctx && (
                <Link
                  href={`/market-appraisals/${encodeURIComponent(ctx.id)}`}
                  className="rounded-full border border-line/80 px-4 py-2 text-[12.5px] font-semibold transition-colors hover:border-ink/40"
                >
                  Back to the appraisal
                </Link>
              )}
            </div>
          </div>
        )}

        {phase === "failed" && (
          <div className="rounded-2xl border border-line/80 bg-panel px-5 py-8 text-center">
            <p className="hand text-[22px]">That recording didn&rsquo;t make it.</p>
            <p className="mt-1 text-[12.5px] text-muted">
              Flow couldn&rsquo;t finish it. Nothing has changed on the landlord&rsquo;s page.
            </p>
            <button
              type="button"
              onClick={reRecord}
              className="mt-4 rounded-full bg-ink px-4 py-2 text-[12.5px] font-semibold text-white"
            >
              Try again
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
