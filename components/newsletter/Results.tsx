"use client";

import { useCallback, useEffect, useState } from "react";
import type { NewsletterResults } from "@/lib/newsletter-track";

/**
 * How a sent email did (1 Oct 2026, Francesca): open rate, clicks, every link
 * and whether it works, delivered and bounced, and each person.
 */

type Check = { url: string; ok: boolean; status: number | null; note: string };

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "-");
const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" }) : "";
const shortUrl = (u: string) => u.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");

export default function Results({ id, live }: { id: string; live: boolean }) {
  const [r, setR] = useState<NewsletterResults | null>(null);
  const [links, setLinks] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [showPeople, setShowPeople] = useState(false);

  const load = useCallback(async () => {
    const j = await (await fetch(`/api/newsletters/${id}/results`, { cache: "no-store" })).json().catch(() => ({ ok: false }));
    if (!j.ok) throw new Error(j.error || "The results didn't load.");
    setR(j.results);
    setLinks(j.linksInEmail ?? []);
  }, [id]);

  useEffect(() => {
    load().catch((e) => setErr(e.message));
    /* The figures move for a day or two after a send; keep them fresh while the page is open. */
    const t = setInterval(() => void load().catch(() => null), live ? 20_000 : 60_000);
    return () => clearInterval(t);
  }, [load, live]);

  async function check() {
    setChecking(true);
    try {
      const j = await (await fetch(`/api/newsletters/${id}/results`, { method: "POST" })).json();
      setChecks(j.ok ? j.checks : []);
    } finally {
      setChecking(false);
    }
  }

  if (err) return <p className="mt-5 rounded-xl border border-accent-dark/40 bg-accent-soft/40 p-3 text-[12.5px]">{err}</p>;
  if (!r) return <p className="mt-5 text-[12.5px] text-muted">Loading the results…</p>;

  const sent = r.sent;
  const clickedOf = new Map(r.links.map((l) => [l.url, l]));
  const allLinks = [...new Set([...links, ...r.links.map((l) => l.url)])];
  const checkOf = new Map((checks ?? []).map((c) => [c.url, c]));

  const tiles: { label: string; big: string; sub: string; tone?: "good" | "bad" }[] = [
    { label: "Sent", big: String(sent), sub: r.failed ? `${r.failed} couldn't be sent` : r.queued ? `${r.queued} still to go` : `of ${r.total}` , tone: r.failed ? "bad" : undefined },
    r.deliveryLinked
      ? { label: "Delivered", big: String(r.delivered), sub: r.bounced ? `${r.bounced} bounced` : pct(r.delivered, sent), tone: r.bounced ? "bad" : "good" }
      : { label: "Delivered", big: "-", sub: "Waits on Resend being linked up" },
    r.tracked
      ? { label: "Open rate", big: pct(r.opened, sent), sub: `${r.opened} of ${sent} people` }
      : { label: "Open rate", big: "-", sub: "Sent before tracking began" },
    r.tracked
      ? { label: "Clicked", big: String(r.clicked), sub: `${pct(r.clicked, sent)} of people · ${r.clicks} ${r.clicks === 1 ? "click" : "clicks"}` }
      : { label: "Clicked", big: "-", sub: "Sent before tracking began" },
  ];

  return (
    <section className="mt-5 rounded-[22px] border border-line/60 bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[17px]">Results</h2>
        <p className="text-[11.5px] text-muted">Updates on its own while this page is open.</p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-2xl border border-line/60 bg-panel p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{t.label}</p>
            <p className={`mt-1 text-[26px] font-bold tabular-nums ${t.tone === "bad" ? "text-[#9d4340]" : ""}`}>{t.big}</p>
            <p className="mt-0.5 text-[12px] text-muted">{t.sub}</p>
          </div>
        ))}
      </div>

      {r.tracked && (
        <p className="mt-3 text-[11.5px] leading-relaxed text-muted">
          Opens are a guide, not a count: Apple Mail opens every picture as the email arrives, and Outlook hides pictures until you ask, so some opens are counted that
          nobody read and some reads are missed. Clicks are the reliable figure. A click also counts as an open.
        </p>
      )}

      {/* ── Every link in the email ── */}
      <div className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[14px]">Links in the email</h3>
          {allLinks.length > 0 && (
            <button type="button" onClick={() => void check()} disabled={checking} className="rounded-full border border-line/80 bg-card px-3.5 py-1.5 text-[12px] font-semibold hover:border-ink/40 disabled:opacity-50">
              {checking ? "Checking every link…" : checks ? "Check again" : "Check every link works"}
            </button>
          )}
        </div>
        {allLinks.length === 0 ? (
          <p className="mt-2 text-[12.5px] text-muted">There are no clickable links in this email.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line/50 rounded-2xl border border-line/60">
            {allLinks.map((u) => {
              const c = clickedOf.get(u);
              const k = checkOf.get(u);
              return (
                <li key={u} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2.5 text-[12.5px]">
                  <a href={u} target="_blank" rel="noopener noreferrer" className="min-w-0 max-w-full truncate font-medium hover:underline">
                    {shortUrl(u)}
                  </a>
                  <span className="flex shrink-0 items-center gap-3">
                    {k && (
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${k.ok ? "bg-[#e3ead9] text-[#56634a]" : "bg-[#f6e1dd] text-[#9d4340]"}`}>
                        {k.ok ? "Works" : k.note}
                      </span>
                    )}
                    <span className="tabular-nums text-muted">
                      {r.tracked ? `${c?.clicks ?? 0} ${(c?.clicks ?? 0) === 1 ? "click" : "clicks"} · ${c?.people ?? 0} ${(c?.people ?? 0) === 1 ? "person" : "people"}` : "-"}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* ── Each person ── */}
      <div className="mt-6">
        <button type="button" onClick={() => setShowPeople((v) => !v)} className="text-[13px] font-semibold hover:underline">
          {showPeople ? "Hide" : "Show"} each person ({r.total})
        </button>
        {showPeople && (
          <div className="mt-2 overflow-x-auto rounded-2xl border border-line/60">
            <table className="w-full min-w-[620px] text-left text-[12.5px]">
              <thead className="bg-panel text-[11px] uppercase tracking-[0.06em] text-muted">
                <tr>
                  <th className="px-4 py-2 font-semibold">Who</th>
                  <th className="px-4 py-2 font-semibold">Sent</th>
                  <th className="px-4 py-2 font-semibold">Delivered</th>
                  <th className="px-4 py-2 font-semibold">Opened</th>
                  <th className="px-4 py-2 font-semibold">Clicked</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/50">
                {r.people.map((p) => (
                  <tr key={p.email}>
                    <td className="px-4 py-2">
                      <span className="font-medium">{p.name || p.email}</span>
                      {p.name && <span className="block text-[11px] text-muted">{p.email}</span>}
                    </td>
                    <td className="px-4 py-2">{p.state === "sent" ? when(p.sentAt) : p.state === "failed" ? <span className="text-[#9d4340]" title={p.error ?? ""}>Couldn&apos;t send</span> : "Waiting"}</td>
                    <td className="px-4 py-2">{p.bounced ? <span className="text-[#9d4340]">{p.bounced}</span> : p.delivered ? "Yes" : r.deliveryLinked ? "Not yet" : "-"}</td>
                    <td className="px-4 py-2">{r.tracked ? (p.openedAt ? `${when(p.openedAt)}${p.opens > 1 ? ` · ${p.opens}×` : ""}` : "Not yet") : "-"}</td>
                    <td className="px-4 py-2">{r.tracked ? (p.clickedAt ? `${when(p.clickedAt)}${p.clicks > 1 ? ` · ${p.clicks}×` : ""}` : "No") : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
