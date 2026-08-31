"use client";

import { use } from "react";
import Link from "next/link";
import PassportForm, { type PassportQuestion } from "@/components/PassportForm";
import { EMPTY_PASSPORT } from "@/lib/passport-shape";

/**
 * The tenant passport, for somebody with the share link.
 *
 * The real form, in demo mode: every field works, the passport book on the
 * right fills in as you type, and nothing is written anywhere. The token in
 * the URL belongs to no passport, which is why the saving has to be stubbed -
 * otherwise the autosave would 404 and sit there saying "not saved" through
 * the whole demonstration.
 *
 * ── It carries example custom questions ───────────────────────────────────
 *
 * The three at the end are what an agent's own questions look like to a
 * tenant: a yes/no, a pick-from-a-list, and one marked as having to be
 * answered. They are invented here rather than read from anybody's account,
 * so this page shows the FEATURE without showing whatever James happens to
 * have configured today.
 */

const SAMPLE_QUESTIONS: PassportQuestion[] = [
  {
    id: "sample-pets",
    label: "Do you have a pet?",
    kind: "yesno",
    options: [],
    required: false,
  },
  {
    id: "sample-parking",
    label: "How many parking spaces will you need?",
    kind: "select",
    options: ["None", "One", "Two or more"],
    required: false,
  },
  {
    id: "sample-notice",
    label: "How much notice do you have to give where you are now?",
    kind: "text",
    options: [],
    required: true,
  },
];

export default function PreviewPassport({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);

  return (
    <>
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-4 pt-6 sm:px-6">
        <p className="text-[12px] leading-relaxed text-muted">
          A sample passport. Type in it freely, nothing is saved and it is about
          nobody.
        </p>
        <Link
          href={`/preview/${token}`}
          className="ml-auto shrink-0 rounded-full border border-line/80 px-3.5 py-1.5 text-[11.5px] transition-colors hover:border-ink/40"
        >
          Back
        </Link>
      </div>

      <PassportForm
        demo
        token="sample"
        initial={{ ...EMPTY_PASSPORT, legalName: "Alex Sample", email: "alex.sample@example.com" }}
        submittedAt={null}
        questions={SAMPLE_QUESTIONS}
        agentName="Sam"
      />
    </>
  );
}
