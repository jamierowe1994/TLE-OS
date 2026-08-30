"use client";

import { useEffect, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import AssistantCharacter, { type Mood } from "@/components/AssistantCharacter";
import { FRONT, BACK, type NavItem } from "@/lib/nav";

/**
 * A stand-in OS for the shareable onboarding preview.
 *
 * ── Why a mock and not the real Shell ─────────────────────────────────────
 *
 * The tour points at rail items and at Steve, so it needs something with
 * those anchors on it. The real Shell would fetch /api/auth/me, render links
 * into pages that are behind the login wall, and show whatever the signed-out
 * state of the dashboard happens to be. This page is going to somebody
 * outside the company, so it does none of that: no fetches, no navigation,
 * no real figures, nothing that can be clicked through to the OS.
 *
 * The rail is built from lib/nav.ts rather than a hand-typed list, so a screen
 * renamed or reordered in the product is renamed and reordered here too. That
 * is the one thing worth sharing between the mock and the real thing - the
 * copy on the tour cards refers to these items by name, and a demonstration
 * that has drifted is worse than none.
 *
 * ── The figures ───────────────────────────────────────────────────────────
 *
 * Invented, round, and labelled "Sample" on the screen. Deliberately not the
 * dashboard's own demo data, which is realistic enough to be mistaken for
 * somebody's actual book - and this is a link that gets forwarded.
 */

const TILES = [
  { label: "Active leads", value: "14", note: "9 tenant, 5 landlord" },
  { label: "Viewings this week", value: "24", note: "6 today" },
  { label: "Applications", value: "6", note: "2 referencing" },
  { label: "Compliance", value: "93%", note: "3 certificates due" },
];

const DIARY = [
  { at: "10:15", what: "Viewing", where: "12 Elm Gardens" },
  { at: "13:00", what: "Market appraisal", where: "9 Granby Road" },
  { at: "15:30", what: "Viewing", where: "41 Harewood Road" },
];

function Rail({ item }: { item: NavItem }) {
  return (
    <span
      data-nav={item.href}
      className="hand flex items-center rounded-xl px-3 py-2.5 text-[13.5px] text-muted"
    >
      <DoodleIcon name={item.icon} size={17} className="shrink-0 text-muted" />
      <span className="ml-3 whitespace-nowrap">{item.label}</span>
    </span>
  );
}

/**
 * Steve, as a picture.
 *
 * He listens to the same `os-help-dock` events the real dock does and runs
 * the same performance, so the last three steps of the tour look exactly as
 * they do in the product - but he cannot be typed at and nothing he shows is
 * connected to anything.
 */
function PreviewDock() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"help" | "guides" | "feedback">("help");
  const [mood, setMood] = useState<Mood>("idle");
  const [performing, setPerforming] = useState(false);

  useEffect(() => {
    let show: number[] = [];
    const stop = () => {
      show.forEach(clearTimeout);
      show = [];
    };

    const onCommand = (e: Event) => {
      const d = (e as CustomEvent).detail as {
        open?: boolean;
        tab?: "help" | "guides" | "feedback";
        perform?: boolean;
      };
      if (d?.tab) setTab(d.tab);
      if (d?.open !== undefined) setOpen(d.open);

      stop();
      if (!d?.perform) {
        setPerforming(false);
        if (d?.open === false) setMood("idle");
        return;
      }
      setPerforming(true);
      setMood("wave");
      show.push(window.setTimeout(() => setMood("flex"), 4200));
      show.push(
        window.setTimeout(() => {
          setPerforming(false);
          setMood("idle");
        }, 8600)
      );
      show.push(window.setTimeout(() => setMood("texting"), 26000));
      show.push(window.setTimeout(() => setMood("asleep"), 44000));
    };

    window.addEventListener("os-help-dock", onCommand);
    return () => {
      stop();
      window.removeEventListener("os-help-dock", onCommand);
    };
  }, []);

  const pill = (on: boolean) =>
    `rounded-full px-2.5 py-1 text-[11px] ${
      on ? "bg-accent-soft text-accent-dark" : "text-muted"
    }`;

  return (
    <>
      <span
        data-os-steve
        className="fixed bottom-2 right-3 z-[190] block text-ink"
        aria-hidden
      >
        <AssistantCharacter mood={mood} size={76} loop={performing} track={false} />
      </span>

      {open && (
        <div
          data-os-steve-bubble
          className="fade-up fixed bottom-[104px] right-[68px] z-[190] w-[min(340px,calc(100vw-2.5rem))]"
        >
          <div className="relative rounded-[22px] border border-line/80 bg-panel p-4 shadow-[0_20px_50px_-16px_rgba(0,0,0,0.4)]">
            <span className="absolute -bottom-[9px] right-9 h-4 w-4 rotate-45 border-b border-r border-line/80 bg-panel" />
            <span className="absolute -bottom-[1px] right-9 h-4 w-4 rotate-45 bg-panel" />
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={pill(tab === "help")}>Need help?</span>
              <span className={pill(tab === "guides")}>Guides</span>
              <span data-os-feedback className={pill(tab === "feedback")}>
                Give feedback
              </span>
            </div>
            <div className="mt-3 text-[12px] leading-relaxed text-muted">
              {tab === "help" && "Ask me anything about a property, a tenancy or where something lives."}
              {tab === "guides" && "Written walkthroughs, as each part of the system lands."}
              {tab === "feedback" && "Broken, confusing, or an idea. It sends a picture of this screen with it."}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function PreviewShell() {
  const [profileOpen, setProfileOpen] = useState(false);

  /* The tour asks the rail to open the profile panel, exactly as it does in
     the product. Nothing else here reacts to anything. */
  useEffect(() => {
    const onShell = (e: Event) => {
      const d = (e as CustomEvent).detail as { profile?: boolean };
      if (d?.profile !== undefined) setProfileOpen(d.profile);
    };
    window.addEventListener("os-shell", onShell);
    return () => window.removeEventListener("os-shell", onShell);
  }, []);

  return (
    <div className="flex min-h-screen">
      <aside
        data-os-sidebar
        className="sticky top-3 mb-3 ml-3 mt-3 hidden h-[calc(100vh-24px)] w-60 shrink-0 flex-col overflow-hidden rounded-3xl border border-line/80 bg-panel px-4 py-5 lg:flex"
      >
        <div className="flex items-center px-1">
          <img src="/brand/house.png" alt="" aria-hidden className="art h-10 w-10 shrink-0 object-contain" />
          <div className="hand ml-2 text-xl leading-none">TLE OS</div>
        </div>
        <div className="mt-4 border-t border-line/70" />

        <nav className="mt-4 flex flex-col gap-1">
          {FRONT.map((i) => <Rail key={i.href} item={i} />)}
          <div className="mb-1 mt-3 border-t border-line/70 pt-3">
            <p className="px-3 text-[9px] font-bold uppercase tracking-[0.14em] text-muted/70">
              Back office
            </p>
          </div>
          {BACK.map((i) => <Rail key={i.href} item={i} />)}
        </nav>

        <div className="mt-auto">
          {profileOpen && (
            <div className="fade-up mb-2 rounded-2xl border border-line/80 bg-panel p-3">
              <span className="mb-2 flex items-center gap-2 rounded-lg border border-line/70 px-2.5 py-2 text-[12px] font-semibold">
                <DoodleIcon name="user" size={14} className="text-accent-dark" />
                Your profile
                <span className="ml-auto text-muted">→</span>
              </span>
              <span className="flex items-center gap-2 px-1 py-1.5 text-xs font-semibold text-muted">
                <DoodleIcon name="logout" size={14} className="text-muted" />
                Sign out
              </span>
            </div>
          )}
          <span data-os-profile className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[11px] font-bold text-accent-dark">
              AB
            </span>
            <span className="min-w-0 flex-1">
              <span className="hand block truncate text-[13px]">A new agent</span>
              <span className="block truncate text-[10px] text-muted">Sample account</span>
            </span>
            <span className="text-muted">▾</span>
          </span>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <main className="w-full flex-1 px-5 py-8 lg:px-10">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="hand text-[26px] leading-tight">Good morning, Alex</h1>
            <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent-dark">
              Sample
            </span>
          </div>
          <p className="mt-1 text-[12.5px] text-muted">
            Every figure on this page is invented. It is here to show the shape of
            the screen, not anybody&apos;s book.
          </p>

          <div className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {TILES.map((t) => (
              <div key={t.label} className="rounded-2xl border border-line/80 bg-panel p-4">
                <p className="text-[9.5px] font-bold uppercase tracking-wider text-muted">{t.label}</p>
                <p className="figures mt-1.5 text-[26px] leading-none">{t.value}</p>
                <p className="mt-1.5 text-[11px] text-muted">{t.note}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <section className="rounded-2xl border border-line/80 bg-panel p-5">
              <p className="text-[9.5px] font-bold uppercase tracking-wider text-muted">Today</p>
              <ul className="mt-3 flex flex-col gap-2.5">
                {DIARY.map((d) => (
                  <li key={d.at} className="flex items-baseline gap-3 text-[12.5px]">
                    <span className="figures w-11 shrink-0 text-muted">{d.at}</span>
                    <span className="min-w-0">
                      {d.what}
                      <span className="text-muted"> - {d.where}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
            <section className="rounded-2xl border border-line/80 bg-panel p-5">
              <p className="text-[9.5px] font-bold uppercase tracking-wider text-muted">
                Needs attention
              </p>
              <ul className="mt-3 flex flex-col gap-2.5 text-[12.5px]">
                <li>3 leads uncontacted for over 24 hours</li>
                <li>Gas certificate expires in 12 days</li>
                <li>Referencing stalled 6 days</li>
              </ul>
            </section>
          </div>
        </main>
      </div>

      <PreviewDock />
    </div>
  );
}
