import { NextRequest, NextResponse } from "next/server";
import { resolveDealAccess } from "@/lib/business/deal-access";
import { getMeta, logSystemEvent, setChecklistItem } from "@/lib/business/deal-store";
import { PLATFORMS } from "@/lib/business/platforms";

/**
 * The Flatfair hand-off, until Flatfair gives us an API.
 *
 * Kirstie (4 Sep): after the PLC check passes "the agents have to manually log
 * into Flatfair and add all the information in", and Flatfair pushes the
 * result back into Propoly. The API meeting is requested and not yet held. So
 * for now the OS does the next best thing: it puts every fact the Flatfair
 * form asks for on one screen, ready to copy, and records that it was done -
 * which is the part nobody records today, and the reason Kirstie checks.
 *
 * GET  ?deal=<uuid>  → the facts, and whether it has been ticked
 * POST { deal, done } → the tick. An agent may tick THIS item on their own
 *                       deal, which the general checklist route does not
 *                       allow: this is their step, and only they know when
 *                       they pressed submit on Flatfair.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ITEM = "deposit_registered";

function flatfairUrl(): string {
  return PLATFORMS.find((p) => p.id === "flatfair")?.url ?? "https://app.flatfair.co.uk";
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("deal") ?? "";
  if (!id) return NextResponse.json({ ok: false, error: "Which deal?" }, { status: 400 });
  const access = await resolveDealAccess(req, id);
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });

  const app = access.deal.app;
  const p = app.propoly;
  const meta = await getMeta(id).catch(() => null);
  const tick = meta?.checklist?.[ITEM] ?? null;
  return NextResponse.json({
    ok: true,
    url: flatfairUrl(),
    deal: {
      id,
      property: [app.propertyName, app.locality].filter(Boolean).join(", "),
      rentPcm: app.offer,
      depositCap: p?.deposit ?? null,
      moveIn: app.startDate,
      service: p?.service ?? null,
      standingOrderRef: p?.standingOrderRef ?? null,
      flatfairClause: Boolean(p?.depositReplacement),
      tenants: app.tenants.map((t) => ({ name: t.name, email: t.email, phone: t.phone })),
      guarantors: p?.guarantors ?? [],
      landlord: p?.landlord ?? null,
      agent: access.deal.managerName,
    },
    done: tick?.done ? { by: tick.by, at: tick.at } : null,
  });
}

export async function POST(req: NextRequest) {
  let body: { deal?: string; done?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Expected JSON." }, { status: 400 });
  }
  const id = body.deal ?? "";
  if (!id) return NextResponse.json({ ok: false, error: "Which deal?" }, { status: 400 });
  const access = await resolveDealAccess(req, id);
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });

  const byName = access.user.name || access.user.email;
  const done = body.done !== false;
  await setChecklistItem(id, ITEM, done, byName);
  await logSystemEvent(
    id,
    { id: access.user.id, name: byName, role: access.role },
    done ? "set the deal up in Flatfair" : "unticked the Flatfair set-up"
  ).catch(() => undefined);
  const meta = await getMeta(id).catch(() => null);
  const tick = meta?.checklist?.[ITEM] ?? null;
  return NextResponse.json({ ok: true, done: tick?.done ? { by: tick.by, at: tick.at } : null });
}
