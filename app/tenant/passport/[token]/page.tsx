import PassportForm from "@/components/PassportForm";
import { getPassport } from "@/lib/passport";
import { passportQuestions, valuesFor } from "@/lib/attributes";
import { findUserById } from "@/lib/users";

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

  /**
   * The issuing agent's own extra questions, read here rather than in the
   * browser.
   *
   * Server-side for the same reason the passport itself is: the first paint
   * has to be the finished form. It also means the browser never asks for a
   * set of questions - it is handed the ones belonging to this passport's
   * agent and has no way to name another.
   *
   * All three are independent reads, and an agent with no questions makes the
   * last two cheap and the form identical to what it is today.
   */
  const [questions, answers, agent] = await Promise.all([
    passportQuestions(record.agentId).catch(() => []),
    record.agentId ? valuesFor(record.agentId, token).catch(() => ({})) : Promise.resolve({}),
    record.agentId ? findUserById(record.agentId).catch(() => null) : Promise.resolve(null),
  ]);

  return (
    <main>
      <PassportForm
        token={record.token}
        initial={record.data}
        submittedAt={record.submittedAt}
        questions={questions}
        initialAnswers={answers}
        /* First name only. "A few more from Sam" is a person asking; the full
           name reads like a letter from a solicitor. */
        agentName={(agent?.name ?? "").trim().split(/\s+/)[0] ?? ""}
      />
    </main>
  );
}
