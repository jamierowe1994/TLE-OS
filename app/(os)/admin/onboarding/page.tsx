import PageHeader from "@/components/PageHeader";
import { previewToken } from "@/lib/preview-token";
import CopyLink from "./CopyLink";

/**
 * Onboarding: the two halves of joining, and the link that shows them to
 * somebody without an account.
 *
 * James needs to be able to send Susan a URL before a presentation. That is
 * the whole reason this page exists, so the links are the page - not buried
 * under a description of a feature.
 *
 * The token is derived from AUTH_SECRET (see lib/preview-token.ts), so it is
 * the same string every time this renders and a link pasted into a message
 * last week still opens today.
 */

export const dynamic = "force-dynamic";

const LINKS = [
  {
    path: "setup",
    label: "Signing up",
    blurb:
      "The five screens after somebody follows their invite: password, REX, email, how the pre-launch works, and how it should look.",
    detail:
      "Runs against nothing. The REX and email buttons are disabled, and no answer is saved anywhere.",
  },
  {
    path: "tour",
    label: "The walkthrough",
    blurb:
      "The tour offered the first time an agent reaches the OS. Full walks the whole rail; fast is the assistant and how to report a problem.",
    detail:
      "Runs over a stand-in dashboard with invented figures, so it shows nobody's real book.",
  },
];

export default function AdminOnboardingPage() {
  const token = previewToken();

  return (
    <>
      <PageHeader
        title="Onboarding"
        blurb="What a new agent walks through, and a link you can send to somebody without an account."
      />

      <div className="fade-up mt-8 flex flex-col gap-3">
        {LINKS.map((l) => (
          <section key={l.path} className="rounded-2xl border border-line/80 bg-panel p-5">
            <h2 className="text-[15px]">{l.label}</h2>
            <p className="mt-1 text-[12px] leading-relaxed text-muted">{l.blurb}</p>
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted">{l.detail}</p>
            <CopyLink path={`/preview/${token}/${l.path}`} />
          </section>
        ))}
      </div>

      <section className="fade-up mt-3 rounded-2xl border border-line/80 bg-panel p-5">
        <h2 className="text-[15px]">Both together</h2>
        <p className="mt-1 text-[12px] leading-relaxed text-muted">
          The same two, on one page with a short explanation. This is the one to
          send if you are not standing next to somebody while they look.
        </p>
        <CopyLink path={`/preview/${token}`} />
      </section>

      <section className="fade-up mt-3 rounded-2xl border border-line/80 bg-panel p-5">
        <h2 className="text-[15px]">Worth knowing before you send it</h2>
        <ul className="mt-2.5 flex list-disc flex-col gap-1.5 pl-4 text-[12px] leading-relaxed text-muted">
          <li>
            <span className="text-ink">Anyone with the link can open it</span>, with no
            sign-in. That is the point, but it does mean treat it like a document
            you are handing over rather than something private.
          </li>
          <li>
            It reaches nothing else. The preview has no session, reads no data and
            writes nothing, and the link is not a way into the OS.
          </li>
          <li>
            It will not turn up in a search engine, and the same link keeps
            working, so you can send it once and use it again later.
          </li>
          <li>
            To kill it, set{" "}
            <code className="rounded bg-box px-1 py-0.5 text-[11px]">
              ONBOARDING_PREVIEW_VERSION
            </code>{" "}
            on Railway to <code className="rounded bg-box px-1 py-0.5 text-[11px]">2</code> and
            redeploy. Every old link stops working and a new one appears here.
            Nobody gets signed out.
          </li>
        </ul>
      </section>

      {/* The rest of the demo shelf. Onboarding is the one with a sendable
          link, so it keeps its own page; these two are next door and a person
          arriving here to find "the thing to show somebody" should not have to
          know which of three rail entries it lives under. */}
      <section className="fade-up mt-3 rounded-2xl border border-line/80 bg-panel p-5">
        <h2 className="text-[15px]">The other things you demo</h2>
        <p className="mt-1 text-[12px] leading-relaxed text-muted">
          Both are behind sign-in, so they are click-through rather than
          sendable. The passport is the exception: it makes a real public link.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <a
            href="/admin/tenant-passport"
            className="rounded-full border border-line/80 px-3.5 py-1.5 text-[11.5px] transition-colors hover:border-ink/40"
          >
            Tenant passport
          </a>
          <a
            href="/admin/plc-demo"
            className="rounded-full border border-line/80 px-3.5 py-1.5 text-[11.5px] transition-colors hover:border-ink/40"
          >
            PLC handover
          </a>
        </div>
      </section>

      <section className="fade-up mt-3 rounded-2xl border border-line/80 bg-panel p-5">
        <h2 className="text-[15px]">Your own account</h2>
        <p className="mt-1 text-[12px] leading-relaxed text-muted">
          These walk the real screens against your own login, rather than the
          stand-in. Neither one changes anything: setting up again will not undo
          your REX or email connection.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <a
            href="/setup?replay=1"
            className="rounded-full border border-line/80 px-3.5 py-1.5 text-[11.5px] transition-colors hover:border-ink/40"
          >
            Set up an account
          </a>
          <a
            href="/dashboard?tour=choose"
            className="rounded-full border border-line/80 px-3.5 py-1.5 text-[11.5px] transition-colors hover:border-ink/40"
          >
            Show me round
          </a>
        </div>
      </section>
    </>
  );
}
