"use client";

import { useEffect, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import PageHeader from "@/components/PageHeader";
import { PressButton } from "@/components/Bits";
import { Pill } from "@/components/Wire";
import {
  applySurface, applyTheme, readSurface, readTheme, writeSurface, writeTheme,
  type SurfaceChoice, type ThemeChoice,
} from "@/lib/theme";

/**
 * The profile: who this agent is, how their OS looks, what keeps THEM legal,
 * what's plugged in, and the one page that sells them something.
 *
 * Email is shown but never editable — it's the identity the whole login
 * hangs off. Everything else is theirs to write.
 */

type TabKey = "info" | "appearance" | "compliance" | "connections" | "ads";

const TABS: { key: TabKey; label: string }[] = [
  { key: "info", label: "Profile information" },
  { key: "appearance", label: "Appearance" },
  { key: "compliance", label: "Personal compliance" },
  { key: "connections", label: "Connections" },
  { key: "ads", label: "Ads" },
];

const ACCENTS = [
  { id: "", label: "Warm Clay", dot: "#de968f" },
  { id: "blush", label: "Blush", dot: "#f0b3bb" },
  { id: "red", label: "Classic Red", dot: "#e31f36" },
];

const PROFILE_KEY = "tle-profile-v1";

type Profile = { name: string; phone: string; patch: string; bio: string };
const DEFAULT_PROFILE: Profile = {
  name: "James Rowe",
  phone: "07XXX XXXXXX",
  patch: "Nottinghamshire & the North West",
  bio: "",
};

/** The agency's packages — shown on the profile so the agent always knows
 *  what they're on. Sample: this account sits on Growth. */
const PLAN: "Starter" | "Growth" | "Pro" = "Growth";

/**
 * An agent's own paperwork — what a SELF-EMPLOYED lettings agent has to
 * hold personally (not trade-body memberships they don't need). Expiry as
 * day offsets, same convention as the rest of the sample book. `portal` is
 * where Sort-it-now will take them once the renewals auto-connect.
 */
const PERSONAL_COMPLIANCE: {
  label: string; expires: number | null; portal: string;
}[] = [
  { label: "ICO data-protection registration", expires: 240, portal: "ico.org.uk" },
  { label: "Professional indemnity insurance", expires: 24, portal: "your broker" },
  { label: "Public liability insurance", expires: 300, portal: "your broker" },
  { label: "HMRC anti-money-laundering supervision", expires: 18, portal: "gov.uk/anti-money-laundering" },
  { label: "Right to Rent training", expires: -12, portal: "the training portal" },
];

function dateFor(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

const CONNECTIONS = [
  { id: "m365", name: "Microsoft 365", what: "Your diary and email — powers the calendar and every send", state: "off", icon: "calendar" },
  { id: "rex", name: "REX", what: "Properties, listings and compliance records", state: "on", icon: "home" },
  { id: "payprop", name: "PayProp", what: "Rent, fees and landlord payments", state: "on", icon: "wallet" },
  { id: "ghl", name: "GoHighLevel", what: "Facebook & Instagram leads land in your inbox", state: "on", icon: "megaphone" },
  { id: "whatsapp", name: "WhatsApp Business", what: "Message applicants where they actually reply", state: "off", icon: "message" },
  { id: "docusign", name: "DocuSign", what: "Terms of business and tenancy signatures", state: "off", icon: "file-contract" },
];

export default function ProfilePage() {
  const [tab, setTab] = useState<TabKey>("info");
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  const [saved, setSaved] = useState(false);
  const [theme, setTheme] = useState<ThemeChoice>("auto");
  const [surface, setSurface] = useState<SurfaceChoice>("medium");
  const [accent, setAccent] = useState("");
  const [connections, setConnections] = useState(CONNECTIONS);
  /** Labels with a diary reminder set this session. */
  const [reminders, setReminders] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PROFILE_KEY);
      if (raw) setProfile({ ...DEFAULT_PROFILE, ...JSON.parse(raw) });
    } catch { /* default profile */ }
    setTheme(readTheme() ?? "auto");
    setSurface(readSurface());
    setAccent(localStorage.getItem("os-accent") ?? "");
  }, []);

  function pickSurface(s: SurfaceChoice) {
    setSurface(s);
    writeSurface(s);
    applySurface(s);
  }

  function save(next: Profile) {
    setProfile(next);
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify(next)); } catch { /* session-only */ }
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1600);
  }

  function pickTheme(t: ThemeChoice) {
    setTheme(t);
    writeTheme(t);
    applyTheme(t);
  }
  function pickAccent(id: string) {
    setAccent(id);
    localStorage.setItem("os-accent", id);
    if (id) document.documentElement.dataset.accent = id;
    else delete document.documentElement.dataset.accent;
  }

  const initials = profile.name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase() || "TLE";
  const field =
    "w-full rounded-xl border border-line/80 bg-transparent px-3.5 py-2.5 text-[13.5px] outline-none transition-colors focus:border-ink";
  const label = "mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted";

  return (
    <>
      <PageHeader
        title="Your profile"
        blurb="Who you are on every email and listing, how your OS looks, and the paperwork that keeps you — not just the properties — compliant."
        illustration="/illustrations/notioly/looking-for-something.svg"
        lineBreak="dip"
        /* Nothing on this page is searched for — the bar would be furniture. */
        search={false}
      />

      {/* ── Tabs, same grammar as the records. ── */}
      <div className="mt-8 flex gap-1 overflow-x-auto border-b border-line/80">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`hand relative whitespace-nowrap px-4 py-2.5 text-[13.5px] transition-colors ${
              tab === t.key ? "text-ink" : "text-muted hover:text-ink"
            }`}
          >
            {t.label}
            {tab === t.key && (
              <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-accent-dark" />
            )}
          </button>
        ))}
      </div>

      <div className="mt-6 pb-10">
        {/* ══ PROFILE INFORMATION ══ */}
        {tab === "info" && (
          <div className="max-w-2xl">
            <div className="flex items-center gap-5">
              <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[24px] font-bold text-accent-dark">
                {initials}
              </span>
              <div className="min-w-0">
                <p className="hand text-[20px] leading-tight">{profile.name}</p>
                <p className="mt-0.5 text-[12px] text-muted">
                  The Lettings Experts · {profile.patch}
                </p>
                {/* The package, always visible — nobody should have to ask
                    what they're on. Starter → Growth → Pro. */}
                <button
                  type="button"
                  onClick={() => setTab("ads")}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1 text-[11px] font-semibold text-accent-dark transition-opacity hover:opacity-80"
                  title="See what Pro adds"
                >
                  <DoodleIcon name="rocket" size={12} />
                  {PLAN} plan
                  {PLAN !== "Pro" && <span className="text-muted">· upgrade →</span>}
                </button>
              </div>
              {saved && <Pill tone="good">Saved</Pill>}
            </div>

            <div className="mt-7 grid gap-5 sm:grid-cols-2">
              <label className="block">
                <span className={label}>Name</span>
                <input
                  value={profile.name}
                  onChange={(e) => save({ ...profile, name: e.target.value })}
                  className={field}
                />
              </label>
              <label className="block">
                <span className={label}>Email</span>
                <span className="flex items-center gap-2.5 rounded-xl border border-line/60 bg-panel px-3.5 py-2.5 text-[13.5px] text-muted">
                  <DoodleIcon name="lock" size={13} className="shrink-0" />
                  james@thelettingexperts.co.uk
                </span>
                <span className="mt-1 block text-[10px] text-muted">
                  Your sign-in — it can&apos;t be changed here.
                </span>
              </label>
              <label className="block">
                <span className={label}>Phone</span>
                <input
                  value={profile.phone}
                  onChange={(e) => save({ ...profile, phone: e.target.value })}
                  className={field}
                />
              </label>
              <label className="block">
                <span className={label}>Your patch</span>
                <input
                  value={profile.patch}
                  onChange={(e) => save({ ...profile, patch: e.target.value })}
                  className={field}
                />
              </label>
            </div>

            <label className="mt-5 block">
              <span className={label}>Bio</span>
              <textarea
                value={profile.bio}
                onChange={(e) => save({ ...profile, bio: e.target.value })}
                rows={4}
                placeholder="A couple of sentences landlords and tenants will see — who you are, how long you've been letting, what you're known for…"
                className={`${field} resize-none leading-relaxed`}
              />
              <span className="mt-1 block text-[10px] text-muted">
                Shows on your listings, your emails and the landlord review pages.
              </span>
            </label>
          </div>
        )}

        {/* ══ APPEARANCE ══ */}
        {tab === "appearance" && (
          <div className="max-w-md">
            <p className={label}>Theme</p>
            <div className="flex gap-2">
              {(["light", "dark", "auto"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => pickTheme(t)}
                  className={`flex-1 rounded-xl border px-3 py-3 text-[12.5px] font-medium capitalize transition-colors ${
                    theme === t
                      ? "border-accent-dark bg-accent-soft text-accent-dark"
                      : "border-line/70 text-muted hover:text-ink"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[10.5px] leading-relaxed text-muted">
              Automatic follows the clock, not the operating system — the screen softens
              from 7pm to 7am.
            </p>

            <p className={`${label} mt-7`}>Surface</p>
            <div className="flex gap-2">
              {(
                [
                  { id: "light", name: "Light", dot: "#ffffff" },
                  { id: "medium", name: "Medium", dot: "#f2f0eb" },
                ] as const
              ).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => pickSurface(s.id)}
                  className={`flex flex-1 items-center justify-center gap-2.5 rounded-xl border px-3 py-3 text-[12.5px] font-medium transition-colors ${
                    surface === s.id
                      ? "border-accent-dark bg-accent-soft text-accent-dark"
                      : "border-line/70 text-muted hover:text-ink"
                  }`}
                >
                  <span
                    className="h-5 w-5 rounded-full border border-ink/15"
                    style={{ backgroundColor: s.dot }}
                  />
                  {s.name}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[10.5px] leading-relaxed text-muted">
              The page&apos;s paper: Medium is the warm eggshell, Light is plain white.
              The jury&apos;s out — one of these will eventually win and the other goes.
              Daylight only; the dark theme is its own paper.
            </p>

            <p className={`${label} mt-7`}>Your accent</p>
            <div className="flex gap-3">
              {ACCENTS.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => pickAccent(a.id)}
                  className={`flex items-center gap-2.5 rounded-full border px-4 py-2.5 text-[12.5px] transition-colors ${
                    accent === a.id ? "border-accent-dark" : "border-line/70 hover:border-ink/40"
                  }`}
                >
                  <span className="h-5 w-5 rounded-full border border-ink/10" style={{ backgroundColor: a.dot }} />
                  {a.label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[10.5px] leading-relaxed text-muted">
              Every chart, button and highlight follows your pick — the whole OS, not a stripe.
            </p>
          </div>
        )}

        {/* ══ PERSONAL COMPLIANCE ══ */}
        {tab === "compliance" && (
          <div className="max-w-3xl">
            <p className="mb-4 text-[12.5px] leading-relaxed text-muted">
              The properties have their page — this one is YOURS: what a self-employed
              lettings agent has to hold personally, when each runs out, and the
              reminder that lands in your diary a month before it does.
            </p>
            <div className="overflow-x-auto rounded-2xl border border-line/70">
              <table className="w-full min-w-[620px] text-left">
                <thead>
                  <tr className="border-b border-line/70 text-[10px] font-semibold uppercase tracking-wide text-muted">
                    <th className="px-4 py-3">What you hold</th>
                    <th className="px-4 py-3">Expires</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Reminder</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {PERSONAL_COMPLIANCE.map((c) => {
                    const state =
                      c.expires == null ? "missing" : c.expires < 0 ? "expired" : c.expires <= 45 ? "due" : "ok";
                    const hasReminder = reminders.has(c.label);
                    return (
                      <tr key={c.label} className="border-b border-line/40 last:border-0">
                        <td className="px-4 py-3.5">
                          <span className="block text-[12.5px] font-semibold">{c.label}</span>
                          <span className="block text-[10px] text-muted">renews via {c.portal}</span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5">
                          {c.expires != null ? (
                            <>
                              <span className="figures block text-[12.5px]">{dateFor(c.expires)}</span>
                              <span className={`block text-[10px] ${state === "ok" ? "text-muted" : "font-semibold text-accent-dark"}`}>
                                {c.expires < 0 ? `${Math.abs(c.expires)} days ago` : `in ${c.expires} days`}
                              </span>
                            </>
                          ) : (
                            <span className="text-[11px] text-muted">no record</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5">
                          {state === "ok" ? (
                            <Pill tone="good">In date</Pill>
                          ) : state === "due" ? (
                            <Pill tone="accent">Due soon</Pill>
                          ) : (
                            <Pill tone="accent">EXPIRED</Pill>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5">
                          {c.expires != null && c.expires >= 30 ? (
                            hasReminder ? (
                              <span className="flex items-center gap-1.5 text-[11px] text-muted">
                                <DoodleIcon name="bell" size={12} className="text-accent-dark" />
                                In your diary · {dateFor(c.expires - 30)}
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setReminders((cur) => new Set(cur).add(c.label))}
                                className="rounded-full border border-ink/25 px-3.5 py-1.5 text-[11px] font-semibold transition-colors hover:border-ink"
                              >
                                Set reminder
                              </button>
                            )
                          ) : (
                            <span className="text-[10px] text-muted">too close — sort it</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          {state !== "ok" && (
                            <PressButton className="press-ring rounded-full bg-accent-dark px-4 py-2 text-[11px] font-semibold text-page">
                              Sort it now
                            </PressButton>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-4 text-[10.5px] leading-relaxed text-muted">
              Reminders land in your diary 30 days before expiry — the minimum runway for
              a renewal. &ldquo;Sort it now&rdquo; will open each provider&apos;s own portal
              once the connections are wired; today it marks the intent.
            </p>
          </div>
        )}

        {/* ══ CONNECTIONS ══ */}
        {tab === "connections" && (
          <div className="max-w-2xl">
            <p className="mb-4 text-[12.5px] leading-relaxed text-muted">
              What your OS is plugged into. Microsoft 365 is the big one — it&apos;s what
              makes the diary yours and the emails really send.
            </p>
            <ul className="space-y-2.5">
              {connections.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-line/70 p-4">
                  <DoodleIcon name={c.icon} size={18} className="shrink-0 text-accent-dark" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold">{c.name}</span>
                    <span className="block text-[11px] text-muted">{c.what}</span>
                  </span>
                  {c.state === "on" ? (
                    <>
                      <Pill tone="good">Connected</Pill>
                      <button
                        type="button"
                        onClick={() =>
                          setConnections((cur) => cur.map((x) => (x.id === c.id ? { ...x, state: "off" } : x)))
                        }
                        className="text-[11px] font-semibold text-muted transition-colors hover:text-ink"
                      >
                        Disconnect
                      </button>
                    </>
                  ) : (
                    <PressButton
                      onClick={() =>
                        setConnections((cur) => cur.map((x) => (x.id === c.id ? { ...x, state: "on" } : x)))
                      }
                      className="press-ring rounded-full bg-accent-dark px-4 py-2 text-[11.5px] font-semibold text-page"
                    >
                      Connect
                    </PressButton>
                  )}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-[10.5px] leading-relaxed text-muted">
              Wireframe — the buttons flip the label; the OAuth flows land with sign-in.
            </p>
          </div>
        )}

        {/* ══ ADS — the one page that sells something. Layout after the
            reference: a small mark, a big centred line with the accent
            carrying the promise, a stack of leaning cards, one button. ══ */}
        {tab === "ads" && (
          <div className="mx-auto max-w-2xl py-6 text-center">
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-line/80 bg-page shadow-[0_10px_24px_-12px_rgba(0,0,0,0.25)]">
              <DoodleIcon name="megaphone" size={30} className="text-accent-dark" />
            </span>

            <h2 className="mx-auto mt-7 max-w-xl text-[34px] leading-tight">
              Put your homes in front of{" "}
              <span className="text-accent-dark">everyone scrolling</span>.
            </h2>
            <p className="mx-auto mt-3 max-w-md text-[13px] leading-relaxed text-muted">
              Pro runs Facebook and Instagram campaigns for your listings and your
              landlord offers — built, targeted and reported without you touching an
              ads manager.
            </p>

            {/* The leaning stack — three ad cards in the house's ink. */}
            <div className="relative mx-auto mt-10 h-[240px] w-full max-w-md">
              {[
                { art: "/illustrations/notioly/buildings.svg", cap: "New to the market", rot: "-8deg", x: "-84px", z: 1 },
                { art: "/illustrations/notioly/moving.svg", cap: "12 Elm Gardens · £1,200 pcm", rot: "0deg", x: "0px", z: 3 },
                { art: "/illustrations/notioly/home-caring.svg", cap: "Landlords: switch & save", rot: "8deg", x: "84px", z: 2 },
              ].map((cardData) => (
                <div
                  key={cardData.cap}
                  className="absolute left-1/2 top-0 w-[180px] overflow-hidden rounded-2xl border border-line/80 bg-card shadow-[0_24px_50px_-20px_rgba(0,0,0,0.35)]"
                  style={{
                    transform: `translateX(-50%) translateX(${cardData.x}) rotate(${cardData.rot})`,
                    zIndex: cardData.z,
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={cardData.art} alt="" aria-hidden className="art mx-auto h-36 w-36 object-contain pt-3" />
                  <div className="flex items-center justify-between gap-2 border-t border-line/60 px-3 py-2.5">
                    <span className="hand truncate text-[11px]">{cardData.cap}</span>
                    <DoodleIcon name="star" size={12} className="shrink-0 text-accent-dark" />
                  </div>
                </div>
              ))}
            </div>

            <div className="mx-auto mt-8 flex max-w-sm flex-col items-center gap-3">
              <PressButton className="press-ring press-wobble w-full rounded-full bg-accent-dark px-8 py-3.5 text-[14px] font-semibold text-page">
                Upgrade to Pro — unlock Ads
              </PressButton>
              <p className="text-[10.5px] leading-relaxed text-muted">
                Pro sits on top of your monthly licence. Campaigns for every new listing,
                a landlord-switch ad always running, and the cost-per-lead on your
                dashboard&apos;s Ads widget.
              </p>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
