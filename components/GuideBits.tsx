import DoodleIcon from "@/components/DoodleIcon";

/**
 * The furniture a written guide is made of.
 *
 * Server components, all of them - a guide is prose and pictures and has no
 * business shipping JavaScript to read.
 *
 * ── Why the pictures carry their own size ─────────────────────────────────
 *
 * Every <Shot/> declares its real width and height. Without them the text
 * below an image jumps down the moment each one decodes, and a guide is read
 * top to bottom, so the reader is always looking exactly where the jump
 * happens. `w-full h-auto` still scales them; the attributes only tell the
 * browser the shape in advance so it can hold the space.
 */

export function Step({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="fade-up mt-9 border-t border-line/70 pt-7">
      <div className="flex items-baseline gap-3">
        <span className="figures shrink-0 text-[12px] font-semibold text-accent-dark">
          {String(n).padStart(2, "0")}
        </span>
        <h2 className="hand text-[19px] leading-snug">{title}</h2>
      </div>
      {/* Two widths, on purpose. Prose is capped at 62 characters because
          that is where a line stops being comfortable to read; the pictures
          are not, because a screenshot of a whole dashboard shrunk to the
          width of a paragraph is a picture you cannot see the buttons in -
          which is the entire job it was put there to do.
          The cap is therefore applied to the text elements rather than to the
          column, so a <Shot/> can use the full width beside them. */}
      <div className="mt-3 max-w-[980px] text-[13px] leading-[1.75] text-muted [&>p]:max-w-[62ch] [&>ul]:max-w-[62ch]">
        {children}
      </div>
    </section>
  );
}

export function Shot({
  src,
  alt,
  width,
  height,
  caption,
}: {
  src: string;
  alt: string;
  width: number;
  height: number;
  caption: string;
}) {
  return (
    <figure className="mt-5">
      {/* eslint-disable-next-line @next/next/no-img-element -- static asset,
          no optimisation to gain and no loader to configure for standalone. */}
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        loading="lazy"
        decoding="async"
        className="h-auto w-full rounded-xl border border-line/80 bg-box"
      />
      <figcaption className="mt-2 max-w-[62ch] text-[11.5px] leading-relaxed text-muted">
        {caption}
      </figcaption>
    </figure>
  );
}

/**
 * The bit somebody will otherwise learn the hard way.
 *
 * Deliberately not styled as a warning. Most of these are not warnings, they
 * are the sentence that stops a person deciding the product is broken - the
 * pause before a tile moves being the obvious one.
 */
export function Aside({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <aside className="mt-5 max-w-[62ch] rounded-xl border border-line/80 bg-box/60 p-4">
      <p className="flex items-center gap-2 text-[12px] font-semibold text-ink">
        <DoodleIcon name="info" size={14} className="text-accent-dark" />
        {title}
      </p>
      <div className="mt-1.5 text-[12.5px] leading-relaxed text-muted">{children}</div>
    </aside>
  );
}

/** A word the reader will see on screen, so it reads as a button not a noun. */
export function Ui({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md border border-line bg-box px-1.5 py-0.5 text-[12px] text-ink">
      {children}
    </span>
  );
}
