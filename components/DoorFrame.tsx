import "@/app/door.css";
import DoorLife from "@/components/DoorLife";
import DoorStamp from "@/components/DoorStamp";
import Wordmark from "@/components/Wordmark";

/**
 * The frame every door wears: sign in, joining, a forgotten password, the
 * office code.
 *
 * Rebuilt 9 Nov 2026 (James: "a really warm and inviting sign-in page ... I
 * want the page to feel cinematic and dramatic whilst still keeping on theme
 * ... a little bit retro, a little bit moody ... the same colour grading
 * that we've got for the website"). It was a card with a painting beside it
 * (13 Sep 2026); it is now one photograph filling the screen, wearing the
 * website's house grade, with the words set in the website's type and the
 * form drawn straight on the picture - no box (the first version put it on a
 * linen card, and James: "the box sitting in the middle of it seems a bit
 * weird"). Everything that does the work of the look is in app/door.css,
 * scoped to .door.
 *
 * Remade the same evening (James: "remake the entry screen ... fairly
 * dramatic and interesting ... this kind of retro/cinematic entrance screen
 * ... add any animations you want. I don't want it to be overdone. I want it
 * to look clean."). Signing in is now the opening shot of a film: the house
 * at dusk through its open gate, the front door ajar and lit. The picture
 * fades up from black as it pulls into focus, the letterbox bars close in,
 * the camera pushes slowly towards the door, and the still is alive (mist,
 * lamplight: components/DoorLife). The bottom bar carries each door's
 * slugline, the way a screenplay names a scene. On a good sign-in the light
 * from the doorway opens over the screen while the OS loads.
 *
 * The art prop keeps its old names so no door had to change which one it
 * asked for; each now names a photograph:
 *
 *   street    the house at dusk, the door ajar - signing in
 *   house     rain on the window - a forgotten password, a check on who you are
 *   desk      the coral front door - joining
 *   building  the village street - the office code
 *
 * Each photograph says where its point of interest is (fx, fy, as a percent
 * of the picture) and where on the screen that should sit (tx, ty). A phone
 * held upright can have its own upright photograph (tall).
 */

type Art = "street" | "desk" | "house" | "building";

interface Scene {
  src: string;
  /** The photograph's own width over height. */
  ar: number;
  fx: number;
  fy: number;
  /** Where on the screen the point of interest sits: on a desktop (tx, ty) and on a phone or tablet (mx, my). */
  tx: number;
  ty: number;
  mx: number;
  my: number;
  /**
   * The same scene framed upright, for a phone or tablet held upright. `rise`
   * is how much taller than the screen it is held, so the point of interest
   * can sit above the middle (a picture that only just covers cannot move);
   * x and y are where on the screen that point sits.
   */
  tall?: { src: string; ar: number; fx: number; fy: number; rise: number; x: number; y: number };
  /** A few seconds of the still, alive: desktop only, laid over it once it plays. */
  film?: string;
  /** A lamp is lit at the point of interest, and breathes. */
  glow?: boolean;
  /** The scene, as a screenplay names one. */
  slug: string;
  title: [string, string];
  line: string;
}

const SCENE: Record<Art, Scene> = {
  street: {
    src: "/brand/art/door-gate.webp",
    ar: 2560 / 1440,
    fx: 74.5,
    fy: 48,
    tx: 75,
    ty: 50,
    mx: 84,
    my: 48,
    tall: { src: "/brand/art/door-gate-tall.webp", ar: 1536 / 2752, fx: 72, fy: 48, rise: 1.4, x: 80, y: 24 },
    film: "/brand/art/door-gate-loop.mp4",
    glow: true,
    slug: "Ext. Home - Dusk",
    title: ["Welcome", "Home."],
    line: "Your day, ready when you are.",
  },
  house: {
    src: "/brand/art/door-rain.webp",
    ar: 1920 / 1080,
    fx: 50,
    fy: 50,
    tx: 50,
    ty: 50,
    mx: 50,
    my: 50,
    slug: "Int. Window - Rain",
    title: ["No", "Worries."],
    line: "We'll get you back in.",
  },
  desk: {
    src: "/brand/art/door-front-door.webp",
    ar: 1280 / 1920,
    fx: 38,
    fy: 36,
    tx: 70,
    ty: 42,
    mx: 62,
    my: 30,
    slug: "Ext. Front Door - Day",
    title: ["Come", "On In."],
    line: "Let's get you set up.",
  },
  building: {
    src: "/brand/art/door-village.webp",
    ar: 1800 / 1350,
    fx: 52,
    fy: 58,
    tx: 70,
    ty: 56,
    mx: 60,
    my: 36,
    slug: "Ext. Village - Day",
    title: ["Mind", "The Door."],
    line: "A quick word, then you're in.",
  },
};

export default function DoorFrame({
  art = "street",
  title,
  line,
  eyebrow = "The Letting Experts",
  note,
  open = false,
  children,
}: {
  art?: Art;
  /** Two lines, as the website breaks its headings. */
  title?: [string, string];
  line?: string;
  eyebrow?: string;
  /** A quiet aside under the card, on the picture. */
  note?: React.ReactNode;
  /** They are in: the light from the picture opens over the screen while the next page loads. Never waited on. */
  open?: boolean;
  children: React.ReactNode;
}) {
  const s = SCENE[art];
  const t = title ?? s.title;
  return (
    <main className="door os-type" data-art={art} data-open={open ? "" : undefined}>
      <div className="door-stage" aria-hidden>
        <div
          className="door-cover"
          data-tall={s.tall ? "" : undefined}
          style={
            {
              "--ar-w": s.ar,
              "--fx-w": s.fx,
              "--fy-w": s.fy,
              "--ar-t": s.tall?.ar ?? s.ar,
              "--fx-t": s.tall?.fx ?? s.fx,
              "--fy-t": s.tall?.fy ?? s.fy,
              "--zh-t": s.tall?.rise ?? 1,
              "--tx-t": s.tall?.x ?? s.mx,
              "--ty-t": s.tall?.y ?? s.my,
              "--tx-d": s.tx,
              "--ty-d": s.ty,
              "--tx-m": s.mx,
              "--ty-m": s.my,
            } as React.CSSProperties
          }
        >
          <picture>
            {s.tall && <source media="(max-width: 1023px) and (orientation: portrait)" srcSet={s.tall.src} />}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="door-photo" src={s.src} alt="" decoding="async" fetchPriority="high" />
          </picture>
          <DoorLife film={s.film} />
          {s.glow && <span className="door-glow" />}
          <span className="door-bloom" />
        </div>
        <span className="door-warm" />
        <span className="door-shade" />
        <span className="door-leak" />
        <span className="door-dust" />
        <span className="door-vignette" />
        <span className="door-grain" />
      </div>

      <header className="door-bar door-bar-top">
        <Wordmark size={24} />
      </header>

      <div className="door-wrap">
        <div className="door-col">
          <div className="door-copy">
            <p className="door-k">{eyebrow}</p>
            {/* Decorative: the form's own heading is the page's heading. */}
            <p className="door-title" aria-hidden="true">
              <span className="door-ln">
                <span>{t[0]}</span>
              </span>
              <span className="door-ln d2">
                <span>{t[1]}</span>
              </span>
            </p>
            <span className="door-rule" aria-hidden />
            <p className="door-line">{line ?? s.line}</p>
          </div>
          <section className="door-panel">{children}</section>
          {note && <p className="door-note">{note}</p>}
        </div>
      </div>

      <footer className="door-bar door-bar-bottom">
        <span className="door-cap">{s.slug}</span>
        <DoorStamp />
      </footer>

      {/* Only ever seen if the next page is slow to arrive: the light has opened and something is still coming. */}
      {open && (
        <p className="door-opening" role="status">
          <span className="door-spin" aria-hidden />
          Opening Up
        </p>
      )}
    </main>
  );
}
