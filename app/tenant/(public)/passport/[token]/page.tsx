import { cookies } from "next/headers";
import PassportForm from "@/components/PassportForm";
import PassportBookForm from "@/components/passport-book/PassportBookForm";
import { enquiredHome, getPassport } from "@/lib/passport";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { lookFor, lookRows } from "@/lib/new-look-store";
import { passportQuestions, valuesFor } from "@/lib/attributes";
import { findUserById } from "@/lib/users";
import { tenantAccountByEmail } from "@/lib/tenant-account";
import { forScreen, passportRules } from "@/lib/passport-scotland";

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

/**
 * Which passport this visitor gets: the book (James's design, 24 Oct 2026,
 * components/passport-book) or today's form, by the "passport" switch in
 * Admin > Switches (lib/new-look).
 *
 *  - ?look=new or ?look=old decides outright, for checking either one.
 *  - At Everyone, everybody gets the book, tenants included.
 *  - Below that, only a signed-in member of staff the level covers gets it.
 *    A tenant is never signed in to the OS, so lookFor(null) would say off
 *    for every row; the Everyone row is read here for that reason.
 *  - Anything else, or a database that does not answer, is today's form.
 */
async function showBook(look: string | undefined): Promise<boolean> {
  if (look === "new") return true;
  if (look === "old") return false;
  const row = (await lookRows().catch(() => [])).find((r) => r.id === "passport");
  if (!row || row.level === "off") return false;
  if (row.level === "everyone") return true;
  const id = verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  const me = id ? await findUserById(id).catch(() => null) : null;
  if (!me || me.locked) return false;
  return (await lookFor(me).catch(() => null))?.passport === true;
}

export default async function Page({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ at?: string; look?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  /* The reminder's button (lib/passport-reminder): open on the first page
     still to answer, not the first page. */
  const resume = sp.at === "resume";
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
  const email = (record.data.email || record.email || "").trim();
  const [questions, answers, agent, account, rules] = await Promise.all([
    passportQuestions(record.agentId).catch(() => []),
    record.agentId ? valuesFor(record.agentId, token).catch(() => ({})) : Promise.resolve({}),
    record.agentId ? findUserById(record.agentId).catch(() => null) : Promise.resolve(null),
    /* Whether this email already has a tenant login: decides if the last
       screen makes an account or opens the one they have. */
    email.includes("@") ? tenantAccountByEmail(email).catch(() => null) : Promise.resolve(null),
    /* Scotland: no nationality or Right to rent asked or shown (lib/passport-scotland). */
    passportRules(record),
  ]);

  if (await showBook(sp.look)) {
    /* The home on the cover: their newest lead with an address. Left off when there is none. */
    const home = email.includes("@") ? await enquiredHome(email).catch(() => null) : null;
    return (
      <PassportBookForm
        token={record.token}
        initial={forScreen(record.data, rules)}
        rules={rules}
        submittedAt={record.submittedAt}
        questions={questions}
        initialAnswers={answers}
        accountExists={Boolean(account?.activatedAt)}
        resume={resume}
        agentName={(agent?.name ?? "").trim().split(/\s+/)[0] ?? ""}
        home={home}
      />
    );
  }

  return (
    <main>
      <PassportForm
        token={record.token}
        initial={forScreen(record.data, rules)}
        rules={rules}
        submittedAt={record.submittedAt}
        questions={questions}
        initialAnswers={answers}
        accountExists={Boolean(account?.activatedAt)}
        resume={resume}
        /* First name only. "A few more from Sam" is a person asking; the full
           name reads like a letter from a solicitor. */
        agentName={(agent?.name ?? "").trim().split(/\s+/)[0] ?? ""}
      />
    </main>
  );
}
