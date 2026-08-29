import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import LaunchPadFunnel from "@/components/LaunchPadFunnel";

/**
 * Launch Pad — the funnel, inside the OS.
 *
 * A second window onto leads that live in Launch Pad, so the everyday view
 * does not need a second login. Launch Pad keeps them and stays fully usable:
 * James, 29 Aug — "we don't want to take away the leads from Launch Pad
 * because they might just want to log in there."
 *
 * This slice is the LIST. Working a lead — logging a call, booking, marking it
 * lost — still happens in Launch Pad, and every row opens the record there.
 * Building half a lead file here would be worse than none: an agent would log
 * a call into whichever window they happened to have open.
 *
 * The entitlement gate is the API route, not this page. See
 * app/api/tools/launchpad-leads.
 */

export const metadata = { title: "Launch Pad" };

export default function LaunchPadPage() {
  return (
    <>
      <PageHeader
        title="Launch Pad"
        blurb="Leads from your ads, and where each one has got to. Open a lead to work it."
      />
      <p className="mt-2 text-[11.5px] text-muted">
        <Link href="/tools" className="underline">
          Tools
        </Link>{" "}
        · Prospecting
      </p>
      <LaunchPadFunnel />
    </>
  );
}
