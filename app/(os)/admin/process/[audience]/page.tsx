import Link from "next/link";
import { notFound } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import PortalFolderView from "@/components/admin/PortalFolderView";
import ProcessMapView from "@/components/admin/ProcessMap";
import { TLE_EMAILS } from "@/lib/email/tle-emails";
import { folderBySlug } from "@/lib/portals";
import { previewToken } from "@/lib/preview-token";
import { loadProcess } from "@/lib/process/store";
import { AdminLookSplit } from "@/components/new-look/admin/ScreenBits";
import { Ico } from "@/components/new-look/Parts";

export const dynamic = "force-dynamic";

export default async function ProcessAudiencePage({ params }: { params: Promise<{ audience: string }> }) {
  const { audience } = await params;
  const f = folderBySlug(audience);
  if (!f) notFound();
  const map = await loadProcess(audience);
  if (!map) return <PortalFolderView f={f} />;

  /* The catalogue, trimmed to what the map needs to attach an email. */
  const emails = TLE_EMAILS.filter((e) => e.audience === audience || e.audience === "internal").map((e) => ({ id: e.id, name: e.name, group: e.group, draft: Boolean(e.draft) }));
  const mapView = <ProcessMapView initial={map} emails={emails} token={previewToken()} />;
  /* The new look (lib/new-look "admin", 24 Oct 2026): the frame gives the way
     back to Process, so only the list link is added. The map itself is the
     same editor in both. */
  return (
    <AdminLookSplit
      what="Opening the map"
      fresh={
        <div data-look="new" className="nl-page nl-rise nl-adm nl-adm-tab">
          <div className="nl-adm-block-head">
            <div>
              <h2 className="nl-section-title">{map.title}</h2>
              <p className="nl-meta nl-adm-measure">{map.blurb}</p>
            </div>
            <Link href={`/admin/process/${audience}/screens`} className="nl-link">
              The screens and emails as a list <Ico name="arrow" size={14} />
            </Link>
          </div>
          <div className="nl-adm-after">{mapView}</div>
        </div>
      }
      old={
        <>
          <PageHeader title={map.title} blurb={map.blurb} />
          <p className="fade-up mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-muted">
            <Link href="/admin/process" className="underline hover:text-ink">← All processes</Link>
            <Link href={`/admin/process/${audience}/screens`} className="underline hover:text-ink">The screens and emails as a list</Link>
          </p>
          <div className="fade-up mt-5">
            {mapView}
          </div>
        </>
      }
    />
  );
}
