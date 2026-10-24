"use client";

import Link from "next/link";
import { useNewLook } from "@/lib/use-new-look";
import { SentEmailDrawerOld, SentEmailsOld, useSentEmails } from "@/components/admin/SentEmails";
import SentEmailsNew from "@/components/new-look/admin/SentEmailsNew";
import { LookLoading } from "@/components/new-look/admin/ScreenBits";

/**
 * Admin > Emails > Sent (24 Oct 2026): every email that left, and each one as
 * it was received. It moved here from Activity in the new look, beside the
 * catalogue of what the OS would send. The old look still shows it on
 * Activity; this address works in both, from the same parts
 * (components/admin/SentEmails).
 *
 * Owners only in the tabs (components/new-look/admin/areas), and the list
 * itself answers only those who hold see:reports (/api/admin/sent-emails).
 */
export default function SentEmailsPage() {
  const s = useSentEmails();
  const look = useNewLook("admin");

  if (look === null) return <LookLoading what="Reading what went out" />;
  if (look) return <SentEmailsNew s={s} />;
  return (
    <>
      <Link href="/admin/emails" className="text-[12.5px] text-muted underline">
        ← Emails
      </Link>
      <SentEmailsOld s={s} />
      <SentEmailDrawerOld s={s} />
    </>
  );
}
