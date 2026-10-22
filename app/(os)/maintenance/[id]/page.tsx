"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import DoodleIcon from "@/components/DoodleIcon";
import PropertyPhoto from "@/components/PropertyPhoto";
import PhotoLightbox from "@/components/PhotoLightbox";
import SaveChip, { SaveScopeProvider, useSaveScope } from "@/components/SaveChip";
import LandlordJobEmails from "@/components/LandlordJobEmails";
import EmailPerson from "@/components/EmailPerson";
import { openDocument } from "@/lib/doc-sheet";
import { readJson } from "@/lib/page-cache";
import { worksLate } from "@/lib/london-clock";
import { URGENCIES, categoriesOf } from "@/lib/works-catalogue";
import { stepOf, type StepId } from "@/lib/works-steps";
import type { Contractor, Move, WorksEvent, WorksOrder, Status, JobTenant } from "@/lib/works-orders";
import type { ManagedProperty } from "@/lib/portfolio-types";
import { CertificateUpload, LandlordSaysStep } from "@/components/WorksNow";
import { OPEN, PAID_HOW, PAYRUN_LABEL, PayrunTrack, awaitingPay, day, nextFor, pounds, stamp, statusLabel } from "@/components/maintenance/works-ui";
import { JobForm, FORM_TITLE, type FormId } from "@/components/maintenance/JobForms";
import { StagePanel, StageTracker, currentStage } from "@/components/maintenance/JobStages";

/**
 * One job, the whole of it, on one page.
 *
 * James, 21 Oct 2026: "When we click the works order itself, it's a
 * completely blank page... I think we should add the property that they're
 * going out to. We should lay it out the same way we've got the property /
 * portfolio page. We'll have the property they're going out to, the engineer
 * that's going out there, and then a load of click buttons on the right-hand
 * side of the photos of the property, which show the job."
 *
 * Laid out as app/(os)/portfolio/[listingId]: the home's photos and the job's
 * name beside the Actions, the stages across, then the job, the money and the
 * files beside the engineer, the tenants, the landlord and the timeline.
 * Every action is a Move on PATCH /api/works-orders/<id> (lib/works-orders) -
 * the same ones the job sheet sends - so the server's rules, emails and
 * timeline lines are exactly the sheet's. Access is the API's: any signed-in
 * member of staff, and the office alone for the payment run.
 *
 * /maintenance?open=<id> 307s here in middleware, so every old link, email
 * and reminder lands on this page.
 */

type Loaded<T> = { state: "loading" } | { state: "failed"; error: string } | { state: "ready"; data: T };
type Job = { order: WorksOrder; events: WorksEvent[]; canPayrun: boolean };
type Book = { ok: boolean; error?: string; properties: ManagedProperty[] };

/** What is open over the page. */
type Pop =
  | { kind: "form"; form: FormId }
  | { kind: "stage"; stage: StepId }
  | { kind: "cert" }
  | { kind: "landlord_says" }
  | { kind: "people"; who: "tenant" | "contractor" };

type Tone = "plain" | "sage" | "warm" | "hot" | "done";
const TONE: Record<Tone, string> = {
  plain: "border border-line/70 bg-white text-ink/75",
  sage: "bg-[#f1f4ec] text-[#56634a]",
  warm: "bg-accent-soft text-accent-dark",
  hot: "bg-accent-dark text-white",
  done: "bg-sage text-white",
};
const STATUS_TONE: Record<Status, Tone> = { reported: "warm", approval: "warm", approved: "warm", scheduled: "sage", done: "done", invoiced: "done", paid: "done", cancelled: "plain" };

const eyebrow = "text-[10.5px] font-semibold uppercase tracking-wide text-muted";
/* The Portfolio page's boxes and their hover, so the two pages read as one. */
const pop =
  "transition-[translate,box-shadow] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] [&:hover:not(:has(.fixed))]:-translate-x-[3px] [&:hover:not(:has(.fixed))]:-translate-y-[3px] [&:hover:not(:has(.fixed))]:shadow-[6px_6px_0_0_color-mix(in_srgb,var(--ink)_72%,var(--page))]";
const box = `${pop} rounded-2xl border border-line/70 bg-white`;
const quiet = "rounded-full border border-line/80 bg-white px-3 py-1 text-[11.5px] font-medium text-ink/80 transition-colors hover:border-ink/40 hover:text-ink";
const tel = (s: string) => s.replace(/[^\d+]/g, "");
const isImage = (f: { type: string; name: string }) => f.type.startsWith("image/") || /\.(jpe?g|png|gif|webp|heic)$/i.test(f.name);

function Loading({ label }: { label: string }) {
  return (
    <p className="flex items-center gap-2 text-[12.5px] text-muted">
      <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-ink" aria-hidden />
      {label}
    </p>
  );
}

function Pill({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-[3px] text-[11px] font-semibold ${TONE[tone]}`}>{children}</span>;
}

export default function WorksOrderPage() {
  const params = useParams<{ id: string }>();
  const id = decodeURIComponent(String(params.id ?? ""));
  const router = useRouter();
  const saves = useSaveScope(id);

  const [job, setJob] = useState<Loaded<Job>>({ state: "loading" });
  const [book, setBook] = useState<Loaded<ManagedProperty[]>>({ state: "loading" });
  const [trades, setTrades] = useState<{ list: Contractor[]; canCorporate: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [popUp, setPop] = useState<Pop | null>(null);
  const [picked, setPicked] = useState<StepId | null>(null);
  const [lightbox, setLightbox] = useState<{ photos: string[]; start: number } | null>(null);
  const [allActions, setAllActions] = useState(false);

  /* The invoices list lives at /maintenance?section=invoices; /maintenance/invoices is not a job. */
  useEffect(() => { if (id === "invoices") router.replace("/maintenance?section=invoices"); }, [id, router]);

  const load = useCallback(() => {
    fetch(`/api/works-orders/${encodeURIComponent(id)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setJob(j?.ok ? { state: "ready", data: { order: j.order, events: j.events ?? [], canPayrun: j.canPayrun === true } } : { state: "failed", error: j?.error ?? "The job could not be read." }))
      .catch(() => setJob({ state: "failed", error: "The job could not be read just now. Try again in a minute." }));
  }, [id]);
  useEffect(() => { if (id && id !== "invoices") load(); }, [id, load]);
  /* The trades book, for picking and for the engineer's details. */
  useEffect(() => {
    fetch("/api/contractors", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setTrades({ list: j?.ok ? j.contractors ?? [] : [], canCorporate: j?.canCorporate === true }))
      .catch(() => setTrades({ list: [], canCorporate: false }));
  }, []);
  /* The home's photos, off the same read as Portfolio (so arriving from it paints at once). */
  useEffect(() => {
    let live = true;
    readJson<Book>("/api/portfolio", (j) => Boolean(j?.ok))
      .then((j) => { if (live) setBook(j.ok ? { state: "ready", data: j.properties ?? [] } : { state: "failed", error: j.error ?? "The book could not be read." }); })
      .catch((e) => { if (live) setBook({ state: "failed", error: e instanceof Error ? e.message : "The book could not be read." }); });
    return () => { live = false; };
  }, []);

  const o = job.state === "ready" ? job.data.order : null;
  const events = job.state === "ready" ? job.data.events : [];
  const canPayrun = job.state === "ready" && job.data.canPayrun;
  const step = o ? stepOf(o) : null;
  /* Once the job moves on, the panel follows it to the new step. */
  useEffect(() => { setPicked(null); }, [step]);

  const home = useMemo(() => {
    if (!o || book.state !== "ready") return null;
    const byId = o.propertyId ? book.data.filter((p) => p.propertyId === o.propertyId) : [];
    const byName = byId.length ? byId : book.data.filter((p) => p.name.trim().toLowerCase() === o.propertyName.trim().toLowerCase());
    return [...byName].sort((a, b) => (b.images?.length ?? 0) - (a.images?.length ?? 0))[0] ?? null;
  }, [o, book]);
  const shots = home ? (home.images?.length ? home.images : home.image ? [home.image] : []) : [];
  /* Someone else's book: the office can still open their record (GET /api/contractors?id=, which says who may). */
  const [theirs, setTheirs] = useState<Contractor | null>(null);
  const inBook = o?.contractorId ? trades?.list.find((c) => c.id === o.contractorId) ?? null : null;
  const wantOther = !!o?.contractorId && trades !== null && !inBook ? o!.contractorId : null;
  useEffect(() => {
    setTheirs(null);
    if (!wantOther) return;
    let live = true;
    fetch(`/api/contractors?id=${encodeURIComponent(wantOther)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (live && j?.ok && j.contractor) setTheirs(j.contractor); })
      .catch(() => null);
    return () => { live = false; };
  }, [wantOther]);
  const contractor = inBook ?? (theirs && theirs.id === o?.contractorId ? theirs : null);

  const move = useCallback(async (m: Move, label = "Job"): Promise<boolean> => {
    setBusy(true);
    setErr(null);
    const settle = saves.reporter.begin(label);
    const r = await fetch(`/api/works-orders/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(m) }).then((x) => x.json()).catch(() => null);
    setBusy(false);
    if (!r?.ok) {
      const problem = r?.error ?? "That didn't work.";
      setErr(problem);
      settle({ ok: false, problem });
      return false;
    }
    setJob((cur) => ({ state: "ready", data: { order: r.order, events: r.events ?? [], canPayrun: r.canPayrun ?? (cur.state === "ready" ? cur.data.canPayrun : false) } }));
    settle({ ok: true });
    return true;
  }, [id, saves.reporter]);

  async function uploadFile(file: File, kind?: "invoice" | "quote"): Promise<boolean> {
    if (!o) return false;
    const fd = new FormData();
    fd.append("file", file);
    fd.append("scope", "document");
    fd.append("ref", `works-${o.ref}`);
    setBusy(true);
    setErr(null);
    const r = await fetch("/api/r2/upload", { method: "POST", body: fd }).then((x) => x.json()).catch(() => null);
    setBusy(false);
    if (!r?.ok) {
      const problem = r?.error ?? "The file did not upload, so nothing was saved.";
      setErr(problem);
      saves.reporter.begin("File")({ ok: false, problem });
      return false;
    }
    return move({ action: "file", file: { key: r.key, name: r.name, type: r.type, ...(kind ? { kind } : {}) } }, "File");
  }

  /* The certificate from the visit (app/api/works-orders/[id]/certificate). */
  async function certificate(fd: FormData): Promise<string | null> {
    setBusy(true);
    setErr(null);
    const settle = saves.reporter.begin("Certificate");
    const r = await fetch(`/api/works-orders/${encodeURIComponent(id)}/certificate`, { method: "POST", body: fd }).then((x) => x.json()).catch(() => null);
    setBusy(false);
    if (!r?.ok) {
      const problem = r?.error ?? "The certificate did not file.";
      settle({ ok: false, problem });
      return problem;
    }
    setJob((cur) => ({ state: "ready", data: { order: r.order, events: r.events ?? [], canPayrun: cur.state === "ready" ? cur.data.canPayrun : false } }));
    settle({ ok: true });
    return null;
  }

  /* Raise our invoice to the landlord (lib/invoices): drafted, then opened. */
  async function invoiceLandlord() {
    if (!o) return;
    setBusy(true);
    const settle = saves.reporter.begin("Invoice");
    const r = await fetch("/api/invoices", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ orderId: o.id }) }).then((x) => x.json()).catch(() => null);
    setBusy(false);
    if (!r?.ok) {
      const problem = r?.error ?? "Could not draft the invoice.";
      setErr(problem);
      settle({ ok: false, problem });
      return;
    }
    settle({ ok: true });
    router.push(`/maintenance/invoices/${encodeURIComponent(r.invoice.id)}`);
  }

  const fileRef = useRef<HTMLInputElement>(null);
  const openPop = (p: Pop) => { setErr(null); setPop(p); };
  /* A move from inside a pop-up closes it once it lands. An edit of the
     landlord's details on the way to telling them does not. */
  const popMove = async (m: Move, label?: string) => {
    const ok = await move(m, label);
    if (ok && m.action !== "edit" && m.action !== "file") setPop(null);
    return ok;
  };

  if (job.state === "loading" || id === "invoices") {
    return <div className="py-16"><Loading label="Opening the job…" /></div>;
  }
  if (job.state === "failed" || !o) {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <p className="hand text-[20px]">The job could not be opened</p>
        <p className="mt-2 text-[12.5px] text-muted">{job.state === "failed" ? job.error : "No such job."}</p>
        <Link href="/maintenance" className="mt-4 inline-block text-[12.5px] underline">Back to Maintenance</Link>
      </div>
    );
  }

  const open = OPEN.includes(o.status);
  const closed = o.status === "paid" || o.status === "cancelled";
  const late = open && worksLate(o);
  const urgency = o.kind === "repair" ? URGENCIES.find((u) => u.id === o.urgency)?.label ?? null : null;
  const tenants: JobTenant[] = o.tenants.length ? o.tenants : o.tenant || o.tenantPhone || o.tenantEmail ? [{ name: o.tenant, phone: o.tenantPhone, email: o.tenantEmail }] : [];
  const next = nextFor(o);
  const address = [o.propertyName, o.locality].filter(Boolean).join(", ");
  const here = currentStage(o);
  const stageShown: StepId | null = picked ?? here;
  const payrunAt = (o as WorksOrder & { payrunAt?: string | null }).payrunAt ?? null;

  /* Out for quotes, a different contractor is asked for a price, never sent
     the works order (Sean McMahon, 21 Oct 2026). */
  const quoting = step === "quote";
  const pickContractor = () => openPop(quoting ? { kind: "form", form: "request_quote" } : { kind: "stage", stage: "pick_contractor" });
  /* The works order again, to whoever is on the job: after a change, or when
     theirs went astray. Once it has gone, and while the job is open. */
  const canResend = open && !quoting && !!o.contractorId && !!(o.contractorConfirmedAt || o.contractorContactedAt || o.scheduledAt);
  /* The contractor was changed after the works order went: the new one hasn't had it. */
  const unsent = canResend && !!o.orderSentTo && o.orderSentTo !== o.contractorId;
  const resendOrder = () => void move({ action: "resend_order" }, "Works order");
  const live = o.quoteAsks.filter((a) => a.state === "asked" || a.state === "quoted").length;

  /* ── the actions, beside the photos ─────────────────────────────────── */
  type Tile = { key: string; label: string; what: string; icon: string; off?: string; done?: boolean; run: () => void };
  const isClosed = closed ? "The job is closed" : undefined;
  const tiles: Tile[] = [
    { key: "quote", label: "Log a Quote", what: o.quotePence != null ? `Now ${pounds(o.quotePence)}` : "Their price, and the file", icon: "coin", off: isClosed, done: o.quotePence != null, run: () => openPop({ kind: "form", form: "quote" }) },
    { key: "approve", label: o.status === "approval" ? "Landlord Approved" : "Approve the Quote", what: o.status === "approval" ? "Waiting on their yes" : o.approvedAt ? `${o.approvedBy || "Approved"} · ${day(o.approvedAt)}` : "Their go-ahead, by phone or email", icon: "checklist", off: isClosed, done: !!o.approvedAt && o.status !== "approval", run: () => openPop({ kind: "form", form: "approve" }) },
    { key: "request_quote", label: "Ask for Quotes", what: o.quoteAsks.length ? `${o.quoteAsks.length} asked${live && live !== o.quoteAsks.length ? `, ${live} in the running` : ""}` : o.quoteRequestedAt ? `Asked ${day(o.quoteRequestedAt)}` : "One contractor or several", icon: "mail", off: isClosed ?? (o.contractorConfirmedAt ? "The works order has gone" : undefined), run: () => openPop({ kind: "form", form: "request_quote" }) },
    { key: "tell", label: "Tell the Landlord", what: o.landlordToldAt ? `Told ${day(o.landlordToldAt)}` : "Ring them, or email the report", icon: "call", off: o.landlordSkipped ? "Not involved in this one" : isClosed, done: !!o.landlordToldAt, run: () => openPop({ kind: "stage", stage: "tell_landlord" }) },
    { key: "arranging", label: "Who's Arranging It", what: o.arranging === "us" ? "Us" : o.arranging === "landlord" ? `The landlord${o.landlordFollowUpAt ? ` · follow up ${day(o.landlordFollowUpAt)}` : ""}` : "The landlord, or us", icon: "user", off: isClosed, done: !!o.arranging, run: () => openPop({ kind: "stage", stage: o.arranging === "landlord" ? "landlord_follow_up" : "arranging" }) },
    { key: "pick", label: quoting ? "Ask Another Contractor" : o.contractorId ? "Change the Contractor" : "Pick a Contractor", what: quoting ? "For a quote, on their own link" : o.contractorName || "Nearest first, by trade", icon: "setting", off: !open ? "Only on an open job" : undefined, done: !quoting && !!o.contractorId, run: pickContractor },
    { key: "resend", label: unsent ? "Send the Works Order" : "Send the Works Order Again", what: canResend ? (unsent ? `To ${o.contractorName}, not sent yet` : `To ${o.contractorName}`) : quoting ? "Once a quote is approved" : "Once it has gone", icon: "mail", off: canResend ? undefined : !open ? "Only on an open job" : quoting ? "The job is out for quotes" : "It hasn't gone yet", run: resendOrder },
    { key: "confirm", label: "Confirm the Contractor", what: o.contractorConfirmedAt ? `Confirmed ${day(o.contractorConfirmedAt)}` : "Sends the works order", icon: "file-contract", off: !o.contractorId ? "Pick a contractor first" : !open ? "Only on an open job" : undefined, done: !!o.contractorConfirmedAt, run: () => openPop({ kind: "stage", stage: "contractor_confirm" }) },
    { key: "date", label: o.scheduledAt ? "Move the Date" : "Set the Date", what: o.scheduledAt ? stamp(o.scheduledAt) : "The date and time agreed", icon: "calendar", off: isClosed ?? (o.completedAt ? "The work is done" : undefined), done: !!o.scheduledAt, run: () => openPop({ kind: "form", form: "schedule" }) },
    { key: "done", label: "Mark It Done", what: o.completedAt ? `Done ${day(o.completedAt)}` : "What was done, and when", icon: "checklist", off: isClosed ?? (o.completedAt ? "Already done" : undefined), done: !!o.completedAt, run: () => openPop({ kind: "form", form: "done" }) },
    { key: "cert", label: "Add a Certificate", what: "Read and filed on the home", icon: "shield", off: o.status === "cancelled" ? "The job is cancelled" : undefined, run: () => openPop({ kind: "cert" }) },
    ...(o.kind === "repair" ? [{ key: "happy", label: "Is the Tenant Happy?", what: o.tenantHappy ? `${o.tenantHappy === "yes" ? "Happy" : "Not happy"}${o.tenantHappyAt ? ` · ${day(o.tenantHappyAt)}` : ""}` : "Their yes or no", icon: "message", off: !o.completedAt ? "Once it's done" : isClosed, done: !!o.tenantHappy, run: () => openPop({ kind: "stage", stage: "aftercare" }) }] : []),
    { key: "payee", label: "Who's Being Paid", what: o.payee === "agent" ? "The agent, who paid it" : o.payee === "contractor" ? o.contractorName || "The contractor" : "The contractor, or you", icon: "wallet", off: isClosed, done: !!o.payee, run: () => openPop({ kind: "stage", stage: "payment" }) },
    { key: "invoice", label: o.invoicePence != null ? "Change the Invoice" : "Log the Invoice", what: o.invoicePence != null ? `${pounds(o.invoicePence)}${o.invoiceRef ? ` · ${o.invoiceRef}` : ""}` : "Amount, number and file", icon: "doc", off: isClosed, done: o.invoicePence != null, run: () => openPop({ kind: "form", form: "invoice" }) },
    { key: "landlord_says", label: "Landlord Authorises", what: o.landlordInvoiceAnswer ? "Answered" : o.landlordInvoiceAskedAt ? `Sent ${day(o.landlordInvoiceAskedAt)}` : "From the rent, or direct", icon: "home", off: o.invoicePence == null ? "Log the invoice first" : isClosed, done: !!o.landlordInvoiceAnswer, run: () => openPop({ kind: "landlord_says" }) },
    { key: "raise", label: "Invoice the Landlord", what: "Draft our invoice to them", icon: "file-contract", off: o.status === "cancelled" ? "The job is cancelled" : undefined, run: () => void invoiceLandlord() },
    /* The office says it's keyed on PayProp (James, 21 Oct 2026). Beside Mark paid, for them only. */
    ...(canPayrun ? [{
      key: "payrun",
      label: payrunAt ? "Take off the Payment Run" : PAYRUN_LABEL,
      what: payrunAt ? `On it since ${day(payrunAt)}` : "Keyed on PayProp",
      icon: "bank",
      off: !awaitingPay(o) ? (o.invoicePence == null ? "Log the invoice first" : o.status === "paid" ? "Already paid" : "Mark it done first") : undefined,
      done: !!payrunAt,
      run: () => void move({ action: payrunAt ? "payrun_undo" : "payrun" } as Move, PAYRUN_LABEL),
    }] : []),
    { key: "paid", label: "Mark It Paid", what: o.paidAt ? `Paid ${day(o.paidAt)}` : "How it was settled", icon: "coin", off: o.status === "paid" ? "Already paid" : o.status === "cancelled" ? "The job is cancelled" : o.invoicePence == null ? "Log the invoice first" : undefined, done: o.status === "paid", run: () => openPop({ kind: "form", form: "paid" }) },
    { key: "note", label: "Add a Note", what: "A call, an email, a query", icon: "note", run: () => openPop({ kind: "form", form: "note" }) },
    { key: "file", label: "Add a File or Photo", what: "On the job and the home", icon: "camera", off: busy ? "Uploading…" : undefined, run: () => fileRef.current?.click() },
    { key: "tenant", label: tenants.length > 1 ? "Ring or Email the Tenants" : "Ring or Email the Tenant", what: tenants.length ? tenants.map((t) => t.name || "Unnamed").join(", ") : "None on the job", icon: "call", off: tenants.length ? undefined : "No tenant on the job", run: () => openPop({ kind: "people", who: "tenant" }) },
    { key: "trade", label: "Ring or Email the Contractor", what: o.contractorName || "Nobody on the job yet", icon: "call", off: o.contractorId ? undefined : "Pick a contractor first", run: () => openPop({ kind: "people", who: "contractor" }) },
    { key: "edit", label: "Edit the Details", what: "Title, people, access, authority", icon: "pencil", run: () => openPop({ kind: "form", form: "edit" }) },
    open || o.status === "paid"
      ? { key: "cancel", label: "Cancel the Job", what: "Says why on the timeline", icon: "cross", off: o.status === "paid" ? "Already paid" : undefined, run: () => openPop({ kind: "form", form: "cancel" }) }
      : { key: "reopen", label: "Reopen the Job", what: o.status === "cancelled" ? o.cancelledReason || "Cancelled" : "Back to open", icon: "clock", run: () => openPop({ kind: "form", form: "reopen" }) },
  ];
  /* The tile for the step the job is on is the pink one. */
  const NEXT_TILE: Partial<Record<StepId, string>> = {
    quote: o.status === "approval" ? "approve" : "quote", tell_landlord: "tell", arranging: "arranging", landlord_follow_up: "arranging",
    pick_contractor: "pick", contractor_confirm: "confirm", booking: "date", visit: "done", aftercare: "happy", payment: "payee",
    invoice: o.invoicePence == null ? "invoice" : "paid",
  };
  const nextTile = step && o.status !== "cancelled" ? NEXT_TILE[step] : undefined;
  /* On a phone the list stops at eight, the step's own first, with the rest a tap away. */
  const ordered = [...tiles].sort((a, b) => Number(b.key === nextTile) - Number(a.key === nextTile));

  const tileCls = (on: boolean) =>
    `group flex min-h-[50px] w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition-[transform,box-shadow,border-color] duration-200 hover:-translate-x-0.5 hover:-translate-y-0.5 hover:border-ink/60 hover:shadow-[3px_3px_0_0_color-mix(in_srgb,var(--ink)_72%,var(--page))] disabled:pointer-events-none disabled:opacity-45 ${on ? "border-accent-dark/60 bg-accent-soft/60" : "border-line/60 bg-white"}`;

  return (
    <SaveScopeProvider scope={saves}>
      <div className="space-y-5">
        {/* ── back, and the chip ─────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="mr-auto flex min-w-0 items-center gap-3">
            <Link href={`/maintenance${o.kind === "planned" ? "?section=planned" : ""}`} className="inline-flex shrink-0 items-center gap-1.5 text-[12.5px] text-muted hover:text-ink">
              <span aria-hidden>←</span> Maintenance
            </Link>
            <SaveChip scope={saves} className="bg-white" />
          </div>
          {home && (
            <Link href={`/portfolio/${encodeURIComponent(String(home.listingId))}`} className="inline-flex items-center gap-1.5 rounded-full border border-line/80 bg-white px-3.5 py-1.5 text-[12px] text-muted transition-colors hover:text-ink">
              <DoodleIcon name="home" size={12} /> The property&apos;s page
            </Link>
          )}
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_390px] 2xl:grid-cols-[minmax(0,1fr)_460px]">
          {/* ── 1. the home they're going out to, and the job ────────────── */}
          <section className={`${box} flex min-w-0 flex-col p-3`}>
            {/* The photos take whatever height the Actions beside them need, so the two boxes stand level. */}
            <div className={`grid flex-1 grid-cols-1 gap-2 ${shots.length > 1 ? "sm:grid-cols-[minmax(0,1fr)_140px] 2xl:grid-cols-[minmax(0,1fr)_170px]" : ""}`}>
              <button
                type="button"
                onClick={() => shots.length && setLightbox({ photos: shots, start: 0 })}
                aria-label={shots.length ? "See the photos" : "No photos"}
                className="group relative aspect-[16/10] overflow-hidden rounded-xl bg-box sm:aspect-auto sm:min-h-[300px]"
              >
                {book.state === "loading" ? (
                  <span className="absolute inset-0 flex items-center justify-center"><Loading label="Finding the photos…" /></span>
                ) : (
                  <PropertyPhoto src={shots[0] ?? null} alt="" loading="eager" width={1400} height={875} className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.015]" />
                )}
                {shots.length > 0 && (
                  <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-[11.5px] font-semibold backdrop-blur">
                    <DoodleIcon name="pack/photo" size={12} /> {shots.length} {shots.length === 1 ? "photo" : "photos"}
                  </span>
                )}
              </button>
              {shots.length > 1 && (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-1">
                  {[0, 1, 2].map((i) => {
                    const src = shots[i + 1];
                    if (!src) return <span key={i} aria-hidden className="aspect-square rounded-xl bg-box" />;
                    const more = i === 2 && shots.length > 4 ? shots.length - 4 : 0;
                    return (
                      <button key={src + i} type="button" onClick={() => setLightbox({ photos: shots, start: i + 1 })} aria-label={more ? `${more} more photos` : `Photo ${i + 2}`} className="group relative aspect-square overflow-hidden rounded-xl bg-box">
                        <PropertyPhoto src={src} alt="" className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
                        {more > 0 && <span className="absolute inset-0 flex items-center justify-center bg-ink/45 text-[18px] font-semibold text-white">+{more}</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="px-2 pb-1.5 pt-4">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-[11.5px] font-semibold text-muted">Job #{o.ref}</span>
                <Pill tone="plain">{o.kind === "repair" ? "Repair" : "Planned"}</Pill>
                <Pill tone={STATUS_TONE[o.status]}>{statusLabel(o)}</Pill>
                {urgency && open && <Pill tone={o.urgency === "emergency" ? "hot" : o.urgency === "urgent" ? "warm" : "sage"}>{urgency}</Pill>}
                {late && <Pill tone="hot">Overdue</Pill>}
                {o.rehearsal && <Pill tone="plain">Walkthrough</Pill>}
              </div>
              <h1 className="hand mt-2 min-w-0 break-words text-[26px] leading-[1.1] sm:text-[30px]">{o.title || o.category || "A job"}</h1>
              <p className="mt-1.5 flex min-w-0 items-start gap-1.5 text-[13px] text-muted">
                <DoodleIcon name="home" size={13} className="mt-[3px]" />
                {home ? (
                  <Link href={`/portfolio/${encodeURIComponent(String(home.listingId))}`} className="min-w-0 break-words underline decoration-line underline-offset-2 hover:text-ink hover:decoration-ink">{address}</Link>
                ) : (
                  <span className="min-w-0 break-words">{address}</span>
                )}
              </p>
              <dl className="mt-3 grid grid-cols-2 gap-x-5 gap-y-3 text-[12.5px] sm:grid-cols-4">
                {o.kind === "repair" ? <Fact k="Attend by" v={o.dueAt ? stamp(o.dueAt) : "Not set"} hot={late} quiet={!o.dueAt} /> : <Fact k="Due by" v={o.dueAt ? day(o.dueAt) : "Not set"} hot={late} quiet={!o.dueAt} />}
                <Fact k="Booked" v={o.scheduledAt ? stamp(o.scheduledAt) : "No date yet"} quiet={!o.scheduledAt} />
                <Fact k="Engineer" v={o.contractorName || "Not picked yet"} quiet={!o.contractorName} />
                <Fact k="Next" v={next.text} hot={next.hot} />
              </dl>
            </div>
          </section>

          {/* ── the actions, level with the photos ─────────────────────────── */}
          <section className={`${box} @container flex flex-col p-4`}>
            <div className="mb-3 flex items-center justify-between gap-2 px-1">
              <p className={eyebrow}>Actions</p>
              <span className="text-[11px] text-muted">Any stage, in any order</span>
            </div>
            <div className="grid grid-cols-1 gap-2 @[22rem]:grid-cols-2 @[44rem]:grid-cols-3 @[60rem]:grid-cols-4">
              {ordered.map((t, i) => (
                <button
                  key={t.key}
                  type="button"
                  disabled={!!t.off}
                  onClick={t.run}
                  title={t.off ?? t.what}
                  className={`${tileCls(t.key === nextTile)} ${i >= 8 && !allActions ? "hidden sm:flex" : ""}`}
                >
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${t.key === nextTile ? "bg-accent-dark text-white" : t.done ? "bg-[#f1f4ec] text-[#56634a]" : "bg-accent-soft text-accent-dark"}`}>
                    <DoodleIcon name={t.icon} size={13} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 block text-[12.5px] font-semibold leading-tight">{t.label}</span>
                    <span className={`block truncate text-[11px] leading-snug ${t.key === nextTile ? "text-accent-dark" : "text-muted"}`}>{t.key === nextTile ? `Next · ${t.off ?? t.what}` : t.off ?? t.what}</span>
                  </span>
                  {t.done && t.key !== nextTile && <span aria-label="Done" className="shrink-0 text-[11px] text-[#56634a]">✓</span>}
                </button>
              ))}
            </div>
            {ordered.length > 8 && (
              <button type="button" onClick={() => setAllActions((v) => !v)} className={`${quiet} mt-3 self-start sm:hidden`}>
                {allActions ? "Fewer actions" : `All ${ordered.length} actions`}
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadFile(f); e.target.value = ""; }} />
            {err && !popUp && <p className="mt-3 px-1 text-[12px] text-accent-dark">{err}</p>}
          </section>
        </div>

        {/* ── the stages, across ───────────────────────────────────────────── */}
        <section className={`${box} min-w-0 p-4 sm:p-5`}>
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <p className={eyebrow}>Where It&apos;s Up To</p>
            <span className="text-[11.5px] text-muted">Press a stage to open it</span>
          </div>
          <StageTracker o={o} picked={stageShown} onPick={(s) => setPicked(s === here ? null : s)} />
          {o.status === "cancelled" && (
            <p className="mt-3 rounded-xl border border-line/70 bg-box px-4 py-2.5 text-[12.5px]">Cancelled: {o.cancelledReason || "no reason given"}.</p>
          )}
          {stageShown && (
            <div className="mt-4">
              <StagePanel
                o={o}
                stage={stageShown}
                move={(m) => move(m)}
                busy={busy}
                err={popUp ? null : err}
                canCorporate={trades?.canCorporate ?? false}
                canPayrun={canPayrun}
                onInvoiceLandlord={() => void invoiceLandlord()}
                onCertificate={certificate}
                onForm={(form) => openPop({ kind: "form", form })}
              />
              {picked && <button type="button" onClick={() => setPicked(null)} className={`${quiet} mt-3`}>Back to the step it&apos;s on</button>}
            </div>
          )}
        </section>

        {/* ── the job and the people ──────────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_390px] 2xl:grid-cols-[minmax(0,1fr)_460px]">
          <div className="min-w-0 space-y-5">
            <Card title="The Job" icon="note" action={<button type="button" onClick={() => openPop({ kind: "form", form: "edit" })} className={quiet}>Edit</button>}>
              <p className="whitespace-pre-wrap break-words rounded-xl bg-box px-3.5 py-3 text-[14px] leading-relaxed">{o.description || <span className="text-muted">No detail recorded.</span>}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {categoriesOf(o.category).map((c) => <Pill key={c} tone="sage">{c}</Pill>)}
              </div>
              <dl className="mt-4 grid gap-x-5 gap-y-3 text-[12.5px] sm:grid-cols-2">
                <Fact k="Reported" v={`${o.reportedAt ? day(o.reportedAt) : "Not recorded"}${o.reportedBy ? ` by ${o.reportedBy.toLowerCase()}` : ""}`} />
                {o.raisedBy && <Fact k="Raised by" v={o.raisedBy} />}
                <Fact k="Access" v={o.access || "No access notes"} quiet={!o.access} />
                {o.completedAt && <Fact k="Done" v={`${stamp(o.completedAt)}${o.completionNote ? ` · ${o.completionNote}` : ""}`} />}
              </dl>
            </Card>

            <Card title="Money" icon="coin" action={
              <span className="flex flex-wrap justify-end gap-1.5">
                {!closed && <button type="button" onClick={() => openPop({ kind: "form", form: "quote" })} className={quiet}>{o.quotePence != null ? "Change quote" : "Log a quote"}</button>}
                {!closed && <button type="button" onClick={() => openPop({ kind: "form", form: "invoice" })} className={quiet}>{o.invoicePence != null ? "Change invoice" : "Log the invoice"}</button>}
              </span>
            }>
              <div className="grid gap-2.5 sm:grid-cols-3">
                <Figure k="Landlord's authority" v={pounds(o.authorityPence)} />
                <Figure k="Quote" v={o.quotePence != null ? pounds(o.quotePence) : "None yet"} quiet={o.quotePence == null} />
                <Figure k="Approved" v={o.approvedAt ? `${o.approvedBy || "Yes"} · ${day(o.approvedAt)}` : o.status === "approval" ? "Waiting on the landlord" : o.quotePence == null || o.quotePence <= o.authorityPence ? "Within authority" : "Not yet"} quiet={!o.approvedAt} hot={o.status === "approval"} />
                {o.payee && <Figure k="Paying" v={o.payee === "agent" ? `${o.raisedBy || "The agent"} (paid it themselves)` : o.contractorName || "The contractor"} />}
                <Figure k="Invoice" v={o.invoicePence != null ? `${pounds(o.invoicePence)}${o.invoiceRef ? ` · ${o.invoiceRef}` : ""}` : "None yet"} quiet={o.invoicePence == null} />
                {o.accountsToldAt && <Figure k="Accounts told" v={day(o.accountsToldAt)} />}
                {o.landlordInvoiceAnswer && <Figure k="Landlord says" v={o.landlordInvoiceAnswer === "pay" ? "From the rent" : o.landlordInvoiceAnswer === "direct" ? "Paying direct" : "A query"} hot={o.landlordInvoiceAnswer === "query"} />}
                {o.paidAt && <Figure k="Paid" v={`${day(o.paidAt)} · ${PAID_HOW.find((h) => h.id === o.paidHow)?.label ?? ""}`} />}
              </div>
              {/* Invoice in, on the payment run, paid - for everyone to see (James, 21 Oct 2026). */}
              {o.invoicePence != null && (
                <div className={`mt-3 rounded-xl border px-3.5 py-2.5 ${payrunAt || o.status === "paid" ? "border-[#56634a]/40 bg-[#f1f3ec]" : "border-line/70 bg-box"}`}>
                  <PayrunTrack o={o} />
                </div>
              )}
            </Card>

            <Card title="Files and Photos" icon="folder" action={
              <span className="flex flex-wrap justify-end gap-1.5">
                {o.status !== "cancelled" && <button type="button" onClick={() => openPop({ kind: "cert" })} className={quiet}>Add a certificate</button>}
                <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} className={quiet}>{busy ? "Uploading…" : "Add a file or photo"}</button>
              </span>
            }>
              <Files o={o} onPhoto={(photos, start) => setLightbox({ photos, start })} />
            </Card>
          </div>

          <div className="min-w-0 space-y-5">
            <Engineer o={o} c={contractor} reading={trades === null} onPick={pickContractor} canPick={open} onResend={canResend ? resendOrder : undefined} unsent={unsent} busy={busy} />

            <Person tone="sage" icon="user" role={tenants.length > 1 ? `Tenants (${tenants.length})` : "Tenant"}>
              {tenants.length === 0 ? (
                <p className="text-[12.5px] text-muted">None on the job.</p>
              ) : (
                tenants.map((t, i) => (
                  <div key={`${t.name}-${i}`} className={i ? "mt-2.5 border-t border-line/50 pt-2.5" : ""}>
                    <p className="text-[13.5px] font-semibold">{t.name || "Unnamed"}{t.room ? <span className="font-normal text-muted"> · {t.room}</span> : null}</p>
                    <Reach phone={t.phone} email={t.email} name={t.name} role="tenant" address={o.propertyName} />
                  </div>
                ))
              )}
              {o.access && <p className="mt-2.5 flex items-start gap-1.5 text-[12px]"><DoodleIcon name="key" size={12} className="mt-[2px] text-muted" />{o.access}</p>}
              {o.quietTenants && <p className="mt-2 text-[11.5px] text-muted">A discreet job: no automatic email goes to the tenants.</p>}
              {o.tenantHappy && <p className="mt-2.5"><Pill tone={o.tenantHappy === "yes" ? "sage" : "hot"}>{o.tenantHappy === "yes" ? "Happy" : "Not happy"}{o.tenantHappyAt ? ` · ${day(o.tenantHappyAt)}` : ""}</Pill></p>}
            </Person>

            <Person tone="clay" icon="home" role="Landlord">
              <p className="text-[13.5px] font-semibold">{o.landlord || "No landlord named"}</p>
              {o.landlordSkipped ? (
                <p className="mt-1 text-[12px] text-muted">Not involved in this one.</p>
              ) : o.landlordMobile || o.landlordEmail ? (
                <Reach phone={o.landlordMobile} email={o.landlordEmail} name={o.landlord} role="landlord" address={o.propertyName} />
              ) : (
                <p className="mt-1 text-[12px] text-accent-dark">No mobile or email yet.</p>
              )}
              {!o.landlordSkipped && (
                <p className="mt-2.5 flex flex-wrap gap-1.5">
                  <Pill tone={o.landlordToldAt ? "sage" : "warm"}>{o.landlordToldAt ? `Told ${day(o.landlordToldAt)}` : "Not told yet"}</Pill>
                  {o.arranging === "landlord" && <Pill tone="plain">Organising it{o.landlordFollowUpAt ? ` · follow up ${day(o.landlordFollowUpAt)}` : ""}</Pill>}
                  {o.arranging === "us" && <Pill tone="plain">We&apos;re arranging it</Pill>}
                </p>
              )}
              {o.landlordEmail.includes("@") && <LandlordJobEmails key={o.landlordEmail} job={o.id} name={o.landlord} order={o} compact className="mt-3 border-t border-line/50 pt-3" />}
            </Person>

            <Card title="Timeline" icon="clock" action={<button type="button" onClick={() => openPop({ kind: "form", form: "note" })} className={quiet}>Add a note</button>}>
              {events.length === 0 ? (
                <p className="text-[12px] text-muted">Nothing on the timeline yet.</p>
              ) : (
                <ol className="relative max-h-[560px] overflow-y-auto pr-1">
                  {events.map((e, i) => (
                    <li key={e.id} className="relative pb-4 pl-6 last:pb-0">
                      {i < events.length - 1 && <span aria-hidden className="absolute left-[5px] top-3 h-full w-[2px] bg-line/60" />}
                      <span aria-hidden className={`absolute left-0 top-[5px] h-3 w-3 rounded-full ${i === 0 ? "bg-accent-dark ring-4 ring-accent-soft" : "border-2 border-line bg-white"}`} />
                      <p className="break-words text-[12.5px] leading-snug">{e.text}</p>
                      <p className="mt-0.5 text-[10.5px] text-muted">{e.by} · {stamp(e.at)}</p>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          </div>
        </div>
      </div>

      {/* ── what opens over the page ───────────────────────────────────────── */}
      {popUp?.kind === "form" && (
        <Modal title={FORM_TITLE[popUp.form](o)} onClose={() => setPop(null)}>
          <JobForm key={popUp.form} o={o} form={popUp.form} contractors={trades?.list ?? []} move={popMove} busy={busy} err={err} onBack={() => setPop(null)} uploadFile={uploadFile} />
          {popUp.form === "done" && !o.completedAt && (
            <button type="button" onClick={() => openPop({ kind: "form", form: "already_done" })} className="mt-3 text-[11.5px] text-muted underline underline-offset-2 hover:text-ink">It was done before it was on the OS - no emails</button>
          )}
        </Modal>
      )}
      {popUp?.kind === "stage" && (
        <Modal onClose={() => setPop(null)} wide>
          <StagePanel
            o={o}
            stage={popUp.stage}
            move={(m) => popMove(m)}
            busy={busy}
            err={err}
            canCorporate={trades?.canCorporate ?? false}
            canPayrun={canPayrun}
            onInvoiceLandlord={() => void invoiceLandlord()}
            onCertificate={certificate}
            onForm={(form) => openPop({ kind: "form", form })}
          />
        </Modal>
      )}
      {popUp?.kind === "cert" && (
        <Modal title="Add a Certificate" onClose={() => setPop(null)}>
          <CertificateUpload o={o} busy={busy} onCertificate={async (fd) => { const problem = await certificate(fd); if (!problem) setPop(null); return problem; }} onDone={() => setPop(null)} />
        </Modal>
      )}
      {popUp?.kind === "landlord_says" && (
        <Modal title="The Landlord Authorises the Invoice" onClose={() => setPop(null)}>
          <LandlordSaysStep o={o} move={async (m) => { await popMove(m); }} busy={busy} />
          {err && <p className="mt-3 text-[12px] text-accent-dark">{err}</p>}
        </Modal>
      )}
      {popUp?.kind === "people" && (
        <Modal title={popUp.who === "tenant" ? (tenants.length > 1 ? "The Tenants" : "The Tenant") : "The Contractor"} onClose={() => setPop(null)}>
          {popUp.who === "tenant" ? (
            <ul className="divide-y divide-line/50">
              {tenants.map((t, i) => (
                <li key={`${t.name}-${i}`} className="py-3 first:pt-0 last:pb-0">
                  <p className="text-[14px] font-semibold">{t.name || "Unnamed"}{t.room ? <span className="font-normal text-muted"> · {t.room}</span> : null}</p>
                  <CallEmail phone={t.phone} email={t.email} name={t.name} role="tenant" address={o.propertyName} />
                </li>
              ))}
            </ul>
          ) : (
            <div>
              <p className="text-[14px] font-semibold">{o.contractorName}{contractor?.contact ? <span className="font-normal text-muted"> · {contractor.contact}</span> : null}</p>
              <CallEmail phone={contractor?.phone ?? ""} email={contractor?.email ?? ""} name={contractor?.contact || o.contractorName} address={o.propertyName} />
              {o.contractorId && (
                <Link href={`/contractors?open=${encodeURIComponent(o.contractorId)}`} className={`${quiet} mt-4 inline-flex items-center gap-1.5`}>
                  <DoodleIcon name="link" size={12} /> Their record, jobs and what they&apos;re owed
                </Link>
              )}
            </div>
          )}
        </Modal>
      )}
      {lightbox && <PhotoLightbox photos={lightbox.photos} start={lightbox.start} name={o.title} onClose={() => setLightbox(null)} />}
    </SaveScopeProvider>
  );
}

/* ── the page's pieces ────────────────────────────────────────────────── */

function Fact({ k, v, hot = false, quiet = false }: { k: string; v: string; hot?: boolean; quiet?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">{k}</dt>
      <dd className={`mt-0.5 break-words ${hot ? "font-semibold text-accent-dark" : quiet ? "text-muted" : ""}`}>{v}</dd>
    </div>
  );
}

function Figure({ k, v, quiet = false, hot = false }: { k: string; v: string; quiet?: boolean; hot?: boolean }) {
  return (
    <div className={`min-w-0 rounded-xl px-3.5 py-2.5 ${hot ? "bg-accent-soft/70" : "bg-box"}`}>
      <p className="text-[11px] text-muted">{k}</p>
      <p className={`mt-0.5 break-words text-[14px] ${quiet ? "text-muted" : "font-semibold"} ${hot ? "text-accent-dark" : ""}`}>{v}</p>
    </div>
  );
}

function Card({ title, icon, action, children }: { title: string; icon: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className={`${box} min-w-0 p-4 sm:p-5`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-[15px]">
          <DoodleIcon name={icon} size={15} className="text-accent-dark" />
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

const PERSON_TONE = {
  sage: { band: "bg-[#f1f4ec]", ink: "text-[#56634a]", border: "border-sage/70" },
  clay: { band: "bg-accent-soft/70", ink: "text-accent-dark", border: "border-accent/50" },
  brown: { band: "bg-brown/[0.07]", ink: "text-brown", border: "border-brown/25" },
} as const;

function Person({ tone, icon, role, action, children }: { tone: keyof typeof PERSON_TONE; icon: string; role: string; action?: React.ReactNode; children: React.ReactNode }) {
  const t = PERSON_TONE[tone];
  return (
    <section className={`${pop} min-w-0 overflow-hidden rounded-2xl border bg-white ${t.border}`}>
      <div className={`flex items-center justify-between gap-2 px-4 py-2.5 ${t.band}`}>
        <p className={`flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider ${t.ink}`}>
          <DoodleIcon name={icon} size={13} />
          {role}
        </p>
        {action}
      </div>
      <div className="px-4 py-3">{children}</div>
    </section>
  );
}

/** A number you can press and an email that opens the OS's own email window. */
function Reach({ phone, email, name, role, address }: { phone: string; email: string; name?: string; role?: "landlord" | "tenant"; address?: string }) {
  return (
    <div className="mt-1 space-y-0.5 text-[12px]">
      {phone ? <a href={`tel:${tel(phone)}`} className="flex items-center gap-1.5 hover:underline"><DoodleIcon name="call" size={12} className="text-muted" />{phone}</a> : <p className="text-muted">No number</p>}
      {email ? (
        <EmailPerson email={email} name={name} role={role} address={address} className="flex min-w-0 max-w-full items-center gap-1.5 text-left hover:underline"><DoodleIcon name="mail" size={12} className="shrink-0 text-muted" /><span className="truncate">{email}</span></EmailPerson>
      ) : (
        <p className="text-muted">No email</p>
      )}
    </div>
  );
}

/** The same, as two big buttons, for the Ring or Email pop-ups. */
function CallEmail({ phone, email, name, role, address }: { phone: string; email: string; name?: string; role?: "landlord" | "tenant"; address?: string }) {
  const b = "inline-flex min-w-0 max-w-full items-center gap-2 rounded-full border border-line/80 bg-white px-4 py-2 text-[12.5px] transition-colors hover:border-ink/40";
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {phone ? <a href={`tel:${tel(phone)}`} className={b}><DoodleIcon name="call" size={13} /><span className="figures truncate">{phone}</span></a> : <span className="text-[12px] text-muted">No number on file</span>}
      {email ? (
        <EmailPerson email={email} name={name} role={role} address={address} className={b}><DoodleIcon name="mail" size={13} className="shrink-0" /><span className="truncate">{email}</span></EmailPerson>
      ) : (
        <span className="text-[12px] text-muted">No email on file</span>
      )}
    </div>
  );
}

/** The engineer going out: their firm, how to reach them, what they're registered for, and their record. */
function Engineer({ o, c, reading, onPick, canPick, onResend, unsent, busy }: { o: WorksOrder; c: Contractor | null; reading: boolean; onPick: () => void; canPick: boolean; onResend?: () => void; unsent: boolean; busy: boolean }) {
  const [copied, setCopied] = useState(false);
  const regs = c
    ? [
        c.gasSafeNumber ? `Gas Safe ${c.gasSafeNumber}` : "",
        c.niceicNumber ? `NICEIC ${c.niceicNumber}` : "",
        c.napitNumber ? `NAPIT ${c.napitNumber}` : "",
        c.otherRegistration ?? "",
      ].filter(Boolean)
    : [];
  if (c && !regs.length && c.registration) regs.push(c.registration);
  const insured = c?.publicLiabilityInsurer ? `${c.publicLiabilityInsurer}${c.publicLiabilityExpiry ? ` · to ${day(c.publicLiabilityExpiry)}` : ""}` : "";
  const quoting = stepOf(o) === "quote";
  /* Out for quotes, each firm has its own link; the job's one is for the works order. */
  const link = o.contractorToken && !quoting ? `${typeof window === "undefined" ? "" : window.location.origin}/contractor/${o.contractorToken}` : null;
  const out = o.quoteAsks.filter((a) => a.state === "asked" || a.state === "quoted");
  return (
    <Person tone="brown" icon="setting" role="The Engineer" action={
      canPick || onResend ? (
        <span className="flex flex-wrap justify-end gap-1.5">
          {onResend && !unsent && <button type="button" disabled={busy} onClick={onResend} className={quiet} title={`Emails ${o.contractorName} the works order again, with their page link`}>Send again</button>}
          {canPick && <button type="button" onClick={onPick} className={quiet}>{quoting ? "Ask another" : o.contractorId ? "Change" : "Pick"}</button>}
        </span>
      ) : null
    }>
      {!o.contractorId && !o.contractorName ? (
        <p className="text-[12.5px] text-muted">{quoting && out.length ? `Out for quotes with ${out.length} contractors: ${out.map((a) => a.contractorName).join(", ")}. Whoever's quote is taken goes on the job.` : "Nobody on the job yet."}</p>
      ) : (
        <>
          <div className="flex items-center gap-3">
            {c?.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={c.logoUrl} alt="" className="h-11 w-11 shrink-0 rounded-xl border border-line/60 bg-white object-contain p-1" />
            ) : (
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brown/[0.07] text-brown"><DoodleIcon name="setting" size={16} /></span>
            )}
            <div className="min-w-0">
              {o.contractorId ? (
                <Link href={`/contractors?open=${encodeURIComponent(o.contractorId)}`} className="block truncate text-[14px] font-semibold underline decoration-line underline-offset-2 hover:decoration-ink" title="Their record under Contractors">{o.contractorName || c?.name || "The contractor"}</Link>
              ) : (
                <p className="truncate text-[14px] font-semibold">{o.contractorName}</p>
              )}
              <p className="truncate text-[11.5px] text-muted">{[c?.trade, c?.contact].filter(Boolean).join(" · ") || (reading ? "Reading their details…" : "")}</p>
            </div>
          </div>
          {c ? <Reach phone={c.phone} email={c.email} name={c.contact || c.name} address={o.propertyName} /> : !reading && o.contractorId ? <p className="mt-2 text-[11.5px] text-muted">Their details are in another agent&apos;s book.</p> : null}
          {unsent && onResend && (
            <div className="mt-3 rounded-xl border border-accent-dark/40 bg-accent-soft/40 px-3 py-2.5">
              <p className="text-[12.5px]">{o.contractorName} hasn&apos;t been sent the works order. It went to {o.orderSentToName || "the last contractor"}.</p>
              <button type="button" disabled={busy} onClick={onResend} className="mt-2 rounded-full bg-ink px-4 py-1.5 text-[12px] font-semibold text-page disabled:opacity-50">{busy ? "Sending…" : `Send it to ${o.contractorName}`}</button>
            </div>
          )}
          {(regs.length > 0 || insured) && (
            <dl className="mt-3 grid gap-2 text-[12px]">
              {regs.length > 0 && <Fact k="Registered" v={regs.join(" · ")} />}
              {insured && <Fact k="Public liability" v={insured} />}
            </dl>
          )}
          <p className="mt-3 flex flex-wrap gap-1.5">
            <Pill tone={o.contractorConfirmedAt ? "sage" : "warm"}>{o.contractorConfirmedAt ? `Confirmed ${day(o.contractorConfirmedAt)}` : o.contractorContactedAt ? `Contacted ${day(o.contractorContactedAt)}` : quoting ? "Asked for a quote" : "Not contacted"}</Pill>
            {o.scheduledAt && <Pill tone="plain">Booked {stamp(o.scheduledAt)}</Pill>}
          </p>
          {link && (
            <button type="button" onClick={() => { void navigator.clipboard?.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className={`${quiet} mt-3`}>
              {copied ? "Copied" : "Copy their job page link"}
            </button>
          )}
        </>
      )}
    </Person>
  );
}

/** Photos as pictures, everything else as a line. Both open in the document sheet or the lightbox. */
function Files({ o, onPhoto }: { o: WorksOrder; onPhoto: (photos: string[], start: number) => void }) {
  if (o.files.length === 0) {
    return <p className="text-[12.5px] text-muted">Nothing on the job yet. Photos of the fault, quotes, invoices and certificates go here, and on the home&apos;s Documents too.</p>;
  }
  const url = (key: string) => `/api/r2/file?key=${encodeURIComponent(key)}`;
  const photos = o.files.filter(isImage);
  const docs = o.files.filter((f) => !isImage(f));
  const urls = photos.map((p) => url(p.key));
  return (
    <div className="space-y-3">
      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 2xl:grid-cols-6">
          {photos.map((p, i) => (
            <button key={p.key} type="button" onClick={() => onPhoto(urls, i)} title={`${p.name} · ${p.by} · ${day(p.at)}`} className="group relative aspect-square overflow-hidden rounded-xl bg-box">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={urls[i]} alt={p.name} loading="lazy" className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
            </button>
          ))}
        </div>
      )}
      {docs.length > 0 && (
        <ul className="divide-y divide-line/50">
          {docs.map((fl) => (
            <li key={fl.key} className="flex items-center justify-between gap-3 py-2 text-[12.5px]">
              <button type="button" onClick={() => openDocument({ key: fl.key, name: fl.name, label: `Job #${o.ref}`, property: o.propertyName, url: url(fl.key) })} className="flex min-w-0 items-center gap-2 text-left hover:underline">
                <DoodleIcon name="doc" size={13} className="shrink-0 text-muted" />
                <span className="truncate">{fl.name}</span>
                {fl.kind && <span className="shrink-0 rounded-full bg-box px-2 py-[1px] text-[10.5px] text-muted">{fl.kind === "invoice" ? "Invoice" : "Quote"}</span>}
              </button>
              <span className="shrink-0 text-[10.5px] text-muted">{fl.by} · {day(fl.at)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Modal({ title, wide = false, onClose, children }: { title?: string; wide?: boolean; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-[150] flex items-start justify-center overflow-y-auto p-4 sm:items-center">
      <button type="button" aria-label="Close" onClick={onClose} className="fixed inset-0 cursor-default bg-ink/55 backdrop-blur-[3px]" />
      <div className={`fade-up relative w-full ${wide ? "max-w-[760px]" : "max-w-[600px]"} rounded-2xl border border-line/70 bg-page p-5 shadow-[0_30px_80px_-24px_rgba(0,0,0,0.45)] sm:p-8`}>
        <div className={`flex items-start justify-between gap-3 ${title ? "mb-4" : "mb-1 -mt-1"}`}>
          {title ? <h2 className="text-[22px] leading-tight">{title}</h2> : <span />}
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line/80 text-[13px] text-muted hover:text-ink">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
