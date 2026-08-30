"use client";

import { useEffect, useState } from "react";

/**
 * A share link, shown in full and copyable in one press.
 *
 * The origin is read in the browser rather than built on the server. The OS
 * answers on both tle-os.co.uk and the railway.app host, and a link that
 * hardcoded either would sometimes hand somebody the wrong one - James copies
 * this to send to people, so the address has to be the one he is actually
 * looking at.
 *
 * The full URL is on screen and not hidden behind the button, because half
 * the time it is going to be read aloud or typed into a phone.
 */
export default function CopyLink({ path }: { path: string }) {
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => setOrigin(window.location.origin), []);

  const url = origin ? `${origin}${path}` : path;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      /* Clipboard refused (it needs a secure context). The link is on screen
         anyway, which is why it is shown in full rather than hidden. */
    }
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <code className="min-w-0 flex-1 truncate rounded-lg border border-line/80 bg-box px-3 py-2 text-[11.5px]">
        {url}
      </code>
      <button
        type="button"
        onClick={copy}
        className="shrink-0 rounded-full bg-ink px-4 py-2 text-[11.5px] text-page"
      >
        {copied ? "Copied" : "Copy link"}
      </button>
      <a
        href={path}
        target="_blank"
        rel="noreferrer"
        className="shrink-0 rounded-full border border-line/80 px-3.5 py-2 text-[11.5px] transition-colors hover:border-ink/40"
      >
        Open
      </a>
    </div>
  );
}
