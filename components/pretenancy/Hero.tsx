/**
 * The head of Kirstie's screens: eyebrow, title and a line on the left, a
 * photograph with a handwritten line on the right. Drawn once here so the
 * dashboard and the board cannot drift apart (James's mocks, 12 Sep 2026).
 *
 * The photograph sits on a pink panel: the picture keeps its right-hand
 * half, the handwriting has the left, and a short gradient joins them so
 * the line never has to fight a plant for legibility.
 *
 * ── It gives space back on a short screen ─────────────────────────────────
 *
 * Kirstie works on a small laptop and said everything is oversized (14 Sep
 * 2026); James, on the same call, that the board is "a little bit too
 * condensed". On a 1366x768 screen this head took 280 of the 768, and the
 * first deal card started below the fold - on the one screen she sits on all
 * day. So every size here has a smaller twin under 820px of height: a 34px
 * title rather than 44, a shorter picture, tighter gaps. Nothing is removed
 * and nothing moves, so it is the same screen she learns once; it simply
 * stops spending a third of a short window on its own name.
 */
const SCRIPT = { fontFamily: "var(--font-shantell), cursive" } as const;

export default function PreTenancyHero({
  eyebrow = "Pre-tenancy compliance",
  title,
  blurb,
  photo,
  line,
  photoPosition = "100% 35%",
  children,
}: {
  eyebrow?: string;
  title: string;
  blurb: string;
  /** The photograph, from /public/brand. */
  photo: string;
  /** The handwritten line beside it. */
  line: string;
  photoPosition?: string;
  /** Under the blurb: the date line, buttons, whatever the page needs. */
  children?: React.ReactNode;
}) {
  return (
    <div className="grid items-stretch gap-5 [@media(max-height:820px)]:gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,46%)]">
      <div className="fade-up flex flex-col justify-center py-2 [@media(max-height:820px)]:py-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent-dark">{eyebrow}</p>
        <h1 className="mt-2 text-[44px] leading-[1.02] [@media(max-height:820px)]:mt-1 [@media(max-height:820px)]:text-[34px]">{title}</h1>
        <p className="mt-3 max-w-[52ch] text-[14.5px] leading-relaxed text-muted [@media(max-height:820px)]:mt-2 [@media(max-height:820px)]:text-[13.5px]">{blurb}</p>
        {children && <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 [@media(max-height:820px)]:mt-3.5">{children}</div>}
      </div>
      <div className="fade-up relative hidden min-h-[230px] overflow-hidden rounded-[22px] bg-[#fdefec] [@media(max-height:820px)]:min-h-[168px] xl:block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo} alt="" className="absolute inset-y-0 right-0 h-full w-[56%] object-cover" style={{ objectPosition: photoPosition }} />
        <div aria-hidden className="absolute inset-y-0 left-[36%] w-[24%] bg-gradient-to-r from-[#fdefec] to-transparent" />
        {/* The last word carries the red underline, drawn under the letters
            themselves so it lands right however many lines the sentence
            takes (the passport headline's trick). */}
        <p className="absolute left-8 top-1/2 w-[38%] text-[28px] leading-[1.15] [@media(max-height:820px)]:left-6 [@media(max-height:820px)]:text-[22px]" style={{ ...SCRIPT, color: "#56423e", transform: "translateY(-50%) rotate(-4deg)" }}>
          {line.split(" ").slice(0, -1).join(" ")}{" "}
          <span style={{ boxShadow: "inset 0 -0.1em 0 0 #fdefec, inset 0 -0.22em 0 0 rgba(192,80,74,0.7)" }}>{line.split(" ").slice(-1)[0]}</span>
        </p>
      </div>
    </div>
  );
}
