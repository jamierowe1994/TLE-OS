import DoodleIcon from "@/components/DoodleIcon";
import PropertyPhoto from "@/components/PropertyPhoto";
import AgentCard from "@/components/landlord/AgentCard";
import AgentCall from "@/components/landlord/AgentCall";
import QrHandoff from "@/components/landlord/QrHandoff";
import UploadDoc from "@/components/landlord/UploadDoc";
import type { DocRow, DocsView } from "@/lib/landlord-documents-view";
import type { LandlordView } from "@/lib/landlord-view";

/**
 * The Documents page (12 Sep 2026), in the home page's language: light,
 * airy, room around everything.
 *
 * The title and the agent. Then what we still need from them, on the pink
 * card - each row takes its own upload - beside what they have sent us.
 * Then what has come from us: the terms and the presentations. Then, for
 * each property we look after, its certificates with their dates. Nothing
 * here is a button to nowhere: every Open is a real file, every Send it
 * files to their record, and the sample says so instead.
 */

const card = "rounded-[22px] border border-line/60 bg-white";
const eyebrow = "text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted";
const SAGE_INK = "#56634a";
const SAGE_WASH = "#f1f4ec";

export default function DocumentsView({ view: v, docs: d, sample = false }: { view: LandlordView; docs: DocsView; sample?: boolean }) {
  const allIn = d.needed.length === 0;
  return (
    <div className="space-y-6">
      {/* ── title and the agent ──
          On a PHONE the head is one line and the agent is a call button in the
          corner beside it. James, 16 Sep 2026: "put the contact number for Sam
          in the top-right corner. The first thing they should see is what they
          still need to do." The 44px title, its paragraph and a full agent card
          were 280px of preamble above the only thing on the page that asks
          anything of them. The whole card is still there on a desktop, where
          there is a column to put it in. */}
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[1fr_auto]">
        <div className="flex items-start justify-between gap-4 pt-2 lg:block">
          <div className="min-w-0">
            <h1 className="text-[30px] leading-[1.08] sm:text-[44px] sm:leading-[1.05]">Your documents</h1>
            <p className="mt-2 hidden max-w-xl text-[14.5px] text-muted sm:mt-3 sm:block">
              Everything we hold on your file, and what we still need from you.
            </p>
          </div>
          <AgentCall v={v} />
        </div>
        <div className="hidden lg:block">
          <AgentCard v={v} />
        </div>
      </div>

      {/* ── what we need, and what they have sent ── */}
      {/* minmax(0,1fr) on a phone: a bare one-column grid sizes its track to
          the widest row (the upload buttons), and the page scrolled sideways. */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <section className="relative overflow-hidden rounded-[22px] bg-accent-soft/80 p-7" data-search>
          <span aria-hidden className="pointer-events-none absolute -bottom-28 -right-16 h-72 w-72 rounded-full bg-accent/15" />
          <span aria-hidden className="pointer-events-none absolute -bottom-40 right-28 h-72 w-72 rounded-full bg-white/40" />
          <div className="relative">
            <p className={eyebrow}>What we need from you</p>
            <div className="mt-4 flex items-start gap-5">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white/70 text-accent-dark">
                <DoodleIcon name={allIn ? "shield" : "upload"} size={22} />
              </span>
              <div className="min-w-0">
                <h2 className="text-[28px] leading-tight">
                  {d.progress.total === 0
                    ? "Nothing to send"
                    : allIn
                      ? "Everything we need is in"
                      : `${d.needed.length} still to send`}
                </h2>
                <p className="mt-1.5 max-w-md text-[13.5px] leading-relaxed text-muted">
                  {d.progress.total === 0
                    ? "Your properties with us are let, so there is nothing to send for now."
                    : allIn
                      ? "Thank you. Your agent has what the let needs."
                      : `${d.progress.have} of ${d.progress.total} in. A photo from your phone is fine; a PDF is better.`}
                </p>
              </div>
            </div>
            {/* THE DESK HAS NO CAMERA. A landlord at a computer with the
                certificate in their hand is one scan away from the phone in
                their pocket - see QrHandoff. Hidden on a phone, which IS the
                camera and has the sheet instead. */}
            {d.needed.length > 0 && (
              <div className="mt-5 hidden sm:block">
                <QrHandoff sample={sample} />
              </div>
            )}
            {d.needed.length > 0 && (
              <ul className="mt-6 divide-y divide-accent-dark/10">
                {d.needed.map((r) => (
                  <li key={r.title} className="flex flex-wrap items-center gap-3 py-3.5 sm:gap-4">
                    {/* The tile goes on a phone. Between it and the Send
                        button the title had about 180px, so "Energy
                        Performance Certificate (EPC)" came out as four lines
                        of two words - and the row already says it is a
                        document by being in the list of documents. */}
                    <span className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/70 text-accent-dark sm:flex">
                      <DoodleIcon name="doc" size={15} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-semibold">{r.title}</span>
                      <span className="block text-[12px] text-muted">{r.sub}</span>
                    </span>
                    <UploadDoc kind={r.kind ?? "other"} title={r.title} appraisalId={d.appraisalId} sample={sample} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className={`${card} flex flex-col p-6`} data-search>
          <h2 className="text-[18px]">Sent to us</h2>
          {d.sent.length === 0 ? (
            <p className="mt-3 text-[13px] leading-relaxed text-muted">Nothing yet. What you send lands here, with the day it arrived.</p>
          ) : (
            <ul className="mt-4 divide-y divide-line/50">
              {d.sent.map((r) => (
                <Row key={r.title + r.sub} r={r} />
              ))}
            </ul>
          )}
          <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-5">
            <p className="text-[12.5px] text-muted">Something else for the file?</p>
            <UploadDoc kind="other" title="Something else" appraisalId={d.appraisalId} sample={sample} label="Add a document" tone="light" />
          </div>
        </section>
      </div>

      {/* ── from us ── */}
      {d.fromUs.length > 0 && (
        <section className={`${card} p-6`} data-search>
          <h2 className="text-[18px]">From us</h2>
          <ul className="mt-4 divide-y divide-line/50">
            {d.fromUs.map((r) => (
              <Row key={r.title + r.sub} r={r} />
            ))}
          </ul>
        </section>
      )}

      {/* ── the properties we look after, and their certificates ── */}
      {d.properties.map((p) => (
        <section key={p.name} className={`${card} p-6`} data-search>
          <div className="flex flex-wrap items-center gap-4">
            <span className="flex h-16 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-line/60 bg-accent-soft/40">
              <PropertyPhoto src={p.image} className="h-full w-full object-cover" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-[18px]">{p.name}</h2>
              <p className="text-[12px] text-muted">{p.locality}</p>
            </div>
            <span
              className={`rounded-full px-3 py-1 text-[11.5px] font-semibold ${p.allInDate ? "" : "bg-accent-soft text-accent-dark"}`}
              style={p.allInDate ? { background: SAGE_WASH, color: SAGE_INK } : undefined}
            >
              {p.headline}
            </span>
          </div>
          {p.certs.length === 0 ? (
            <p className="mt-4 text-[13px] text-muted">Its certificates are being read from your file.</p>
          ) : (
            <ul className="mt-4 divide-y divide-line/50">
              {p.certs.map((r) => (
                <Row key={r.title} r={r} upload={{ appraisalId: d.appraisalId, sample }} />
              ))}
            </ul>
          )}
          <p className="mt-4 text-[12px] text-muted">
            We arrange renewals before they fall due. If your own engineer does one, send us the new certificate from its row. If a date here looks wrong, message {v.agent ? v.agent.name.split(/\s+/)[0] : "your agent"}.
          </p>
        </section>
      ))}

      {/* What this page becomes once the property is let. Words about the
          future, not a button that pretends. */}
      {d.properties.length === 0 && (
        <section className="relative overflow-hidden rounded-[22px] p-6" style={{ background: SAGE_WASH }} data-search>
          <div className="relative z-[1] flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/80" style={{ color: SAGE_INK }}>
              <DoodleIcon name="shield" size={17} />
            </span>
            <h2 className="text-[18px] leading-snug">Once your property is let</h2>
          </div>
          <div className="relative z-[1] max-w-[56%]">
            <p className="mt-3 text-[12.5px] leading-relaxed text-muted">Its certificates live here, with their dates, and we arrange each renewal before it falls due:</p>
            <ul className="mt-3 space-y-2">
              {["Gas safety, every year", "Electrical safety (EICR), every five years", "Energy Performance Certificate, every ten"].map((t) => (
                <li key={t} className="flex items-center gap-2.5 text-[12.5px]">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/80 text-[10px] font-bold" style={{ color: SAGE_INK }}>
                    ✓
                  </span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/art/keys-handover.png" alt="" className="pointer-events-none absolute -bottom-2 -right-3 w-[36%] max-w-[220px]" />
        </section>
      )}

      <p className="text-[12px] leading-relaxed text-muted">
        Your documents are kept on your own file, in the UK, and only your letting agent sees them. Nothing is shared with a tenant.
      </p>
    </div>
  );
}

/** One document: an icon, the name, its state, and the way to open it - or,
 *  for a certificate that is due, the way to send the new one. */
function Row({ r, upload }: { r: DocRow; upload?: { appraisalId: string | null; sample: boolean } }) {
  const ok = r.state === "uploaded";
  const missing = r.state === "missing";
  const watch = r.state === "watch";
  return (
    <li className="flex items-center gap-3 py-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line/60 text-muted">
        <DoodleIcon name={ok ? "shield" : "doc"} size={15} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-semibold">{r.title}</span>
        <span className={`block truncate text-[12px] ${missing ? "text-accent-dark" : "text-muted"}`}>{r.sub}</span>
      </span>
      {upload && r.kind && r.state !== "uploaded" && <UploadDoc kind={r.kind} title={r.title} appraisalId={upload.appraisalId} sample={upload.sample} label="Send the new one" tone="light" />}
      {r.href && (
        <a
          href={r.href}
          target={r.href.startsWith("http") || r.href.startsWith("/present") ? "_blank" : undefined}
          rel="noreferrer"
          className={`shrink-0 rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition-colors ${
            r.cta === "Sign" ? "bg-accent-dark text-white hover:opacity-90" : "border border-line/70 hover:border-ink/40"
          }`}
        >
          {r.cta ?? "Open"}
        </a>
      )}
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold ${
          missing ? "bg-accent-soft text-accent-dark" : watch ? "bg-accent-soft text-accent-dark" : ok ? "" : "bg-[#f3f3f1] text-muted"
        }`}
        style={ok ? { background: SAGE_WASH, color: SAGE_INK } : undefined}
        title={ok ? "On file" : missing ? "Missing" : watch ? "Due soon" : "On its way"}
      >
        {ok ? "✓" : missing ? "!" : watch ? "!" : "…"}
      </span>
    </li>
  );
}
