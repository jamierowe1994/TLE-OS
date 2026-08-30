import { notFound } from "next/navigation";
import type { Metadata } from "next";
import PreviewTheme from "@/components/preview/PreviewTheme";
import { previewTokenValid } from "@/lib/preview-token";

/**
 * The door for the shareable onboarding preview.
 *
 * Everything below this checks out at the layout, once: a wrong token is a
 * 404 rather than a refusal, because "wrong password" tells somebody there is
 * a right one and this URL is meant to look like nothing at all to anybody
 * who was not sent it.
 *
 * PreviewTheme is the only piece of OS chrome that comes along, and it is a
 * cut-down ThemeGate: light and dark, without the first-run splash that would
 * ask a guest to pick a theme before showing them anything. No Shell, no
 * HelpDock, no SetupGate, nothing that reads an account.
 */

export const metadata: Metadata = {
  title: "TLE OS - a look at joining",
  /* A capability URL gets forwarded, pasted into chats, and occasionally into
     something that crawls. It should never turn up in a search result. */
  robots: { index: false, follow: false, nocache: true },
};

export default async function PreviewLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!previewTokenValid(token)) notFound();
  return (
    <>
      <PreviewTheme />
      {children}
    </>
  );
}
