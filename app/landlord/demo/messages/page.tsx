import MessagesView from "@/components/landlord/MessagesView";
import { RAJ } from "@/lib/landlord-sample";

/** The sample landlord's messages page - the same Raj as the demo home. */
export default function LandlordDemoMessages() {
  return <MessagesView view={RAJ} sample />;
}
