import { redirect } from "next/navigation";

/**
 * Verified is a tab of To verify now (James, 22 Oct 2026: "build this in ...
 * so it's just another tab"). This address stays, for links and bookmarks,
 * and opens that page on Verified (or on Sent, from ?view=sent).
 */
export default async function VerifiedTab({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  redirect(`/compliance-desk/verify?tab=${sp.view === "sent" ? "sent" : "verified"}`);
}
