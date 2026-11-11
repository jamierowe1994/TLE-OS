import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { can } from "@/lib/roles";
import { hasDb, q } from "@/lib/db";
import { isInternalAddress } from "@/lib/email-policy";
import { msConnectionFor, msSendMail, MailboxNotConnected } from "@/lib/microsoft";
import { newMarker, threadStarted, THREAD_HEADER } from "@/lib/mail-threads";
import { getCase } from "@/lib/plc-store";
import { checkById } from "@/lib/plc";
import { homeContext, isRefusal } from "@/lib/home-send";
import { addrOf } from "@/lib/address-parse";
import { publicError } from "@/lib/public-error";
import { record } from "@/lib/audit";

/**
 * EMAIL THE TEAM ABOUT A HOME OR A PACK, AND KEEP THE THREAD (James, 6 Nov 2026).
 *
 * Susan and Dan on 22 Jubilee Gardens' EICR went back and forth in Outlook,
 * and none of it reached the home. James: "we need to make sending them an
 * email really easy ... offering them options on the failed reasons, ask
 * additional questions etc. Then anything in that thread gets uploaded into
 * the OS. It should only pull from that thread": Susan emails Dan, recorded;
 * Dan answers with the evidence, recorded; a new email saying thanks, not.
 *
 * GET  ?case=<plc id> | ?listing=&listings=  who to send to (suggested first),
 *      the pack's open reasons to tick, and whether your Outlook is connected
 * POST { case | listing, listings?, to[], subject, reasons[], questions[], note }
 *
 * It goes from the sender's own Outlook (lib/microsoft msSendMail), so the
 * answers come back into a real conversation, and only that conversation is
 * followed (lib/mail-threads): on the pack when it is about a pack, on the
 * home either way. Colleagues only: a landlord or tenant is written to from
 * the record's own buttons, which carry their own brakes.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Person = { name: string; email: string; role: string; why?: string };
const s = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const list = (v: unknown, n: number, each: number) => (Array.isArray(v) ? v.map((x) => s(x, each)).filter(Boolean).slice(0, n) : []);
const esc = (x: string) => x.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Everyone here who can be written to: signed up, not locked, on one of our own addresses. */
async function colleagues(): Promise<Person[]> {
  const rows = await q<{ name: string; email: string; role: string }>(
    `SELECT name, email, role FROM os_users WHERE locked_at IS NULL ORDER BY name`
  ).catch(() => []);
  return rows.filter((r) => isInternalAddress(r.email)).map((r) => ({ name: r.name || r.email, email: r.email.toLowerCase(), role: r.role }));
}

const OFFICE_ROLES = new Set(["pretenancy", "compliance"]);

/** What it is about: a pack (with its open reasons) or a home in the caller's book. */
async function subjectOf(req: NextRequest, sp: { case?: string; listing?: string; listings?: string[] }) {
  if (sp.case) {
    const who = await whoIs(req).catch(() => null);
    const me = who?.actor;
    if (!me) return { error: "Sign in first.", status: 401 } as const;
    const c = await getCase(sp.case);
    if (!c) return { error: "That pack isn't here any more.", status: 404 } as const;
    const mine = c.agentEmail?.toLowerCase() === me.email.toLowerCase();
    if (!mine && !can(me.role, "see:pretenancy") && !can(me.role, "work:plc")) return { error: "That pack isn't yours.", status: 403 } as const;
    /* The reasons a pack failed or is being asked about, to tick: its blockers
       and questions, the deferral note, and any check marked not needed. */
    const reasons = [
      ...(c.findings ?? []).filter((f) => f.level !== "ok").map((f) => `${checkById(f.checkId)?.label ?? "Anything else"}: ${f.message}`),
      ...(c.decisionNote ? [`Deferred: ${c.decisionNote}`] : []),
      ...(c.waivers ?? []).map((w) => `${checkById(w.checkId as never)?.label ?? w.checkId} marked not needed: "${w.reason}"`),
    ];
    return {
      me, viewingAs: Boolean(who?.viewingAs), caseId: c.id, address: c.address, propertyId: null as string | null,
      agent: c.agentEmail ? { name: c.agentName || c.agentEmail, email: c.agentEmail.toLowerCase() } : null,
      reasons: [...new Set(reasons)].slice(0, 30),
    };
  }
  const ctx = await homeContext(req, sp.listing ?? "", sp.listings ?? []);
  if (isRefusal(ctx)) return ctx;
  const rexAgent = ctx.home.agent?.id ?? null;
  const [agent] = rexAgent ? await q<{ name: string; email: string }>(`SELECT name, email FROM os_users WHERE rex_user_id = $1 AND locked_at IS NULL LIMIT 1`, [rexAgent]).catch(() => []) : [];
  return {
    me: ctx.me, viewingAs: ctx.viewingAs, caseId: null, address: addrOf(ctx.home), propertyId: ctx.home.propertyId ?? null,
    agent: agent ? { name: agent.name || agent.email, email: agent.email.toLowerCase() } : null,
    reasons: [] as string[],
  };
}

export async function GET(req: NextRequest) {
  try {
    if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
    const u = req.nextUrl.searchParams;
    const about = await subjectOf(req, { case: s(u.get("case"), 80) || undefined, listing: s(u.get("listing"), 40), listings: s(u.get("listings"), 400).split(",").filter(Boolean) });
    if ("error" in about) return NextResponse.json({ ok: false, error: about.error }, { status: about.status });
    const everyone = (await colleagues()).filter((p) => p.email !== about.me.email.toLowerCase());
    /* Suggested: the agent on it, and the office who check packs. */
    const suggested: Person[] = [];
    if (about.agent && about.agent.email !== about.me.email.toLowerCase()) suggested.push({ ...about.agent, role: "agent", why: "The agent" });
    for (const p of everyone) if (OFFICE_ROLES.has(p.role) && !suggested.some((x) => x.email === p.email)) suggested.push({ ...p, why: p.role === "compliance" ? "Compliance" : "Pre-tenancy" });
    const conn = await msConnectionFor(about.me.id).catch(() => null);
    return NextResponse.json({
      ok: true,
      address: about.address,
      reasons: about.reasons,
      suggested,
      everyone,
      outlook: conn?.connected ? conn.email ?? "connected" : null,
      viewingAs: about.viewingAs,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "The team couldn't be read just now.") }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
    const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!b) return NextResponse.json({ ok: false, error: "Nothing to send." }, { status: 400 });
    const about = await subjectOf(req, { case: s(b.case, 80) || undefined, listing: s(b.listing, 40), listings: list(b.listings, 20, 40) });
    if ("error" in about) return NextResponse.json({ ok: false, error: about.error }, { status: about.status });
    if (about.viewingAs) return NextResponse.json({ ok: false, error: "This goes from your own Outlook, so it can't be sent while you're viewing as somebody." }, { status: 403 });

    const team = new Map((await colleagues()).map((p) => [p.email, p]));
    const to = [...new Set(list(b.to, 12, 200).map((e) => e.toLowerCase()))];
    if (!to.length) return NextResponse.json({ ok: false, error: "Pick who it goes to." }, { status: 400 });
    const stranger = to.find((e) => !team.has(e));
    if (stranger) return NextResponse.json({ ok: false, error: `${stranger} isn't one of the team. Landlords and tenants are written to from the record's own buttons.` }, { status: 400 });

    const reasons = list(b.reasons, 30, 600);
    const questions = list(b.questions, 12, 400);
    const note = s(b.note, 6000);
    if (!reasons.length && !questions.length && !note) return NextResponse.json({ ok: false, error: "Say what it's about: tick a reason, a question, or write a note." }, { status: 400 });
    const subject = s(b.subject, 200) || `${about.address.split(",")[0]} - a question`;

    const first = (n: string) => n.split(/\s+/)[0] || n;
    const names = to.map((e) => first(team.get(e)?.name ?? e));
    const para = (t: string) => `<p style="margin:0 0 12px">${esc(t).replace(/\n/g, "<br>")}</p>`;
    const bullets = (items: string[]) => `<ul style="margin:0 0 12px;padding-left:20px">${items.map((x) => `<li style="margin:0 0 4px">${esc(x)}</li>`).join("")}</ul>`;
    const html = [
      para(`Hi ${names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0]},`),
      para(`This is about ${about.address}.`),
      ...(reasons.length ? [para(reasons.length === 1 ? "The point to look at:" : "The points to look at:"), bullets(reasons)] : []),
      ...(questions.length ? [para(questions.length === 1 ? "Could you let me know:" : "Could you let me know:"), bullets(questions)] : []),
      ...(note ? [para(note)] : []),
      para("Reply to this email and your answer is saved on the record."),
      para(`Thanks,\n${first(about.me.name || about.me.email)}`),
    ].join("");

    /* On a pack the thread is the pack's own (threadStarted), so it shows
       under Emails on This Pack as well as on the home. */
    const marker = about.caseId ? newMarker() : null;
    try {
      await msSendMail(about.me.id, {
        to: { email: to[0], name: team.get(to[0])?.name },
        cc: to.slice(1).map((e) => ({ email: e, name: team.get(e)?.name })),
        subject,
        body: html,
        about: { address: about.address, propertyId: about.propertyId },
        what: "Team email",
        ...(marker ? { headers: { [THREAD_HEADER]: marker } } : {}),
      });
    } catch (e) {
      if (e instanceof MailboxNotConnected) return NextResponse.json({ ok: false, error: "Connect your Outlook on your Profile first. This goes from your own mailbox so the replies come back to you and onto the record." }, { status: 400 });
      throw e;
    }
    if (marker && about.caseId) {
      await threadStarted({ caseId: about.caseId, userId: about.me.id, marker, subject, to: to[0], what: "Team email", by: about.me.name || about.me.email });
    }
    await record({
      kind: "team_email_sent",
      actorId: about.me.id,
      actorEmail: about.me.email,
      detail: `${about.address}: "${subject}" to ${to.join(", ")}`,
    }).catch(() => undefined);
    return NextResponse.json({ ok: true, sentTo: to, detail: `Sent from your Outlook to ${names.join(", ")}. Their replies in that thread are saved on the record within five minutes.` });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "That email didn't go. Try again in a minute.") }, { status: 500 });
  }
}
