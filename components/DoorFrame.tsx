import "@/app/door.css";
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
 * (13 Sep 2026); it is now one photograph from the website's own set filling
 * the screen, wearing the website's house grade, with the words set in the
 * website's type and the form drawn straight on the picture - no box (the
 * first version put it on a linen card, and James: "the box sitting in the
 * middle of it seems a bit weird"). Everything that does the work of the look
 * is in app/door.css, scoped to .door.
 *
 * The art prop keeps its old names so no door had to change which one it
 * asked for; each now names a photograph:
 *
 *   street    the candle-lit sofa - signing in (the warmest picture we have)
 *   house     rain on the window - a forgotten password, a check on who you are
 *   desk      the coral front door - joining
 *   building  the village street - the office code
 *
 * Each photograph says where its point of interest is (fx, fy, as a percent
 * of the picture) and where on the screen that should sit (tx, ty); the
 * sofa's candle (gx, gy) is the one that moves.
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
  /** A flame, as a percent of the picture. */
  glow?: { x: number; y: number };
  title: [string, string];
  line: string;
}

const SCENE: Record<Art, Scene> = {
  street: {
    src: "/brand/art/door-sofa.webp",
    ar: 2000 / 1333,
    fx: 67,
    fy: 58,
    tx: 72,
    ty: 58,
    mx: 74,
    my: 24,
    glow: { x: 67.2, y: 57.8 },
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
  children,
}: {
  art?: Art;
  /** Two lines, as the website breaks its headings. */
  title?: [string, string];
  line?: string;
  eyebrow?: string;
  /** A quiet aside under the card, on the picture. */
  note?: React.ReactNode;
  children: React.ReactNode;
}) {
  const s = SCENE[art];
  const t = title ?? s.title;
  return (
    <main className="door os-type" data-art={art}>
      <div className="door-stage" aria-hidden>
        <div
          className="door-cover"
          style={
            {
              "--ar": s.ar,
              "--fx": s.fx,
              "--fy": s.fy,
              "--tx-d": s.tx,
              "--ty-d": s.ty,
              "--tx-m": s.mx,
              "--ty-m": s.my,
            } as React.CSSProperties
          }
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="door-photo" src={s.src} alt="" decoding="async" fetchPriority="high" />
          {s.glow && <span className="door-glow" style={{ "--gx": s.glow.x, "--gy": s.glow.y } as React.CSSProperties} />}
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
        <span className="door-cap">The Letting Experts</span>
        <DoorStamp />
      </footer>
    </main>
  );
}
