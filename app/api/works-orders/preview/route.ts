import { NextRequest, NextResponse } from "next/server";
import { publicError } from "@/lib/public-error";
import { hasDb, q } from "@/lib/db";
import { whoIs } from "@/lib/admin";
import { dueFor, getContractor, URGENCIES, type JobTenant, type Urgency, type WorksOrder } from "@/lib/works-orders";
import { previewJobEmail } from "@/lib/works-emails";

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
};

export async function POST(req: NextRequest) {
  const { actor, subject } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const b = ((await req.json().catch(() => null)) ?? {}) as Draft;
  if (!b.contractorId) return NextResponse.json({ ok: false, error: "Pick a contractor first." }, { status: 400 });
  const c = await getContractor(b.contractorId).catch(() => null);
  if (!c) return NextResponse.json({ ok: false, error: "That contractor is not in the book." }, { status: 404 });
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
    propertyName: (b.propertyName ?? "").trim(), locality: (b.locality ?? "").trim(), contractorId: c.id, contractorName: c.name,
    tenants, tenant: tenants[0]?.name ?? "", tenantPhone: tenants[0]?.phone ?? "", tenantEmail: tenants[0]?.email ?? "",
    landlord: "", quotePence: null, authorityPence: 0, completionNote: "", contractorToken: "…", tenantToken: null,
  } as unknown as WorksOrder;
  try {
    const mail = await previewJobEmail(draft, repair ? "works-contractor-order" : "works-contractor-planned", subject ?? actor, seq?.n ? {} : { ref: "(new)" });
    return NextResponse.json({ ok: true, ...mail });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "The preview could not be written.") }, { status: 400 });
  }
}
