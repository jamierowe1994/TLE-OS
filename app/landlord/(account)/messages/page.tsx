import MessagesView from "@/components/landlord/MessagesView";
import { currentLandlord } from "@/lib/landlord-account";
import { loadLandlordHome } from "@/lib/landlord-home-view";

export const metadata = { title: "Messages · The Letting Experts" };

/** The landlord's messages, live: the thread with their agent, from the same view the home page reads. */
export default async function LandlordMessagesPage() {
  const me = (await currentLandlord())!;
  const { view, first } = await loadLandlordHome(me);
  if (!view) {
    return (
      <div className="pt-4">
        <h1 className="text-[40px] leading-none">Hello, {first}</h1>
        <p className="mt-3 text-[13.5px] text-muted">We don&rsquo;t have a property against this address yet, so there is no agent to message.</p>
      </div>
    );
  }
  return <MessagesView view={view} />;
}
