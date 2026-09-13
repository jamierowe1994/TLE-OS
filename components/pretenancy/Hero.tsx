/**
 * The head of Kirstie's screens: eyebrow, title and a line on the left, a
 * photograph with a handwritten line on the right. Drawn once here so the
 * dashboard and the board cannot drift apart (James's mocks, 12 Sep 2026).
 *
 * The photograph sits on a pink panel: the picture keeps its right-hand
 * half, the handwriting has the left, and a short gradient joins them so
 * the line never has to fight a plant for legibility.
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
    <div className="grid items-stretch gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,46%)]">
      <div className="fade-up flex flex-col justify-center py-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent-dark">{eyebrow}</p>
        <h1 className="mt-2 text-[44px] leading-[1.02]">{title}</h1>
        <p className="mt-3 max-w-[52ch] text-[14.5px] leading-relaxed text-muted">{blurb}</p>
        {children && <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2">{children}</div>}
      </div>
      <div className="fade-up relative hidden min-h-[230px] overflow-hidden rounded-[22px] bg-[#fdefec] xl:block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo} alt="" className="absolute inset-y-0 right-0 h-full w-[56%] object-cover" style={{ objectPosition: photoPosition }} />
        <div aria-hidden className="absolute inset-y-0 left-[36%] w-[24%] bg-gradient-to-r from-[#fdefec] to-transparent" />
        <p className="absolute left-8 top-1/2 w-[38%] text-[28px] leading-[1.15]" style={{ ...SCRIPT, color: "#56423e", transform: "translateY(-50%) rotate(-4deg)" }}>
          {line}
        </p>
        <span aria-hidden className="absolute left-9 top-[calc(50%+52px)] h-[3px] w-[110px] rounded-full bg-[#c0504a]/70" style={{ transform: "rotate(-4deg)" }} />
      </div>
    </div>
  );
}
