/**
 * The shape of the Systems tour (Tools > Learning > Systems, James, 26 Oct
 * 2026): "it's almost like they click into a file... it feels more like a
 * computer screen. We're clicking into files to get to the right thing, and
 * then we go through that section." Every file has a pop-out guide that talks
 * them through that one process.
 *
 * A journey is a window; its folders are down the side; a folder holds files;
 * a file is a page the customer sees (a new-style demo screen), an email
 * they get, or a process the agent runs in the OS (its guide, and a button to
 * the real screen). Written in lib/learning/systems.ts, drawn by
 * components/new-look/learning/Explorer.tsx, the pages served by
 * lib/learning/pages.ts (our own under app/learning-demo).
 */

import type { LearningPage } from "@/lib/learning/pages";

export type JourneyId = "tenant" | "landlord" | "agent";

/** One beat of a pop-out guide: a short heading and a line or two, in an agent's words. */
export type GuideStep = { title: string; says: string };

export type SysFile = {
  /** Unique within its journey; in the address as ?file=. */
  id: string;
  kind: "page" | "email" | "process";
  /** Title Case, short: what an agent would call it. */
  name: string;
  /** One line under the name in the folder. */
  blurb: string;
  /** Where in the journey it happens, e.g. "Before the viewing". */
  when: string;
  /** kind "page": which new-style demo screen (lib/learning/pages). */
  page?: LearningPage;
  /** kind "email": its id in TLE_EMAILS (lib/email/tle-emails), previewed through /api/tools/learning/email. */
  email?: string;
  /** kind "process": the real OS screen it happens on, e.g. { label: "Open Leads", href: "/leads" }. */
  opens?: { label: string; href: string };
  /** Any kind: the customer screen this leads to, shown beside the guide. */
  shows?: LearningPage;
  /** The pop-out guide: three to six steps through this one process. */
  guide: GuideStep[];
  /** What the agent presses to set it off, and where (an OS path). */
  you?: { says: string; href?: string };
};

export type Folder = {
  id: string;
  /** Title Case, e.g. "Screens They See", "Emails They Get". */
  name: string;
  blurb: string;
  files: SysFile[];
};

export type Journey = {
  id: JourneyId;
  name: string;
  /** One or two sentences for the journey's tile. */
  says: string;
  folders: Folder[];
};
