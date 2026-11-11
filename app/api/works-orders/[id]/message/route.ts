import { NextRequest, NextResponse } from "next/server";
import { hasDb } from "@/lib/db";
import { whoIs } from "@/lib/admin";
import { getOrder, logEvent, type WorksOrder } from "@/lib/works-orders";
import { jobTenants } from "@/lib/works-emails";
import { proseEmail } from "@/lib/email/prose";
import { applyMerge, type MergeValues } from "@/lib/message-templates";
import { isInternalAddress } from "@/lib/email-policy";
import { sendAsAgent } from "@/lib/send-as-agent";
import { sendingLocked, switchOn } from "@/lib/switches";
import { JOB_MESSAGE_TEMPLATES, type JobMessagePerson } from "@/lib/works-message";

/**
 * One message about a job to the landlord and the tenants (lib/works-message).
 *
 *   GET                         -> { people, templates, sendEnabled }
 *   POST { to: keys[], subject, body, intent: "preview" | "send" }
 *
 * Only the job's own people can be written to - the landlord on the job and
 * the tenants who still live there (lib/works-emails jobTenants) - picked by
 * key, never a typed address. Each gets their own copy with their own name.
 * The same switch as every email to a customer ("Email to landlords and
 * tenants" on Admin, Switches), the same road (the agent's Outlook where it
 * is connected), and the same refusal of an unfilled {{field}}. Sent ones are
 * filed on each person's Activity by lib/send-as-agent and said once on the
 * job's timeline here.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const LOCKED =
  "Email to landlords and tenants is switched off on Admin, Switches, so nothing has gone. Ring them, or send it from Outlook if it cannot wait.";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/* {{job}} reads mid-sentence ("the leaking tap"), so a subject that opens with it gets its capital back. */
const capital = (t: string) => t.replace(/^\s*\S/, (c) => c.toUpperCase());

async function mayWrite(to: string): Promise<boolean> {
  if (sendingLocked()) return false;
  if (isInternalAddress(to)) return true;
  return switchOn("customer_email");
}

/** The landlord and the tenants who still live there, each with a key. */
async function peopleOf(o: WorksOrder): Promise<JobMessagePerson[]> {
  const out: JobMessagePerson[] = [];
  const landlordEmail = o.landlordEmail.trim().toLowerCase();
  out.push({
    key: "landlord",
    role: "landlord",
    name: o.landlord.trim() || "The landlord",
    email: EMAIL.test(landlordEmail) ? landlordEmail : null,
    note: !EMAIL.test(landlordEmail) ? "No email on file" : o.landlordSkipped ? "Not involved in this job" : null,
  });
  const tenants = await jobTenants(o).catch(() => [] as Awaited<ReturnType<typeof jobTenants>>);
  tenants.forEach((t, i) => {
    const email = (t.email ?? "").trim().toLowerCase();
    out.push({
      key: `tenant:${i}`,
      role: "tenant",
      name: t.name.trim() || "The tenant",
      email: EMAIL.test(email) ? email : null,
      note: !EMAIL.test(email) ? "No email on file" : o.quietTenants ? "A discreet job" : null,
    });
  });
  return out;
}

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { timeZone: "Europe/London", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) : undefined;

function mergeFor(o: WorksOrder, p: JobMessagePerson, agent: string): MergeValues {
  const name = p.name.startsWith("The ") ? "" : p.name;
  return {
    name: name || undefined,
    firstName: name ? name.split(/\s+/)[0] : undefined,
    address: o.propertyName || undefined,
    agent: agent || undefined,
    /* Beyond the general fields: the job's own. Left unset when the job has
       no answer, so the route refuses rather than sending "on ." */
    ...({
      job: o.title.trim() ? o.title.trim().replace(/^./, (c) => c.toLowerCase()) : undefined,
      date: when(o.scheduledAt),
      contractor: o.contractorName.trim() || undefined,
    } as Record<string, string | undefined>),
  } as MergeValues;
}

async function load(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  /* Sent as the person signed in, never as somebody they are viewing as: it goes from their own mailbox. */
  const { actor } = await whoIs(req);
  if (!actor) return { fail: NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 }) } as const;
  if (!hasDb()) return { fail: NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 }) } as const;
  const { id } = await ctx.params;
  const found = await getOrder(id);
  if (!found) return { fail: NextResponse.json({ ok: false, error: "No such job." }, { status: 404 }) } as const;
  return { me: actor, order: found.order } as const;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const got = await load(req, ctx);
  if ("fail" in got) return got.fail;
  const people = await peopleOf(got.order);
  const firstEmail = people.find((p) => p.email)?.email ?? "";
  return NextResponse.json({ ok: true, people, templates: JOB_MESSAGE_TEMPLATES, sendEnabled: firstEmail ? await mayWrite(firstEmail) : !sendingLocked() && (await switchOn("customer_email")) });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const got = await load(req, ctx);
  if ("fail" in got) return got.fail;
  const { order: o, me } = got;
  const b = (await req.json().catch(() => ({}))) as { to?: unknown; subject?: unknown; body?: unknown; intent?: unknown };
  const keys = Array.isArray(b.to) ? b.to.map(String) : [];
  const subjectRaw = typeof b.subject === "string" ? b.subject.slice(0, 300) : "";
  const bodyRaw = typeof b.body === "string" ? b.body.slice(0, 10_000) : "";

  const people = await peopleOf(o);
  const chosen = people.filter((p) => keys.includes(p.key));
  const agent = me.name || me.email;

  /* Previewed as the first person picked, or as a landlord when nobody is yet. */
  const sample = chosen[0] ?? people[0];
  const m = mergeFor(o, sample, agent);
  const subj = applyMerge(subjectRaw, m);
  const body = applyMerge(bodyRaw, m);
  const missing = [...new Set([...subj.missing, ...body.missing])];
  const preview = { ok: true as const, subject: capital(subj.text), html: proseEmail(body.text), missing, to: sample?.name ?? null };

  if (b.intent !== "send") return NextResponse.json({ ...preview, sent: [] });

  /* ── somebody pressed Send ─────────────────────────────────────────────── */
  if (!chosen.length) return NextResponse.json({ ...preview, error: "Pick who it goes to first." }, { status: 400 });
  if (!bodyRaw.trim()) return NextResponse.json({ ...preview, error: "Write the message first." }, { status: 400 });
  const noEmail = chosen.filter((p) => !p.email);
  if (noEmail.length) return NextResponse.json({ ...preview, error: `${noEmail.map((p) => p.name).join(", ")} ha${noEmail.length === 1 ? "s" : "ve"} no email on file.` }, { status: 400 });
  /* Every copy is checked before any goes: half a household told is worse than none. */
  for (const p of chosen) {
    const pm = mergeFor(o, p, agent);
    const gaps = [...new Set([...applyMerge(subjectRaw, pm).missing, ...applyMerge(bodyRaw, pm).missing])];
    if (gaps.length) {
      return NextResponse.json({ ...preview, error: `Not sent. Nothing to fill ${gaps.map((g) => `{{${g}}}`).join(", ")} for ${p.name}. Take it out or fill it in by hand.` }, { status: 400 });
    }
    if (!(await mayWrite(p.email!))) return NextResponse.json({ ...preview, locked: true, error: LOCKED }, { status: 409 });
  }

  const sent: string[] = [];
  const failed: Array<{ name: string; why: string }> = [];
  for (const p of chosen) {
    const pm = mergeFor(o, p, agent);
    const r = await sendAsAgent({ me, to: p.email!, toName: p.name, subject: capital(applyMerge(subjectRaw, pm).text), html: proseEmail(applyMerge(bodyRaw, pm).text) }).catch(
      (e) => ({ sent: false, detail: e instanceof Error ? e.message : "It did not go." }) as { sent: boolean; detail: string }
    );
    if (r.sent) sent.push(p.name);
    else failed.push({ name: p.name, why: r.detail });
  }

  if (sent.length) {
    const who = sent.length <= 1 ? sent.join("") : `${sent.slice(0, -1).join(", ")} and ${sent[sent.length - 1]}`;
    await logEvent(o.id, me.name || me.email, "message", `Emailed ${who}: "${capital(subj.text)}".`);
  }
  return NextResponse.json(
    { ...preview, sent, failed, error: failed.length ? `Not sent to ${failed.map((f) => `${f.name} (${f.why})`).join("; ")}.` : undefined },
    { status: sent.length || !failed.length ? 200 : 502 }
  );
}
