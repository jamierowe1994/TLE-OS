import PracticeRun from "@/components/PracticeRun";
import { scriptById } from "@/lib/rig-scripts";

/**
 * /plc/practice — the agent's rehearsal of handing a pack over.
 *
 * James, 14 Sep 2026: "can you also build the rig from the other side, which
 * is the PLC process for the agent as well."
 *
 * Open to any signed-in person, and it has to be: the people who most need it
 * are partner agents doing their first handover, who have no admin capability
 * of any kind. Nothing here reads a real record, so there is nothing to gate -
 * the pack, the property and the people are invented and the API is never
 * called. Reached from the Start the PLC check button on an application, which
 * is the moment somebody wishes they had done this once already.
 */

export const dynamic = "force-dynamic";

export default function AgentPracticePage() {
  const script = scriptById("plc-agent");
  if (!script) return null;
  return <PracticeRun script={script} backHref="/applications" backLabel="Back to applications" />;
}
