"use client";

import { useEffect, useRef, useState } from "react";
import { captureScreen } from "@/lib/screenshot";
import { note, trail, trailAsText } from "@/lib/trail";

/**
 * What an agent sees when a screen breaks, and the one button that tells us.
 *
 * ── Why ───────────────────────────────────────────────────────────────────
 *
 * James, 13 Sep 2026: an error or a timeout should offer one button that
 * files a full report. Until this, a crash in the OS showed Next's own words
 * - "Application error: a client-side exception has occurred" - which tells
 * the person nothing, tells us nothing, and leaves the report to whether
 * somebody thinks to describe it later. During a pilot week that is the
 * difference between a bug fixed on the day and a bug nobody can reproduce.
 *
 * ── What goes in the report ───────────────────────────────────────────────
 *
 * The route, the person (the API knows them from their session), the error
 * and the first few lines of its stack, the last things they did, and a
 * picture of the screen. All of it is already in the browser; none of it
 * should have to be asked for.
 *
 * ── It is used twice ──────────────────────────────────────────────────────
 *
 * By app/(os)/error.tsx, where the rail and the theme are still there, and by
 * app/global-error.tsx, where the root layout itself has gone and no
 * stylesheet is loaded. So it is styled inline, with the palette as fallbacks
 * rather than requirements: it has to look deliberate on a bare page.
 */

const BROWN = "var(--accent-dark, #a85a51)";
const INK = "var(--ink, #101014)";
const MUTED = "var(--muted, #6b6b70)";
const LINE = "var(--line, #d8d5d1)";
const PAGE = "var(--page, #fdfbf9)";

/** The useful half of a stack: our own frames, not the framework's. */
function shortStack(e: unknown): string {
  const stack = (e as Error | undefined)?.stack;
  if (!stack) return "";
  return stack
    .split("\n")
    .slice(0, 6)
    .map((l) => l.trim())
    .join("\n")
    .slice(0, 1200);
}

export default function CrashScreen({
  error,
  reset,
  /** Said above the button. The timeout says something different from a crash. */
  headline = "This screen stopped working",
  what = "It broke on its own, which means it is ours to fix rather than anything you did.",
  kind = "bug",
  /* A picture is worth taking when the screen is still there behind this
     panel - a call that will not finish, say. After a render crash there is
     nothing left to photograph but the rail, so it is not worth the upload
     or the promise. */
  picture = true,
}: {
  error?: (Error & { digest?: string }) | null;
  reset?: () => void;
  headline?: string;
  what?: string;
  kind?: string;
  picture?: boolean;
}) {
  const [state, setState] = useState<"ready" | "sending" | "sent" | "failed">("ready");
  const [extra, setExtra] = useState("");
  const sent = useRef(false);

  /* The error itself goes in the trail, so a second crash carries the first. */
  useEffect(() => {
    note("failed", error?.message || "a screen stopped working");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function send() {
    if (sent.current) return;
    sent.current = true;
    setState("sending");

    const steps = trailAsText();
    const body = [
      `${headline.toUpperCase()} - filed by the button on the error screen.`,
      error?.message ? `\nWhat the browser said:\n${error.message}` : "",
      extra.trim() ? `\nWhat they were doing:\n${extra.trim()}` : "",
      steps ? `\nThe last few steps:\n${steps}` : "",
      shortStack(error) ? `\nWhere it broke:\n${shortStack(error)}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    /* The words go on their own, and the picture follows. Drawing the screen
       holds the browser's only thread for as long as it takes, so a report
       that waits for the picture is a report nobody can be sure was sent. */
    const payload = JSON.stringify({
      body,
      kind,
      path: typeof window === "undefined" ? "" : window.location.pathname + window.location.search,
      context: {
        crash: true,
        digest: error?.digest ?? null,
        message: error?.message ?? null,
        stack: shortStack(error) || null,
        trail: trail(),
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        ua: navigator.userAgent.slice(0, 160),
      },
    });
    const filed = await fetch("/api/bugs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: payload,
    })
      .then((r) => (r.ok ? (r.json() as Promise<{ id?: string }>) : null))
      .catch(() => null);

    setState(filed ? "sent" : "failed");
    /* A failed send must not be a dead end: let them try once more. */
    if (!filed) {
      sent.current = false;
      return;
    }

    /* Now the picture, with the panel already saying thank you. It is hidden
       from the draw, so what arrives is the screen rather than this. */
    if (!picture) return;
    const shot = await captureScreen();
    if (shot && filed.id) {
      await fetch("/api/bugs", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: filed.id, shot }),
      }).catch(() => {
        /* The words are already filed. A picture that would not go on is not
           worth a second message to somebody who has just hit a bug. */
      });
    }
  }

  const button: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    borderRadius: 12,
    padding: "12px 22px",
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
    border: "1px solid transparent",
  };

  return (
    <div
      data-hide-from-shot
      style={{
        minHeight: "60vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "48px 20px",
        background: PAGE,
        color: INK,
        fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <div style={{ width: "100%", maxWidth: 560 }}>
        <p style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: "0.22em", textTransform: "uppercase", color: MUTED, margin: 0 }}>
          The Letting Experts OS
        </p>
        <h1 style={{ fontSize: 30, lineHeight: 1.1, margin: "10px 0 0", fontWeight: 800, letterSpacing: "-0.02em" }}>{headline}</h1>
        <p style={{ fontSize: 15, lineHeight: 1.6, color: MUTED, margin: "12px 0 0", maxWidth: "48ch" }}>{what}</p>

        {state === "sent" ? (
          <div
            style={{
              marginTop: 24,
              borderRadius: 14,
              border: `1px solid ${LINE}`,
              background: "var(--card, #fff)",
              padding: "16px 18px",
            }}
          >
            <p style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Sent. Thank you.</p>
            <p style={{ margin: "6px 0 0", fontSize: 13.5, lineHeight: 1.6, color: MUTED }}>
              {picture
                ? "It went over with a picture of this screen and the last few things you did, so nobody has to ask you to remember any of it."
                : "It went over with the error, the page and the last few things you did, so nobody has to ask you to remember any of it."}
            </p>
          </div>
        ) : (
          <>
            <label style={{ display: "block", marginTop: 22, fontSize: 13.5, color: MUTED }}>
              Anything you can add, if you have a moment. Not needed.
              <textarea
                value={extra}
                onChange={(e) => setExtra(e.target.value)}
                rows={2}
                placeholder="e.g. I pressed Book a viewing and it went white"
                style={{
                  display: "block",
                  width: "100%",
                  marginTop: 8,
                  borderRadius: 12,
                  border: `1px solid ${LINE}`,
                  background: "var(--card, #fff)",
                  color: INK,
                  padding: "10px 12px",
                  fontSize: 14.5,
                  fontFamily: "inherit",
                  resize: "vertical",
                }}
              />
            </label>
            {state === "failed" && (
              <p style={{ margin: "10px 0 0", fontSize: 13, color: "#9d4340" }}>
                That did not get through. Try once more, or tell us through Steve on any working screen.
              </p>
            )}
          </>
        )}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 20 }}>
          {state !== "sent" && (
            <button type="button" onClick={() => void send()} style={{ ...button, background: BROWN, color: "#fff" }}>
              {state === "sending" ? "Sending…" : "Send the report"}
            </button>
          )}
          {reset && (
            <button
              type="button"
              onClick={reset}
              style={{ ...button, background: "var(--card, #fff)", color: INK, borderColor: LINE }}
            >
              Try this screen again
            </button>
          )}
          <a href="/dashboard" style={{ ...button, background: "var(--card, #fff)", color: INK, borderColor: LINE, textDecoration: "none" }}>
            Back to the dashboard
          </a>
        </div>

        {error?.digest && (
          <p style={{ marginTop: 18, fontSize: 11.5, color: MUTED }}>Reference {error.digest}</p>
        )}
      </div>
    </div>
  );
}
