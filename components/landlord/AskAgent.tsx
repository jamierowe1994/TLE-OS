"use client";

import { useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";

/**
 * A message to the agent. Honest about where it goes: it opens the
 * landlord's own email with the agent's address and the words filled in,
 * because there is no inbox in the OS for a landlord's message to land in
 * yet. When there is, this box is the one that changes and nothing else.
 */
export default function AskAgent({ to, name, property }: { to: string | null; name: string | null; property: string }) {
  const [text, setText] = useState("");
  const address = to ?? "hello@thelettingexperts.co.uk";
  const href = `mailto:${address}?subject=${encodeURIComponent(`About ${property}`)}&body=${encodeURIComponent(text)}`;
  return (
    <div className="rounded-2xl border border-line/70 bg-white p-4" data-search>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        placeholder={name ? `Ask ${name.split(/\s+/)[0]} anything about the property` : "Ask us anything about the property"}
        className="w-full resize-none bg-transparent text-[13.5px] outline-none placeholder:text-muted"
      />
      <div className="mt-2 flex items-center justify-between gap-3">
        <span className="flex items-center gap-1 text-muted">
          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-line/70"><DoodleIcon name="call" size={13} /></span>
          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-line/70"><DoodleIcon name="upload" size={13} /></span>
        </span>
        <a
          href={href}
          className={`inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-[12.5px] font-semibold text-white transition-opacity ${text.trim() ? "" : "pointer-events-none opacity-40"}`}
        >
          Send
          <DoodleIcon name="rocket" size={13} className="text-white" />
        </a>
      </div>
    </div>
  );
}
