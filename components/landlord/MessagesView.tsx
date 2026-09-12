import DoodleIcon from "@/components/DoodleIcon";
import Thread from "@/components/landlord/Thread";
import type { LandlordView } from "@/lib/landlord-view";

/**
 * The Messages page (12 Sep 2026), in the home page's language.
 *
 * The title. Then the thread with their agent as the page itself, the
 * composer under it - one conversation, kept on the file, rather than a
 * sheet that closes. Beside it: who they are talking to, with the ways to
 * reach them, when to expect an answer, and what we have sent them - the
 * presentations, the terms, the documents received - so the page reads as
 * everything that has passed between us.
 */

const card = "rounded-[22px] border border-line/60 bg-white";
const eyebrow = "text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted";
const SAGE_INK = "#56634a";
const SAGE_WASH = "#f1f4ec";

export default function MessagesView({ view: v, sample = false }: { view: LandlordView; sample?: boolean }) {
  const agent = v.agent;
  const first = agent?.name.split(/\s+/)[0] ?? "your agent";
  const messages = v.messages ?? [];
  const sent = v.activity.filter((a) => /shared|signed|received|sent/i.test(a.title));
  return (
    <div className="space-y-6">
      <div className="pt-2">
        <h1 className="text-[44px] leading-[1.05]">Messages</h1>
        <p className="mt-3 max-w-xl text-[14.5px] text-muted">Everything between you and {first}, kept in one place.</p>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        {/* ── the conversation ── */}
        <section className={`${card} p-6`} data-search>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-[18px]">Your conversation with {first}</h2>
            <span className="text-[11.5px] text-muted">{messages.length === 0 ? "Nothing yet" : `${messages.length} message${messages.length === 1 ? "" : "s"}`}</span>
          </div>
          <div className="mt-5">
            <Thread appraisalId={v.appraisalId ?? null} agentFirst={first} messages={messages} sample={sample} />
          </div>
        </section>

        <div className="space-y-6">
          {/* ── who they are talking to ── */}
          <section className="relative overflow-hidden rounded-[22px] bg-accent-soft/80 p-6" data-search>
            <span aria-hidden className="pointer-events-none absolute -bottom-24 -right-16 h-60 w-60 rounded-full bg-accent/15" />
            <span aria-hidden className="pointer-events-none absolute -bottom-32 right-20 h-60 w-60 rounded-full bg-white/40" />
            <div className="relative">
              <p className={eyebrow}>Your letting agent</p>
              {agent ? (
                <>
                  <div className="mt-4 flex items-center gap-4">
                    {agent.photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={agent.photo} alt="" className="h-16 w-16 shrink-0 rounded-full object-cover" />
                    ) : (
                      <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-white/80 text-[24px] font-semibold text-accent-dark">{agent.name[0]}</span>
                    )}
                    <div className="min-w-0">
                      <h2 className="text-[22px] leading-tight">{agent.name}</h2>
                      {agent.title && <p className="mt-0.5 text-[12.5px] text-muted">{agent.title}</p>}
                    </div>
                  </div>
                  <ul className="mt-5 space-y-2.5 text-[13px]">
                    {agent.phone && (
                      <li>
                        <a href={`tel:${agent.phone.replace(/\s+/g, "")}`} className="flex items-center gap-2.5 hover:text-accent-dark">
                          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/80 text-accent-dark"><DoodleIcon name="call" size={13} /></span>
                          {agent.phone}
                        </a>
                      </li>
                    )}
                    {agent.email && (
                      <li>
                        <a href={`mailto:${agent.email}`} className="flex min-w-0 items-center gap-2.5 hover:text-accent-dark">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/80 text-accent-dark"><DoodleIcon name="mail" size={13} /></span>
                          <span className="truncate">{agent.email}</span>
                        </a>
                      </li>
                    )}
                    <li className="flex items-center gap-2.5 text-muted">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/80 text-accent-dark"><DoodleIcon name="clock" size={13} /></span>
                      Replies the same working day, Monday to Friday
                    </li>
                  </ul>
                </>
              ) : (
                <p className="mt-3 text-[13.5px] text-muted">Your agent appears here once your property is with us.</p>
              )}
            </div>
          </section>

          {/* ── what has come from us ── */}
          <section className={`${card} p-6`} data-search>
            <h2 className="text-[18px]">What we&rsquo;ve sent you</h2>
            {sent.length === 0 ? (
              <p className="mt-3 text-[13px] text-muted">Presentations, terms and anything else from us show here as they are sent.</p>
            ) : (
              <ul className="mt-4 space-y-3.5">
                {sent.map((a, k) => (
                  <li key={k} className="flex items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: SAGE_WASH, color: SAGE_INK }}>
                      <DoodleIcon name={a.icon} size={14} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13.5px] font-semibold leading-snug">{a.title}</span>
                      <span className="block text-[12px] text-muted">{a.sub}{a.date ? `  •  ${a.date}` : ""}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      {/* ── the rules of the road, on sage ── */}
      <section className="flex flex-wrap items-center gap-5 rounded-[22px] p-6" style={{ background: SAGE_WASH }} data-search>
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/80" style={{ color: SAGE_INK }}>
          <DoodleIcon name="message" size={18} />
        </span>
        <div className="min-w-[240px] flex-1">
          <h2 className="text-[17px]">How messages work</h2>
          <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-muted">
            What you write here is kept on your file and lands in {first}&rsquo;s inbox straight away. For anything urgent - a leak, no heating, a lock - ring the office rather than write.
          </p>
        </div>
      </section>
    </div>
  );
}
