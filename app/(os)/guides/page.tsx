import HelpLook from "@/components/new-look/help/HelpLook";
import GuidesShelf, { helpData } from "@/components/guides/GuidesShelf";

/**
 * Help: the guide shelf, reached from Help at the foot of the sidebar
 * (components/LaunchNav, 11 Oct 2026). Every agent can open it, so nothing on
 * it is written to James: the "where these are going" notes that sat at the
 * foot of the page came off when it became the agents' Help.
 *
 * The shelf itself is components/guides/GuidesShelf, shared with Admin's
 * Content tab (/admin/guides).
 */

export const dynamic = "force-dynamic";

export default function GuidesPage() {
  /* The new look (lib/new-look "help", 23 Oct 2026) draws the same shelf its
     own way; with the switch off, the page below is drawn exactly as it was. */
  return <HelpLook data={helpData()} old={<GuidesShelf />} />;
}
