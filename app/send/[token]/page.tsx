import type { Metadata } from "next";
import { readHandoff } from "@/lib/doc-handoff";
import { landlordAccountById } from "@/lib/landlord-account";
import { loadLandlordDocuments } from "@/lib/landlord-documents-view";
import SendDocuments from "@/components/landlord/SendDocuments";

/**
 * WHAT THE QR CODE OPENS: one screen, on a phone, with no sign-in.
 *
 * Deliberately outside app/landlord: everything under there is behind the
 * portal's auth gate and wrapped in the portal's shell, and this page must be
 * neither. It is not a small version of the portal. It is one job - photograph
 * a document and send it - and the fact that it cannot navigate anywhere else
 * is the feature, not a limitation.
 *
 * ── What it is allowed to know ─────────────────────────────────────────────
 *
 * The TITLES of what is outstanding, and the landlord's first name so the page
 * can address them. Nothing else crosses: no documents, no hrefs, no
 * valuation, no contract, no agent's number. Anybody holding a photographed
 * QR code learns that somebody, somewhere, still owes a gas certificate - and
 * that is the whole of it.
 */

export const dynamic = "force-dynamic";

/* Never in anybody's search results, never in a link preview, and no Referer
   carrying the token to whatever gets loaded next. */
export const metadata: Metadata = {
  title: "Send a document",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

export default async function SendPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const at = await readHandoff(token);

  if (!at) return <Gone />;
  const me = await landlordAccountById(at.accountId);
  if (!me) return <Gone />;

  const d = await loadLandlordDocuments(me);

  return (
    <SendDocuments
      token={token}
      firstName={me.name.split(/\s+/)[0] ?? ""}
      expiresAt={at.expiresAt}
      needed={d.needed.map((r) => ({ title: r.title, sub: r.sub, kind: r.kind ?? "other" }))}
      have={d.progress.have}
      total={d.progress.total}
    />
  );
}

/** An expired or unknown code. The same screen for both, on purpose: telling
 *  a stranger which of the two they have is telling them something. */
function Gone() {
  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center bg-[#faf9f7] px-8 text-center text-ink">
      <h1 className="text-[26px] leading-tight">This link has run out</h1>
      <p className="mt-3 max-w-[300px] text-[14px] leading-relaxed text-muted">
        Codes last twenty minutes. Go back to your computer, press Send from your phone, and scan the new one.
      </p>
    </main>
  );
}
