import PortalShell from "@/components/tenant/PortalShell";

/**
 * The sample portal: the same shell as the real one, on Sophie, with no
 * sign-in. Reached from the admin's Portals page and from the preview.
 */
export const metadata = { title: "The Letting Experts — Your tenant area (sample)" };

export default function TenantDemoLayout({ children }: { children: React.ReactNode }) {
  return <PortalShell name="Sophie Turner" base="/tenant/demo" sample>{children}</PortalShell>;
}
