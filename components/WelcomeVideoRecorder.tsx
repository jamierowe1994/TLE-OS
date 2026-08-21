"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { WelcomeVideo } from "@/lib/present";

/**
 * Record a welcome, straight onto the landlord's page.
 *
 * The agent presses one button, talks for ninety seconds about the house they
 * are coming to see, and it appears at the top of the deck the landlord opens.
 * No file, no upload, no link to paste — which is the entire point, because
 * the version of this that involves any of those three never gets done.
 *
 * ── Why it is built this defensively ──────────────────────────────────────
 *
 * Flow's Integration API has never been run end to end; its own docs say the
 * first integration should expect to find something. So:
 *
 *  · the frame's postMessage events are treated as PRESENTATION ONLY. They
 *    move the wording along, they never decide anything. A user can close the
 *    tab mid-upload and the recording still completes server-side.
 *  · we poll our own API regardless of what the frame says, because on Flow's
 *    side the webhook has never been delivered to a real endpoint either.
 *  · every failure leaves the deck exactly as it was. A pre-appraisal page
 *    without a welcome video is a good page.
 */

const WORDS: Record<WelcomeVideo["status"], string> = {
  awaiting_recording: "Ready when you are.",
  uploading: "Sending it over…",
  processing: "Flow is processing it — this usually takes under a minute.",
  ready: "Done. It's on the landlord's page.",
  failed: "That recording didn't make it.",
};

export default function WelcomeVideoRecorder({
  token,
  address,
  compact = false,
  onDone,
}: {
  /** The presentation this belongs to. Never leaves our own origin. */
  token: string;
  address: string;
  /** One button on a row of buttons, for the send composer's footer. The
   *  modal it opens is identical — only the trigger changes. */
  compact?: boolean;
  onDone?: (v: WelcomeVideo) => void;
}) {
  const [open, setOpen] = useState(false);
  const [recorderUrl, setRecorderUrl] = useState<string | null>(null);
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [origin, setOrigin] = useState<string | null>(null);
  const [video, setVideo] = useState<WelcomeVideo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** What the frame last told us. Cosmetic — see the header note. */
  const [frameSays, setFrameSays] = useState<string | null>(null);
  const polling = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (polling.current) clearInterval(polling.current);
    polling.current = null;
  }, []);

  /* What we already have, on mount — so reopening an appraisal that already
     has a welcome shows it rather than offering to record a second one. */
  useEffect(() => {
    let live = true;
    fetch(`/api/video?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((d: { video?: WelcomeVideo | null }) => live && d.video && setVideo(d.video))
      .catch(() => {
        /* No video is the normal case. Never surfaced as an error. */
      });
    return () => {
      live = false;
      stopPolling();
    };
  }, [token, stopPolling]);

  /* The frame's running commentary. Origin-checked, because a message
     listener that trusts anyone is a hole in the page. */
  useEffect(() => {
    if (!origin) return;
    function onMessage(e: MessageEvent) {
      if (e.origin !== origin) return;
      const type = (e.data as { type?: string; message?: string } | null)?.type;
      switch (type) {
        case "flow:recording:started": setFrameSays("Recording…"); break;
        case "flow:recording:stopped": setFrameSays("Stopped — sending it over…"); break;
        case "flow:recording:uploaded":
          setFrameSays(null);
          // Safe to close the frame. NOT safe to call it done — that is what
          // the poll below is for.
          setOpen(false);
          break;
        case "flow:recording:failed":
          setFrameSays((e.data as { message?: string }).message ?? "The recorder hit a problem.");
          break;
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [origin]);

  /** Ask our own API where the recording got to, until it settles. */
  const watch = useCallback(() => {
    stopPolling();
    let tries = 0;
    polling.current = setInterval(async () => {
      // Roughly four minutes. Longer than transcoding a two-minute clip should
      // ever take, and short of leaving a timer running on a forgotten tab.
      if (++tries > 80) return stopPolling();
      try {
        const d = (await fetch(`/api/video?token=${encodeURIComponent(token)}`).then((r) =>
          r.json()
        )) as { video?: WelcomeVideo | null };
        if (!d.video) return;
        setVideo(d.video);
        if (d.video.status === "ready" || d.video.status === "failed") {
          stopPolling();
          if (d.video.status === "ready") onDone?.(d.video);
        }
      } catch {
        /* Transient. The next tick tries again. */
      }
    }, 3000);
  }, [token, onDone, stopPolling]);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const d = (await fetch("/api/video", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      }).then((r) => r.json())) as {
        ok?: boolean;
        error?: string;
        video?: WelcomeVideo;
        recorderUrl?: string;
        qrSvg?: string | null;
        origin?: string;
        alreadyRecorded?: boolean;
      };
      if (!d.ok || !d.recorderUrl) {
        if (d.alreadyRecorded && d.video) setVideo(d.video);
        else setError(d.error ?? "Couldn't start a recording.");
        return;
      }
      setRecorderUrl(d.recorderUrl);
      setQrSvg(d.qrSvg ?? null);
      setOrigin(d.origin ?? null);
      if (d.video) setVideo(d.video);
      setOpen(true);
      watch();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const ready = video?.status === "ready";
  const working = video && !ready && video.status !== "failed";

  /* The modal is shared, so it is built once and rendered by both branches. */
  const modal =
    open && recorderUrl && typeof document !== "undefined"
      ? createPortal(
          <div className="fixed inset-0 z-[140] flex items-center justify-center bg-ink/45 p-6">
            <div className="flex w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-page shadow-2xl">
              <div className="flex items-center justify-between gap-3 border-b border-line/70 px-5 py-3.5">
                <div className="min-w-0">
                  <p className="hand text-[16px] leading-tight">Record your welcome</p>
                  <p className="truncate text-[11.5px] text-muted">
                    {frameSays ?? `Up to two and a half minutes · ${address}`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="shrink-0 text-[18px] leading-none text-muted transition-colors hover:text-ink"
                  title="Close"
                >
                  ✕
                </button>
              </div>
              {/* `allow` is REQUIRED. Without it the browser blocks camera and
                  microphone inside the frame and the recorder shows a
                  permissions error it cannot resolve on its own. */}
              <iframe
                src={recorderUrl}
                allow="camera; microphone; display-capture"
                className="h-[460px] w-full border-0"
                title="Flow recorder"
              />

              {/* Scan and carry on — the SAME recording slot, so whichever
                  device finishes first fills this deck. The phone is usually
                  the better camera and always the better angle; a laptop
                  webcam films the underside of a chin. */}
              <div className="flex items-start gap-4 border-t border-line/70 px-5 py-4">
                {qrSvg && (
                  <span
                    /* 190px, and that number is measured rather than chosen —
                       see the note in /api/video. This code is ~70 modules
                       wide; anything under about 160px is too dense for a
                       phone to lock on to. */
                    className="shrink-0 rounded-lg bg-white p-1.5 [&>svg]:block [&>svg]:h-[190px] [&>svg]:w-[190px]"
                    /* Server-generated from the recorder URL by the qrcode
                       package — a fixed SVG, no markup from anywhere else. */
                    dangerouslySetInnerHTML={{ __html: qrSvg }}
                  />
                )}
                <div className="min-w-0 text-[11px] leading-relaxed text-muted">
                  {qrSvg && (
                    <p className="mb-1 text-[12px] font-semibold text-ink">
                      Rather use your phone? Scan this.
                    </p>
                  )}
                  <p>
                    It opens the same recording, so record on either — whichever you
                    finish lands on the landlord&apos;s page. The link is good for two
                    hours.
                  </p>
                  <p className="mt-1">
                    You can close this once it says it has sent. The upload finishes on
                    Flow&apos;s side either way.
                  </p>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  if (compact) {
    return (
      <>
        <button
          type="button"
          onClick={start}
          disabled={busy || Boolean(working) || ready}
          className="rounded-full border border-line/80 px-4 py-2.5 text-[12px] transition-opacity disabled:opacity-45"
          title={ready ? "Already recorded — it's on their page" : undefined}
        >
          {ready
            ? "Welcome recorded ✓"
            : busy
              ? "Setting up…"
              : working
                ? WORDS[video!.status]
                : "Record a welcome"}
        </button>
        {error && <span className="text-[11px] text-accent-dark">{error}</span>}
        {modal}
      </>
    );
  }

  return (
    <div className="rounded-2xl border border-line/80 bg-panel p-5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[9.5px] font-bold uppercase tracking-wider text-muted">
          Welcome video
        </p>
        {video && <p className="text-[11px] text-muted">{WORDS[video.status]}</p>}
      </div>

      {ready && video.embedUrl ? (
        <div className="mt-3.5">
          {/* The landlord sees exactly this, at the top of their page. */}
          <iframe
            src={`${video.embedUrl}?theme=light`}
            allow="autoplay; fullscreen; picture-in-picture"
            className="w-full rounded-xl border-0"
            style={{ aspectRatio: "16 / 9" }}
            title="Welcome video"
          />
          <p className="mt-2 text-[11px] leading-relaxed text-muted">
            {video.durationSecs ? `${Math.round(video.durationSecs)} seconds · ` : ""}
            on the landlord&apos;s page now. Kept for three months, then deleted.
          </p>
        </div>
      ) : (
        <>
          <p className="mt-2 text-[12.5px] leading-relaxed">
            Ninety seconds to camera, before you go. Say who you are and one thing you
            already know about {address} — it is the difference between a stranger
            arriving and someone they have met.
          </p>

          <button
            type="button"
            onClick={start}
            disabled={busy || Boolean(working)}
            className="mt-3.5 rounded-lg bg-accent-dark px-3.5 py-2.5 text-[12.5px] font-semibold text-white transition-opacity disabled:opacity-40"
          >
            {busy ? "Setting up…" : working ? WORDS[video!.status] : "Record a welcome"}
          </button>

          <p className="mt-2.5 text-[11px] leading-relaxed text-muted">
            Record here on screen, or scan the code that appears to do it on your
            phone. Kept for three months, then deleted.
          </p>

          {error && <p className="mt-2 text-[11.5px] text-accent-dark">{error}</p>}
        </>
      )}

      {modal}
    </div>
  );
}
