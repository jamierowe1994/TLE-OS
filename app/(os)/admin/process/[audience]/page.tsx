import Link from "next/link";
import { notFound } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import PortalFolderView from "@/components/admin/PortalFolderView";
import ProcessMapView from "@/components/admin/ProcessMap";
import { TLE_EMAILS } from "@/lib/email/tle-emails";
import { folderBySlug } from "@/lib/portals";
import { previewToken } from "@/lib/preview-token";
import { loadProcess } from "@/lib/process/store";

export const dynamic = "force-dynamic";

export default async function ProcessAudiencePage({ params }: { params: Promise<{ audience: string }> }) {
  const { audience } = await params;
  const f = folderBySlug(audience);
  if (!f) notFound();
  const map = await loadProcess(audience);
  if (!map) return <PortalFolderView f={f} />;

  /* The catalogue, trimmed to what the map needs to attach an email. */
  const emails = TLE_EMAILS.filter((e) => e.audience === audience || e.audience === "internal").map((e) => ({ id: e.id, name: e.name, group: e.group, draft: Boolean(e.draft) }));
  return (
    <>
      <PageHeader title={map.title} blurb={map.blurb} />
      <p className="fade-up mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-muted">
        <Link href="/admin/process" className="underline hover:text-ink">← All processes</Link>
        <Link href={`/admin/process/${audience}/screens`} className="underline hover:text-ink">The screens and emails as a list</Link>
      </p>
      <div className="fade-up mt-5">
        <ProcessMapView initial={map} emails={emails} token={previewToken()} />
      </div>
    </>
  );
}
