import Link from "next/link";
import RadarBoard from "@/components/RadarBoard";

/**
 * Landlord Radar — the board.
 *
 * Properties in the patch whose landlord looks likely to move agent, read off
 * the daily Homesearch sweep and scored. See docs/LANDLORD-RADAR.md for the
 * plan and lib/radar-signals.ts for what each signal means.
 *
 * The board is a client component because it is worked, not read: stages,
 * assignees and notes change under the agent's hands. The header's figures
 * come with the same fetch, so the page has one loading state, not two.
 */

export const metadata = { title: "Landlord Radar" };

export default function RadarPage() {
  return (
    <>
      <RadarBoard />
      <p className="mt-3 text-[11.5px] text-muted">
        <Link href="/tools" className="underline">
          Tools
        </Link>{" "}
        · Prospecting
      </p>
    </>
  );
}
