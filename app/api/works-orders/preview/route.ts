import { NextRequest, NextResponse } from "next/server";
import { publicError } from "@/lib/public-error";
import { hasDb, q } from "@/lib/db";
import { whoIs } from "@/lib/admin";
import { dueFor, getContractor, getOrder, tenantsOf, URGENCIES, type JobTenant, type Urgency, type WorksOrder } from "@/lib/works-orders";
import { editableJobEmail, jobTenants, previewJobEmail, tenantEmailOnRaise, tenantEmailOnStep, type ContractorEdit, type TenantStep } from "@/lib/works-emails";

/**
 * The works order a job would send, rendered from the form as it stands and
 * sent nowhere. The last screen of Plan a certificate and Report a repair
 * shows it before Send.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Draft = {
  kind?: string; urgency?: string | null;
  title?: string; description?: string; category?: string; dueAt?: string | null; scheduledAt?: string | null; access?: string;
  propertyName?: string; locality?: string; contractorId?: string | null; tenants?: JobTenant[];
  /** A job already on the board: its quote request as this contractor will get it (Ask for quotes, 21 Oct 2026). */
  orderId?: string; template?: "quote";
  /** The home it's on, so the key numbers and access the real email reads are in the preview too. */
  propertyId?: string | null;
  /** The agent's own words for the works order (James, 8 Nov 2026), and whether to send back the words to edit. */
  edit?: ContractorEdit | null; editable?: boolean;
  /** The tenants' email instead of the works order (Lianna Denholm, 16 Nov 2026), and whether Let the tenants know is ticked. */
  audience?: "contractor" | "tenant"; tellTenants?: boolean;
  /** On a job's page: which button the tenants' email goes with, and the date being set (Lianna Denholm, 16 Nov 2026). */
  step?: TenantStep;
};
const STEPS: TenantStep[] = ["confirm", "schedule", "booked", "access"];

export async function POST(req: NextRequest) {
  const { actor, subject } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const b = ((await req.json().catch(() => null)) ?? {}) as Draft;
  if (!b.contractorId) return NextResponse.json({ ok: false, error: "Pick a contractor first." }, { status: 400 });
  const c = await getContractor(b.contractorId).catch(() => null);
  if (!c) return NextResponse.json({ ok: false, error: "That contractor is not in the book." }, { status: 404 });
  if (b.orderId) {
    const found = await getOrder(b.orderId).catch(() => null);
    if (!found) return NextResponse.json({ ok: false, error: "No such job." }, { status: 404 });
    /* The tenants' email a button on the job's page sends, as it stands or in
       the agent's words (Lianna Denholm, 16 Nov 2026): Confirm the Contractor,
       the date being set, Tell the tenants. */
    if (b.audience === "tenant") {
      const step: TenantStep = STEPS.includes(b.step as TenantStep) ? (b.step as TenantStep) : "confirm";
      const at = step === "schedule" && b.scheduledAt && !Number.isNaN(new Date(b.scheduledAt).getTime()) ? new Date(b.scheduledAt).toISOString() : null;
      const o = { ...found.order, contractorId: c.id, contractorName: c.name, ...(at ? { scheduledAt: at } : {}) };
      if (step === "schedule" && !at) return NextResponse.json({ ok: true, none: true });
      const id = tenantEmailOnStep(o, step);
      if (!id) return NextResponse.json({ ok: true, none: true });
      try {
        const live = (await jobTenants(o)).filter((t) => t.email.includes("@"));
        /* Setting the date tells the lead tenant only, as emailsForMove's tenantBooked does, and not one who has moved out. */
        const lead = o.tenantEmail.trim().toLowerCase();
        const gone = lead && tenantsOf(o).some((t) => t.email.toLowerCase() === lead && !live.some((l) => l.name === t.name && l.email === t.email));
        const to = step === "schedule"
          ? (lead.includes("@") && !gone ? [{ name: o.tenant || live.find((t) => t.email.toLowerCase() === lead)?.name || "", email: o.tenantEmail.trim() }] : [])
          : live.map((t) => ({ name: t.name, email: t.email }));
        if (!to.length) return NextResponse.json({ ok: true, none: true });
        const change = b.edit && typeof b.edit === "object" ? { subject: typeof b.edit.subject === "string" ? b.edit.subject.slice(0, 200) : null, body: typeof b.edit.body === "string" ? b.edit.body.slice(0, 6000) : null } : null;
        const mail = await previewJobEmail(o, id, subject ?? actor, {}, change);
        const words = b.editable ? await editableJobEmail(o, id, subject ?? actor) : null;
        return NextResponse.json({ ok: true, ...mail, to, template: id, ...(words ? { text: words.text, fields: words.fields } : {}) });
      } catch (e) {
        return NextResponse.json({ ok: false, error: publicError(e, "The email to the tenants could not be written.") }, { status: 400 });
      }
    }
    try {
      const mail = await previewJobEmail({ ...found.order, contractorId: c.id, contractorName: c.name, contractorToken: "…" }, "works-contractor-quote-request", subject ?? actor);
      return NextResponse.json({ ok: true, ...mail });
    } catch (e) {
      return NextResponse.json({ ok: false, error: publicError(e, "The preview could not be written.") }, { status: 400 });
    }
  }
  /* The number the job will most likely get. Only a preview, so a race with
     somebody else raising a job at the same moment costs nothing. */
  const [seq] = hasDb() ? await q<{ n: string }>(`SELECT (last_value + CASE WHEN is_called THEN 1 ELSE 0 END)::text AS n FROM os_works_orders_ref`).catch(() => []) : [];
  const tenants = (Array.isArray(b.tenants) ? b.tenants : []).slice(0, 30);
  const repair = b.kind === "repair";
  const urgency = repair ? ((URGENCIES.find((u) => u.id === b.urgency)?.id ?? "routine") as Urgency) : null;
  const draft = {
    id: "preview", ref: Number(seq?.n ?? 0), kind: repair ? "repair" : "planned", title: (b.title ?? "").trim() || "The job", description: (b.description ?? "").trim(),
    category: b.category ?? "", urgency, dueAt: repair ? dueFor("repair", urgency, null) : b.dueAt ? new Date(b.dueAt).toISOString() : null,
    scheduledAt: b.scheduledAt ? new Date(b.scheduledAt).toISOString() : null, access: (b.access ?? "").trim(),
    propertyId: typeof b.propertyId === "string" && b.propertyId ? b.propertyId : null,
    propertyName: (b.propertyName ?? "").trim(), locality: (b.locality ?? "").trim(), contractorId: c.id, contractorName: c.name,
    tenants, tenant: tenants[0]?.name ?? "", tenantPhone: tenants[0]?.phone ?? "", tenantEmail: tenants[0]?.email ?? "",
    landlord: "", quotePence: null, authorityPence: 0, completionNote: "", contractorToken: "…", tenantToken: null,
  } as unknown as WorksOrder;
  try {
    const tenantId = b.audience === "tenant" ? tenantEmailOnRaise({ kind: draft.kind, scheduledAt: draft.scheduledAt, quietTenants: b.tellTenants === false, accessNotice: b.tellTenants === true }) : null;
    if (b.audience === "tenant" && !tenantId) return NextResponse.json({ ok: true, none: true });
    const id = tenantId ?? (repair ? "works-contractor-order" : "works-contractor-planned");
    const over: Record<string, string> = seq?.n ? {} : { ref: "(new)" };
    const change = b.edit && typeof b.edit === "object" ? { subject: typeof b.edit.subject === "string" ? b.edit.subject.slice(0, 200) : null, body: typeof b.edit.body === "string" ? b.edit.body.slice(0, 6000) : null } : null;
    const mail = await previewJobEmail(draft, id, subject ?? actor, over, change);
    const words = b.editable ? await editableJobEmail(draft, id, subject ?? actor, over) : null;
    return NextResponse.json({ ok: true, ...mail, template: id, ...(words ? { text: words.text, fields: words.fields } : {}) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "The preview could not be written.") }, { status: 400 });
  }
}
