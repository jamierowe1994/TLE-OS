"use client";

import DoodleIcon from "@/components/DoodleIcon";
import { Badge, type Tone } from "@/components/new-look/Parts";
import { openDocument } from "@/lib/doc-sheet";
import type { WorksOrder } from "@/lib/works-orders";

/**
 * Every contractor invoice on one home, at a glance (Lianna Denholm and
 * Michael Healy, tickets cc5d2fc3 and 69e0d507, 17 Nov 2026: "why can't I see
 * invoices in the property screen? There should be a tab for invoices").
 *
 * An invoice lives on its job: the figure (invoicePence) and the file (a job
 * file of kind "invoice"), whether it came in on a job or through Log an
 * Invoice (which raises a finished job for it). So this reads the jobs the
 * page already holds - nothing new is fetched and nothing is stored twice.
 * The same files also sit on the Documents tab (lib/works-orders "file").
 */

type Row = {
  order: WorksOrder;
  files: WorksOrder["files"];
  pence: number | null;
  at: string;
};

const money = (p: number) => `£${(p / 100).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export function invoiceRows(orders: WorksOrder[]): Row[] {
  return orders
    .filter((o) => !o.rehearsal)
    .map((o) => {
      const files = o.files.filter((f) => f.kind === "invoice");
      return { order: o, files, pence: o.invoicePence, at: o.invoicedAt ?? files[0]?.at ?? o.updatedAt ?? o.createdAt };
    })
    .filter((r) => r.pence != null || r.files.length > 0)
    .sort((a, b) => b.at.localeCompare(a.at));
}

function standing(o: WorksOrder): { tone: Tone; text: string } {
  if (o.status === "paid") return { tone: "good", text: "Paid" };
  if (o.status === "cancelled") return { tone: "neutral", text: "Job cancelled" };
  if (o.landlordInvoiceAnswer === "query") return { tone: "accent", text: "Landlord queried" };
  if (o.payrunAt) return { tone: "info", text: "On the pay run" };
  if (o.invoicePence == null) return { tone: "warning", text: "Figure to add" };
  return { tone: "warning", text: "To pay" };
}

export default function HomeInvoices({ orders, onOpenJob, look }: { orders: WorksOrder[]; onOpenJob: (o: WorksOrder) => void; look: boolean }) {
  const rows = invoiceRows(orders);
  const blank = "No invoices on this home yet. When a contractor's invoice goes on a job, or is logged from Contractors > Log an Invoice, it shows here and on the Documents tab.";
  if (!rows.length) return look ? <p className="nl-prop-blank">{blank}</p> : <p className="rounded-2xl border border-dashed border-line/80 p-6 text-center text-[13px] text-muted">{blank}</p>;

  const total = rows.reduce((n, r) => n + (r.pence ?? 0), 0);
  const unpaid = rows.filter((r) => r.order.status !== "paid" && r.order.status !== "cancelled").reduce((n, r) => n + (r.pence ?? 0), 0);
  const open = (o: WorksOrder, f: WorksOrder["files"][number]) =>
    openDocument({ key: f.key, name: f.name, label: `Invoice · job #${o.ref}`, property: o.propertyName, url: `/api/r2/file?key=${encodeURIComponent(f.key)}` });

  const summary = `${rows.length} ${rows.length === 1 ? "invoice" : "invoices"} · ${money(total)} in all${unpaid > 0 ? ` · ${money(unpaid)} still to pay` : ""}`;

  if (!look) {
    return (
      <div className="space-y-3">
        <p className="text-[12.5px] text-muted">{summary}</p>
        <ul className="divide-y divide-line/50 rounded-2xl border border-line/70 bg-white">
          {rows.map(({ order: o, files, pence, at }) => {
            const st = standing(o);
            return (
              <li key={o.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-[12.5px]">
                <button type="button" onClick={() => onOpenJob(o)} className="min-w-0 flex-1 text-left">
                  <span className="block truncate font-semibold">{pence != null ? money(pence) : "No figure yet"} · {o.contractorName || "No contractor named"}</span>
                  <span className="block truncate text-[11.5px] text-muted">#{o.ref}{o.invoiceRef ? ` · their ref ${o.invoiceRef}` : ""} · {o.title} · {day(at)}</span>
                </button>
                {files.map((f) => (
                  <button key={f.key} type="button" onClick={() => open(o, f)} className="inline-flex items-center gap-1.5 rounded-full border border-line/80 px-3 py-1 text-[11.5px] font-semibold hover:border-ink/40">
                    <DoodleIcon name="doc" size={12} /> Open
                  </button>
                ))}
                <span className="rounded-full bg-line/40 px-2 py-0.5 text-[11px]">{st.text}</span>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  return (
    <div className="nl-holder">
      <section className="nl-prop-group">
        <h3 className="nl-prop-group-title">From Contractors</h3>
        <p className="nl-meta nl-prop-group-foot">{summary}</p>
        <ul className="nl-prop-list">
          {rows.map(({ order: o, files, pence, at }) => {
            const st = standing(o);
            return (
              <li key={o.id} className="nl-prop-inv">
                <button type="button" onClick={() => onOpenJob(o)} className="nl-prop-job">
                  <span className={`nl-prop-row-ic${st.tone === "accent" ? " is-hot" : ""}`} aria-hidden>
                    <DoodleIcon name="coin" size={17} />
                  </span>
                  <span className="min-w-0">
                    <span className="nl-prop-row-title">{pence != null ? money(pence) : "No figure yet"} · {o.contractorName || "No contractor named"}</span>
                    <span className="nl-meta block truncate">
                      <span className="nl-mono">#{o.ref}</span>{o.invoiceRef ? ` · their ref ${o.invoiceRef}` : ""} · {o.title}
                    </span>
                  </span>
                  <span className="nl-prop-job-next">{o.status === "paid" && o.paidAt ? `Paid ${day(o.paidAt)}` : `In ${day(at)}`}</span>
                  <Badge tone={st.tone}>{st.text}</Badge>
                </button>
                <div className="nl-prop-visit-files">
                  {files.length > 0
                    ? files.map((f) => (
                        <button key={f.key} type="button" onClick={() => open(o, f)} className="nl-link inline-flex items-center gap-1.5">
                          <DoodleIcon name="doc" size={13} /> {f.name}
                        </button>
                      ))
                    : <span className="nl-meta">No file on the job yet</span>}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
