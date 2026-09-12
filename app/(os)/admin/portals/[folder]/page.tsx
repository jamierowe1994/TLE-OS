import { redirect } from "next/navigation";

export default async function PortalFolderRedirect({ params }: { params: Promise<{ folder: string }> }) {
  const { folder } = await params;
  redirect(`/admin/process/${folder}`);
}
