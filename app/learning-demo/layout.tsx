import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { findUserById } from "@/lib/users";

/**
 * The Learning demos (Tools > Learning > Systems, lib/learning/pages): real
 * customer screens on the invented 8 Recreation Terrace story, every call
 * answered on the page (components/learning-demo/DemoFrame).
 *
 * For signed-in staff only: no session, or a locked one, is a plain 404.
 * Outside app/(os), so no OS sidebar - the tour frames them as the customer
 * sees them. Never indexed. Framed by our own pages only: the script below
 * blanks the page when the frame around it is another site's (the session
 * cookie is SameSite=Lax as well, so another site's frame gets no session).
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Learning demo · TLE OS",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

/* Runs before anything draws: inside another site's frame the page stays blank. */
const OWN_FRAME_ONLY = `(function(){try{if(window.top!==window.self){var o=window.parent.location.origin;if(o!==window.location.origin)throw 0;}}catch(e){document.documentElement.style.display="none";}})();`;

export default async function LearningDemoLayout({ children }: { children: React.ReactNode }) {
  const id = verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  const me = id ? await findUserById(id).catch(() => null) : null;
  if (!me || me.locked) notFound();
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: OWN_FRAME_ONLY }} />
      {children}
    </>
  );
}
