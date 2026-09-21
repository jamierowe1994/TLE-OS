"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Recording the screen from inside the OS, to go with a report.
 *
 * James, 21 Sep 2026, for Howard's testing. The browser does all of it: it
 * asks which tab or window to share, draws its own "sharing" bar, and hands
 * back a stream that MediaRecorder turns into a file. Nothing is installed and
 * nothing leaves the machine until the report is sent.
 *
 * ── Why it lives in a hook and not in the form ────────────────────────────
 *
 * The form is inside Steve's bubble, and the bubble has to CLOSE while
 * somebody records - otherwise the recording is of the form. So the recorder
 * belongs to the dock, which is mounted on every page and survives moving
 * between them, and the form only reads what it produced.
 *
 * ── The limits ────────────────────────────────────────────────────────────
 *
 * Three minutes, then it stops itself. A fault takes seconds to show; a
 * recording that runs to ten minutes is one nobody watches, and the upload
 * route holds the file in memory. The bitrate is set low for the same reason:
 * this is a user interface, not a film, and it stays readable.
 */

export const MAX_SECONDS = 180;
const BITS_PER_SECOND = 900_000;

export interface Clip {
  file: File;
  seconds: number;
}

/** First container this browser will actually write. Safari only does mp4. */
function pickType(): string {
  const wanted = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm", "video/mp4"];
  return wanted.find((t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) ?? "";
}

export function useScreenRecording(onDone?: (clip: Clip) => void) {
  const [supported, setSupported] = useState(false);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [clip, setClip] = useState<Clip | null>(null);
  const [problem, setProblem] = useState("");

  const recorder = useRef<MediaRecorder | null>(null);
  const streams = useRef<MediaStream[]>([]);
  const clock = useRef<number | null>(null);
  const began = useRef(0);
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    /* A phone has no getDisplayMedia. Decided after mount so the server and
       the first client render agree. */
    setSupported(
      typeof navigator !== "undefined" &&
        Boolean(navigator.mediaDevices?.getDisplayMedia) &&
        typeof MediaRecorder !== "undefined" &&
        Boolean(pickType())
    );
  }, []);

  const release = useCallback(() => {
    if (clock.current) window.clearInterval(clock.current);
    clock.current = null;
    streams.current.forEach((s) => s.getTracks().forEach((t) => t.stop()));
    streams.current = [];
  }, []);

  const stop = useCallback(() => {
    if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
  }, []);

  const start = useCallback(async (withVoice: boolean): Promise<boolean> => {
    setProblem("");
    let screen: MediaStream;
    try {
      screen = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 12 },
        audio: false,
        /* Chrome and Edge: offer THIS tab first, which is nearly always the
           one meant. Ignored everywhere else. */
        preferCurrentTab: true,
      } as DisplayMediaStreamOptions);
    } catch {
      /* They pressed Cancel on the browser's own picker. Not a fault. */
      return false;
    }
    streams.current = [screen];

    const tracks = [...screen.getVideoTracks()];
    if (withVoice) {
      /* Asked for second, and optional: a refused microphone still records
         the screen, which is the part that matters. */
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => null);
      if (mic) {
        streams.current.push(mic);
        tracks.push(...mic.getAudioTracks());
      } else {
        setProblem("The microphone wasn't allowed, so this one has no sound.");
      }
    }

    const type = pickType();
    const chunks: Blob[] = [];
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(new MediaStream(tracks), { mimeType: type, videoBitsPerSecond: BITS_PER_SECOND });
    } catch {
      release();
      setProblem("This browser wouldn't start a recording.");
      return false;
    }
    rec.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    rec.onstop = () => {
      const took = Math.max(1, Math.round((Date.now() - began.current) / 1000));
      release();
      setRecording(false);
      recorder.current = null;
      const base = type.split(";")[0];
      const blob = new Blob(chunks, { type: base });
      if (!blob.size) {
        setProblem("Nothing was recorded. Try once more.");
        return;
      }
      const made: Clip = {
        file: new File([blob], `screen-recording.${base === "video/mp4" ? "mp4" : "webm"}`, { type: base }),
        seconds: took,
      };
      setClip(made);
      done.current?.(made);
    };
    /* The browser's own "Stop sharing" bar ends it just as well as ours. */
    screen.getVideoTracks()[0]?.addEventListener("ended", stop);

    recorder.current = rec;
    began.current = Date.now();
    setSeconds(0);
    setClip(null);
    setRecording(true);
    rec.start(1000);
    clock.current = window.setInterval(() => {
      const s = Math.round((Date.now() - began.current) / 1000);
      setSeconds(s);
      if (s >= MAX_SECONDS) stop();
    }, 500);
    return true;
  }, [release, stop]);

  /* Leaving the OS altogether mid-recording must not leave the tab "sharing". */
  useEffect(() => release, [release]);

  return { supported, recording, seconds, clip, problem, start, stop, clear: () => setClip(null) };
}

/** 0:07, 2:41. */
export const clockFace = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
