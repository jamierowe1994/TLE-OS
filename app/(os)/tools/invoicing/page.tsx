"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Mast, Tabs } from "@/components/new-look/Parts";
import FloatSheet, { FloatCard, FloatChoice, FloatFoot } from "@/components/new-look/FloatSheet";

/**
 * TOOLS > INVOICING (James, 8 Nov 2026: "an invoice builder. Within the tool
 * section, it'll open out invoices, and then it will say 'Generate an
 * invoice' ... those tools currently don't actually do anything").
 *
 * The invoices the business raises, live from /api/invoices (lib/invoices),
 * and Generate an Invoice: for a home (the landlord, the rent and the service
 * come off the managed book and the fee is worked out from the rates set in
 * Finances) or a blank one. Either way it lands in the invoice editor
 * (/maintenance/invoices/<id>) to check, produce and send. Nothing is
 * numbered or sent from here.
 */

type Line = { qty: number; unitPence: number; vatRate: number };
type Inv = {
  id: string;
  number: string | null;
  status: "draft" | "issued" | "sent" | "paid" | "void";
  property: string;
  toName: string;
  issueDate: string;
  dueDate: string;
  reference: string;
  lines: Line[];
  createdAt: string;
  paidAt: string | null;
};
type Home = { listingId: string; propertyId?: string | null; name: string; locality?: string; service?: string | null; rentMonthly?: number | null; landlord?: { name: string } | null; /** A home that is not a let yet: On the market, Let agreed... */ stage?: string };
type View = "all" | "draft" | "out" | "overdue" | "paid";

const GBP = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const money = (p: number) => GBP.format(p / 100);
const totalOf = (lines: Line[]) =>
  lines.reduce((a, l) => {
    const net = Math.round((Number(l.qty) || 0) * (Number(l.unitPence) || 0));
    return a + net + Math.round((net * (Number(l.vatRate) || 0)) / 100);
  }, 0);
const londonToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
const day = (iso: string) => (iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "-");

export default function InvoicingTool() {
  const router = useRouter();
  const [state, setState] = useState<{ status: "loading" } | { status: "failed"; error: string } | { status: "ready"; live: boolean; invoices: Inv[] }>({ status: "loading" });
  const [view, setView] = useState<View>("all");
  const [making, setMaking] = useState(false);

  const load = () =>
    fetch("/api/invoices", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; live?: boolean; error?: string; invoices?: Inv[] }) => {
        if (!j.ok) setState({ status: "failed", error: j.error ?? "The invoices couldn't be read just now." });
        else setState({ status: "ready", live: j.live !== false, invoices: j.invoices ?? [] });
      })
      .catch(() => setState({ status: "failed", error: "The invoices couldn't be read just now. Check your connection and try again." }));
  useEffect(() => {
    void load();
  }, []);

  const today = londonToday();
  const month = today.slice(0, 7);
  const all = state.status === "ready" ? state.invoices : [];
  const isOut = (i: Inv) => i.status === "issued" || i.status === "sent";
  const isOver = (i: Inv) => isOut(i) && i.dueDate && i.dueDate.slice(0, 10) < today;
  const figs = useMemo(() => {
    const drafts = all.filter((i) => i.status === "draft");
    const out = all.filter(isOut);
    const over = all.filter(isOver);
    const paidThisMonth = all.filter((i) => i.status === "paid" && (i.paidAt ?? "").slice(0, 7) === month);
    return {
      drafts: drafts.length,
      out: out.reduce((a, i) => a + totalOf(i.lines), 0),
      outN: out.length,
      over: over.reduce((a, i) => a + totalOf(i.lines), 0),
      overN: over.length,
      paid: paidThisMonth.reduce((a, i) => a + totalOf(i.lines), 0),
      paidN: paidThisMonth.length,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, today, month]);

  const shown = all.filter((i) =>
    view === "all" ? i.status !== "void" : view === "draft" ? i.status === "draft" : view === "out" ? isOut(i) : view === "overdue" ? isOver(i) : i.status === "paid"
  );
  const monthName = new Date(`${month}-01T12:00:00`).toLocaleDateString("en-GB", { month: "long" });

  return (
    <div data-look="new" className="nl-page nl-rise nl-edge nl-iv">
      <Link href="/tools" className="nl-fc-back">
        <span aria-hidden>‹</span> Tools
      </Link>
      <Mast
        eyebrow="Getting paid"
        title="Invoicing"
        blurb="Generate an invoice for a home and the fee is worked out from its rent and service. Check it, produce it with its number, then send it."
        actions={
          <button type="button" className="nl-btn nl-btn--primary" onClick={() => setMaking(true)} disabled={state.status === "ready" && !state.live}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
            Generate an Invoice
          </button>
        }
      />

      {state.status === "loading" ? (
        <div className="nl-fc-card nl-fc-wait"><span className="nl-fc-spin" aria-hidden /> Reading the invoices…</div>
      ) : state.status === "failed" ? (
        <div className="nl-fc-card nl-fc-off" role="alert">
          <p>{state.error}</p>
          <button type="button" className="nl-btn nl-btn--secondary" onClick={() => { setState({ status: "loading" }); void load(); }}>Try again</button>
        </div>
      ) : !state.live ? (
        <div className="nl-fc-card nl-fc-off"><p>Invoices need the OS&apos;s own database, which this copy of the OS doesn&apos;t have.</p></div>
      ) : (
        <>
          <section className="nl-fc-figs">
            <Fig tone="clay" label="Drafts" value={String(figs.drafts)} sub="Not numbered yet" onClick={() => setView("draft")} />
            <Fig tone="olive" label="Waiting to Be Paid" value={money(figs.out)} sub={`${figs.outN} ${figs.outN === 1 ? "invoice" : "invoices"} out`} onClick={() => setView("out")} />
            <Fig tone="terra" label="Overdue" value={money(figs.over)} sub={figs.overN ? `${figs.overN} past the due date` : "Nothing late"} onClick={() => setView("overdue")} />
            <Fig tone="brown" label={`Paid in ${monthName}`} value={money(figs.paid)} sub={`${figs.paidN} ${figs.paidN === 1 ? "invoice" : "invoices"}`} onClick={() => setView("paid")} />
          </section>

          <Tabs
            label="Show"
            className="mt-10"
            value={view}
            onChange={setView}
            items={[
              { id: "all" as const, label: "All", count: all.filter((i) => i.status !== "void").length },
              { id: "draft" as const, label: "Drafts", count: figs.drafts || null },
              { id: "out" as const, label: "Out", count: figs.outN || null },
              { id: "overdue" as const, label: "Overdue", count: figs.overN || null },
              { id: "paid" as const, label: "Paid" },
            ]}
          />

          {shown.length === 0 ? (
            <div className="nl-iv-empty">
              <p>{view === "all" ? "No invoices yet." : "Nothing here."}</p>
              {view === "all" && <button type="button" className="nl-btn nl-btn--primary" onClick={() => setMaking(true)}>Generate an Invoice</button>}
            </div>
          ) : (
            <ul className="nl-iv-list">
              {shown.map((i) => {
                const over = isOver(i);
                return (
                  <li key={i.id}>
                    <Link href={`/maintenance/invoices/${encodeURIComponent(i.id)}`} className="nl-iv-row">
                      <span className="nl-iv-no">{i.number ?? "Draft"}</span>
                      <span className="nl-iv-who">
                        <b>{i.toName || "No one yet"}</b>
                        <em>{i.property || i.reference || "No home"}</em>
                      </span>
                      <span className="nl-iv-when">
                        {i.status === "draft" ? `Started ${day(i.createdAt)}` : i.status === "paid" ? `Paid ${day(i.paidAt ?? "")}` : `Due ${day(i.dueDate)}`}
                      </span>
                      <span className={`nl-iv-st is-${over ? "over" : i.status}`}>{over ? "Overdue" : i.status === "issued" ? "Produced" : i.status[0].toUpperCase() + i.status.slice(1)}</span>
                      <span className="nl-iv-amt">{money(totalOf(i.lines))}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      {making && <Generate onClose={() => setMaking(false)} onMade={(id) => router.push(`/maintenance/invoices/${encodeURIComponent(id)}`)} />}
    </div>
  );
}

function Fig({ tone, label, value, sub, onClick }: { tone: string; label: string; value: string; sub: string; onClick: () => void }) {
  return (
    <button type="button" className="nl-fc-fig nl-iv-fig" data-tone={tone} onClick={onClick}>
      <span className="nl-fc-k">{label}</span>
      <span className="nl-fc-v">{value}</span>
      <span className="nl-fc-sub">{sub}</span>
    </button>
  );
}

/* ── Generate an Invoice ───────────────────────────────────────────────── */

function Generate({ onClose, onMade }: { onClose: () => void; onMade: (id: string) => void }) {
  const [kind, setKind] = useState<"home" | "blank" | null>(null);
  const [step, setStep] = useState(1);
  const [homes, setHomes] = useState<Home[] | null | "failed">(null);
  const [q, setQ] = useState("");
  const [pick, setPick] = useState<Home | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (kind !== "home" || homes !== null) return;
    /* Portfolio's lets, which carry the rent and the service the fee is worked
       out from, and behind them every other home this person may act on - a
       listing on the market or let agreed (/api/homes, lib/homes-to-pick).
       Lets only meant a home could not be invoiced until REX called it let
       (Lianna Denholm, 10 Nov 2026: an inventory fee before the move-in). */
    const json = (url: string) => fetch(url, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    void Promise.all([json("/api/portfolio"), json("/api/homes")]).then(([folio, all]: [{ ok?: boolean; properties?: Home[] } | null, { homes?: { id: string; listingId: string | null; name: string; locality: string; landlord: string; stage: string }[] } | null]) => {
      const lets = folio?.ok && Array.isArray(folio.properties) ? folio.properties : null;
      const rest = Array.isArray(all?.homes) ? all.homes : null;
      if (!lets && !rest) return setHomes("failed");
      const have = new Set((lets ?? []).flatMap((h) => [h.propertyId, h.listingId]).filter(Boolean).map(String));
      const others: Home[] = (rest ?? [])
        .filter((h) => !have.has(String(h.id)) && !(h.listingId && have.has(String(h.listingId))))
        .map((h) => ({ listingId: h.id, propertyId: h.id, name: h.name, locality: h.locality, landlord: h.landlord ? { name: h.landlord } : null, stage: h.stage }));
      setHomes([...(lets ?? []), ...others]);
    });
  }, [kind, homes]);

  const found = useMemo(() => {
    if (!Array.isArray(homes)) return [];
    const n = q.trim().toLowerCase();
    const list = n ? homes.filter((h) => [h.name, h.locality, h.landlord?.name].some((x) => (x ?? "").toLowerCase().includes(n))) : homes;
    return list.slice(0, 30);
  }, [homes, q]);

  const make = async () => {
    setBusy(true);
    setError(null);
    const body = kind === "home" && pick ? { propertyId: pick.listingId, property: [pick.name, pick.locality].filter(Boolean).join(", ") } : {};
    const j = await fetch("/api/invoices", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
      .then((r) => r.json())
      .catch(() => null);
    if (!j?.ok) {
      setBusy(false);
      setError(j?.error ?? "The invoice couldn't be started. Try again.");
      return;
    }
    onMade(j.invoice.id);
  };

  const steps = kind === "home" ? 2 : 1;
  return (
    <FloatSheet
      title="Generate an Invoice"
      step={step}
      steps={kind === "home" ? 2 : undefined}
      onBack={step > 1 && !busy ? () => setStep(1) : undefined}
      onClose={onClose}
      dismissible={!busy}
      screenKey={step}
      question={step === 1 ? "What is it for?" : "Which home?"}
      lede={step === 1 ? "It opens in the invoice editor to check before it is produced. Nothing is sent from here." : "Any of your listings or homes. The landlord comes off its record, and for a let the fee is worked out from the rates set in Finances."}
      foot={
        <FloatFoot left={error ? <span className="nl-to-miss">{error}</span> : <span className="nl-meta">{kind === "home" && pick ? pick.name : " "}</span>}>
          {step === 1 && kind === "home" ? (
            <button type="button" className="nl-btn nl-btn--primary" onClick={() => setStep(2)}>Next: The Home</button>
          ) : (
            <button type="button" className="nl-btn nl-btn--primary" disabled={busy || !kind || (kind === "home" && !pick)} onClick={() => void make()}>
              {busy ? "Starting it…" : steps === 2 || kind === "blank" ? "Open the Invoice" : "Open the Invoice"}
            </button>
          )}
        </FloatFoot>
      }
    >
      {step === 1 && (
        <div className="nl-fs-choices">
          <FloatChoice title="For a Home" text="The fee worked out from its rent and service, addressed to the landlord" on={kind === "home"} onClick={() => setKind("home")} />
          <FloatChoice title="A Blank Invoice" text="Fill in who it is to and every line yourself" on={kind === "blank"} onClick={() => setKind("blank")} />
        </div>
      )}
      {step === 2 && (
        <>
          <FloatCard>
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Address, town or landlord" className="nl-fs-input" aria-label="Find the home" />
          </FloatCard>
          {homes === null ? (
            <FloatCard><p className="nl-meta flex items-center gap-2"><span className="nl-fc-spin" aria-hidden /> Reading the book…</p></FloatCard>
          ) : homes === "failed" ? (
            <FloatCard><p className="nl-meta">The book couldn&apos;t be read just now. Close this and try again in a minute.</p></FloatCard>
          ) : found.length === 0 ? (
            <FloatCard><p className="nl-meta">No home matches that.</p></FloatCard>
          ) : (
            <FloatCard tight as="ul">
              {found.map((h) => (
                <li key={h.listingId}>
                  <button type="button" className={`nl-iv-pick${pick?.listingId === h.listingId ? " is-on" : ""}`} onClick={() => setPick(h)}>
                    <span>
                      <b>{h.name}</b>
                      <em>{[h.locality, h.landlord?.name].filter(Boolean).join(" · ")}</em>
                    </span>
                    <span className="nl-iv-pick-r">
                      {h.stage ?? h.service ?? "No service"}
                      {h.rentMonthly ? ` · ${GBP.format(h.rentMonthly)} pcm` : ""}
                    </span>
                  </button>
                </li>
              ))}
            </FloatCard>
          )}
        </>
      )}
    </FloatSheet>
  );
}
