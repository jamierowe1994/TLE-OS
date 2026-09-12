import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import DoodleIcon from "@/components/DoodleIcon";
import { PORTAL_FOLDERS } from "@/lib/portals";
import { defaultProcess } from "@/lib/process/store";

/**
 * Process - one per person the product acts on: the tenant, the landlord,
 * the agent, and a repair. Each opens as a process map when one has been
 * drawn (the tenant's, first, 12 Sep 2026) and as the folder of screens
 * and emails until then. Every link stays live: open any screen, send any
 * email to yourself.
 */

export const dynamic = "force-dynamic";

export default function ProcessPage() {
  return (
    <>
      <PageHeader
        title="Process"
        blurb="How the product treats each person, step by step: the screens they meet, the emails that go to them, and what happens when they stall. Open one to see the map, the links and the emails - and to change it."
      />
      <div className="fade-up mt-8 flex flex-col gap-3">
        {PORTAL_FOLDERS.map((f) => {
          const mapped = Boolean(defaultProcess(f.slug));
          return (
            <Link key={f.slug} href={`/admin/process/${f.slug}`} className="block-pop rounded-2xl border border-line/80 bg-panel p-5">
              <div className="flex items-start gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent-dark">
                  <DoodleIcon name={f.icon} size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-[16px]">The {f.name.toLowerCase()} process</h2>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${mapped ? "border-accent-dark/40 text-accent-dark" : "border-line/80 text-muted"}`}>
                      {mapped ? "Process map" : "Screens and emails"}
                    </span>
                  </div>
                  <p className="mt-1 max-w-2xl text-[12.5px] leading-relaxed text-muted">{f.blurb}</p>
                  <p className="mt-2 text-[11.5px] text-muted">
                    {f.items.filter((i) => i.kind === "open").length} screens · {f.items.filter((i) => i.kind === "email").length} emails
                    {mapped ? " · mapped with branches and triggers" : " · map to come"}
                  </p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </>
  );
}
