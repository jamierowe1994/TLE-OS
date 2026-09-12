import { notFound } from "next/navigation";
import PortalFolderView from "@/components/admin/PortalFolderView";
import { folderBySlug } from "@/lib/portals";

/** The folder view - every screen and email as a list - beside the map. */
export const dynamic = "force-dynamic";

export default async function ProcessScreensPage({ params }: { params: Promise<{ audience: string }> }) {
  const { audience } = await params;
  const f = folderBySlug(audience);
  if (!f) notFound();
  return <PortalFolderView f={f} backHref={`/admin/process/${audience}`} backLabel="← The process map" />;
}
