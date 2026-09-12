import PortalShell from "@/components/tenant/PortalShell";
import StageHarness from "@/components/tenant/StageHarness";
import { demoStage } from "@/lib/tenant-demo";

/**
 * The sample portal: the same shell as the real one, on Sophie, with no
 * sign-in. Reached from the admin's Portals page and from the preview. The
 * harness along the foot moves her from stage to stage.
 */
export const metadata = { title: "The Letting Experts — Your tenant area (sample)" };
export const dynamic = "force-dynamic";

export default async function TenantDemoLayout({ children }: { children: React.ReactNode }) {
  const stage = await demoStage();
  return (
    <PortalShell name="Sophie Turner" base="/tenant/demo" stage={stage} sample>
      {children}
      <StageHarness stage={stage} />
    </PortalShell>
  );
}
