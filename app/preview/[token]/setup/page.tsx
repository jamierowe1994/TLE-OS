"use client";

import { use, useState } from "react";
import Link from "next/link";
import Wizard from "@/components/setup/Wizard";

/**
 * The joining screens, for somebody with the share link.
 *
 * The SAME Wizard the real /setup renders, in forceDemo: it never calls the
 * API, never writes, and the REX and email steps show their real forms with
 * the buttons disabled. What Susan sees here is what a new starter gets,
 * because it is the same component and not a mock of one.
 */
export default function PreviewSetup({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center px-5 py-12 text-center">
        <h1 className="hand text-[24px] leading-tight">That is the whole of signing up</h1>
        <p className="mx-auto mt-3 max-w-sm text-[12.5px] leading-relaxed text-muted">
          At this point a real agent lands in the OS and is offered the
          walkthrough.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
          <Link
            href={`/preview/${token}/tour`}
            className="rounded-full bg-accent-dark px-4 py-2 text-[12.5px] font-semibold text-white"
          >
            See the walkthrough
          </Link>
          <button
            type="button"
            onClick={() => setDone(false)}
            className="rounded-full border border-line/80 px-4 py-2 text-[12.5px] transition-colors hover:border-ink/40"
          >
            Run it again
          </button>
        </div>
        <Link href={`/preview/${token}`} className="mt-5 text-[11.5px] text-muted underline">
          Back
        </Link>
      </main>
    );
  }

  /* Unmounted entirely while the closing panel is up, so "run it again" gets
     a fresh mount and a fresh set of answers without needing a key. */
  return <Wizard forceDemo onFinish={() => setDone(true)} />;
}
