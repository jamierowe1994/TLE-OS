import DoodleIcon from "@/components/DoodleIcon";
import type { TenantHome } from "@/lib/tenant-home-view";
import SendDocuments from "@/components/tenant/SendDocuments";

/**
 * Documents: one section of the tenant portal, drawn from the home view.
 * Shared with the sample.
 *
 * James, 18 Sep 2026: "a bit cleaner. If they've done their rental passport,
 * that should show at the top, and Send us something asks for all of the
 * things underneath." So: the passport first, as the one document that is
 * already theirs; then every kind of thing we might ask for, each with its
 * own Send button and whether it is in; and "With your tenancy" only once
 * there is a tenancy - before that it was a list of four things that do not
 * exist, all saying Not yet.
 */

const card = "rounded-[22px] border border-line/60 bg-white";

export default function DocumentsView({ v, sample = false }: { v: TenantHome; sample?: boolean }) {
  const done = v.passport.done === v.passport.total;
  return (
    <div className="space-y-5">
      <div className="pt-2">
        <h1 className="text-[32px] leading-[1.05] sm:text-[36px]">Documents</h1>
      </div>

      {/* ── the passport ── */}
      <div className={`${card} flex items-center gap-4 p-5 sm:p-6`} data-search>
        <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${done ? "bg-[#f1f4ec] text-[#56634a]" : "bg-accent-soft text-accent-dark"}`}>
          {done ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          ) : (
            <DoodleIcon name="doc" size={18} />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[16px] font-bold leading-tight">Your tenant passport</p>
          <p className="mt-0.5 text-[12.5px] leading-snug text-muted">
            {done ? "Complete. It goes with every application you make." : `${v.passport.done} of ${v.passport.total} sections done`}
          </p>
        </div>
        {v.passport.path && (
          <a href={v.passport.path} className={`shrink-0 rounded-full px-4 py-2 text-[12.5px] font-semibold ${done ? "border border-line/80" : "bg-accent-dark text-white"}`}>
            {done ? "Open" : "Finish it"}
          </a>
        )}
      </div>

      {/* ── what we might ask for ── */}
      <div className={`${card} p-5 sm:p-6`} data-search>
        <h2 className="text-[19px] font-bold">Send us something</h2>
        <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-muted">
          Whatever we have asked you for. Each one goes straight to your agent and onto your file. A PDF or a photograph, up to 25MB.
        </p>
        <SendDocuments sample={sample} />
      </div>

      <a
        href="https://www.gov.uk/government/publications/how-to-rent"
        target="_blank"
        rel="noreferrer"
        className={`${card} flex items-center gap-4 p-5 transition-colors hover:border-ink/40`}
        data-search
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-panel text-muted"><DoodleIcon name="info" size={16} /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-semibold">How to rent</span>
          <span className="block text-[12.5px] text-muted">The government&apos;s checklist, given to every tenant</span>
        </span>
        <span className="shrink-0 text-[12.5px] font-semibold">Open</span>
      </a>

      {/* ── once there is a tenancy ── */}
      {v.deal && (
        <div className={`${card} p-5 sm:p-6`} data-search>
          <h2 className="text-[19px] font-bold">With your tenancy</h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted">These arrive here as your tenancy is set up.</p>
          <ul className="mt-3 divide-y divide-line/60">
            <Row label="Tenancy agreement" sub="Sent for signing when it is drawn up" />
            <Row label="Deposit protection certificate" sub="After your deposit is registered" />
            <Row label="Gas safety certificate and EPC" sub="The property's certificates, before you move in" />
            <Row label="Inventory and check-in report" sub="From move-in day" />
          </ul>
        </div>
      )}
    </div>
  );
}

function Row({ label, sub }: { label: string; sub: string }) {
  return (
    <li className="flex items-center gap-4 py-3.5 text-muted">
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-medium text-ink">{label}</span>
        <span className="block text-[12.5px]">{sub}</span>
      </span>
      <span className="shrink-0 text-[12px]">Not yet</span>
    </li>
  );
}
