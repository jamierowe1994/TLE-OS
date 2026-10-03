import Link from "next/link";
import { GUIDES } from "@/lib/m-guides";
import { HomeHero, TopBar } from "../bits";

/**
 * GUIDES (James, 3 Oct 2026): the latest rules in plain English, newest
 * first. Each card is big and bold like the guide behind it.
 */

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export default function PhoneGuides() {
  const [latest, ...rest] = GUIDES;
  return (
    <main>
      <TopBar />
      <HomeHero title="Guides" line="The latest rules, in plain English." src="/illustrations/app/home-flats.webp" height={160} right={-6} bottom={12} />

      {latest && (
        <Link href={`/agent/guides/${latest.slug}`} className="m-press relative z-[1] -mt-5 block overflow-hidden rounded-[28px] p-5 shadow-[0_18px_40px_-22px_rgba(150,70,50,0.6)]" style={{ background: "var(--m-card)" }}>
          <span className="text-[12px] font-bold uppercase tracking-[0.12em]" style={{ color: "var(--m-coral)" }}>
            New · {latest.topic} · {day(latest.published)}
          </span>
          <span className="m-guide-title mt-2 block text-[34px] leading-[0.98]">
            <span style={{ color: "var(--m-coral)" }}>{latest.title[0]}</span>
            <br />
            {latest.title[1]}
          </span>
          <span className="mt-3 block text-[14.5px] leading-snug text-muted">{latest.summary}</span>
          <span className="mt-4 flex items-center justify-between">
            <span className="text-[13px] text-muted">{latest.minutes} min read</span>
            <span className="flex h-11 w-11 items-center justify-center rounded-[14px] text-white" style={{ background: "var(--m-coral)" }}>
              <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </span>
          </span>
        </Link>
      )}

      {rest.length > 0 && (
        <>
          <p className="mb-2 mt-6 px-1 text-[15px] font-medium">More Guides</p>
          <ul className="grid gap-2.5">
            {rest.map((g) => (
              <li key={g.slug}>
                <Link href={`/agent/guides/${g.slug}`} className="m-press block rounded-[22px] px-4 py-3.5" style={{ background: "var(--m-card)" }}>
                  <span className="text-[12px] font-bold uppercase tracking-[0.1em]" style={{ color: "var(--m-coral)" }}>
                    {g.topic} · {day(g.published)}
                  </span>
                  <span className="m-guide-title mt-1 block text-[21px] leading-tight">{g.title[0]}</span>
                  <span className="mt-0.5 block text-[13.5px] text-muted">{g.summary}</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="mt-6 px-1 text-[12.5px] leading-snug text-muted">Our own plain-English versions of what has been published, with the source at the foot of each. Not tax or legal advice.</p>
    </main>
  );
}
