import { NextRequest, NextResponse } from "next/server";
import { publicError } from "@/lib/public-error";
import { requireCapability } from "@/lib/admin";
import { hasDb } from "@/lib/db";
import { asText, jsonObject } from "@/lib/json-body";
import { msConnectionFor } from "@/lib/microsoft";
import { agentDirectory, chaseableRow, chasesFor, currentTracker, draftChase, sendHandChase } from "@/lib/cert-chase";

/**
 * Chase the Agent on one certificate (Josel, ticket 11c8acc9, 11 Nov 2026).
 *
 * GET  ?propertyId=&cert=  → who would be emailed, the message to start from,
 *                            and every chase on this certificate so far.
 * POST { propertyId, cert, subject, message } → sent and recorded.
 *
 * The compliance office only (see:agent-compliance), as Property Compliance
 * is. The certificate is found again in the tracker here, so a chase can only
 * be about a certificate the OS counts as ours and outstanding or coming up;
 * see lib/cert-chase for the rules that brings with it.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function find(propertyId: string, cert: string) {
  const t = await currentTracker();
  const row = chaseableRow(t.tracker, propertyId, cert);
  if (!row) return { error: "That certificate isn't outstanding or coming up on a home we look after, so there is nothing to chase." } as const;
  const whoFor = await agentDirectory();
  return { row, agent: whoFor(row.propertyId, row.agent), live: t.live } as const;
}

export async function GET(req: NextRequest) {
  const me = await requireCapability(req, "see:agent-compliance");
  if (!me) return NextResponse.json({ ok: false, error: "Chasing agents is the compliance office's." }, { status: 403 });
  const propertyId = (req.nextUrl.searchParams.get("propertyId") ?? "").trim();
  const cert = (req.nextUrl.searchParams.get("cert") ?? "").trim();
  if (!propertyId || !cert) return NextResponse.json({ ok: false, error: "Which certificate?" }, { status: 400 });
  try {
    const [f, history, outlook] = await Promise.all([
      find(propertyId, cert),
      chasesFor(propertyId, cert).catch(() => null),
      msConnectionFor(me.id).then((c) => c.connected).catch(() => false),
    ]);
    if ("error" in f) return NextResponse.json({ ok: false, error: f.error, history }, { status: 404 });
    const draft = draftChase(f.row, f.agent.login?.name ?? f.agent.name, me);
    return NextResponse.json({
      ok: true,
      live: f.live,
      agent: {
        name: f.agent.login?.name ?? f.agent.name,
        email: f.agent.login?.email ?? null,
        canEmail: Boolean(f.agent.login),
        why: f.agent.why,
      },
      from: outlook ? "mailbox" : "ours",
      draft,
      /* Null when the trail could not be read: "never chased" would be untrue. */
      history,
      stored: hasDb(),
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "The certificate couldn't be read just now. Try again in a minute.") }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  const me = await requireCapability(req, "see:agent-compliance");
  if (!me) return NextResponse.json({ ok: false, error: "Chasing agents is the compliance office's." }, { status: 403 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment, so a chase could not be recorded. Nothing was sent." }, { status: 503 });
  const body = await jsonObject(req);
  const propertyId = asText(body.propertyId).trim();
  const cert = asText(body.cert).trim();
  const subject = asText(body.subject).trim();
  const message = asText(body.message).trim();
  if (!propertyId || !cert) return NextResponse.json({ ok: false, error: "Which certificate?" }, { status: 400 });
  if (!subject || !message) return NextResponse.json({ ok: false, error: "The email needs a subject and a message." }, { status: 400 });
  try {
    const f = await find(propertyId, cert);
    if ("error" in f) return NextResponse.json({ ok: false, error: f.error }, { status: 404 });
    if (!f.agent.login) return NextResponse.json({ ok: false, error: f.agent.why ?? "There is nobody to email." }, { status: 409 });
    const r = await sendHandChase({ me, row: f.row, agent: f.agent.login, agentName: f.agent.name ?? f.agent.login.name, subject, message });
    return NextResponse.json({ ok: r.sent, said: r.said, record: r.record, history: await chasesFor(propertyId, cert).catch(() => null) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "The chase couldn't be finished just now. Look at the certificate's history before sending it again.") }, { status: 502 });
  }
}
