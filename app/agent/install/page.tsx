"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import QRCode from "qrcode";

/**
 * DOWNLOAD OS (2-3 Oct 2026).
 *
 * James: the phone site carries on as it is, and its menu offers "Download
 * App" here - "if they don't want it, they don't have to". It installs the
 * app at /agent to the home screen: one tap on Android (Chrome's own install
 * prompt), three steps on an iPhone (Safari has no prompt to offer), and a
 * QR code on a computer so the phone can carry on from there.
 *
 * Under /agent on purpose: the page has to carry the app's manifest at the
 * moment it is added, or the phone saves the wrong thing. Opened from the
 * installed app itself, it sends them straight to Today.
 */

type Platform = "ios" | "ios-other" | "android" | "desktop";

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

export default function InstallPage() {
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [done, setDone] = useState(false);
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
    if (standalone || /TLEOSApp\//.test(navigator.userAgent)) {
      window.location.replace("/agent");
      return;
    }
    const ua = navigator.userAgent;
    const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    /* Only Safari can add a web app to an iPhone's home screen properly. */
    setPlatform(ios ? (/CriOS|FxiOS|EdgiOS|GSA\//.test(ua) ? "ios-other" : "ios") : /Android/.test(ua) ? "android" : "desktop");

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPrompt);
    };
    const onInstalled = () => setDone(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  useEffect(() => {
    if (platform !== "desktop") return;
    QRCode.toDataURL(`${window.location.origin}/agent/install`, { margin: 1, width: 360, color: { dark: "#121212", light: "#ffffff" } })
      .then(setQr)
      .catch(() => setQr(null));
  }, [platform]);

  const install = async () => {
    if (!prompt) return;
    await prompt.prompt();
    const choice = await prompt.userChoice.catch(() => ({ outcome: "dismissed" }));
    if (choice.outcome === "accepted") setDone(true);
    setPrompt(null);
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-[520px] flex-col px-5 pb-[calc(env(safe-area-inset-bottom)+28px)] pt-[calc(env(safe-area-inset-top)+16px)]">
      <div className="flex h-11 items-center">
        <Link href="/m" aria-label="Back" className="m-round m-press">
          <svg viewBox="0 0 24 24" aria-hidden className="h-[18px] w-[18px]">
            <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
      </div>

      <div className="m-group mt-3 flex items-center justify-center py-4">
        <img src="/illustrations/people/happy-call.svg" alt="" className="m-ill h-[170px] w-auto" />
      </div>

      <h1 className="m-title mt-6 text-[30px] leading-[1.15]">Download TLE OS</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-muted">
        Your day, your people and your properties, on your home screen, in light or dark. The phone site carries on as it is - the app is there if you want it.
      </p>

      <div className="mt-6">
        {platform === null ? null : done ? (
          <Note title="It's on Your Home Screen">Open TLE OS from your home screen and sign in once. It stays signed in from then on.</Note>
        ) : platform === "android" ? (
          prompt ? (
            <button type="button" onClick={install} className="m-btn m-btn-primary m-press w-full">
              Install TLE OS
            </button>
          ) : (
            <Steps
              steps={[
                <>Tap the <b>⋮</b> menu at the top right of Chrome</>,
                <>Tap <b>Install app</b> (or <b>Add to Home screen</b>)</>,
                <>Tap <b>Install</b></>,
              ]}
            />
          )
        ) : platform === "ios" ? (
          <Steps
            steps={[
              <>
                Tap <ShareIcon /> <b>Share</b> at the foot of Safari
              </>,
              <>Scroll down and tap <b>Add to Home Screen</b></>,
              <>Tap <b>Add</b> at the top right</>,
            ]}
          />
        ) : platform === "ios-other" ? (
          <Note title="Open This in Safari">On an iPhone only Safari can add an app to the home screen. Copy this page&apos;s address into Safari, then tap Download App again.</Note>
        ) : (
          <div className="m-group flex items-center gap-5 p-5">
            {qr ? <img src={qr} alt="QR code for the TLE OS app" className="h-[132px] w-[132px] shrink-0 rounded-lg" /> : <span className="h-[132px] w-[132px] shrink-0" />}
            <div>
              <p className="text-[16px] font-medium">Scan with Your Phone</p>
              <p className="mt-1 text-[14px] leading-relaxed text-muted">Point your phone&apos;s camera at the code, open the link, and follow the steps there.</p>
            </div>
          </div>
        )}
      </div>

      <Link href="/m" className="mt-auto pt-8 text-center text-[14.5px] text-muted">
        Not Now
      </Link>
    </main>
  );
}

function Steps({ steps }: { steps: React.ReactNode[] }) {
  return (
    <ol className="m-group">
      {steps.map((s, i) => (
        <li key={i} className="m-row flex items-center gap-3.5 px-4 py-4 text-[15.5px]">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-medium" style={{ background: "var(--m-ink)", color: "var(--m-bg)" }}>
            {i + 1}
          </span>
          <span className="leading-snug">{s}</span>
        </li>
      ))}
    </ol>
  );
}

function Note({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="m-group p-5">
      <p className="flex items-center gap-2 text-[16px] font-medium">
        <span className="h-2 w-2 rounded-full" style={{ background: "var(--m-green)" }} />
        {title}
      </p>
      <p className="mt-1.5 text-[14.5px] leading-relaxed text-muted">{children}</p>
    </div>
  );
}

/** Safari's share mark: a box with an arrow out of the top. */
function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-label="the Share button" className="mx-0.5 -mt-1 inline h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v12M8 7l4-4 4 4M6 11H5v9h14v-9h-1" />
    </svg>
  );
}
