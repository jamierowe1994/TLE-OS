"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import EmailFooterSetup from "@/components/EmailFooterSetup";
import PersonalCalendar from "@/components/PersonalCalendar";
import DoodleIcon from "@/components/DoodleIcon";
import PageHeader from "@/components/PageHeader";
import CustomAttributes from "@/components/CustomAttributes";
import PersonalCompliance from "@/components/PersonalCompliance";
import Automations from "@/components/automations/Automations";
import AddressField from "@/components/AddressField";
import { PressButton } from "@/components/Bits";
import { Pill } from "@/components/Wire";
import RexSignIn from "@/components/RexSignIn";
import { usePref, usePrefsHome } from "@/lib/prefs-store";
import { PHOTO_MAX_CHARS } from "@/lib/profile-photo";
import {
  applyTheme, readTheme, writeTheme,
  CHARCOALS, DARK_BG_DEFAULT, DARK_BG_KEY, DARK_BOX_DEFAULT, DARK_BOX_KEY,
  readDarkStep, writeDarkStep,
  type ThemeChoice,
  THEME_LOCKED,
} from "@/lib/theme";
import { fetchMe, invalidateMe } from "@/lib/me";
import { useNewLook } from "@/lib/use-new-look";
import { Badge, Ico, Mast, Tabs } from "@/components/new-look/Parts";

/**
 * The profile: who this agent is, how their OS looks, what keeps THEM legal,
 * what's plugged in, and the one page that sells them something.
 *
 * Email is shown but never editable — it's the identity the whole login
 * hangs off. Everything else is theirs to write.
 */

/** In the doodle set; the pack has none. */
const LOCK_ICON = "lock";

type TabKey = "info" | "appearance" | "custom" | "automations" | "compliance" | "connections" | "ads";

const TABS: { key: TabKey; label: string }[] = [
  { key: "info", label: "Profile information" },
  { key: "appearance", label: "Appearance" },
  /* Your own fields, the filters that come with them, and the questions you
     bolt onto your tenant passports. "Custom attributes" was accurate when
     that was all it held; it is now two different kinds of custom thing, and
     the shorter word covers both without promising either. */
  { key: "custom", label: "Custom" },
  /* Their own automations, and Steve building them (lib/automations, 22 Oct 2026). */
  { key: "automations", label: "Automations" },
  { key: "compliance", label: "Personal compliance" },
  { key: "connections", label: "Connections" },
  /* "Portals" USED to be here - the customer-facing fronts. James, 9 Sep:
     an agent has no reason to look at them from their own profile. */
  { key: "ads", label: "Ads" },
  /* "The wiring" USED to be here. It has moved to /admin — James: "they don't
     need to see that, that's for my referencing and testing." An agent's own
     Connections tab stays; the environment switches are not theirs. */
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

/**
 * WHAT AN AGENT CONNECTS THEMSELVES, and nothing else.
 *
 * James, 9 Sep 2026: PayProp, GoHighLevel and DocuSign were on this list and
 * should not have been - those are wired once at business level, not per
 * person, so an agent seeing a Connect button for them is being offered a job
 * that is not theirs. Three remain, and each one is a real account of theirs:
 * their mailbox, their REX sign-in, their WhatsApp.
 *
 * These tiles used to be a wireframe whose buttons only flipped a label. They
 * now read the live answer from /api/setup, which is the same source the
 * setup wizard uses, so "Live" means live.
 */


/**
 * One connection, in the shape all three share.
 *
 * "Live" rather than "Connected", because the word has to mean the OS asked
 * just now and got an answer - not that somebody once pressed a button
 * (James, 9 Sep 2026).
 */
/**
 * "Send yourself a test." The one thing that turns a connected mailbox into a
 * mailbox somebody has watched work.
 */
function MailboxTest({ defaultTo }: { defaultTo: string }) {
  const [to, setTo] = useState(defaultTo);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null);

  async function send() {
    if (busy) return;
    setBusy(true);
    setSaid(null);
    const j = await fetch("/api/mailbox/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ to }),
    })
      .then((r) => r.json())
      .catch(() => null);
    setBusy(false);
    setSaid(j?.ok ? { ok: true, text: j.message } : { ok: false, text: j?.error ?? "That didn't send." });
  }

  return (
    <div className="rounded-2xl border border-line/70 bg-card p-4">
      <p className="text-[13px] font-semibold">Send yourself a test</p>
      <p className="mt-1 text-[12px] leading-relaxed text-muted">
        One message from your own mailbox, so you can see it arrive. Nobody else is copied.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <input
          type="email"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="you@example.com"
          className="min-w-[200px] flex-1 rounded-xl border border-line/80 bg-transparent px-3 py-2 text-[12.5px] outline-none focus:border-ink"
        />
        <button
          type="button"
          onClick={send}
          disabled={busy || !to.includes("@")}
          className="rounded-full bg-[var(--brown)] px-5 py-2 text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {busy ? "Sending…" : "Send it"}
        </button>
      </div>
      {said && (
        <p className={`mt-2.5 text-[12px] leading-relaxed ${said.ok ? "" : "text-accent-dark"}`}>{said.text}</p>
      )}
    </div>
  );
}

function ConnectionTile({
  icon, name, what, live, pending, note, onConnect, onDisconnect,
}: {
  icon: string;
  name: string;
  what: string;
  live: boolean;
  pending: boolean;
  note?: string;
  onConnect?: () => void;
  onDisconnect?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="rounded-2xl border border-line/70 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <DoodleIcon name={icon} size={18} className="shrink-0 text-accent-dark" />
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold">{name}</span>
          <span className="block text-[11px] text-muted">{what}</span>
        </span>
        {pending ? (
          <span className="text-[11px] text-muted">Checking…</span>
        ) : live ? (
          <Pill tone="good">Live</Pill>
        ) : onConnect ? null : (
          <Pill tone="neutral">Not connected</Pill>
        )}
        {!pending && live && onDisconnect && (
          <button
            type="button"
            disabled={busy}
            onClick={async () => { setBusy(true); await onDisconnect(); setBusy(false); }}
            className="text-[11px] font-semibold text-muted transition-colors hover:text-ink disabled:opacity-50"
          >
            Disconnect
          </button>
        )}
        {!pending && !live && onConnect && (
          <PressButton
            onClick={onConnect}
            className="press-ring rounded-full bg-accent-dark px-4 py-2 text-[11.5px] font-semibold text-page"
          >
            Connect
          </PressButton>
        )}
      </div>
      {note && <p className="mt-2 text-[11px] leading-relaxed text-muted">{note}</p>}
    </div>
  );
}

export default function ProfilePage() {
  const [tab, setTab] = useState<TabKey>("info");
  /* The new look (lib/new-look "settings", 23 Oct 2026). */
  const look = useNewLook("settings");
  /* ?tab=connections lands on that tab - the launch checklist's REX and
     email links (12 Oct 2026). */
  useEffect(() => {
    const want = new URLSearchParams(window.location.search).get("tab");
    if (want && TABS.some((t) => t.key === want)) setTab(want as TabKey);
  }, []);
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
  /* Whether their mailbox and REX are actually connected, asked of the
     server rather than remembered in the page. */
  const [setup, setSetup] = useState<{ emailConnected?: boolean; rexConnected?: boolean; email?: string } | null>(null);
  /** "Upgrade to Pro" used to be a dead button; it now says who does it. */
  const [askedPro, setAskedPro] = useState(false);
  const loadSetup = useCallback(() => {
    fetch("/api/setup", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setSetup(j && j.ok ? j : {}))
      .catch(() => setSetup({}));
  }, []);
  useEffect(() => { loadSetup(); }, [loadSetup]);

  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  /** The sign-in address, from the session and nowhere else. Not part of
   *  Profile: it is not theirs to edit, and a copy saved in the browser would
   *  outlive the account it came from. */
  const [email, setEmail] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  /** Geocoding the Hub's address after they accept it. */
  const [placing, setPlacing] = useState(false);
  const [theme, setTheme] = useState<ThemeChoice>("auto");
  /** Somebody pressed a locked theme: the line underneath answers them. */
  const [soon, setSoon] = useState(false);
  const [darkBg, setDarkBg] = useState(DARK_BG_DEFAULT);
  const [darkBox, setDarkBox] = useState(DARK_BOX_DEFAULT);
  /* Who you are follows the account. Theme
     stays browser-first — it paints before React runs, and a
     round-trip would mean a flash of the wrong colour on every load. */
  const [storedProfile, storeProfile] = usePref<Profile | null>(PROFILE_KEY, null);
  const prefsHome = usePrefsHome();
  /* What typing has changed but not yet saved - see save() below. */
  const pending = useRef<Profile | null>(null);
  const pendingTimer = useRef<number | null>(null);
  /** The name and photo the account last heard, so a bio edit doesn't resend them. */
  const accountHas = useRef<{ name: string; photo: string | null } | null>(null);

  /* Who is actually signed in. The page used to never ask, which is how a
     hardcoded name came to stand in for everybody who had saved nothing yet.
     The account is the base; anything they have since typed here wins over it,
     because a person editing their own name means it. */
  useEffect(() => {
    let alive = true;
    fetchMe()
      .then((j) => {
        if (!alive || !j?.user) return;
        setEmail(j.user.email ?? null);
        accountHas.current ??= { name: j.user.name ?? "", photo: j.user.photo ?? null };
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
    setTheme(readTheme() ?? "auto");
    setDarkBg(readDarkStep(DARK_BG_KEY, DARK_BG_DEFAULT));
    setDarkBox(readDarkStep(DARK_BOX_KEY, DARK_BOX_DEFAULT));
  }, []);

  /* Typing used to be a save per keystroke (21 Oct 2026): Erleta wrote her
     bio and the page sent 776 PATCHes to /api/profile in thirteen minutes,
     every one carrying her name and whole headshot, and the same again to
     /api/prefs. That fills the read log and walks towards the pace pause.
     The screen still changes at once; the account is written once typing
     stops, and /api/profile only when the name or the photo changed. */

  const flush = useCallback(() => {
    if (pendingTimer.current != null) {
      window.clearTimeout(pendingTimer.current);
      pendingTimer.current = null;
    }
    const next = pending.current;
    if (!next) return;
    pending.current = null;
    storeProfile(next);
    /* Name and photo go to the DATABASE as well as to this browser. The
       sidebar, decks and emails all read os_users — a headshot saved only
       locally is invisible everywhere but this page, and gone on a second
       machine. Fire and forget: a failed sync must not block the form. */
    const name = next.name;
    const photo = next.photo ?? null;
    const had = accountHas.current;
    if (!had || had.name !== name || had.photo !== photo) {
      accountHas.current = { name, photo };
      /* Only what changed: a renamed agent sends a few bytes, not their
         headshot again. Small enough to survive the tab closing (keepalive
         is capped at 64 KB, which a photo can pass). */
      const body = JSON.stringify({
        ...(!had || had.name !== name ? { name } : {}),
        ...(!had || had.photo !== photo ? { photo } : {}),
      });
      void fetch("/api/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body,
        keepalive: body.length < 60_000,
      })
        .then((r) => {
          if (!r.ok) accountHas.current = null; // try again on the next change
        })
        .catch(() => {
          accountHas.current = null;
        });
      /* The only thing on this machine that changes who /api/auth/me says you
         are without a page load, so it is the only thing that has to say so —
         otherwise the sidebar keeps yesterday's headshot for half a minute. */
      invalidateMe();
    }
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1600);
  }, [storeProfile]);

  /* Leaving the page or closing the tab mid-word still saves the word.
     Hidden as well as pagehide: a phone switching apps often never sends
     pagehide before the page is thrown away. */
  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onHidden);
      flush();
    };
  }, [flush]);

  /** `now` for a deliberate act (a photo, a picked address); typing waits for a pause. */
  function save(next: Profile, now = false) {
    setProfile(next);
    pending.current = next;
    if (pendingTimer.current != null) window.clearTimeout(pendingTimer.current);
    pendingTimer.current = now ? null : window.setTimeout(flush, 800);
    if (now) flush();
  }

  function pickTheme(t: ThemeChoice) {
    setTheme(t);
    writeTheme(t);
    applyTheme(t);
  }

  /** A headshot picked from disk: scaled, squeezed under the cap, saved at once. */
  function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const img = new Image();
    img.onload = () => {
      /* Up to 1200px on the long side, uncropped (17 Sep
         2026). It was a 256px square, and the landlord's
         deck shows this photo 500px wide - so on a sharp
         screen it was drawn four times its size and looked
         fuzzy. Avatars crop it themselves with object-cover. */
      const long = Math.max(img.width, img.height);
      const s = Math.min(1, 1200 / long);
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * s);
      c.height = Math.round(img.height * s);
      const ctx = c.getContext("2d")!;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, c.width, c.height);
      /* Under the server's cap. A busy 1200px photo
         can run past it at 0.86, and the server refuses it
         where nobody sees - so step the quality down until
         it fits rather than send something that bounces. */
      let photo = c.toDataURL("image/jpeg", 0.86);
      for (const quality of [0.8, 0.72, 0.64, 0.56]) {
        if (photo.length <= PHOTO_MAX_CHARS) break;
        photo = c.toDataURL("image/jpeg", quality);
      }
      save({ ...profile, photo }, true);
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(file);
  }

  /** The Team Hub's address, accepted: placed on the map so the booker can use it. */
  async function acceptHubHome() {
    if (!hubHome) return;
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
      }, true);
    } catch {
      save({ ...profile, base: hubHome, baseLat: null, baseLng: null }, true);
    } finally {
      setPlacing(false);
    }
  }

  const initials = profile.name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase() || "TLE";
  const field =
    "w-full rounded-xl border border-line/80 bg-transparent px-3.5 py-2.5 text-[13.5px] outline-none transition-colors focus:border-ink";
  const label = "mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted";

  /* ── THE NEW LOOK (lib/new-look "settings", 23 Oct 2026) ─────────────────
     The same profile, saves and tabs, drawn the new way: a type-only header,
     text tabs, the form beside how landlords see you, and each tab's own
     section in the new colours. */
  if (look === null) {
    return <p className="flex items-center gap-2 py-16 text-[12.5px] text-muted"><span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-ink" aria-hidden />Opening your profile…</p>;
  }
  if (look) {
    return (
      <div data-look="new" className="nl-page nl-rise">
        <Mast
          title="Your Profile"
          blurb="Who you are on every email and listing, how your OS looks, and the paperwork that keeps you compliant, not just the properties."
        />
        <Tabs label="Your profile" value={tab} onChange={setTab} items={TABS.map((t) => ({ id: t.key, label: t.label }))} className="mb-8" />

        <div key={tab} className="nl-pane pb-16">
          {tab === "info" && (
            <div className="nl-profile-grid">
              <div className="nl-form">
                <div className="nl-form-row">
                  <label className="nl-field">
                    <span>Name</span>
                    <input value={profile.name} onChange={(e) => save({ ...profile, name: e.target.value })} />
                  </label>
                  <div className="nl-field">
                    <span>Email</span>
                    <div className="nl-locked">
                      <Ico name="lock" size={14} />
                      <span>{email ?? "Loading…"}</span>
                    </div>
                    <small>Your sign-in. It can&apos;t be changed here.</small>
                  </div>
                </div>
                <div className="nl-form-row">
                  <label className="nl-field">
                    <span>Phone</span>
                    <input value={profile.phone} onChange={(e) => save({ ...profile, phone: e.target.value })} />
                  </label>
                  <label className="nl-field">
                    <span>Your patch</span>
                    <input value={profile.patch} onChange={(e) => save({ ...profile, patch: e.target.value })} />
                  </label>
                </div>
                <div className="nl-field">
                  <span>Home address</span>
                  <AddressField
                    value={profile.base ?? ""}
                    onChange={(v) => save({ ...profile, base: v, baseLat: null, baseLng: null })}
                    onResolved={(a) => save({ ...profile, base: a.address, baseLat: a.lat, baseLng: a.lng }, true)}
                  />
                  <small>
                    Only used to work out your drive to the first appointment of the day, so the booker can offer you a buffer. Never shown to landlords or tenants, and never on a deck or an email.
                  </small>
                  {hubHome && !profile.base && (
                    <div className="nl-card mt-1 p-4">
                      <p className="m-0 text-[13px] leading-relaxed">
                        The Team Hub has this for you: <span className="font-medium">{hubHome}</span>
                      </p>
                      <button type="button" disabled={placing} onClick={() => void acceptHubHome()} className="nl-btn nl-btn--secondary nl-btn--sm mt-3">
                        {placing ? "Placing it on the map…" : "Use this address"}
                      </button>
                    </div>
                  )}
                  {profile.base && profile.baseLat == null && (
                    <small className="text-accent-dark">
                      Pick one of the suggestions as you type so we can place it on the map. Typed text on its own has no coordinates, so travel time from home stays unavailable.
                    </small>
                  )}
                  {profile.baseLat != null && <small>Placed on the map. The booker can measure your drive from here.</small>}
                </div>
                <label className="nl-field">
                  <span>Bio</span>
                  <textarea
                    value={profile.bio}
                    onChange={(e) => save({ ...profile, bio: e.target.value })}
                    rows={4}
                    placeholder="A couple of sentences landlords and tenants will see: who you are, how long you've been letting, what you're known for."
                  />
                  <small>Shows on your listings, your emails and the landlord review pages.</small>
                </label>
                <div className="min-h-[22px]">
                  {saved && (
                    <span className="nl-saved">
                      <i /> {prefsHome.signedIn ? "Saved to your account." : "Saved in this browser."}
                    </span>
                  )}
                </div>
              </div>

              <aside className="nl-preview">
                <span className="nl-eyebrow">How landlords see you</span>
                <div className="nl-preview-card">
                  <label className="nl-photo-pick self-start" title="Change your photo">
                    <span className="nl-avatar nl-avatar--lg">
                      {profile.photo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={profile.photo} alt="" />
                      ) : (
                        initials
                      )}
                    </span>
                    <span className="nl-photo-over">
                      <Ico name="camera" size={22} />
                    </span>
                    <input type="file" accept="image/*" className="hidden" onChange={onPhoto} />
                  </label>
                  <div className="nl-preview-name">{profile.name || "Your name"}</div>
                  <div className="nl-meta">The Letting Experts{profile.patch ? ` · ${profile.patch}` : ""}</div>
                  <p className={`nl-preview-bio${profile.bio ? "" : " is-empty"}`}>{profile.bio || "Your bio will appear here as you type."}</p>
                  {profile.phone && (
                    <span className="nl-preview-contact">
                      <Ico name="phone" size={14} /> {profile.phone}
                    </span>
                  )}
                </div>
                {pkg && (
                  <button type="button" onClick={() => setTab("ads")} className="nl-link self-start" title="What your package includes">
                    {pkg} package{pkg !== "Pro" ? " · upgrade" : ""}
                  </button>
                )}
                <span className="nl-meta">Click the photo to change it.</span>
              </aside>
            </div>
          )}

          {tab === "appearance" && (
            <div className="max-w-2xl">
              <h2 className="nl-block-title">Light or Dark</h2>
              <p className="nl-meta mb-4 mt-1">
                {THEME_LOCKED ? "TLE OS is in Light for everybody for now. Dark and Auto are coming soon." : "Dark mode lives here and nowhere else. Automatic follows the clock: the screen softens from 7pm to 7am."}
              </p>
              <div className="nl-choice-row" role="radiogroup" aria-label="Theme">
                {(
                  [
                    { id: "light", label: "Light", sub: "White pages", icon: "sun" },
                    { id: "dark", label: "Dark", sub: "Charcoal, easy at night", icon: "moon" },
                    { id: "auto", label: "Automatic", sub: "Dark from 7pm to 7am", icon: "auto" },
                  ] as const
                ).map((c) => {
                  const lockedOut = THEME_LOCKED && c.id !== "light";
                  const on = THEME_LOCKED ? c.id === "light" : theme === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      aria-disabled={lockedOut}
                      onClick={() => (lockedOut ? setSoon(true) : pickTheme(c.id))}
                      className={`nl-choice${on ? " is-on" : ""}${lockedOut ? " opacity-60" : ""}`}
                    >
                      <Ico name={lockedOut ? "lock" : c.icon} size={18} />
                      <span className="font-medium">{c.label}</span>
                      <small>{lockedOut ? "Coming soon" : c.sub}</small>
                    </button>
                  );
                })}
              </div>
              {soon && THEME_LOCKED && <p className="nl-meta mt-3">Dark and Auto are coming soon. For now TLE OS is in Light for everybody.</p>}
            </div>
          )}

          {tab === "custom" && <div className="nl-holder max-w-[1100px]"><CustomAttributes /></div>}
          {tab === "automations" && <Automations look="new" />}
          {tab === "compliance" && <PersonalCompliance look="new" />}

          {tab === "connections" && (
            <div className="max-w-3xl">
              <p className="nl-blurb mt-0 mb-6 text-[16px] leading-[24px]">
                The accounts and calendars that are yours rather than the agency&apos;s. Everything else the OS talks to is connected once for the whole business, so there is nothing for you to do about it.
              </p>
              <ul className="nl-lines nl-conn">
                <li>
                  <span className="nl-conn-icon"><Ico name="mail" size={17} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="nl-strong block">Microsoft 365</span>
                    <span className="nl-meta block">Your diary and email. The calendar is yours and sends really go out.</span>
                  </span>
                  {setup === null ? (
                    <span className="nl-meta">Checking…</span>
                  ) : setup.emailConnected ? (
                    <>
                      <Badge tone="good" bare>Live</Badge>
                      <button
                        type="button"
                        className="nl-link"
                        onClick={async () => {
                          await fetch("/api/auth/microsoft/disconnect", { method: "POST" }).catch(() => null);
                          loadSetup();
                        }}
                      >
                        Disconnect
                      </button>
                    </>
                  ) : (
                    <button type="button" onClick={() => { window.location.href = "/api/auth/microsoft/start?from=profile"; }} className="nl-btn nl-btn--primary nl-btn--sm">
                      Connect
                    </button>
                  )}
                </li>
                <li>
                  <span className="nl-conn-icon"><Ico name="phone" size={17} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="nl-strong block">WhatsApp Business</span>
                    <span className="nl-meta block">Message applicants where they actually reply. Not switched on yet; when it is, you connect your own number here.</span>
                  </span>
                  <Badge tone="neutral" bare>Not connected</Badge>
                </li>
              </ul>
              <div className="nl-holder mt-6">
                {setup?.emailConnected === true && <MailboxTest defaultTo={setup?.email ?? ""} />}
                {setup?.emailConnected === true && <EmailFooterSetup mailbox={setup?.email ?? ""} />}
                <PersonalCalendar />
                <RexSignIn onChange={loadSetup} />
              </div>
            </div>
          )}

          {tab === "ads" && (
            <div className="max-w-2xl">
              <h2 className="nl-section-title">Put your homes in front of everyone scrolling</h2>
              <p className="nl-blurb">
                Pro runs Facebook and Instagram campaigns for your listings and your landlord offers: built, targeted and reported without you touching an ads manager.
              </p>
              <ul className="nl-lines my-6">
                <li>A campaign for every new listing</li>
                <li>A landlord-switch ad always running</li>
                <li>The cost per lead on your dashboard</li>
              </ul>
              <button type="button" onClick={() => setAskedPro(true)} className="nl-btn nl-btn--primary">
                Upgrade to Pro
              </button>
              {askedPro && (
                <p className="nl-cell nl-cell--manilla mt-4 text-[14px] leading-relaxed">
                  Pro sits on your licence rather than in here, so it is Susan who turns it on. Ask her and it is live on your next sign-in.
                </p>
              )}
              <p className="nl-meta mt-4">Pro sits on top of your monthly licence.</p>
            </div>
          )}
        </div>
      </div>
    );
  }

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
            {t.key === "appearance" && THEME_LOCKED && (
              <DoodleIcon name={LOCK_ICON} size={11} className="ml-1.5 -translate-y-px opacity-60" />
            )}
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
                  onChange={onPhoto}
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
                  {/* Was a hardcoded james@ (6 Oct 2026): every agent saw
                      James's address on their own profile. */}
                  <span className="truncate">{email ?? "Loading…"}</span>
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
                  save({ ...profile, base: a.address, baseLat: a.lat, baseLng: a.lng }, true)
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
                    onClick={() => void acceptHubHome()}
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
        {/* Light only for now - THEME_LOCKED in lib/theme (James, 21 Sep 2026:
            "I haven't gone through and tested every single part of it"). The
            choices stay on the page so people can see they are coming; Dark
            and Auto say so and do nothing. The full picker is the branch
            below, untouched, for the day the lock comes off. */}
        {tab === "appearance" && THEME_LOCKED && (
          <div className="max-w-md">
            <p className={label}>Theme</p>
            <div className="flex gap-2">
              <div className="flex-1 rounded-xl border border-accent-dark bg-accent-soft px-3 py-3 text-center text-[12.5px] font-medium text-accent-dark">
                Light
              </div>
              {(["Dark", "Auto"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setSoon(true)}
                  aria-disabled
                  className="flex flex-1 cursor-not-allowed flex-col items-center gap-1 rounded-xl border border-dashed border-line/80 px-3 py-2 text-[12.5px] font-medium text-muted"
                >
                  <span className="flex items-center gap-1.5">
                    <DoodleIcon name={LOCK_ICON} size={11} />
                    {t}
                  </span>
                  <span className="text-[10px] font-semibold uppercase tracking-[0.08em]">Coming soon</span>
                </button>
              ))}
            </div>
            <p className="mt-2.5 text-[11.5px] leading-relaxed text-muted">
              {soon
                ? "Dark and Auto are coming soon. For now TLE OS is in Light for everybody."
                : "TLE OS is in Light for everybody for now. Dark and Auto are coming soon."}
            </p>
          </div>
        )}

        {tab === "appearance" && !THEME_LOCKED && (
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

            {/* The adjustable charcoals went on 11 Oct 2026: dark is James's
                two colours for everyone, black #111111 round a charcoal
                #202020 page (app/globals.css). */}

            {/* The accent picker lived here until 11 Sep 2026. James: "it's not
                going to be cohesive" - the OS runs the house clay for everyone
                now, and the choice that stays is light or dark. */}
          </div>
        )}

        {/* ══ PERSONAL COMPLIANCE ══ */}
        {tab === "compliance" && <PersonalCompliance />}

        {/* ══ CONNECTIONS ══ */}
        {tab === "connections" && (
          <div className="max-w-2xl">
            <p className="mb-4 text-[12.5px] leading-relaxed text-muted">
              The accounts and calendars that are yours rather than the agency’s. Everything else the
              OS talks to is connected once for the whole business, so there is nothing for you
              to do about it.
            </p>

            <div className="space-y-2.5 pb-20 sm:pb-0">
              {/* Their mailbox and diary. Real OAuth: it hands off to Microsoft
                  and comes back, and the pill is read from the stored token. */}
              <ConnectionTile
                icon="calendar"
                name="Microsoft 365"
                what="Your diary and email - the calendar is yours and sends really go out"
                live={setup?.emailConnected === true}
                pending={setup === null}
                onConnect={() => { window.location.href = "/api/auth/microsoft/start?from=profile"; }}
                onDisconnect={async () => {
                  await fetch("/api/auth/microsoft/disconnect", { method: "POST" }).catch(() => null);
                  loadSetup();
                }}
              />

              {/* Proving it, rather than assuming it (James, 13 Sep 2026).
                  Connecting only proves Microsoft said yes; this proves a
                  message actually leaves and arrives. One fixed message to an
                  address they choose - usually their own. */}
              {setup?.emailConnected === true && <MailboxTest defaultTo={setup?.email ?? ""} />}

              {/* Their own footer, under everything the OS sends from their
                  mailbox (James, 21 Sep 2026). Only once the mailbox is
                  connected: the quick road reads it out of that mailbox. */}
              {setup?.emailConnected === true && <EmailFooterSetup mailbox={setup?.email ?? ""} />}

              {/* Their PERSONAL calendar, both ways and read only (Amrit, 14 Oct
                  2026): the OS diary out to it, its busy times in. */}
              <PersonalCalendar />

              {/* REX signs in with their own credentials, so it brings its own
                  form. Same tile shape as the other two. */}
              <RexSignIn onChange={loadSetup} />

              <ConnectionTile
                icon="message"
                name="WhatsApp Business"
                what="Message applicants where they actually reply"
                live={false}
                pending={false}
                note="Not switched on yet. When it is, this is where you will connect your own number."
              />
            </div>
          </div>
        )}

        {/* ══ THE WIRING — what's genuinely connected, live-checked. ══ */}
        {tab === "custom" && <CustomAttributes />}

        {/* ══ AUTOMATIONS ══ */}
        {tab === "automations" && <Automations />}

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

            {/* It was a button with no handler on it (found 13 Sep 2026 in the
                sweep that followed James's two). Pro is a licence change and
                the price is not ours to state, so the honest thing it can do
                is say who actually switches it on. */}
            <div className="mx-auto mt-8 flex max-w-sm flex-col items-center gap-3">
              <PressButton
                onClick={() => setAskedPro(true)}
                className="press-ring press-wobble w-full rounded-full bg-accent-dark px-8 py-3.5 text-[14px] font-semibold text-page"
              >
                Upgrade to Pro — unlock Ads
              </PressButton>
              {askedPro && (
                <p className="fade-up rounded-xl border border-line/70 bg-card px-4 py-3 text-center text-[12px] leading-relaxed">
                  Pro sits on your licence rather than in here, so it is Susan who turns it on.
                  Ask her and it is live on your next sign-in.
                </p>
              )}
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
