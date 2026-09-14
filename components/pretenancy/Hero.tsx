/**
 * The head of Kirstie's screens: eyebrow, title, a line, and whatever the page
 * puts under it. Drawn once here so the dashboard, the board and the PLC queue
 * cannot drift apart (James's mocks, 12 Sep 2026).
 *
 * ── The photograph is gone ────────────────────────────────────────────────
 *
 * It sat in the top right of all three screens on a pink panel, and it cost
 * 230px of height and nearly half the width. James, 14 Sep 2026: take the
 * photographs out of the top right, the screens need the room and the white
 * space, they look cramped. So the head is now the words alone across the
 * full width, and the page beneath starts where the picture used to.
 *
 * The `photo`, `photoPosition` and `line` props are still accepted and
 * ignored, so the three pages did not all have to change on the same day.
 *
 * ── It scales with the window ─────────────────────────────────────────────
 *
 * Kirstie is on a 14in laptop. Every size here is a clamp between what a 13in
 * screen can carry and what a large desktop deserves, measured against the
 * viewport width, so the head grows and shrinks with the window instead of
 * being one fixed size that is right on one machine. 14in (1512 wide) sits
 * mid-clamp deliberately: it is the screen this was drawn for.
 */

export default function PreTenancyHero({
  eyebrow = "Pre-tenancy compliance",
  title,
  blurb,
  children,
}: {
  eyebrow?: string;
  title: string;
  blurb: string;
  /** Accepted and ignored since 14 Sep 2026 - see above. */
  photo?: string;
  line?: string;
  photoPosition?: string;
  /** Under the blurb: the date line, buttons, whatever the page needs. */
  children?: React.ReactNode;
}) {
  return (
    <div className="fade-up flex flex-col justify-center">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent-dark">{eyebrow}</p>
      <h1 className="mt-1.5 leading-[1.02] text-[clamp(30px,2.6vw,44px)]">{title}</h1>
      <p className="mt-2 max-w-[68ch] leading-relaxed text-muted text-[clamp(13px,0.95vw,15px)]">{blurb}</p>
      {children && (
        <div className="mt-3.5 flex flex-wrap items-center gap-x-5 gap-y-2">{children}</div>
      )}
    </div>
  );
}
