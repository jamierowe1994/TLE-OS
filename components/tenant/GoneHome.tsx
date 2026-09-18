import Link from "next/link";
import DoodleIcon from "@/components/DoodleIcon";

/** A home that has come off the market since the link was made. */
export default function GoneHome({ base, q = "" }: { base: string; q?: string }) {
  return (
    <div className="mx-auto max-w-md rounded-[22px] border border-line/60 bg-white p-8 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent-dark"><DoodleIcon name="home" size={20} /></span>
      <h1 className="mt-4 text-[24px] leading-tight">This Home Has Gone</h1>
      <p className="mt-2 text-[13.5px] text-muted">It has been let or taken off the market. Plenty more are on.</p>
      <Link href={`${base}/homes${q}`} className="mt-5 inline-flex rounded-full bg-accent-dark px-5 py-2.5 text-[13px] font-semibold text-white">See the homes to rent</Link>
    </div>
  );
}
