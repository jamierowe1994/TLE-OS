import { notFound } from "next/navigation";
import Explorer from "@/components/new-look/learning/Explorer";
import { JOURNEYS } from "@/lib/learning/systems";
import type { JourneyId } from "@/lib/learning/systems-types";

/**
 * One journey on the Systems tour (Tools > Learning > Systems): the journey
 * as a computer window of folders and files (components/new-look/learning/
 * Explorer). The content is lib/learning/systems; ?folder= and ?file= land on
 * a place in it.
 */
export const dynamic = "force-dynamic";

const SIDES: JourneyId[] = ["landlord", "tenant", "agent"];

const NAMES: Record<JourneyId, string> = { landlord: "The Landlord's Journey", tenant: "The Tenant's Journey", agent: "Your Side of the Desk" };

export async function generateMetadata({ params }: { params: Promise<{ side: string }> }) {
  const { side } = await params;
  const id = side as JourneyId;
  return { title: SIDES.includes(id) ? (JOURNEYS.find((j) => j.id === id)?.name ?? NAMES[id]) : "Systems Tour" };
}

export default async function SystemsJourneyPage({ params, searchParams }: { params: Promise<{ side: string }>; searchParams: Promise<{ folder?: string; file?: string }> }) {
  const { side } = await params;
  if (!SIDES.includes(side as JourneyId)) notFound();
  const id = side as JourneyId;
  const { folder, file } = await searchParams;
  const journey = JOURNEYS.find((j) => j.id === id) ?? null;
  return <Explorer side={id} journey={journey} initialFolder={folder ?? null} initialFile={file ?? null} />;
}
