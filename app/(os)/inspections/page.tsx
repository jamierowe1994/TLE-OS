import InspectionsBoard from "@/components/portfolio/InspectionsBoard";

/**
 * Inspections, on its own page.
 *
 * James, 21 Oct 2026: "Under Portfolio, we should be able to get rid of a bunch
 * of these different tabs ... Technically we're not deleting it, we're just
 * hiding it within the Overview tab." The tab is off the Portfolio menu and
 * the board opens from its tile on /overview (?panel=inspections). This page stays
 * so every link already out there - emails, the bell, search, a home's page -
 * still lands. The board lives in components/portfolio/InspectionsBoard.tsx.
 */
export default function Page() {
  return <InspectionsBoard />;
}
