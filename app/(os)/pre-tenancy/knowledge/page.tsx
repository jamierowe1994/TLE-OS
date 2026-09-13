"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import DoodleIcon from "@/components/DoodleIcon";
import PreTenancyHero from "@/components/pretenancy/Hero";
import WorkspaceLoading from "@/components/WorkspaceLoading";
import { GUIDES, guideById, type Guide } from "@/lib/pretenancy-guides";

/**
 * Knowledge, for pre-tenancy: one card per guide, and the guide itself as a
 * pop-up you scroll through, each step with its picture beside it.
 *
 * James, 13 Sep 2026: "make this into a helpful guide area where they can
 * learn about how these processes work now ... they're able to just click
 * through it. I can just scroll down, and it should open out as a pop-up
 * modal." For Kirstie and for whoever starts next.
 *
 * ?guide=board opens that guide on arrival, which is what the "How this
 * works" buttons on the three screens link to. The content is in
 * lib/pretenancy-guides; this file only draws it.
 */

const GREEN = "bg-[#f1f4ec] text-[#56634a]";

function Hub() {
  const router = useRouter();
  const params = useSearchParams();
  const [open, setOpen] = useState<Guide | null>(null);
  /* Drawn after mount, like the other three screens: the shell stamps its
     entrance timings onto the blocks before the page hydrates, and a page
     that is in the server HTML then disagrees with itself. */
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  useEffect(() => {
    setOpen(guideById(params.get("guide")));
  }, [params]);

  const show = (g: Guide | null) => {
    setOpen(g);
    router.replace(g ? `/pre-tenancy/knowledge?guide=${g.id}` : "/pre-tenancy/knowledge", { scroll: false });
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && show(null);
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!ready) return <WorkspaceLoading />;

  return (
    <div className="space-y-5 pb-8">
      <PreTenancyHero
        eyebrow="Pre-tenancy knowledge"
        title="How it all works"
        blurb="A guide for each screen, with a picture of every part and what it is for. Open one and scroll; nothing here changes anything."
        photo="/brand/photo/welcome-door.webp"
        photoPosition="50% 30%"
        line="Learn it once, do it every day"
      />

      <div className="fade-up grid gap-4 md:grid-cols-2">
        {GUIDES.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => show(g)}
            className="group flex items-start gap-4 rounded-[22px] border border-line/70 bg-card p-5 text-left transition hover:border-black/25"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-dark"><DoodleIcon name={g.icon} size={19} /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-[18px] font-bold leading-tight">{g.title}</span>
              <span className="mt-1 block text-[13px] leading-relaxed text-muted">{g.blurb}</span>
              <span className="mt-3 flex items-center gap-3 text-[12px] text-muted">
                <span className={`rounded-full px-2.5 py-0.5 font-semibold ${GREEN}`}>{g.steps.length} steps</span>
                <span>About {g.minutes} minutes</span>
                <span className="ml-auto flex items-center gap-1 font-semibold text-ink transition group-hover:text-accent-dark">Open the guide <DoodleIcon name="trend-up" size={11} /></span>
              </span>
            </span>
          </button>
        ))}
      </div>

      <p className="text-[12.5px] text-muted">
        The pictures are taken from the screens themselves. When a screen changes, the guide is recaptured with it.
      </p>

      {open ? <GuideModal g={open} onClose={() => show(null)} /> : null}
    </div>
  );
}

function GuideModal({ g, onClose }: { g: Guide; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#2b201d]/45 p-3 sm:p-6" onClick={onClose}>
      <div
        className="drawer-in flex max-h-[92vh] w-full max-w-[1060px] flex-col overflow-hidden rounded-[26px] bg-page shadow-[0_30px_80px_-30px_rgba(40,25,20,0.6)]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={g.title}
      >
        {/* ── the head stays; the steps scroll under it ── */}
        <div className="flex items-start gap-4 border-b border-line/60 px-6 py-5 sm:px-8">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-dark"><DoodleIcon name={g.icon} size={19} /></span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent-dark">Guide</p>
            <h2 className="text-[26px] font-bold leading-tight">{g.title}</h2>
            <p className="mt-1 text-[13px] text-muted">{g.steps.length} steps · about {g.minutes} minutes · scroll down</p>
          </div>
          <Link href={g.href} className="hidden shrink-0 items-center gap-2 rounded-full border border-line/80 bg-card px-4 py-2 text-[12.5px] font-semibold transition hover:border-ink/40 sm:flex">
            Open the screen <DoodleIcon name="trend-up" size={11} />
          </Link>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted transition hover:bg-card hover:text-ink">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 sm:px-8">
          <ol className="space-y-8">
            {g.steps.map((s, i) => (
              <li key={s.title} className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] lg:gap-8">
                <div className="flex gap-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-dark text-[13px] font-bold text-white">{i + 1}</span>
                  <div className="min-w-0">
                    <h3 className="text-[17px] font-bold leading-tight">{s.title}</h3>
                    <p className="mt-2 text-[13.5px] leading-relaxed text-ink/80">{s.body}</p>
                  </div>
                </div>
                {s.image ? (
                  <figure className="min-w-0">
                    {/* Capped in height, so a tall crop (a column, a drawer)
                        sits at a readable size rather than filling the width
                        and running off the bottom of the step. */}
                    <div className="overflow-hidden rounded-2xl border border-line/70 bg-card p-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={s.image} alt={s.title} className="mx-auto max-h-[480px] w-auto max-w-full rounded-xl" loading={i < 2 ? "eager" : "lazy"} />
                    </div>
                    {s.caption ? <figcaption className="mt-1.5 text-[11.5px] text-muted">{s.caption}</figcaption> : null}
                  </figure>
                ) : null}
              </li>
            ))}
          </ol>

          <div className="mt-8 flex flex-wrap items-center gap-3 rounded-2xl bg-accent-soft px-5 py-4">
            <span className={`flex h-9 w-9 items-center justify-center rounded-full ${GREEN}`}>✓</span>
            <p className="flex-1 text-[13.5px] font-semibold">That is the whole of it.</p>
            <Link href={g.href} className="rounded-full bg-accent-dark px-4 py-2 text-[12.5px] font-semibold text-white">Open the screen</Link>
            <button type="button" onClick={onClose} className="rounded-full border border-line/80 bg-card px-4 py-2 text-[12.5px] font-semibold">Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PreTenancyKnowledgePage() {
  return (
    <Suspense fallback={null}>
      <Hub />
    </Suspense>
  );
}
