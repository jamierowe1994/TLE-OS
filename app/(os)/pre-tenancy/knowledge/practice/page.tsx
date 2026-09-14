import PracticeRun from "@/components/PracticeRun";
import { scriptById } from "@/lib/rig-scripts";

/**
 * /pre-tenancy/knowledge/practice — Kirstie's rehearsal of the PLC check.
 *
 * It sits under Knowledge rather than beside the real PLC queue on purpose.
 * The queue is where live packs are decided and a practice pack has no
 * business being in the same list; Knowledge is where you go to learn the job,
 * and this is the doing half of that. The guide teaches the screen, this walks
 * it.
 *
 * The workspace rail comes from app/(os)/pre-tenancy/layout, so the navigation
 * stays put while the run happens inside it.
 */

export const dynamic = "force-dynamic";

export default function PreTenancyPracticePage() {
  const script = scriptById("plc-compliance");
  if (!script) return null;
  return <PracticeRun script={script} backHref="/pre-tenancy/knowledge" backLabel="Back to Knowledge" />;
}
