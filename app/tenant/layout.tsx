import PreviewReturnBar from "@/components/PreviewReturnBar";

/**
 * Everything under /tenant is the tenant surface: its own mix of the palette
 * (globals.css, data-surface="tenant"), so an agent's OS accent never
 * reaches a customer. The two shells - the masthead for the public pages,
 * the sidebar for the portal - are the route groups beneath.
 */
export const metadata = { title: "The Letting Experts — Your tenant area" };

export default function TenantLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-surface="tenant" className="min-h-screen bg-white font-sans text-ink">
      {children}
      {/* Only ever renders with ?from=admin - a real customer never sees it. */}
      <PreviewReturnBar />
    </div>
  );
}
