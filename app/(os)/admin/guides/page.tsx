import GuidesShelf, { helpData } from "@/components/guides/GuidesShelf";
import GuidesAdmin from "@/components/new-look/admin/GuidesNew";

/**
 * Admin > Content > Guides (24 Oct 2026): the same shelf as /guides, inside
 * the Admin frame, for see:reports as the Admin rail's Guides entry always
 * asked. /guides stays open to every agent as their Help.
 */

export const dynamic = "force-dynamic";

export default function AdminGuides() {
  return <GuidesAdmin data={helpData()} old={<GuidesShelf />} />;
}
