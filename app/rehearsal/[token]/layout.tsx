import { notFound } from "next/navigation";
import type { Metadata } from "next";
import PreviewTheme from "@/components/preview/PreviewTheme";
import { rehearsalTokenValid } from "@/lib/rehearsal";

/**
 * The door for the maintenance walkthrough.
 *
 * Same shape as the onboarding preview: the token is checked once, here, and
 * a wrong one is a 404 rather than a refusal — a link that is meant to look
 * like nothing at all to anybody who was not sent it.
 *
 * No Shell and no rail. Somebody opening this has no account and should not
 * be shown a navigation they cannot use; and James showing it in a meeting
 * wants the walkthrough on the screen, not the OS around it.
 */

export const metadata: Metadata = {
  title: "TLE OS - a repair, end to end",
  robots: { index: false, follow: false, nocache: true },
};

export default async function RehearsalLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!rehearsalTokenValid(token)) notFound();
  return (
    <>
      <PreviewTheme />
      {children}
    </>
  );
}
