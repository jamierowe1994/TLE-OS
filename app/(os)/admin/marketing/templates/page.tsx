"use client";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
export default function Templates() {
  return (
    <>
      <PageHeader title="Email templates" blurb="The wording that goes out under our name." />
      <div className="fade-up mt-8 rounded-2xl border border-line/80 bg-panel p-5">
        <p className="text-[12.5px] leading-relaxed">
          Templates live on <span className="font-semibold">os_email_templates</span> as an
          overlay: the step&apos;s day, channel and audience stay in code where they can be read
          at a glance, and only the words are editable.
        </p>
        <Link href="/emails" className="mt-3 inline-block rounded-lg border border-line/80 px-3.5 py-2 text-[12px]">
          Open the email audit
        </Link>
      </div>
    </>
  );
}
