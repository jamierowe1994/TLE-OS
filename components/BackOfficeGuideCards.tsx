"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import DoodleIcon from "@/components/DoodleIcon";
import { areaForPage, canSee, type AreaAccess } from "@/lib/area-map";

/**
 * The back office walkthroughs on Help (11 Oct 2026).
 *
 * Each one opens in the Showroom, and the Showroom is off the sidebar and
 * hidden from agents until phase 3 (lib/phases). Listed for everybody, the
 * cards were four links an agent pressed and got turned away from. So they
 * show only to somebody the Showroom is switched on for, asked the same way
 * the sidebar asks, and nothing is drawn until it answers.
 */

export type BackOfficeCard = { id: string; title: string; lead: string; scenes: number };

export default function BackOfficeGuideCards({ cards }: { cards: BackOfficeCard[] }) {
  const [open, setOpen] = useState<boolean | null>(null);
  useEffect(() => {
    let gone = false;
    const area = areaForPage("/showroom");
    fetch("/api/area-access", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (gone) return;
        const access: AreaAccess | null = j && typeof j.gated === "boolean" ? { gated: j.gated, tester: Boolean(j.tester), levels: j.levels ?? {} } : null;
        setOpen(Boolean(access) && (!area || canSee(access, area)));
      })
      .catch(() => !gone && setOpen(false));
    return () => { gone = true; };
  }, []);

  if (!open || !cards.length) return null;
  return (
    <section className="fade-up mt-8">
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">The back office, step by step</p>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {cards.map((j) => (
          <Link key={j.id} href={`/showroom?side=backoffice&step=${j.id}`} className="block-pop block rounded-2xl border border-line/80 bg-panel p-5">
            <span className="flex flex-wrap items-baseline gap-2.5">
              <DoodleIcon name="magic-wand" size={18} className="self-center text-accent-dark" />
              <span className="hand text-[17px]">{j.title}</span>
              <span className="text-[10.5px] text-muted">Guide and live demo · {j.scenes} scenes</span>
              <span className="ml-auto text-muted">→</span>
            </span>
            <span className="mt-1.5 block text-[12px] leading-relaxed text-muted">{j.lead}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
