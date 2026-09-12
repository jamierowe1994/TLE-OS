import DocumentsView from "@/components/landlord/DocumentsView";
import { RAJ, RAJ_DOCUMENTS } from "@/lib/landlord-sample";

/** The sample landlord's documents page - the same Raj as the demo home. */
export default function LandlordDemoDocuments() {
  return <DocumentsView view={RAJ} docs={RAJ_DOCUMENTS} sample />;
}
