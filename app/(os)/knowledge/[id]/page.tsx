import Link from "next/link";
import { notFound } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import { getKnowledge } from "@/lib/business/knowledge-store";
import { renderPlainText } from "@/lib/plain-text";

/**
 * A guide, read.
 *
 * Any signed-in person can read a knowledge entry - they are written for the
 * agents, and Steve quotes them anyway. Editing is the hub's job, behind
 * edit:knowledge; this page only shows.
 */

export const dynamic = "force-dynamic";

export default async function KnowledgeReader({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const entry = await getKnowledge(id).catch(() => null);
  if (!entry) notFound();

  const when = new Date(entry.updatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  return (
    <>
      <PageHeader title={entry.title} blurb={entry.section} search={false} />
      <article className="fade-up mt-6 max-w-3xl rounded-2xl border border-line/80 bg-panel px-6 py-5">
        {renderPlainText(entry.content)}
        <p className="mt-6 border-t border-line/60 pt-3 text-[11px] text-muted">
          {entry.updatedBy ? `Written by ${entry.updatedBy}, ` : "Last changed "}
          {when}. Steve answers from this too.
        </p>
      </article>
      <p className="mt-4 text-[12px]">
        <Link href="/knowledge" className="text-muted underline decoration-line underline-offset-2 hover:text-ink">
          Every guide
        </Link>
      </p>
    </>
  );
}
