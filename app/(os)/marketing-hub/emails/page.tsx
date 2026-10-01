"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { Pill } from "@/components/Wire";
import type { Newsletter, NewsletterKind } from "@/lib/newsletters";
import { statusLine } from "./status";

/**
 * Emails & Events: every newsletter and event invite Marketing has made, and
 * the button that starts a new one (James, 30 Sep 2026). Each opens on its own
 * page where it is designed, given its list and sent - see ./[id].
 */
export default function Emails() {
  const router = useRouter();
  const [list, setList] = useState<Newsletter[] | null>(null);
  const [armed, setArmed] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [creating, setCreating] = useState<NewsletterKind | null>(null);

  const load = useCallback(() => {
    fetch("/api/newsletters", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!j.ok) throw new Error(j.error || "Couldn't load the emails.");
        setList(j.newsletters);
        setArmed(Boolean(j.armed));
      })
      .catch((e) => setErr(e.message));
  }, []);
  useEffect(load, [load]);

  const [copying, setCopying] = useState<string | null>(null);
  async function duplicate(id: string) {
    setCopying(id);
    setErr(null);
    try {
      const j = await (await fetch(`/api/newsletters/${id}/duplicate`, { method: "POST" })).json();
      if (!j.ok) throw new Error(j.error || "Couldn't duplicate it.");
      router.push(`/marketing-hub/emails/${j.newsletter.id}`);
    } catch (e) {
      setErr((e as Error).message);
      setCopying(null);
    }
  }

  async function create(kind: NewsletterKind) {
    setCreating(kind);
    try {
      const j = await (await fetch("/api/newsletters", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind }) })).json();
      if (!j.ok) throw new Error(j.error || "Couldn't start one.");
      router.push(`/marketing-hub/emails/${j.newsletter.id}?design=1`);
    } catch (e) {
      setErr((e as Error).message);
      setCreating(null);
    }
  }

  return (
    <div className="px-4 md:px-0">
      <PageHeader
        title="Emails & Events"
        blurb="Design a newsletter or an event invite, pick who gets it, and send it now or at a time you choose."
      />

      <div className="fade-up mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setChoosing(true)}
          className="rounded-full bg-ink px-5 py-2.5 text-[13.5px] font-semibold text-page"
        >
          + Create email
        </button>
        {!armed && (
          <p className="text-[12px] text-muted">
            Sending is switched off for now. Anything you publish waits, marked Held, until James switches it on.
          </p>
        )}
      </div>

      {choosing && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 p-4 backdrop-blur-sm" onClick={() => !creating && setChoosing(false)}>
          <div className="w-full max-w-[560px] rounded-2xl border border-line bg-card p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="hand text-[20px] leading-tight">What Are You Sending?</h2>
            <p className="mt-1 text-[12.5px] text-muted">Pick one to start from. Everything on it can be changed.</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {(
                [
                  { kind: "newsletter", title: "Newsletter", sub: "News, updates and stories, laid out like a magazine page." },
                  { kind: "event", title: "Event", sub: "An invite with the date, the place and a button to say yes." },
                ] as const
              ).map((o) => (
                <button
                  key={o.kind}
                  type="button"
                  disabled={creating !== null}
                  onClick={() => void create(o.kind)}
                  className="rounded-xl border border-line p-4 text-left transition-colors hover:border-ink/40 disabled:opacity-50"
                >
                  <p className="text-[15px] font-semibold">{creating === o.kind ? "Opening…" : o.title}</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-muted">{o.sub}</p>
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setChoosing(false)} className="mt-4 text-[12px] font-semibold text-muted hover:text-ink">
              Cancel
            </button>
          </div>
        </div>
      )}

      {err && <p className="mt-4 rounded-xl border border-accent-dark/40 bg-accent-soft/40 p-3 text-[12.5px]">{err}</p>}

      <section className="fade-up mt-6">
        {list === null && !err ? (
          <p className="flex items-center gap-2 text-[12.5px] text-muted">
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-ink" /> Loading your emails…
          </p>
        ) : list && list.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line p-8 text-center">
            <p className="text-[14px] font-semibold">Nothing sent yet</p>
            <p className="mt-1 text-[12.5px] text-muted">Press Create email to design the first one.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {list?.map((n) => {
              const s = statusLine(n, armed);
              return (
                <li key={n.id} className="flex items-stretch gap-2">
                  <Link
                    href={`/marketing-hub/emails/${n.id}`}
                    className="flex min-w-0 flex-1 flex-wrap items-center gap-3 rounded-xl border border-line/70 bg-card p-3.5 transition-colors hover:border-ink/30"
                  >
                    <span className="min-w-0 flex-1 basis-full sm:basis-0">
                      <span className="block truncate text-[13.5px] font-semibold">{n.name || "Untitled"}</span>
                      <span className="block truncate text-[11.5px] text-muted">{n.subject || "No subject yet"}</span>
                    </span>
                    <Pill tone="neutral">{n.kind === "event" ? "Event" : "Newsletter"}</Pill>
                    <span className="text-[11.5px] text-muted">{n.recipients.length} {n.recipients.length === 1 ? "person" : "people"}</span>
                    <Pill tone={s.tone}>{s.text}</Pill>
                  </Link>
                  <button
                    type="button"
                    disabled={copying !== null}
                    onClick={() => void duplicate(n.id)}
                    aria-label={`Duplicate ${n.name || "Untitled"}`}
                    className="shrink-0 rounded-xl border border-line/70 bg-card px-3.5 text-[12px] font-semibold text-muted transition-colors hover:border-ink/30 hover:text-ink disabled:opacity-40"
                  >
                    {copying === n.id ? "Duplicating…" : "Duplicate"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
