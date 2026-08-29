"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import DoodleIcon from "@/components/DoodleIcon";
import { TOOL_GROUPS, toolsInGroup, type Tool } from "@/lib/tools";

/**
 * The tool cards, and what each one says to the person looking at it.
 *
 * ── Four outcomes, not two ────────────────────────────────────────────────
 *
 * A gated tool cannot be reduced to open or shut, because the four reasons a
 * card might not open need four different sentences and lead to four different
 * next moves:
 *
 *   entitled        it is theirs. Say so.
 *   not-pro         their licence does not cover it. A commercial conversation.
 *   unknown-person  we have no record of them. A data problem, and phoning the
 *                   office fixes it; telling them to upgrade would be wrong.
 *   unavailable     we could not ask. NOT a refusal — see lib/launchpad.ts.
 *
 * Collapsing these into "you don't have access" is how a Pro partner gets told
 * to buy something they already pay for during an outage.
 *
 * ── While it loads, it says nothing ───────────────────────────────────────
 *
 * The access line is blank until the answer arrives rather than defaulting to
 * either state. Defaulting open flashes an invitation at somebody who cannot
 * have it; defaulting shut flashes a refusal at somebody who can, which is the
 * one they will remember and mention.
 */

type Reason = "entitled" | "not-pro" | "unknown-person" | "unavailable";

interface Access {
  entitled: boolean;
  reason: Reason;
  hasAccount: boolean;
}

/** What the card says about access, in an agent's words. */
function accessLine(a: Access): { text: string; strong: boolean } | null {
  switch (a.reason) {
    case "entitled":
      return a.hasAccount
        ? { text: "Included with your Pro licence.", strong: true }
        : { text: "Included with your Pro licence. You have not set it up yet.", strong: true };
    case "not-pro":
      return { text: "Not part of your licence. Speak to Susan about going Pro.", strong: false };
    case "unknown-person":
      /* Deliberately not "upgrade". We cannot find them, which is a record
         problem rather than a commercial one, and sending somebody to buy
         something they may already have is the worse of the two mistakes. */
      return { text: "We cannot find your licence record. Ask the office to check it.", strong: false };
    case "unavailable":
      return { text: "Cannot check your licence just now. Try again shortly.", strong: false };
  }
}

function ToolCard({ tool, access }: { tool: Tool; access: Access | null }) {
  /* Gated AND known to be barred means the tool cannot open, whatever its build
     state. Unknown access never opens the door either — a paid product must
     fail shut on the click and merely explain itself on the card. */
  const barred = Boolean(tool.gate) && (!access || !access.entitled);
  const live = tool.status === "live" && tool.href && !barred;
  const line = tool.gate && access ? accessLine(access) : null;

  const inner = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line/80 bg-card ${
            live ? "text-ink" : "text-muted"
          }`}
        >
          <DoodleIcon name={tool.icon} size={20} />
        </span>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          {tool.access === "paid" && (
            <span className="rounded-full border border-line/70 px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-muted">
              Paid
            </span>
          )}
          {tool.status !== "live" && (
            <span className="rounded-full border border-line/70 px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-muted">
              Building
            </span>
          )}
        </div>
      </div>
      <p className={`mt-3.5 text-[15px] ${live ? "text-ink" : "text-muted"}`}>{tool.name}</p>
      <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{tool.blurb}</p>
      {line ? (
        <p
          className={`mt-2.5 text-[11.5px] leading-relaxed ${
            line.strong ? "text-ink" : "text-muted"
          }`}
        >
          {line.text}
        </p>
      ) : null}
      {tool.status !== "live" && tool.note ? (
        <p className="mt-2.5 border-t border-line/40 pt-2.5 text-[11.5px] leading-relaxed text-muted">
          {tool.note}
        </p>
      ) : null}
    </>
  );

  return live ? (
    <Link
      href={tool.href!}
      className="fade-up rounded-2xl border border-line/80 bg-panel p-5 transition-colors hover:border-ink"
    >
      {inner}
    </Link>
  ) : (
    <div className="fade-up rounded-2xl border border-dashed border-line/70 bg-panel p-5">{inner}</div>
  );
}

export default function ToolsGrid() {
  const [access, setAccess] = useState<Access | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/tools/launchpad-access", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: Access | null) => {
        if (!alive) return;
        /* A failed fetch is "cannot check", never "not entitled". */
        setAccess(
          j && typeof j.entitled === "boolean"
            ? j
            : { entitled: false, reason: "unavailable", hasAccount: false }
        );
      })
      .catch(() => {
        if (alive) setAccess({ entitled: false, reason: "unavailable", hasAccount: false });
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <>
      {TOOL_GROUPS.map((group) => {
        const tools = toolsInGroup(group.key);
        if (tools.length === 0) return null;
        return (
          <section key={group.key} className="mt-8">
            <h2 className="text-[15px]">{group.label}</h2>
            <p className="mt-1 max-w-xl text-[12.5px] leading-relaxed text-muted">{group.blurb}</p>
            <div className="mt-3.5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {tools.map((t) => (
                <ToolCard key={t.key} tool={t} access={t.gate ? access : null} />
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}
