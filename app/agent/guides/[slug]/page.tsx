import { notFound } from "next/navigation";
import { guideBySlug, GUIDES } from "@/lib/m-guides";
import { BackLink } from "../../bits";

/**
 * ONE GUIDE (James, 3 Oct 2026), laid out like his Fieldfolk reference: a
 * huge two-line headline (the first line coral), a picture in a card with
 * one big curved corner, the numbers that matter as giant figures, the
 * things to do as numbered cards, the dates, and what it means for us.
 */

export function generateStaticParams() {
  return GUIDES.map((g) => ({ slug: g.slug }));
}

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const g = guideBySlug((await params).slug);
  if (!g) notFound();

  return (
    <main className="pb-6">
      <div className="mb-5 mt-1 flex items-center justify-between">
        <BackLink href="/agent/guides" />
        <span className="text-[12px] font-bold uppercase tracking-[0.14em]" style={{ color: "var(--m-coral)" }}>
          Guide · {g.topic}
        </span>
      </div>

      <h1 className="m-guide-title text-[40px] leading-[0.96]">
        <span style={{ color: "var(--m-coral)" }}>{g.title[0]}</span>
        <br />
        {g.title[1]}
      </h1>
      <p className="mt-4 text-[15px] leading-relaxed text-muted">{g.intro}</p>
      <p className="mt-3 text-[12.5px] font-medium text-muted">
        {day(g.published)} · {g.minutes} min read
      </p>

      {/* The picture, one corner swept round (the reference's photo card). */}
      <div className="relative mt-5 h-[210px] overflow-hidden rounded-[22px] rounded-tr-[90px]" style={{ background: "var(--m-pink-wash)" }}>
        <img src={g.image} alt="" className="absolute bottom-3 left-1/2 h-[180px] w-auto max-w-none -translate-x-1/2" />
      </div>

      {/* In numbers */}
      <h2 className="m-guide-title mt-9 text-[34px] leading-[0.98]">
        <span style={{ color: "var(--m-coral)" }}>In</span> Numbers
      </h2>
      <ul className="mt-4 grid gap-2.5">
        {g.numbers.map((n) => (
          <li key={n.label} className="rounded-[24px] px-5 pb-4 pt-3" style={{ background: "var(--m-card)" }}>
            <span className="m-guide-num block text-[64px] leading-none">
              {n.big}
              {n.plus && <span style={{ color: "var(--m-coral)" }}>+</span>}
            </span>
            <span className="mt-2 block text-[12px] font-semibold uppercase leading-snug tracking-[0.04em] text-muted">{n.label}</span>
          </li>
        ))}
      </ul>

      {/* What to do */}
      <h2 className="m-guide-title mt-9 text-[34px] leading-[0.98]">
        {g.steps.length} Things <span style={{ color: "var(--m-coral)" }}>to Do</span>
      </h2>
      <ol className="mt-4 grid gap-2.5">
        {g.steps.map((s, i) => (
          <li key={s.title} className="rounded-[24px] p-5" style={{ background: "var(--m-card)" }}>
            <span className="m-guide-num block text-[44px] leading-none" style={{ color: "var(--m-coral)" }}>
              {String(i + 1).padStart(2, "0")}
            </span>
            <h3 className="m-guide-title mt-2 text-[22px] leading-tight">{s.title}</h3>
            <p className="mt-2 text-[15px] leading-relaxed">{s.body}</p>
            {s.tell && (
              <p className="mt-3 rounded-[16px] px-3.5 py-2.5 text-[13.5px] leading-snug" style={{ background: "var(--m-pink-wash)" }}>
                <span className="block text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: "var(--m-coral)" }}>
                  Tell your landlord
                </span>
                {s.tell}
              </p>
            )}
          </li>
        ))}
      </ol>

      {/* Key dates */}
      <h2 className="m-guide-title mt-9 text-[34px] leading-[0.98]">
        Key <span style={{ color: "var(--m-coral)" }}>Dates</span>
      </h2>
      <ol className="mt-4 rounded-[24px] p-5" style={{ background: "var(--m-card)" }}>
        {g.dates.map((d, i) => (
          <li key={d.when} className="relative flex gap-4 pb-5 last:pb-0">
            {i < g.dates.length - 1 && <span aria-hidden className="absolute left-[7px] top-4 h-full w-[2px]" style={{ background: "var(--m-pink-wash)" }} />}
            <span aria-hidden className="relative mt-1 h-4 w-4 shrink-0 rounded-full border-[3px]" style={{ borderColor: "var(--m-coral)", background: "var(--m-card)" }} />
            <span>
              <span className="block text-[15px] font-bold">{d.when}</span>
              <span className="block text-[14px] leading-snug text-muted">{d.what}</span>
            </span>
          </li>
        ))}
      </ol>

      {/* What it means for us */}
      <section className="mt-9 rounded-[28px] p-5" style={{ background: "var(--m-green-wash)" }}>
        <h2 className="m-guide-title text-[28px] leading-[1.02]" style={{ color: "var(--m-sage-ink)" }}>
          What It Means for Us
        </h2>
        <ul className="mt-3 grid gap-2.5">
          {g.forUs.map((f) => (
            <li key={f} className="flex gap-3 text-[15px] leading-snug">
              <span aria-hidden className="mt-[7px] h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--m-sage-ink)" }} />
              {f}
            </li>
          ))}
        </ul>
      </section>

      <p className="mt-6 px-1 text-[12.5px] leading-relaxed text-muted">
        Our plain-English version of{" "}
        <a href={g.source.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">
          {g.source.name}
        </a>
        , {day(g.published)}, by {g.source.by}. Not tax or legal advice - landlords should check with their accountant.
      </p>
    </main>
  );
}
