import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import DoodleIcon from "@/components/DoodleIcon";
import { PORTAL_FOLDERS } from "@/lib/portals";

/**
 * Portals — three folders, and everything the product shows somebody who is
 * not us.
 *
 * The index does one job: get out of the way. Each folder says who it is
 * about and how many things are in it, and one click opens them.
 */

export const dynamic = "force-dynamic";

export default function PortalsPage() {
  return (
    <>
      <PageHeader
        title="Portals"
        blurb="Everything the product shows a tenant, a landlord or a new agent. Open any of it in one click."
      />

      <div className="fade-up mt-8 flex flex-col gap-3">
        {PORTAL_FOLDERS.map((f) => (
          <Link
            key={f.slug}
            href={`/admin/portals/${f.slug}`}
            className="block-pop rounded-2xl border border-line/80 bg-panel p-5"
          >
            <div className="flex flex-wrap items-baseline gap-2.5">
              <DoodleIcon name={f.icon} size={18} className="self-center text-accent-dark" />
              <span className="hand text-[17px]">{f.name}</span>
              <span className="text-[10.5px] text-muted">
                {f.items.length} thing{f.items.length === 1 ? "" : "s"}
              </span>
              <span className="ml-auto text-muted">→</span>
            </div>
            <p className="mt-1.5 max-w-2xl text-[12px] leading-relaxed text-muted">{f.blurb}</p>
          </Link>
        ))}
      </div>

      <section className="fade-up mt-4 rounded-2xl border border-line/80 bg-panel p-5">
        <h2 className="text-[15px]">Before you show somebody</h2>
        <ul className="mt-2.5 flex list-disc flex-col gap-1.5 pl-4 text-[12px] leading-relaxed text-muted">
          <li>
            The customer portals run on invented people, Sophie and Raj, with
            invented properties. Nothing you press in them touches a real record.
          </li>
          <li>
            Opening one takes over the window, the way Susan&apos;s view does. A
            small <span className="text-ink">Back to Portals</span> button sits in
            the bottom corner, and only ever appears because you arrived from
            here.
          </li>
          <li>
            Emails are shown as they would arrive. The ones with no send path yet
            say so on the card rather than leaving you to find out.
          </li>
        </ul>
      </section>
    </>
  );
}
