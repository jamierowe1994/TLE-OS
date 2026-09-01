import Link from "next/link";
import { notFound } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import { folderBySlug, PORTAL_FOLDERS } from "@/lib/portals";
import EmailCard from "./EmailCard";

/**
 * One folder: the things a tenant, a landlord or a new agent actually meets,
 * in the order they meet them.
 *
 * Ordered as a journey rather than grouped by type - the email that starts it,
 * then the screen it lands on, then the thing they do there. That is how James
 * narrates it when he shows somebody, so it is how the page reads.
 */

/**
 * `dynamicParams = false` rather than `dynamic = "force-dynamic"`.
 *
 * There are three folders and they come from a constant, so there is nothing
 * per-request to be dynamic about. It also fixes a real bug: with
 * force-dynamic alongside generateStaticParams, an unknown slug rendered the
 * 404 page with a 200 status - it LOOKED right and answered "found" to
 * anything reading the status. Every other bad URL in the OS returns a proper
 * 404, and this one now does too, decided by the router before this file runs.
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return PORTAL_FOLDERS.map((f) => ({ folder: f.slug }));
}

export default async function PortalFolderPage({
  params,
}: {
  params: Promise<{ folder: string }>;
}) {
  const { folder } = await params;
  const f = folderBySlug(folder);
  if (!f) notFound();

  return (
    <>
      <PageHeader title={f.name} blurb={f.blurb} />

      <p className="fade-up mt-4">
        <Link href="/admin/portals" className="text-[11.5px] text-muted underline hover:text-ink">
          ← All portals
        </Link>
      </p>

      <div className="fade-up mt-5 flex flex-col gap-3">
        {f.items.map((item, i) => (
          <section key={item.id} className="rounded-2xl border border-line/80 bg-panel p-5">
            <div className="flex flex-wrap items-baseline gap-2.5">
              {/* Numbered, because the order is the point. */}
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[10px] font-bold text-accent-dark">
                {i + 1}
              </span>
              <h2 className="text-[15px]">{item.name}</h2>
              <span className="rounded-full border border-line/80 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted">
                {item.kind === "email" ? "Email" : "Screen"}
              </span>
              {item.kind === "open" && (
                <a
                  href={item.href}
                  /* New tab for the customer-facing ones: they take over the
                     window, and coming back to a folder you had scrolled is
                     better than re-finding it. The in-OS admin pages open in
                     place, because those keep the rail and go back normally. */
                  target={item.href.startsWith("/admin") ? undefined : "_blank"}
                  rel={item.href.startsWith("/admin") ? undefined : "noreferrer"}
                  className="ml-auto shrink-0 rounded-full bg-ink px-4 py-1.5 text-[11.5px] text-page"
                >
                  Open
                </a>
              )}
            </div>

            <p className="mt-1.5 max-w-2xl text-[12px] leading-relaxed text-muted">{item.blurb}</p>

            {item.caveat && (
              <p className="mt-2.5 rounded-xl border border-accent-dark/30 bg-accent-soft/30 p-3 text-[11.5px] leading-relaxed">
                {item.caveat}
              </p>
            )}

            {item.kind === "email" && <EmailCard emailId={item.emailId} />}

            {item.kind === "open" && (
              <p className="mt-2 text-[11px] text-muted">
                <code className="rounded bg-box px-1 py-0.5">{item.href.split("?")[0]}</code>
              </p>
            )}
          </section>
        ))}
      </div>

      {f.missing && f.missing.length > 0 && (
        <section className="fade-up mt-4 rounded-2xl border border-line/80 bg-panel p-5">
          <h2 className="text-[15px]">What is not built yet</h2>
          <p className="mt-1 text-[12px] leading-relaxed text-muted">
            Worth knowing before somebody asks you in the room.
          </p>
          <ul className="mt-2.5 flex list-disc flex-col gap-1.5 pl-4 text-[12px] leading-relaxed text-muted">
            {f.missing.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
