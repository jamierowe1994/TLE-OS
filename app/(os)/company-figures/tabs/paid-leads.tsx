"use client";

// Admin tab: Paid leads, read from Launch Pad (the paid leads admin site) so it
// shows what Susan's MD screen there shows, plus the pro licence and a live
// Socials snapshot (Facebook + Instagram followers + growth) pulled from the
// same app's partner API.

import { useEffect, useState } from "react";
import { londonToday } from "@/lib/london-clock";
import StatCard from "@/components/business/StatCard";
import TimescaleSelect from "@/components/business/TimescaleSelect";
import type { SeedData } from "@/lib/business/seed-data"; // type-only - erased at build
import type { StatValue } from "@/lib/business/types";
import type { LaunchPadFigures } from "@/lib/business/launchpad-figures"; // type-only
import { currentMonth, monthLabel } from "@/lib/business/format";

/* ------------------------------- socials ------------------------------- */

interface SocialPlatform {
  configured: boolean;
  followers: number | null;
  gained: number | null;
  handle: string | null;
  error?: string;
}
interface SocialSnap {
  facebook: SocialPlatform;
  instagram: SocialPlatform;
}

const SOCIAL_PRESETS = [
  { id: "last_7d", label: "Last 7 days" },
  { id: "last_30d", label: "Last 30 days" },
  { id: "last_90d", label: "Last 90 days" },
] as const;

const FB_ICON =
  "M13 22v-9h3l.5-3.5H13V7.3c0-1 .3-1.7 1.8-1.7H16.6V2.4C16.3 2.4 15.2 2.3 14 2.3c-2.6 0-4.3 1.6-4.3 4.5v2.7H6.6V13h3.1v9H13z";
const IG_ICON =
  "M12 8.2A3.8 3.8 0 1012 15.8 3.8 3.8 0 0012 8.2zm0 6.3a2.5 2.5 0 110-5 2.5 2.5 0 010 5zM17 5.6a.9.9 0 100 1.8.9.9 0 000-1.8zM12 4.6c2.4 0 2.7 0 3.7.06 2.5.1 3.6 1.3 3.7 3.7.05 1 .06 1.3.06 3.7s0 2.7-.06 3.7c-.1 2.4-1.2 3.6-3.7 3.7-1 .05-1.3.06-3.7.06s-2.7 0-3.7-.06c-2.5-.1-3.6-1.3-3.7-3.7C4.6 14.7 4.6 14.4 4.6 12s0-2.7.06-3.7c.1-2.4 1.2-3.6 3.7-3.7 1-.05 1.3-.06 3.7-.06zM12 3.3c-2.4 0-2.8 0-3.7.05C4.9 3.5 3.5 4.9 3.4 8.3c-.05.9-.05 1.3-.05 3.7s0 2.8.05 3.7c.1 3.4 1.5 4.8 4.9 4.9.9.05 1.3.05 3.7.05s2.8 0 3.7-.05c3.4-.1 4.8-1.5 4.9-4.9.05-.9.05-1.3.05-3.7s0-2.8-.05-3.7c-.1-3.4-1.5-4.8-4.9-4.9-.9-.05-1.3-.05-3.7-.05z";

const fmt = (n: number | null) =>
  n == null ? "—" : n.toLocaleString("en-GB");
const fmtGained = (n: number | null) =>
  n == null ? "" : `${n > 0 ? "+" : ""}${n.toLocaleString("en-GB")}`;

function PlatformCard({
  label,
  icon,
  iconBg,
  data,
  windowLabel,
}: {
  label: string;
  icon: string;
  iconBg: string;
  data: SocialPlatform;
  windowLabel: string;
}) {
  const gainedColor =
    data.gained == null
      ? "text-muted"
      : data.gained > 0
        ? "text-emerald-600"
        : data.gained < 0
          ? "text-accent"
          : "text-muted";
  return (
    <div className="card p-5">
      <div className="flex items-center gap-2.5">
        <span
          className="flex h-9 w-9 items-center justify-center rounded-lg text-white"
          style={{ background: iconBg }}
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
            <path d={icon} />
          </svg>
        </span>
        <div className="min-w-0">
          <div className="text-sm font-semibold leading-tight">{label}</div>
          {data.handle ? (
            <div className="truncate text-xs text-muted">{data.handle}</div>
          ) : null}
        </div>
      </div>
      {!data.configured ? (
        <p className="mt-3 text-[13px] text-amber-600">Not connected</p>
      ) : data.error || data.followers == null ? (
        <p className="mt-3 text-[13px] text-amber-600">Needs Meta access</p>
      ) : (
        <div className="mt-3 flex items-baseline gap-3">
          <span className="stat-value text-[30px]">{fmt(data.followers)}</span>
          {data.gained != null ? (
            <span className={`text-sm font-semibold ${gainedColor}`}>
              {fmtGained(data.gained)}{" "}
              <span className="text-xs font-normal text-muted">{windowLabel}</span>
            </span>
          ) : null}
        </div>
      )}
      <div className="mt-1 text-xs text-muted">Followers</div>
    </div>
  );
}

function SocialsSection() {
  const [preset, setPreset] = useState<string>("last_30d");
  const [social, setSocial] = useState<SocialSnap | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error" | "off">(
    "loading"
  );
  const windowLabel =
    SOCIAL_PRESETS.find((p) => p.id === preset)?.label ?? "";

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    fetch(`/api/business/social?preset=${preset}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { configured?: boolean; social?: SocialSnap | null }) => {
        if (cancelled) return;
        if (!d.configured) {
          setState("off");
          return;
        }
        setSocial(d.social ?? null);
        setState(d.social ? "ready" : "error");
      })
      .catch(() => !cancelled && setState("error"));
    return () => {
      cancelled = true;
    };
  }, [preset]);

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Socials</h2>
          <p className="mt-0.5 text-xs text-muted">
            Live from Meta · followers now &amp; growth over the window
          </p>
        </div>
        <TimescaleSelect
          value={preset}
          options={SOCIAL_PRESETS}
          onChange={setPreset}
          disabled={state === "loading"}
        />
      </div>

      {state === "off" ? (
        <div className="card p-5 text-[13px] text-muted">
          Socials connection isn&rsquo;t wired up yet.
        </div>
      ) : state === "error" ? (
        <div className="card p-5 text-[13px] text-muted">
          Couldn&rsquo;t load socials right now - try again shortly.
        </div>
      ) : state === "loading" && !social ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="card h-28 animate-pulse" />
          <div className="card h-28 animate-pulse" />
        </div>
      ) : social ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <PlatformCard
            label="Facebook"
            icon={FB_ICON}
            iconBg="#1877F2"
            data={social.facebook}
            windowLabel={windowLabel}
          />
          <PlatformCard
            label="Instagram"
            icon={IG_ICON}
            iconBg="linear-gradient(45deg, #F58529 0%, #DD2A7B 45%, #8134AF 75%, #515BD4 100%)"
            data={social.instagram}
            windowLabel={windowLabel}
          />
        </div>
      ) : null}
    </section>
  );
}

/* --------------------------------- tab --------------------------------- */

/* Susan Liles, 3 Nov 2026: "The paid leads tab on here doesn't show the same
   details as the paid leads admin site?" It counted Meta's leads for the whole
   ad account and asked Go High Level (retired, token refused) for the rest, so
   it disagreed with Launch Pad on the one number it had and showed dashes for
   everything else. Every paid-lead figure below now comes from Launch Pad's
   own sums for the picked month - see lib/business/launchpad-figures.ts. */

/** Launch Pad's own duration format, so "Speed to lead" reads the same. */
function fmtDuration(ms: number): string {
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h < 24) return m ? `${h}h ${m}m` : `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

const gbp = (n: number) =>
  `£${n.toLocaleString("en-GB", { minimumFractionDigits: n < 100 && n % 1 ? 2 : 0, maximumFractionDigits: n < 100 ? 2 : 0 })}`;
const money = (n: number | null | undefined) => (n == null ? "—" : gbp(n));
const pct = (n: number | null | undefined) => (n == null ? "—" : `${n}%`);

const LAUNCHPAD_DOWN: Record<string, string> = {
  "not-configured": "Launch Pad isn't connected to TLE OS, so there are no paid lead figures to show.",
  "not-deployed": "Launch Pad doesn't share these figures with TLE OS yet, so there are no paid lead figures to show.",
  unavailable: "Launch Pad hasn't answered, so there are no paid lead figures to show. Try again shortly.",
};

function BarList({ rows }: { rows: { label: string; value: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="text-[13px] text-muted">No leads this month yet.</p>;
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="flex items-baseline justify-between gap-3 text-[13px]">
            <span className="truncate">{r.label}</span>
            <span className="font-semibold tabular-nums">{r.value}</span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-line/50">
            <div className="h-full rounded-full bg-accent" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function PaidLeadsTab({ month, seed }: { month: string; seed: SeedData }) {
  const pl = seed.paidLeads;

  const [lp, setLp] = useState<LaunchPadFigures | null>(null);
  const [lpState, setLpState] = useState<"loading" | "ready" | "not-configured" | "not-deployed" | "unavailable">(
    "loading"
  );
  /* Asked for the picked month, and asked again when it changes. It took no
     month and ran once until 10 Oct 2026 (Rig P-018): the heading followed
     the picker while every figure under it stayed this month's. */
  useEffect(() => {
    let cancelled = false;
    setLp(null);
    setLpState("loading");
    (async () => {
      try {
        const res = await fetch(`/api/business/paid-leads-live?month=${month}`, { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const j = await res.json();
        if (cancelled) return;
        if (j.month && j.month !== month) return;
        if (j.launchpad) {
          setLp(j.launchpad as LaunchPadFigures);
          setLpState("ready");
        } else {
          setLpState(j.launchpadError ?? "unavailable");
        }
      } catch {
        if (!cancelled) setLpState("unavailable");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [month]);

  const isCurrent = month === currentMonth();
  /** "this month" or "September 2026" - what the live notes are about. */
  const periodWords = isCurrent ? "this month" : monthLabel(month);
  const loading = lpState === "loading";
  const t = lp?.totals;
  const asOf = londonToday();
  const ma = "Market Appraisals";

  /** A Launch Pad figure, or nothing at all - never a stand-in. */
  const live = (value: number | null | undefined, display?: string, note?: string): StatValue =>
    lp && value != null
      ? {
          value,
          display,
          source: "live-teg",
          note: note ?? `Live from Launch Pad, ${periodWords}.`,
          asOf,
        }
      : {
          value: null,
          source: "unavailable",
          note: lp ? `Launch Pad has no figure for ${periodWords}.` : LAUNCHPAD_DOWN[lpState] ?? LAUNCHPAD_DOWN.unavailable,
        };

  const spendNote =
    lp?.metaWindow == null
      ? "Meta only gives spend for this month and last month."
      : "Live from Meta via Launch Pad - spend on every agent's own campaigns.";

  return (
    <div className="space-y-6">
      {/* Live socials snapshot (Facebook + Instagram) */}
      <SocialsSection />

      {/* Source banner */}
      {lpState === "ready" ? (
        <div className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-[13px] text-green-800">
          <span className="font-semibold">Source:</span> Launch Pad, the paid leads admin site - the same figures
          as its managing director screen for {monthLabel(month)}
          {isCurrent ? " so far" : ""}.
        </div>
      ) : lpState === "loading" ? (
        <div className="flex items-center gap-2 rounded-2xl border border-line bg-card px-4 py-3 text-[13px] text-muted">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-transparent" aria-hidden />
          Asking Launch Pad for {monthLabel(month)}
        </div>
      ) : (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
          {LAUNCHPAD_DOWN[lpState] ?? LAUNCHPAD_DOWN.unavailable}
        </div>
      )}

      {/* Month cards - Launch Pad's overview and ads totals, for the picked month */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={isCurrent ? "Leads (MTD)" : "Leads"}
          stat={live(t?.leads, undefined, `Live from Launch Pad - leads that landed in an agent's funnel, ${periodWords}.`)}
          sub="Landed in agents' funnels"
          big
          loading={loading}
        />
        <StatCard
          label={ma}
          stat={live(t?.converted)}
          sub={t ? `${pct(t.rate)} of leads` : undefined}
          loading={loading}
        />
        <StatCard
          label="Speed to Lead"
          stat={live(t?.speedMs, t?.speedMs != null ? fmtDuration(t.speedMs) : undefined, `Live from Launch Pad - average time from a lead arriving to the first call, ${periodWords}.`)}
          sub="Lead in to first call"
          loading={loading}
        />
        <StatCard
          label="Team"
          stat={live(t?.team)}
          sub={t ? `${t.started} started` : undefined}
          loading={loading}
        />
        <StatCard
          label="Ad Spend"
          stat={live(t?.spend, t?.spend != null ? gbp(t.spend) : undefined, spendNote)}
          sub={
            t?.spend != null
              ? `${t.metaLeads ?? 0} Meta lead${t.metaLeads === 1 ? "" : "s"} on agents' campaigns`
              : lp
                ? "Meta only gives this month and last month"
                : undefined
          }
          loading={loading}
        />
        <StatCard label="Cost per Lead" stat={live(t?.cpl, t?.cpl != null ? gbp(t.cpl) : undefined)} loading={loading} />
        <StatCard
          label="Cost per Market Appraisal"
          /* No MAs yet is an answer, not an outage - a dash with the live dot. */
          stat={
            t && t.spend != null && t.converted === 0
              ? live(0, "—", `Live from Launch Pad - no ${ma.toLowerCase()} ${periodWords} to divide the spend by.`)
              : live(t?.costPerConversion, t?.costPerConversion != null ? gbp(t.costPerConversion) : undefined)
          }
          sub={t && t.costPerConversion == null && t.converted === 0 ? `No ${ma.toLowerCase()} yet` : undefined}
          loading={loading}
        />
        <StatCard
          label="Monthly Ad Budget"
          stat={live(t?.monthlyBudget, t ? gbp(t.monthlyBudget) : undefined, "Launch Pad - £100 a month per partner, the Pro licence cap.")}
          sub="£100 a month per partner"
          loading={loading}
        />
      </div>

      {/* Leads by team member - Launch Pad's Team and Ads tabs in one table */}
      <section className="card p-5">
        <h2 className="text-sm font-semibold">Leads by Team Member - {monthLabel(month)}</h2>
        <p className="mt-0.5 text-xs text-muted">
          Leads that landed in each agent&rsquo;s funnel, what they turned into, and what their ads cost.
        </p>
        {loading ? (
          <div className="mt-4 flex items-center gap-2 text-xs text-muted">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-transparent" aria-hidden />
            Loading
          </div>
        ) : !lp ? (
          <p className="mt-4 text-[13px] text-muted">{LAUNCHPAD_DOWN[lpState] ?? LAUNCHPAD_DOWN.unavailable}</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-[13px]">
              <thead>
                <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-muted">
                  <th className="pb-2 pr-3 font-semibold">Agent</th>
                  {/* Leads and MAs first, so a phone sees them before it scrolls. */}
                  <th className="pb-2 pr-3 text-right font-semibold">Leads</th>
                  <th className="pb-2 pr-3 text-right font-semibold">MAs</th>
                  <th className="pb-2 pr-3 text-right font-semibold">Spend</th>
                  <th className="pb-2 pr-3 text-right font-semibold">Meta Leads</th>
                  <th className="pb-2 pr-3 text-right font-semibold">Rate</th>
                  <th className="pb-2 pr-3 text-right font-semibold">Cost / Lead</th>
                  <th className="pb-2 text-right font-semibold">Speed</th>
                </tr>
              </thead>
              <tbody>
                {lp.agents.map((a, i) => (
                  <tr key={`${a.name}-${i}`} className="border-b border-line/50 last:border-0">
                    <td className="py-2.5 pr-3">
                      <div className="font-medium">{a.name}</div>
                      <div className="text-[11px] text-muted">
                        {[
                          a.started ? null : "Not started",
                          a.active ? null : "Left",
                          a.connected ? null : "No ads connected",
                          a.error ? "Meta didn't answer" : null,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "Active"}
                      </div>
                    </td>
                    <td className="py-2.5 pr-3 text-right font-semibold tabular-nums">{a.leads}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">{a.converted}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">{money(a.spend)}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-muted">{a.metaLeads ?? "—"}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-muted">{pct(a.rate)}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-muted">{money(a.cpl)}</td>
                    <td className="py-2.5 text-right tabular-nums text-muted">
                      {a.speedMs != null ? fmtDuration(a.speedMs) : "—"}
                    </td>
                  </tr>
                ))}
                {lp.agents.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-6 text-center text-muted">
                      Nobody at TLE has a Launch Pad account yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Where leads came from */}
        <section className="card p-5">
          <h2 className="text-sm font-semibold">Where Leads Came From</h2>
          <p className="mt-0.5 text-xs text-muted">{monthLabel(month)}</p>
          <div className="mt-4">
            {loading ? (
              <div className="flex items-center gap-2 text-xs text-muted">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-transparent" aria-hidden />
                Loading
              </div>
            ) : !lp ? (
              <p className="text-[13px] text-muted">{LAUNCHPAD_DOWN[lpState] ?? LAUNCHPAD_DOWN.unavailable}</p>
            ) : (
              <BarList
                rows={lp.sources.map((s) => ({
                  label: s.source.charAt(0).toUpperCase() + s.source.slice(1),
                  value: s.leads,
                }))}
              />
            )}
          </div>
        </section>

        {/* Needs attention - about today, so only on the current month */}
        <section className="card p-5">
          <h2 className="text-sm font-semibold">Needs Attention</h2>
          <p className="mt-0.5 text-xs text-muted">
            {lp && isCurrent
              ? `${lp.attentionCount.toLocaleString("en-GB")} lead${lp.attentionCount === 1 ? "" : "s"} going cold across the business`
              : "Leads going cold across the business"}
          </p>
          <div className="mt-4">
            {loading ? (
              <div className="flex items-center gap-2 text-xs text-muted">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-transparent" aria-hidden />
                Loading
              </div>
            ) : !lp ? (
              <p className="text-[13px] text-muted">{LAUNCHPAD_DOWN[lpState] ?? LAUNCHPAD_DOWN.unavailable}</p>
            ) : !isCurrent ? (
              <p className="text-[13px] text-muted">This is about today, so it shows on the current month only.</p>
            ) : lp.attention.length === 0 ? (
              <p className="text-[13px] text-muted">Nothing needs chasing - everything&rsquo;s being worked.</p>
            ) : (
              <div className="space-y-2">
                {lp.attention.slice(0, 6).map((a, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium">{a.leadName}</p>
                      <p className="truncate text-xs text-muted">{a.agentName}</p>
                    </div>
                    <span className="shrink-0 text-xs text-muted">
                      {a.kind === "unanswered" ? "No answer" : "Going cold"} · {fmtDuration(a.ageMs)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Licence economics */}
      <section className="card p-5">
        <h2 className="text-sm font-semibold">Licence Economics</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              Joining fee
            </div>
            <div className="stat-value mt-1 text-[26px]">£1,000+VAT</div>
            <div className="mt-1 text-xs text-muted">One-off, per partner</div>
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              Pro licence
            </div>
            <div className="stat-value mt-1 text-[26px]">£100+VAT</div>
            <div className="mt-1 text-xs text-muted">Per partner, per month</div>
          </div>
          <StatCard
            label="Pro licence income (MTD)"
            stat={pl.proLicenceIncome}
          />
          <StatCard
            label="YTD joining fees"
            stat={pl.ytdJoiningFees}
            /* Was "Jan–Jun 2026", typed (Rig run 2, P-021). The year off the clock. */
            sub={`Joining fees received so far in ${new Date().toLocaleDateString("en-GB", { timeZone: "Europe/London", year: "numeric" })}`}
          />
        </div>
        {/* pl.note named Go High Level as the lead source; Launch Pad is now. */}
        <p className="mt-4 text-xs text-muted">
          Pro licence = £100+VAT a month per partner · Joining fee = £1,000+VAT one-off
        </p>
      </section>
    </div>
  );
}
