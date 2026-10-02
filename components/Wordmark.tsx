/**
 * The TLE OS wordmark for the side rails (James, 2 Oct 2026): no house, just
 * the words in Bricolage Grotesque - TLE at 800, OS skinny at 200 (loaded in
 * app/layout), the O and S drawn close. Live text, so a collapsing rail can
 * slide OS across over TLE and the narrow rail reads OS.
 *
 * One component for every rail (the agents' Shell, the workspace rail, the
 * preview shell), so they cannot drift apart.
 */
export default function Wordmark({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <span
      aria-label="TLE OS"
      className="flex select-none items-baseline whitespace-nowrap text-[30px] leading-none tracking-[-0.03em] text-ink"
      style={{ fontFamily: "var(--font-bricolage), var(--font-heading)" }}
    >
      <span
        aria-hidden
        className={`inline-block overflow-hidden font-[800] transition-[max-width,opacity] duration-[360ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
          collapsed ? "max-w-0 opacity-0" : "max-w-[90px] opacity-100"
        }`}
      >
        TLE
      </span>
      <span aria-hidden className={`font-[200] tracking-[-0.07em] transition-[margin] duration-[360ms] ${collapsed ? "ml-0" : "ml-[3px]"}`}>
        OS
      </span>
    </span>
  );
}
