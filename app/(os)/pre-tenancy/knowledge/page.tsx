"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import DoodleIcon from "@/components/DoodleIcon";
import PreTenancyHero from "@/components/pretenancy/Hero";
import WorkspaceLoading from "@/components/WorkspaceLoading";
import GuideModal from "@/components/GuideModal";
import { GUIDES, guideById, type Guide } from "@/lib/pretenancy-guides";
import { RIG_SCRIPTS } from "@/lib/rig-scripts";

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

/** The practice run that covers a guide, if one does. */
const practiceFor = (guideId: string) => RIG_SCRIPTS.find((s) => s.guide === guideId) ?? null;

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

      {/* ── the doing half ──
          A guide can be right about a screen that is broken. A practice run
          cannot: it says what should happen and asks whether it did. Kept
          apart from the guides above and said plainly, because the two are
          answers to different questions. */}
      <section className="fade-up space-y-3 pt-2">
        <div>
          <h2 className="text-[20px] font-bold leading-tight">Practice runs</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-muted">
            Reading about it once is not the same as having done it. These walk you through the real screens on
            invented paperwork, a step at a time, and ask after each one whether what happened is what it said would
            happen. Nothing is saved and nothing is sent, so press everything. If a step does not do what it says,
            say so on the spot and it goes to James with a picture of the screen.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {RIG_SCRIPTS.map((s) => (
            <Link
              key={s.id}
              href={s.href}
              className="group flex items-start gap-4 rounded-[22px] border border-line/70 bg-card p-5 transition hover:border-black/25"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-dark"><DoodleIcon name={s.icon} size={19} /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-[18px] font-bold leading-tight">{s.title}</span>
                <span className="mt-0.5 block text-[12px] font-semibold text-accent-dark">{s.who}</span>
                <span className="mt-1.5 block text-[13px] leading-relaxed text-muted">{s.blurb}</span>
                <span className="mt-3 flex items-center gap-3 text-[12px] text-muted">
                  <span className={`rounded-full px-2.5 py-0.5 font-semibold ${GREEN}`}>{s.steps.length} steps</span>
                  <span>About {s.minutes} minutes</span>
                  <span className="ml-auto flex items-center gap-1 font-semibold text-ink transition group-hover:text-accent-dark">Start the run <DoodleIcon name="trend-up" size={11} /></span>
                </span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Drawn by the same pop-up as the agents' guides (components/GuideModal),
          which handles Escape and holds the page still behind it. */}
      {open ? (
        <GuideModal
          g={{ ...open, practice: practiceFor(open.id) ? { href: practiceFor(open.id)!.href, label: "Practise it" } : undefined }}
          onClose={() => show(null)}
        />
      ) : null}
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
