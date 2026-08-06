import DoodleIcon from "@/components/DoodleIcon";

/**
 * Every page opens on the same ledge: a rule right across, the title sat on
 * it with a pop stroke off the top-left and its mirror off the bottom-right,
 * search and notifications to the right, and an illustration perched ON the
 * line. One header component so the rhythm can never drift page to page.
 */

/** The pop strokes off the title's corners — big enough to notice. */
function Pop() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className="h-8 w-8 text-ink"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
    >
      <path d="M3 15 L9 10" />
      <path d="M9 4 L12 11" />
      <path d="M18 3 L16 10" />
    </svg>
  );
}

export default function PageHeader({
  title,
  blurb,
  illustration,
  /** How far in from the right the illustration sits, clear of the search. */
  illustrationRight = 350,
}: {
  title: string;
  blurb: string;
  illustration?: string;
  illustrationRight?: number;
}) {
  return (
    <div className="fade-up relative flex items-end justify-between gap-6 border-b border-line/80 pt-10">
      <div className="relative mb-2 pb-9 pl-2 pt-8">
        <span className="absolute -top-2 left-0">
          <Pop />
        </span>
        <span className="absolute -right-12 bottom-4 rotate-180">
          <Pop />
        </span>
        <h1 className="text-[30px] leading-tight">{title}</h1>
        <p className="mt-2.5 max-w-lg text-[13px] text-muted">{blurb}</p>
      </div>

      <div className="flex shrink-0 items-end gap-3 self-end pb-9">
        <label className="hidden w-60 items-center gap-2.5 rounded-full border border-line/80 px-4 py-2.5 transition-colors focus-within:border-ink sm:flex">
          <DoodleIcon name="search" size={15} className="shrink-0 text-muted" />
          <input
            type="text"
            placeholder="Search properties, tenants…"
            className="w-full bg-transparent text-[13px] outline-none placeholder:text-muted/70"
          />
        </label>
        <button
          type="button"
          className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line/80"
          title="Notifications (wireframe)"
        >
          <DoodleIcon name="bell" size={17} className="text-ink" />
          <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-accent" />
        </button>
      </div>

      {/* The figure's own floor line lands on the page rule — sat on the ledge. */}
      {illustration && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={illustration}
          alt=""
          aria-hidden
          className="pointer-events-none absolute bottom-0 hidden h-28 xl:block"
          style={{ right: illustrationRight }}
        />
      )}
    </div>
  );
}
