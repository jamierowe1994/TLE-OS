"use client";

import { useEffect, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";

/**
 * "Put it on my desktop", in one button.
 *
 * Chrome and Edge hand a qualifying page an install prompt; pressing the
 * button opens it, and the OS lands in the Dock or Start menu as its own
 * window with its own icon, opening on the manifest's start page. Where no
 * prompt is on offer (Safari, an already-installed app, a browser that does
 * not do it) the same button downloads a one-file desktop shortcut instead,
 * which double-clicks open in the browser, signed in - the least that does
 * the job with no installer and no unsigned-download warning.
 */

interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
}

export default function DesktopInstall({
  shortcutHref,
  label = "Add to your desktop",
}: {
  /** The shortcut file route, for browsers with no install prompt. */
  shortcutHref: string;
  label?: string;
}) {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(false);
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    try {
      setStandalone(window.matchMedia("(display-mode: standalone)").matches);
    } catch {
      /* no matchMedia, no app window */
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPrompt);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  /* Already running as its own window: nothing to offer. */
  if (standalone) return null;
  if (installed) {
    return <span className="text-[11px] text-muted">On your desktop now - open it from the Dock.</span>;
  }
  if (prompt) {
    return (
      <button
        type="button"
        onClick={() => void prompt.prompt().then(() => setPrompt(null))}
        className="flex items-center gap-2 rounded-full border border-line/80 px-4 py-2 text-[12px] font-medium text-muted transition-colors hover:border-ink hover:text-ink"
        title="Installs TLE OS as its own window, with an icon in your Dock"
      >
        <DoodleIcon name="rocket" size={13} />
        {label}
      </button>
    );
  }
  return (
    <a
      href={shortcutHref}
      className="flex items-center gap-2 rounded-full border border-line/80 px-4 py-2 text-[12px] font-medium text-muted transition-colors hover:border-ink hover:text-ink"
      title="Downloads a shortcut for your desktop. Double-click it and this opens, signed in. Safari: File, Add to Dock does the same with an icon."
    >
      <DoodleIcon name="rocket" size={13} />
      {label}
    </a>
  );
}
