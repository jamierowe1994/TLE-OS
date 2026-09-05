"use client";

import { useEffect, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import PageHeader from "@/components/PageHeader";
import CustomAttributes from "@/components/CustomAttributes";
import PersonalCompliance from "@/components/PersonalCompliance";
import AddressField from "@/components/AddressField";
import { PressButton } from "@/components/Bits";
import { Pill } from "@/components/Wire";
import RexSignIn from "@/components/RexSignIn";
import { usePref, usePrefsHome } from "@/lib/prefs-store";
import {
  applyTheme, readTheme, writeTheme,
  CHARCOALS, DARK_BG_DEFAULT, DARK_BG_KEY, DARK_BOX_DEFAULT, DARK_BOX_KEY,
  readDarkStep, writeDarkStep,
  type ThemeChoice,
} from "@/lib/theme";

/**
 * The profile: who this agent is, how their OS looks, what keeps THEM legal,
 * what's plugged in, and the one page that sells them something.
 *
 * Email is shown but never editable — it's the identity the whole login
 * hangs off. Everything else is theirs to write.
 */

type TabKey = "info" | "appearance" | "custom" | "compliance" | "connections" | "portals" | "ads";

const TABS: { key: TabKey; label: string }[] = [
  { key: "info", label: "Profile information" },
  { key: "appearance", label: "Appearance" },
  /* Your own fields, the filters that come with them, and the questions you
     bolt onto your tenant passports. "Custom attributes" was accurate when
     that was all it held; it is now two different kinds of custom thing, and
     the shorter word covers both without promising either. */
  { key: "custom", label: "Custom" },
  { key: "compliance", label: "Personal compliance" },
  { key: "connections", label: "Connections" },
  { key: "portals", label: "Portals" },
  { key: "ads", label: "Ads" },
  /* "The wiring" USED to be here. It has moved to /admin — James: "they don't
     need to see that, that's for my referencing and testing." An agent's own
     Connections tab stays; the environment switches are not theirs. */
];

const ACCENTS = [
  { id: "", label: "Warm Clay", dot: "#de968f" },
  { id: "blush", label: "Blush", dot: "#f0b3bb" },
  { id: "red", label: "Classic Red", dot: "#e31f36" },
];

const PROFILE_KEY = "tle-profile-v1";

type Profile = {
  name: string; phone: string; patch: string; bio: string; photo?: string;
  /**
   * Where they set off from — home for most partners, since TLE is a
   * self-employed network with no office anybody commutes to.
   *
   * Only ever used as the STARTING point for a travel-time estimate on the
   * first appointment of a day, and never shown to a landlord or a tenant.
   * Kept as coordinates alongside the text so the booker doesn't re-geocode
   * the same house on every glance at the calendar.
   */
  base?: string;
  baseLat?: number | null;
  baseLng?: number | null;
};
/**
 * EMPTY. Never a person.
 *
 * This held "James Rowe", a phone placeholder and his patch, and the page
 * merged saved preferences OVER it while never asking who was signed in. So
 * anybody with nothing saved yet — which is every new account, on their very
 * first screen — was shown James's name and area as their own.
 *
 * Susan hit it on 29 Aug, minutes after redeeming her invite: "it's currently
 * showing all of my details rather than hers." The join flow lands on
 * /profile, so this was the first thing she ever saw in the OS.
 *
 * It is the snapshot mistake wearing different clothes. A placeholder that
 * looks like real data gets believed, and this one did not just show a stale
 * figure — it told a colleague she was somebody else. A default must be blank,
 * because blank is obviously nothing and a name is obviously something.
 */
const DEFAULT_PROFILE: Profile = {
  name: "",
  phone: "",
  patch: "",
  bio: "",
};

/* A hardcoded `const PLAN = "Growth"` stood here, shown to every agent as
   their package. It was a sample value on a ladder (Starter → Growth → Pro)
   that TLE does not use — the real packages are Basic, Pro and Academy, and
   they live on each person's record in the TEG Team Hub.

   So every partner was being told, confidently and in their own profile, that
   they were on a plan that does not exist. It now comes from /api/teg/me, and
   shows nothing at all when the Hub has no package for them — which is the
   honest answer for the five partners whose record is blank. */

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
  /* Their package, from the TEG Hub via the local copy. null while it loads
     and null if the Hub has none for them — the pill simply doesn't render,
     rather than inventing a tier. */
  const [pkg, setPkg] = useState<string | null>(null);
  /** Their home address as the TEG Hub holds it, offered when they have none. */
  const [hubHome, setHubHome] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/teg/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { partnerPackage?: string | null; homeAddress?: string | null } | null) => {
        if (!alive) return;
        setPkg(d?.partnerPackage ?? null);
        setHubHome(d?.homeAddress ?? null);
      })
      .catch(() => {
        /* A missing package badge must never break the profile page. */
      });
    return () => {
      alive = false;
    };
  }, []);
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  const [saved, setSaved] = useState(false);
  /** Geocoding the Hub's address after they accept it. */
  const [placing, setPlacing] = useState(false);
  const [theme, setTheme] = useState<ThemeChoice>("auto");
  const [darkBg, setDarkBg] = useState(DARK_BG_DEFAULT);
  const [darkBox, setDarkBox] = useState(DARK_BOX_DEFAULT);
  const [accent, setAccent] = useState("");
  const [connections, setConnections] = useState(CONNECTIONS);

  /* Who you are, and the accent you picked, now follow the account. Theme
     stays browser-first — it paints before React runs, and a
     round-trip would mean a flash of the wrong colour on every load. */
  const [storedProfile, storeProfile] = usePref<Profile | null>(PROFILE_KEY, null);
  const [storedAccent, storeAccent] = usePref<string>("os-accent", "");
  const prefsHome = usePrefsHome();

  /* Who is actually signed in. The page used to never ask, which is how a
     hardcoded name came to stand in for everybody who had saved nothing yet.
     The account is the base; anything they have since typed here wins over it,
     because a person editing their own name means it. */
  useEffect(() => {
    let alive = true;
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { user?: { name?: string; photo?: string | null } } | null) => {
        if (!alive || !j?.user) return;
        setProfile((p) => ({
          ...p,
          name: p.name || j.user!.name || "",
          photo: p.photo ?? j.user!.photo ?? undefined,
        }));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (storedProfile) setProfile((p) => ({ ...p, ...storedProfile }));
  }, [storedProfile]);

  useEffect(() => {
    setAccent(storedAccent ?? "");
    if (storedAccent) document.documentElement.dataset.accent = storedAccent;
  }, [storedAccent]);

  useEffect(() => {
    setTheme(readTheme() ?? "auto");
    setDarkBg(readDarkStep(DARK_BG_KEY, DARK_BG_DEFAULT));
    setDarkBox(readDarkStep(DARK_BOX_KEY, DARK_BOX_DEFAULT));
  }, []);

  function save(next: Profile) {
    setProfile(next);
    storeProfile(next);
    /* Name and photo go to the DATABASE as well as to this browser. The
       sidebar, decks and emails all read os_users — a headshot saved only
       locally is invisible everywhere but this page, and gone on a second
       machine. Fire and forget: a failed sync must not block the form. */
    void fetch("/api/profile", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: next.name, photo: next.photo ?? null }),
    }).catch(() => {});
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
    storeAccent(id);
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
              {/* The headshot: click it, pick a photo. Downscaled to 256px
                  and stored on the profile — it goes on emails and listings
                  when those are wired. */}
              <label
                className="group relative block h-20 w-20 shrink-0 cursor-pointer overflow-hidden rounded-full"
                title="Change your photo"
              >
                {profile.photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={profile.photo} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center bg-accent-soft text-[24px] font-bold text-accent-dark">
                    {initials}
                  </span>
                )}
                {/* A camera in the middle rather than a word across the
                    bottom. "Add photo" set in 8.5px across a 20px strip is a
                    label fighting for room it hasn't got; an icon says the
                    same thing and leaves the face visible. */}
                <span className="absolute inset-0 flex items-center justify-center bg-ink/45 opacity-0 transition-opacity group-hover:opacity-100">
                  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6" style={{ color: "var(--page)" }}>
                    <path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2.2l1.1-1.6A1 1 0 0 1 8.6 5h6.8a1 1 0 0 1 .8.4L17.3 7h2.2A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z" strokeLinejoin="round" />
                    <circle cx="12" cy="12.8" r="3.4" />
                  </svg>
                </span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const img = new Image();
                    img.onload = () => {
                      // 256px square crop-fit — enough for every avatar spot,
                      // small enough to live in localStorage until sign-in.
                      const c = document.createElement("canvas");
                      c.width = c.height = 256;
                      const ctx = c.getContext("2d")!;
                      const side = Math.min(img.width, img.height);
                      ctx.drawImage(
                        img,
                        (img.width - side) / 2, (img.height - side) / 2, side, side,
                        0, 0, 256, 256
                      );
                      save({ ...profile, photo: c.toDataURL("image/jpeg", 0.85) });
                      URL.revokeObjectURL(img.src);
                    };
                    img.src = URL.createObjectURL(file);
                  }}
                />
              </label>
              <div className="min-w-0">
                <p className="hand text-[20px] leading-tight">{profile.name}</p>
                <p className="mt-0.5 text-[12px] text-muted">
                  The Letting Experts · {profile.patch}
                </p>
                {/* The package, always visible — nobody should have to ask
                    what they're on. Hidden rather than guessed when the Hub
                    holds no package for them. */}
                {pkg ? (
                  <button
                    type="button"
                    onClick={() => setTab("ads")}
                    className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1 text-[11px] font-semibold text-accent-dark transition-opacity hover:opacity-80"
                    title="What your package includes"
                  >
                    <DoodleIcon name="rocket" size={12} />
                    {pkg} package
                    {pkg !== "Pro" && <span className="text-muted">· upgrade →</span>}
                  </button>
                ) : null}
              </div>
              {saved && (
                <Pill tone="good">
                  {prefsHome.signedIn ? "Saved to your account" : "Saved in this browser"}
                </Pill>
              )}
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

            {/* Home address. Stored as `base`/`baseLat`/`baseLng` rather than
                `home` — those names shipped first and somebody may already
                have saved one, and renaming a stored key silently empties the
                field for whoever did. The LABEL is what needed fixing: "where
                you usually set off from" is not a thing anybody scans a
                profile looking for. */}
            <div className="mt-5">
              <span className={label}>Home address</span>
              <AddressField
                value={profile.base ?? ""}
                onChange={(v) => save({ ...profile, base: v, baseLat: null, baseLng: null })}
                onResolved={(a) =>
                  save({ ...profile, base: a.address, baseLat: a.lat, baseLng: a.lng })
                }
              />
              <span className="mt-1 block text-[10px] leading-relaxed text-muted">
                Where you normally set off from. Used only to work out your travel time to the first
                appointment of the day, so the booker can offer you a buffer — never shown to
                landlords or tenants, and never on a deck or an email.
              </span>

              {/* What the Team Hub already holds for them, OFFERED rather than
                  written in. It is their home address: filling it in silently
                  from another system, on a screen they did not ask to have it
                  on, is not a thing to do without showing them first. One
                  click, and it geocodes so the booker can actually use it. */}
              {hubHome && !profile.base && (
                <div className="mt-2.5 rounded-xl border border-line/60 bg-panel/60 p-3">
                  <p className="text-[11.5px] leading-relaxed">
                    The Team Hub has this for you:{" "}
                    <span className="text-ink">{hubHome}</span>
                  </p>
                  <button
                    type="button"
                    disabled={placing}
                    onClick={async () => {
                      setPlacing(true);
                      try {
                        const r = await fetch(
                          `/api/address?geocode=${encodeURIComponent(hubHome)}`,
                          { cache: "no-store" }
                        );
                        const j = await r.json();
                        // Saved either way — a home address we can't place is
                        // still their address, and they can correct it.
                        save({
                          ...profile,
                          base: j.address ?? hubHome,
                          baseLat: j.lat ?? null,
                          baseLng: j.lng ?? null,
                        });
                      } catch {
                        save({ ...profile, base: hubHome, baseLat: null, baseLng: null });
                      } finally {
                        setPlacing(false);
                      }
                    }}
                    className="hand mt-2 rounded-full border border-accent-dark px-3.5 py-1.5 text-[12px] text-accent-dark transition-colors hover:bg-accent-soft/40 disabled:opacity-50"
                  >
                    {placing ? "Placing it on the map…" : "Use this address"}
                  </button>
                </div>
              )}
              {/* Typed text saves fine but has no coordinates, and a home
                  address with no coordinates is invisible to the booker while
                  looking perfectly filled in. Say so where they'll see it. */}
              {profile.base && profile.baseLat == null && (
                <span className="mt-1.5 flex items-start gap-1.5 text-[10.5px] leading-relaxed text-accent-dark">
                  <DoodleIcon name="target" size={11} className="mt-0.5 shrink-0" />
                  Pick one of the suggestions as you type so we can place it on the map. Typed text
                  on its own has no coordinates, so travel time from home stays unavailable.
                </span>
              )}
              {profile.baseLat != null && (
                <span className="mt-1.5 flex items-center gap-1.5 text-[10.5px] text-muted">
                  <DoodleIcon name="target" size={11} className="shrink-0 text-accent-dark" />
                  Placed on the map — the booker can measure your drive from here.
                </span>
              )}
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

            {/* The dark room's decorating kit — shown only once Dark is the
                choice, because that's when the question exists. Ten charcoals
                each for the background and the boxes; find the blend by eye. */}
            {theme === "dark" && (
              <>
                <p className={`${label} mt-7`}>Dark background</p>
                <div className="flex gap-1.5">
                  {CHARCOALS.map((c) => (
                    <button
                      key={c.step}
                      type="button"
                      title={`${c.step}`}
                      onClick={() => {
                        setDarkBg(c.step);
                        writeDarkStep(DARK_BG_KEY, c.step);
                      }}
                      className={`flex h-9 flex-1 flex-col items-center justify-end rounded-lg border pb-1 transition-transform hover:scale-105 ${
                        darkBg === c.step ? "border-accent-dark" : "border-ink/15"
                      }`}
                      style={{ backgroundColor: c.hex }}
                    >
                      <span className={`text-[7.5px] font-semibold ${darkBg === c.step ? "text-accent" : "text-white/50"}`}>
                        {c.step}
                      </span>
                    </button>
                  ))}
                </div>

                <p className={`${label} mt-5`}>Dark boxes</p>
                <div className="flex gap-1.5">
                  {CHARCOALS.map((c) => (
                    <button
                      key={c.step}
                      type="button"
                      title={`${c.step}`}
                      onClick={() => {
                        setDarkBox(c.step);
                        writeDarkStep(DARK_BOX_KEY, c.step);
                      }}
                      className={`flex h-9 flex-1 flex-col items-center justify-end rounded-lg border pb-1 transition-transform hover:scale-105 ${
                        darkBox === c.step ? "border-accent-dark" : "border-ink/15"
                      }`}
                      style={{ backgroundColor: c.hex }}
                    >
                      <span className={`text-[7.5px] font-semibold ${darkBox === c.step ? "text-accent" : "text-white/50"}`}>
                        {c.step}
                      </span>
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-[10.5px] leading-relaxed text-muted">
                  100 is the lightest charcoal, 1000 the deepest — never true black, the
                  ink needs its paper. Boxes usually sit a step or two lighter than the
                  background. Changes apply live.
                </p>
              </>
            )}



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
        {tab === "compliance" && <PersonalCompliance />}

        {/* ══ CONNECTIONS ══ */}
        {tab === "connections" && (
          <div className="max-w-2xl">
            <p className="mb-4 text-[12.5px] leading-relaxed text-muted">
              What your OS is plugged into. Microsoft 365 is the big one — it&apos;s what
              makes the diary yours and the emails really send.
            </p>

            {/* First, because it's the one that decides whose NAME ends up on
                the work. The others decide what the OS can do; this decides
                who it says did it. */}
            <div className="mb-5">
              <RexSignIn />
            </div>
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

        {/* ══ PORTALS — the customer-facing fronts, previewable from here. ══ */}
        {tab === "portals" && (
          <div className="max-w-2xl">
            <p className="mb-4 text-[12.5px] leading-relaxed text-muted">
              The two customer fronts of the OS — brand red, corporate type, no
              illustrations, deliberately NOT this product&apos;s look. Preview them
              exactly as a customer sees them.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              {(
                [
                  {
                    title: "Tenant portal",
                    who: "Sent with the GDPR welcome when a tenant is registered.",
                    what: "Their viewings (reschedulable), homes picked for them, offers online, guides, and the landlord-facing profile builder.",
                    href: "/tenant/welcome",
                  },
                  {
                    title: "Landlord portal",
                    who: "Sent when the terms of business come back signed.",
                    what: "The letting's progress and offers, the sitting tenant and rent, compliance certificates, upkeep approvals, documents down and up.",
                    href: "/landlord/welcome",
                  },
                ]
              ).map((c) => (
                <div key={c.title} className="rounded-2xl border border-line/70 p-5">
                  <p className="flex items-center gap-2 text-[14px] font-semibold">
                    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#e31f36] text-[9px] font-extrabold text-white">
                      TLE
                    </span>
                    {c.title}
                  </p>
                  <p className="mt-2 text-[11px] font-semibold text-accent-dark">{c.who}</p>
                  <p className="mt-1.5 text-[12px] leading-relaxed text-muted">{c.what}</p>
                  <a
                    href={c.href}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#e31f36] px-4 py-2 text-[12px] font-semibold text-white transition-opacity hover:opacity-90"
                  >
                    Open the preview →
                  </a>
                </div>
              ))}
            </div>
            <p className="mt-4 text-[10.5px] leading-relaxed text-muted">
              Both sit outside the office access code — customers get their own doors
              (magic link → password). Sign-in and per-customer data land with the
              database.
            </p>
          </div>
        )}

        {/* ══ THE WIRING — what's genuinely connected, live-checked. ══ */}
        {tab === "custom" && <CustomAttributes />}

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
