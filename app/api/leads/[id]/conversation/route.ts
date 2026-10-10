import { NextRequest, NextResponse } from "next/server";
import { leadAccess } from "@/lib/lead-access";
import { hasDb, q } from "@/lib/db";
import { conversationFor, openEmail } from "@/lib/conversation";
import { contactIdOf, isOsContactLead } from "@/lib/contact-leads";
import { smsNumber } from "@/lib/sms";

/**
 * The conversation with one lead: emails both ways, texts both ways, calls
 * and WhatsApps between (lib/conversation). Behind the lead's own access rule.
 *
 *   GET ?email=&phone=   the stream; email and phone are what the record shows,
 *                        and are only used when the lead holds them
 *   GET ?open=<id>       one email in full, with its thread
 *
 * WHY THE CHECK ON EMAIL AND PHONE. The record lets an agent correct a
 * contact's details, so the panel sends what is on screen. But a route that
 * read any address it was handed would let anyone who can open one lead read
 * what the OS sent to any address at all - so a value is used only when the
 * lead's own row, its hand-typed contact or its saved facts carry it.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function known(id: string): Promise<string> {
  if (!hasDb()) return "";
  const parts: string[] = [];
  const lead = await q<{ email: string | null; phone: string | null; payload: unknown }>(`SELECT email, phone, payload FROM os_leads WHERE id = $1`, [id]).catch(() => []);
  for (const r of lead) parts.push(r.email ?? "", r.phone ?? "", JSON.stringify(r.payload ?? ""));
  if (isOsContactLead(id)) {
    const c = await q<{ email: string; mobile: string }>(`SELECT email, mobile FROM os_contacts WHERE id = $1`, [contactIdOf(id)]).catch(() => []);
    for (const r of c) parts.push(r.email, r.mobile);
  }
  const facts = await q<{ value: unknown }>(`SELECT row_to_json(f)::text AS value FROM os_lead_facts f WHERE lead_id = $1`, [id]).catch(() => []);
  for (const r of facts) parts.push(String(r.value ?? ""));
  return parts.join(" ").toLowerCase();
}

const digits = (s: string) => s.replace(/\D/g, "");

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { who, denied } = await leadAccess(req, id);
  if (denied) return denied;
  const held = await known(id);
  const heldDigits = digits(held);
  const sp = req.nextUrl.searchParams;
  const emails = sp.getAll("email").map((e) => e.trim().toLowerCase()).filter((e) => e && held.includes(e));
  const phones = sp.getAll("phone").filter((p) => {
    const n = smsNumber(p);
    if (!n) return false;
    /* Held as 07..., +447... or 447...: match on the last ten digits. */
    return heldDigits.includes(digits(n).slice(-10));
  });

  const open = sp.get("open");
  if (open) {
    const r = await openEmail(who.actor.id, who.viewingAs, open, emails);
    return "error" in r ? NextResponse.json({ ok: false, error: r.error }, { status: 404 }) : NextResponse.json({ ok: true, email: r });
  }
  return NextResponse.json(await conversationFor({ userId: who.actor.id, viewingAs: who.viewingAs, emails, phones, leadId: id }));
}
