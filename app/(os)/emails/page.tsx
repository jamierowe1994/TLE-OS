"use client";

import { useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { FlowTag, Pill } from "@/components/Wire";
import type { EmailAudit } from "@/lib/email-audit";

/**
 * Everything that goes out under the company's name.
 *
 * Built because "turn the auto-responders off" was an instruction with no list
 * attached. There are five Power Automate flows, REX's own mail-merge, and 151
 * merge templates on an account six businesses share — and until this page,
 * nobody could name what was actually sending.
 *
 * Two halves, deliberately separate, because they are two different problems:
 * the automation sends the same words every time and can be edited in one
 * place; the agents write every message fresh and cannot.
 */

/**
 * Depth costs time, so the page opens shallow.
 *
 * Every page is a REX round trip and this log is slow — measured at 10s for
 * three pages, 19s for four, because three is one batch and four is two.
 * So the default is exactly one batch: a couple of days of traffic, which
 * already answers "what is going out under our name". Going further back is a
 * deliberate ask, because it costs another twenty seconds.
 */
const SHALLOW = 3;
const DEEP = 6;

const inFlight = new Map<number, Promise<EmailAudit & { error?: string }>>();
function audit(pages: number) {
  const held = inFlight.get(pages);
  if (held) return held;
  const p = fetch(`/api/email-audit?pages=${pages}`)
    .then((r) => r.json())
    .catch((e: Error) => {
      inFlight.delete(pages);
      throw e;
    });
  inFlight.set(pages, p);
  return p;
}

const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}%` : "—");

function Table({
  rows,
  empty,
}: {
  rows: EmailAudit["automated"];
  empty: string;
}) {
  if (!rows.length) return <p className="py-6 text-[12.5px] text-muted">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-[12.5px]">
        <thead>
          <tr className="border-b border-line/70 text-left text-[9.5px] font-bold uppercase tracking-wider text-muted">
            <th className="pb-2 pr-3 font-bold">What</th>
            <th className="pb-2 pr-3 font-bold">Sent</th>
            <th className="pb-2 pr-3 font-bold">Opened</th>
            <th className="pb-2 pr-3 font-bold">Clicked</th>
            <th className="pb-2 font-bold">Bounced</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((g) => (
            <tr key={`${g.templated}-${g.name}`} className="border-b border-line/40 last:border-0">
              <td className="py-2 pr-3">
                {/* Template names must NOT truncate. Four of them read
                    "TLE: As a TT I would like to be notified when an
                    application is …" and the only word that tells them apart
                    is the last one — an end-ellipsis would render two
                    different emails identical. Agent-typed previews are the
                    opposite: the opening words are the identity. */}
                <span
                  className={
                    g.templated ? "block max-w-[420px]" : "block max-w-[420px] truncate"
                  }
                >
                  {g.name}
                </span>
                <span className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-muted">
                  {g.channel}
                  {!g.templated && <span>· typed by hand, no template</span>}
                </span>
              </td>
              <td className="figures py-2 pr-3">{g.count}</td>
              <td className="figures py-2 pr-3 text-muted">
                {g.opened || "—"}
                {g.opened ? <span className="ml-1 text-[10px]">{pct(g.opened, g.count)}</span> : null}
              </td>
              <td className="figures py-2 pr-3 text-muted">{g.clicked || "—"}</td>
              <td className="figures py-2">
                {g.bounced ? (
                  <span className="text-accent-dark">{g.bounced}</span>
                ) : (
                  <span className="text-muted">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Emails() {
  const [a, setA] = useState<EmailAudit | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [depth, setDepth] = useState(SHALLOW);

  useEffect(() => {
    let live = true;
    setError(null);
    audit(depth)
      .then((d) => {
        if (!live) return;
        if (d.error) setError(d.error);
        else setA(d);
      })
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [depth]);

  const bouncePct = a && a.totals.tle ? (a.totals.bounced / a.totals.tle) * 100 : 0;

  return (
    <>
      <PageHeader
        title="Emails"
        blurb="Everything sent under the company's name, from REX's own send log — the automation and the agents, kept apart."
      />

      <div className="mt-10">
        <FlowTag from="REX" to="here" />
      </div>

      {error && (
        <p className="fade-up mt-4 rounded-2xl border border-line/80 bg-panel p-5 text-[12.5px] text-muted">
          {error}
        </p>
      )}

      {!a && !error && (
        <p className="fade-up mt-4 rounded-2xl border border-line/80 bg-panel p-5 text-[12.5px] text-muted">
          Reading the send log…
        </p>
      )}

      {a && (
        <>
          <div className="fade-up mt-4 rounded-2xl border border-line/80 bg-panel p-5 lg:max-w-[80%]">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="text-[15px]">{a.from} to {a.to}</h2>
              <p className="flex items-center gap-3 text-[11px] text-muted">
                {a.totals.account} sends on the account
                {depth < DEEP && (
                  <button
                    type="button"
                    onClick={() => {
                      setA(null);
                      setDepth(DEEP);
                    }}
                    className="underline transition-colors hover:text-ink"
                  >
                    Look further back
                  </button>
                )}
              </p>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                ["Ours", a.totals.tle, "of the shared account"],
                ["By the automation", a.totals.automated, "same words every time"],
                ["Typed by an agent", a.totals.byHand, "written fresh each time"],
                ["Bounced", a.totals.bounced, `${bouncePct.toFixed(1)}% of ours`],
              ].map(([label, n, sub]) => (
                <div key={label as string}>
                  <p className="figures text-[22px] leading-none">{n as number}</p>
                  <p className="mt-1 text-[10.5px] leading-tight text-muted">{label as string}</p>
                  <p className="text-[10px] leading-tight text-muted/70">{sub as string}</p>
                </div>
              ))}
            </div>

            {/* Six businesses share this account, so an unscoped number here
                would be nine parts somebody else's post. */}
            <p className="mt-4 border-t border-line/70 pt-3 text-[11px] leading-relaxed text-muted">
              Six businesses send from this REX account.{" "}
              {a.byBusiness
                .slice(0, 4)
                .map((b) => `${b.domain} ${b.count}`)
                .join(" · ")}
              . Everything below is scoped to ours by the sender&apos;s domain.
            </p>
          </div>

          {bouncePct > 2 && (
            <div className="fade-up mt-4 rounded-2xl border border-accent-dark/40 bg-accent-soft/40 p-5 lg:max-w-[80%]">
              <p className="text-[9.5px] font-bold uppercase tracking-wider text-accent-dark">
                Bounce rate
              </p>
              <p className="mt-2 text-[13.5px] leading-relaxed">
                <span className="figures font-semibold">{bouncePct.toFixed(1)}%</span> of our
                emails bounced. An email programme should stay under 2%.
              </p>
              <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted">
                REX has recorded this all along and nobody has been reading it. Every bounce is
                a landlord or tenant who was told something and never got it.
              </p>
            </div>
          )}

          <div className="fade-up mt-4 rounded-2xl border border-line/80 bg-panel p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-[15px]">Sent by the automation</h2>
              <Pill tone="neutral">editable in one place</Pill>
            </div>
            <p className="mb-3 text-[11.5px] leading-relaxed text-muted">
              Howard&apos;s Power Automate flows, sending through REX&apos;s mail-merge as
              &ldquo;Automated System&rdquo;. Each one runs off a named template, so changing the
              wording is one edit — and turning one off is one switch in the flow.
            </p>
            <Table rows={a.automated} empty="Nothing automated went out in this window." />
          </div>

          <div className="fade-up mt-4 rounded-2xl border border-line/80 bg-panel p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-[15px]">Typed by an agent</h2>
              <Pill tone="accent">no template behind any of it</Pill>
            </div>
            <p className="mb-3 text-[11.5px] leading-relaxed text-muted">
              Thirteen TLE templates exist in REX. The agents use none of them — every one of
              these was written fresh, which is why the same question gets a different answer
              depending on who picked it up. Grouped by opening words, so rewrites of the same
              message sit together.
            </p>
            <Table rows={a.byHand} empty="No agent-sent mail in this window." />
          </div>

          <ul className="mt-4 space-y-1.5 text-[11px] leading-relaxed text-muted">
            <li>
              <span className="font-semibold">Nothing on this page can send or stop an
              email.</span> It answers what is going out under our name — the question that had
              to come before deciding what to switch off.
            </li>
            <li>
              Three versions of the post-viewing email exist —{" "}
              <span className="font-semibold">&ldquo;TLE Post Viewing Email&rdquo;, &ldquo;(new)&rdquo;
              and &ldquo;(2)&rdquo;</span> — and only &ldquo;(2)&rdquo; is ever sent. Anyone editing
              the wording has a two-in-three chance of editing a template nobody uses.
            </li>
            <li>
              One hop is still unaudited: the <span className="font-semibold">Zapier
              webhook</span> buried in the PLC Request flow. It is somebody else&apos;s server and
              nobody here knows what it does. That needs Howard, not a probe.
            </li>
          </ul>
        </>
      )}
    </>
  );
}
