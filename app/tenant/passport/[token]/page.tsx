import PassportForm from "@/components/PassportForm";
import { getPassport } from "@/lib/passport";

/**
 * The passport, reached by the link in the tenant's email.
 *
 * Loaded on the SERVER so the first paint already has their details in it.
 * Fetching from the client instead would show an empty form for a moment,
 * which on a form somebody has half filled in reads as "it lost my answers"
 * - and once somebody believes that, they stop trusting the autosave.
 *
 * An unknown token gets the same flat answer as an expired one, with no detail:
 * anything that distinguishes them turns this page into a way of testing
 * guesses. See app/api/tenant/passport for the trade being made.
 */

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const record = await getPassport(token).catch(() => null);

  if (!record) {
    return (
      <main className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-6 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
          The Letting Experts
        </p>
        <h1 className="hand mt-2 text-[28px] leading-tight">This link doesn&apos;t open anything</h1>
        <p className="mt-3 text-[13.5px] leading-relaxed text-muted">
          It may have been mistyped, or it may belong to a passport that has since been removed.
          Reply to the email we sent you and we will send a fresh one.
        </p>
      </main>
    );
  }

  return (
    <main>
      <PassportForm
        token={record.token}
        initial={record.data}
        submittedAt={record.submittedAt}
      />
    </main>
  );
}
