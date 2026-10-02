"use client";

import { useState } from "react";
import { M_THEME_COLOUR, type MTheme } from "@/lib/m-theme";

/**
 * The first visit on a phone: a welcome, then light or dark (James, 2 Oct
 * 2026: "When they first sign in, they'll have the option of a light or dark
 * mode"). Drawn like his reference's welcome - a few words in the middle and
 * one round arrow. Choosing a mode repaints at once, so the second screen
 * shows what they are picking. It never comes back on that phone; the "+"
 * sheet has the switch after that.
 */
export default function Welcome({ onChoose }: { onChoose: (t: MTheme) => void }) {
  const [step, setStep] = useState<0 | 1>(0);
  const [pick, setPick] = useState<MTheme>("light");

  const preview = (t: MTheme) => {
    setPick(t);
    document.querySelector(".m-app")?.setAttribute("data-mtheme", t);
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", M_THEME_COLOUR[t]));
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-[560px] flex-col px-6 pb-[calc(env(safe-area-inset-bottom)+28px)] pt-[calc(env(safe-area-inset-top)+20px)]">
      {step === 0 ? (
        <>
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <img src="/illustrations/people/real-estate-agent.svg" alt="" className="m-ill mb-8 h-[200px] w-auto" />
            <p className="text-[15px] font-medium">Welcome</p>
            <h1 className="m-title mt-3 text-[30px] leading-[1.15]">Your day, your people and your properties, in your pocket</h1>
          </div>
          <button
            type="button"
            onClick={() => setStep(1)}
            aria-label="Next"
            className="m-press mx-auto flex h-14 w-14 items-center justify-center rounded-full"
            style={{ background: "var(--m-ink)", color: "var(--m-bg)" }}
          >
            <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14m-6-6 6 6-6 6" />
            </svg>
          </button>
        </>
      ) : (
        <>
          <div className="flex flex-1 flex-col justify-center">
            <p className="text-center text-[15px] font-medium">Appearance</p>
            <h1 className="m-title mt-3 text-center text-[30px] leading-[1.15]">Light or Dark?</h1>
            <p className="mt-2 text-center text-[15px] text-muted">You can change this any time from the + at the top.</p>
            <div className="mt-8 grid grid-cols-2 gap-3">
              {(["light", "dark"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => preview(t)}
                  aria-pressed={pick === t}
                  className="m-press rounded-[22px] border-2 p-2 text-left"
                  style={{ borderColor: pick === t ? "var(--m-ink)" : "var(--m-line)" }}
                >
                  <Mini dark={t === "dark"} />
                  <span className="mt-2.5 flex items-center justify-between px-1.5 pb-1">
                    <span className="text-[15px] font-medium">{t === "light" ? "Light" : "Dark"}</span>
                    <span
                      className="flex h-5 w-5 items-center justify-center rounded-full border"
                      style={pick === t ? { background: "var(--m-ink)", borderColor: "var(--m-ink)", color: "var(--m-bg)" } : { borderColor: "var(--m-soft)" }}
                    >
                      {pick === t && (
                        <svg viewBox="0 0 24 24" aria-hidden className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M5 12l5 5L19 7" />
                        </svg>
                      )}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
          <button type="button" onClick={() => onChoose(pick)} className="m-btn m-btn-primary m-press w-full">
            Continue
          </button>
        </>
      )}
    </main>
  );
}

/** A tiny drawing of the Today screen in either mode. */
function Mini({ dark }: { dark: boolean }) {
  const bg = dark ? "#121212" : "#f4f4f3";
  const card = dark ? "#1c1c1c" : "#ffffff";
  const line = dark ? "#2a2a2a" : "#e5e5e3";
  const ink = dark ? "#f2f2f0" : "#121212";
  return (
    <span className="block overflow-hidden rounded-[16px] p-2.5" style={{ background: bg, aspectRatio: "3 / 4" }}>
      <span className="block h-2 w-14 rounded-full" style={{ background: ink }} />
      <span className="mt-2.5 block h-[42%] rounded-[10px] border" style={{ background: card, borderColor: line }} />
      <span className="mt-2 flex gap-1.5">
        <span className="h-4 flex-1 rounded-full border" style={{ background: card, borderColor: line }} />
        <span className="h-4 flex-1 rounded-full" style={{ background: ink }} />
      </span>
      <span className="mt-2 block h-[18%] rounded-[10px] border" style={{ background: card, borderColor: line }} />
      <span className="mt-1.5 block h-1.5 w-10 rounded-full" style={{ background: "#e8968d" }} />
    </span>
  );
}
