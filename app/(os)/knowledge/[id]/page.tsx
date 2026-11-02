import Link from "next/link";
import { notFound } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import { cookies } from "next/headers";
import { getKnowledge } from "@/lib/business/knowledge-store";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { LIBRARY_SECTION } from "@/lib/marketing-library";
import { keyVisible, readFolderAccess, shelfViewer } from "@/lib/shelf-access";
import { findUserById } from "@/lib/users";
import { renderPlainText } from "@/lib/plain-text";

/**
 * A guide, read.
 *
 * Any signed-in person can read a knowledge entry - they are written for the
 * agents, and Steve quotes them anyway - except a File Store write-up from an
 * Office only or Pro folder. Editing is the hub's job, behind
 * edit:knowledge; this page only shows.
 */

export const dynamic = "force-dynamic";

export default async function KnowledgeReader({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const entry = await getKnowledge(id).catch(() => null);
  if (!entry) notFound();
  /* A File Store write-up follows its file's folder: Office only and Pro stay
     with whoever may see them (lib/shelf-access, 2 Nov 2026). */
  if (entry.section === LIBRARY_SECTION) {
    const key = entry.content.match(/^File key:\s*(library\/shelf\/[^\n]+)$/m)?.[1]?.trim();
    const uid = verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
    const me = uid ? await findUserById(uid).catch(() => null) : null;
    const access = await readFolderAccess().catch(() => null);
    if (!key || !access || !keyVisible(key, (await shelfViewer(me)).tier, access)) notFound();
  }

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
