"use client";

import { fetchMe } from "@/lib/me";
import { entranceSoundOn, markSteveEntranceSeen, pickSteveEntrance, steveEntranceSrc } from "@/lib/entrance-steve";

import { useEffect, useMemo, useRef, useState } from "react";
import { useNewLook } from "@/lib/use-new-look";

/**
 * The load-in moment.
 *
 * It used to play a video, which meant one fixed clip, a download before
 * anyone saw anything, and a greeting that was identical every single time.
 * Now it's a drawing and a line of type: a different illustration on each
 * visit, so the OS feels like it has more than one mood, and nothing to wait
 * for because the art is already in the app.
 *
 * Short on purpose. A splash screen is a greeting, not a toll gate — it holds
 * for a beat and a half, and any click, key or scroll goes straight through.
 * Reduced motion skips it entirely, and it only shows once per session.
 *
 * The new look (lib/new-look "entrance", James, 26 Oct 2026): no painting.
 * The name letters in one by one, a short coral line draws under it, and it
 * lifts away as the page underneath pops in. Still once a visit - a refresh
 * never plays it again. (A hand-drawn cursive line was tried first and
 * dropped the same day.)
 */


/** James's own paintings (13 Sep 2026), not the stock line drawings. */
const ART = [
  "/brand/art/sign-in-real.webp",
  "/brand/art/lead-house.webp",
  "/brand/art/lead-building.webp",
  "/brand/art/appraisal-house.webp",
];

/** A line under the title, drawn from the same shuffle so it varies too. */
const LINES = [
  "Everything in one place.",
  "Let's get on with it.",
  "The day, ready when you are.",
  "Your book, live.",
  "Right then.",
];

export default function IntroGate({ children }: { children: React.ReactNode }) {
  const [show, setShow] = useState(false);
  const [fading, setFading] = useState(false);
  const done = useRef(false);
  const filmLook = useNewLook("entrance");
  const steveLook = useNewLook("entrancesteve");
  /* Steve's entrance needs a screen wide enough to hold the whole name; a
     narrow window, or a clip that will not play, falls back to Entrance. */
  const [steveOut, setSteveOut] = useState(false);
  const steve = steveLook === true && !steveOut;
  const steveCannot = useMemo(() => () => setSteveOut(true), []);
  const look = steveLook === null ? null : steve ? true : filmLook;

  /* Picked once per mount, and NOT during render on the server: the server
     and the browser would choose different pictures and React would keep the
     server's, so the shuffle would look broken about half the time. */
  const [pick, setPick] = useState<{ art: string; line: string } | null>(null);

  useEffect(() => {
    /* ?entrance=again plays it once more, to look at it. */
    if (new URLSearchParams(window.location.search).get("entrance") === "again") sessionStorage.removeItem("os-intro-seen");
    if (
      sessionStorage.getItem("os-intro-seen") ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    setPick({
      art: ART[Math.floor(Math.random() * ART.length)],
      line: LINES[Math.floor(Math.random() * LINES.length)],
    });
    setShow(true);
  }, []);

  const dismiss = useMemo(
    () => () => {
      if (done.current) return;
      done.current = true;
      sessionStorage.setItem("os-intro-seen", "1");
      setFading(true);
      /* The page underneath pops in as the cover fades (app/globals.css). */
      const root = document.documentElement;
      root.dataset.entrance = "pop";
      window.setTimeout(() => setShow(false), 900);
      window.setTimeout(() => { if (root.dataset.entrance === "pop") delete root.dataset.entrance; }, 1800);
    },
    []
  );

  /* It leaves on its own, and on any sign of impatience. */
  useEffect(() => {
    /* The new look leaves when its name has landed (EntranceMark says when). */
    if (!show || look !== false) return;
    const t = window.setTimeout(dismiss, 2100);
    const go = () => dismiss();
    window.addEventListener("keydown", go);
    window.addEventListener("wheel", go, { passive: true });
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", go);
      window.removeEventListener("wheel", go);
    };
  }, [show, dismiss, look]);

  /* Any key or scroll goes straight through the new one too. */
  useEffect(() => {
    if (!show || look !== true) return;
    const go = () => dismiss();
    window.addEventListener("keydown", go);
    window.addEventListener("wheel", go, { passive: true });
    return () => {
      window.removeEventListener("keydown", go);
      window.removeEventListener("wheel", go);
    };
  }, [show, dismiss, look]);

  return (
    <>
      {children}
      {/* Until the switch has answered, a plain cover, so neither the page
          nor the wrong entrance flashes. */}
      {show && look !== false && (
        <div
          onClick={dismiss}
          className={look === true ? `ent-cover${fading ? " is-leaving" : ""}` : `fixed inset-0 z-[250] cursor-pointer bg-page transition-opacity duration-700 ${fading ? "pointer-events-none opacity-0" : "opacity-100"}`}
        >
          <h1 className="sr-only">Welcome to TLE OS</h1>
          {look === true && (steve ? <EntranceSteve onDone={dismiss} onCannot={steveCannot} leaving={fading} /> : <EntranceFilm onDone={dismiss} />)}
          <button
            type="button"
            onClick={dismiss}
            className={look === true ? "ent-skip" : "absolute bottom-8 right-8 text-xs font-semibold text-muted transition-colors hover:text-ink"}
          >
            Skip
          </button>
        </div>
      )}
      {show && look === false && pick && (
        <div
          onClick={dismiss}
          className={`os-type fixed inset-0 z-[100] flex cursor-pointer flex-col items-center justify-center gap-7 bg-page px-6 transition-opacity duration-700 ${
            fading ? "pointer-events-none opacity-0" : "opacity-100"
          }`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={pick.art}
            alt=""
            aria-hidden
            className="intro-rise h-[clamp(180px,36vh,340px)] w-auto max-w-[min(90vw,620px)] rounded-[24px] object-contain"
          />
          <div className="intro-rise-late text-center">
            <h1 className="leading-none">
              <span className="sr-only">Welcome to TLE OS</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/tle-os-logo.png" alt="" aria-hidden className="art-light mx-auto h-auto w-[clamp(180px,22vw,240px)]" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/tle-os-logo-dark.png" alt="" aria-hidden className="art-dark mx-auto h-auto w-[clamp(180px,22vw,240px)]" />
            </h1>
            <p className="mt-3 text-[13px] text-muted">{pick.line}</p>
          </div>

          <button
            type="button"
            onClick={dismiss}
            className="absolute bottom-8 right-8 text-xs font-semibold text-muted transition-colors hover:text-ink"
          >
            Skip →
          </button>
        </div>
      )}
    </>
  );
}

/** The name, a letter at a time, the coral line under it, then onDone. */
function EntranceMark({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const t = window.setTimeout(onDone, 1700);
    return () => window.clearTimeout(t);
  }, [onDone]);
  const letters = ["T", "L", "E", " ", "O", "S"];
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-5" aria-hidden>
      <div className="entrance-mark">
        {letters.map((c, i) => (
          <span key={i} className={i > 3 ? "is-os" : undefined} style={{ animationDelay: `${i * 70}ms` }}>{c === " " ? "\u00a0" : c}</span>
        ))}
      </div>
      <i className="entrance-rule" />
    </div>
  );
}

/**
 * THE ENTRANCE, IN THE WEBSITE'S LANGUAGE (James, 8 Nov 2026: "warm and
 * authentic ... something that feels different as they're going in").
 *
 * About four seconds, any key, scroll or click goes straight in:
 *   1. On linen, "Good morning, James" rises in the condensed capitals.
 *   2. The two lines spring apart and a window pops open in the gap on a
 *      quick run of real moments (James, 8 Nov: "a different video ... a
 *      little bit more lively"): a girl in a moving box, a kitten, a
 *      birthday, then a family photo in the garden.
 *   3. The window grows past the words to fill the screen, turning them
 *      white, and they snap back together with today's date under them.
 *   4. The whole cover lifts like a blind and the OS comes up underneath.
 * The film is public/entrance/home.mp4, four shots cut from the website's
 * fireside.mp4. It waits to play until the window opens, so the first shot
 * is seen from its start.
 */
function EntranceFilm({ onDone }: { onDone: () => void }) {
  const [first, setFirst] = useState<string | null>(null);
  const film = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    let live = true;
    void fetchMe().then((m) => {
      const n = (m?.actor?.name || m?.user?.name || "").trim().split(/\s+/)[0];
      if (live && n) setFirst(n);
    }).catch(() => undefined);
    const t = window.setTimeout(onDone, 4400);
    const play = window.setTimeout(() => { void film.current?.play().catch(() => undefined); }, 900);
    return () => {
      live = false;
      window.clearTimeout(t);
      window.clearTimeout(play);
    };
  }, [onDone]);
  const h = new Date().getHours();
  const part = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  return (
    <div className="ent" aria-hidden>
      <div className="ent-window">
        <video ref={film} className="ent-film" src="/entrance/home.mp4" poster="/entrance/home.jpg" muted playsInline preload="auto" />
        <span className="ent-tint" />
      </div>
      <div className="ent-words">
        <p className="ent-eyebrow"><span>The Letting Experts</span></p>
        <h2 className="ent-hello">
          <span className="ent-line"><span>{part},</span></span>
          <span className="ent-line"><span>{first ?? "welcome back"}</span></span>
        </h2>
        <i className="ent-rule" />
        <p className="ent-date"><span>{today}</span></p>
      </div>
    </div>
  );
}

/**
 * STEVE'S ENTRANCE (James, 21 Nov 2026: "very unique and playful, with a bit
 * of sound that is fun ... when people sign in, they know it's purpose-built").
 *
 * A three second film made in Blender (public/entrance/steve-N.mp4, four
 * versions): the letters TLE OS drop onto linen, one lands crooked, Steve
 * rolls in, hops up and knocks it straight, looks at you, then jumps out of
 * the top - and the cover lifts with him. The film fills the screen whatever
 * its shape; the greeting is real type over it, so the name is the person's.
 *
 * Sound: browsers only allow it once the person has clicked on the site, so
 * it is tried with sound and played silent if that is refused. Profile >
 * Appearance turns it off for good on this computer.
 */
function EntranceSteve({ onDone, onCannot, leaving }: { onDone: () => void; onCannot: () => void; leaving: boolean }) {
  const [first, setFirst] = useState<string | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const film = useRef<HTMLVideoElement | null>(null);
  const left = useRef(false);

  useEffect(() => {
    /* The name is under half the film's width; a window much taller than it is wide would cut Steve off. */
    if (window.innerWidth / Math.max(1, window.innerHeight) < 1.25) { onCannot(); return; }
    setSrc(steveEntranceSrc(pickSteveEntrance()));
    let live = true;
    void fetchMe().then((m) => {
      const n = (m?.actor?.name || m?.user?.name || "").trim().split(/\s+/)[0];
      if (live && n) setFirst(n);
    }).catch(() => undefined);
    return () => { live = false; };
  }, [onCannot]);

  useEffect(() => {
    const v = film.current;
    if (!v || !src) return;
    let raf = 0;
    /* Sound that is allowed but cannot start (no speakers, a tab kept quiet)
       holds the picture at its first frame: carry on without it. */
    const stuck = window.setTimeout(() => { if (!v.muted && v.currentTime < 0.03) v.muted = true; }, 350);
    /* If it has not started in a second and a half, do not make anyone wait for a cartoon. */
    const late = window.setTimeout(() => { if (v.currentTime < 0.05) onCannot(); }, 1500);
    const go = () => {
      if (left.current) return;
      left.current = true;
      markSteveEntranceSeen();
      onDone();
    };
    /* He leaves the ground at 2.62s: the cover goes up with him. Watched
       every frame, and on the film's own clock too, because a tab in the
       background gets no frames. */
    const check = () => { if (v.currentTime >= 2.6) go(); };
    const tick = () => {
      check();
      if (!left.current) raf = window.requestAnimationFrame(tick);
    };
    const start = async () => {
      v.muted = !entranceSoundOn();
      v.volume = 0.6;
      try {
        await v.play();
      } catch {
        v.muted = true;
        try { await v.play(); } catch { onCannot(); return; }
      }
      raf = window.requestAnimationFrame(tick);
    };
    void start();
    v.addEventListener("ended", go);
    v.addEventListener("timeupdate", check);
    v.addEventListener("error", onCannot);
    return () => {
      window.clearTimeout(stuck);
      window.clearTimeout(late);
      window.cancelAnimationFrame(raf);
      v.removeEventListener("ended", go);
      v.removeEventListener("timeupdate", check);
      v.removeEventListener("error", onCannot);
    };
  }, [src, onDone, onCannot]);

  /* Skipped: it should not carry on making a noise behind the page. */
  useEffect(() => {
    if (!leaving || left.current) return;
    left.current = true;
    const v = film.current;
    if (v) { v.muted = true; v.pause(); }
  }, [leaving]);

  const h = new Date().getHours();
  const part = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  return (
    <div className="ents" aria-hidden>
      <div className="ents-stage">
        {src && <video ref={film} className="ents-film" src={src} playsInline preload="auto" />}
        <p className="ents-hello"><span>{part}{first ? `, ${first}` : ""}</span></p>
      </div>
    </div>
  );
}
