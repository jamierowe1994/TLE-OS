import Link from "next/link";
import DoodleIcon from "@/components/DoodleIcon";

/**
 * A section that is not open yet. The nav shows the padlock; this is what
 * the page says if they click through anyway - what the section is for and
 * what opens it, in one card, with the way back. Never a blank page.
 */
export default function LockedView({ title, what, opens, base = "/tenant" }: { title: string; what: string; opens: string; base?: string }) {
  return (
    <div className="space-y-5">
      <div className="pt-2">
        <h1 className="text-[36px] leading-[1.05]">{title}</h1>
      </div>
      <div className="rounded-[22px] border border-line/60 bg-white p-6 sm:p-8" data-search>
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent-dark">
          <DoodleIcon name="lock" size={18} />
        </span>
        <h2 className="mt-5 text-[22px] font-bold leading-tight">{opens}</h2>
        <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-muted">{what}</p>
        <Link href={base} className="mt-6 inline-flex items-center gap-2 rounded-full bg-accent-dark px-5 py-2.5 text-[13px] font-semibold text-white">
          Back to home <DoodleIcon name="trend-up" size={13} className="invert" />
        </Link>
      </div>
    </div>
  );
}
