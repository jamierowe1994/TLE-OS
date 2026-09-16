import DocumentsView from "@/components/landlord/DocumentsView";
import { currentLandlord } from "@/lib/landlord-account";
import { loadLandlordDocuments } from "@/lib/landlord-documents-view";
import { loadLandlordHome } from "@/lib/landlord-home-view";

export const metadata = { title: "Your documents · The Letting Experts" };

/**
 * The landlord's documents, live: what we need, what they have sent, what
 * came from us, and the certificates on every property we look after.
 */
export default async function LandlordDocumentsPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const me = (await currentLandlord())!;
  /* Which property, from the address bar. See PlacePicker. */
  const { p } = await searchParams;
  const [{ view, first }, docs] = await Promise.all([loadLandlordHome(me, p), loadLandlordDocuments(me)]);
  if (!view) {
    return (
      <div className="pt-4">
        <h1 className="text-[40px] leading-none">Hello, {first}</h1>
        <p className="mt-3 text-[13.5px] text-muted">We don&rsquo;t have a property against this address yet, so there are no documents to show.</p>
      </div>
    );
  }
  return <DocumentsView view={view} docs={docs} />;
}
