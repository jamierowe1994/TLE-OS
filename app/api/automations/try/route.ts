import { NextRequest, NextResponse } from "next/server";
import { publicError } from "@/lib/public-error";
import { publicOrigin } from "@/lib/origin";
import { sendAsAgent } from "@/lib/send-as-agent";
import { clean, problems } from "@/lib/automations/catalogue";
import { act } from "@/lib/automations/actions";
import { wouldHaveCaught } from "@/lib/automations/runner";
import type { Automation, PreviewItem, Subject } from "@/lib/automations/store";
import { caller } from "@/lib/automations/http";

/**
 * Trying one before it is on. Reads and renders; the only thing it ever sends
 * is a copy to the agent THEMSELF.
 *
 * POST { def }              → what its trigger would have caught lately, on
 *                             their own book, and every message rendered for
 *                             the newest of them (nothing sent)
 * POST { def, test: true }  → the same messages, to their own inbox, marked Test
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const who = await caller(req);
  if (!who) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { def?: unknown; name?: string; test?: boolean };
  const def = clean(b.def);
  const wrong = problems(def);
  if (wrong.length) return NextResponse.json({ error: wrong[0] }, { status: 400 });
  try {
    const { newest, ...caught } = await wouldHaveCaught(def, who.me, 7).catch(() => ({ count: 0, examples: [], note: "Couldn't look just now.", newest: null }));
    /* The test customer is them, on the home the newest real one was about,
       so "homes nearby" and {{address}} come out as they would for real. */
    const sample: Subject = {
      key: "test", at: new Date().toISOString(), name: who.me.name || "Test", email: who.me.email, phone: null,
      address: newest?.address || "8 Recreation Terrace", postcode: newest?.postcode ?? null,
      listingId: newest?.listingId ?? null, leadId: null, propertyId: newest?.propertyId ?? null, what: "A test", facts: newest?.facts ?? {},
    };
    const auto: Automation = {
      id: "test", userId: who.me.id, userName: who.me.name, name: b.name || "Test", def, sentence: "", enabled: false, state: "draft",
      dailyCap: 1, askedFor: null, cursor: null, nextAt: null, offBy: null, offAt: null, createdAt: sample.at, updatedAt: sample.at,
    };
    const items: PreviewItem[] = [];
    const notes: string[] = [];
    for (const [i, step] of def.actions.entries()) {
      const r = await act(step, { automation: auto, runId: "test", index: i, owner: who.me, subject: sample, origin: publicOrigin(req), mode: "preview" });
      if (r.preview) items.push(r.preview);
      else notes.push(`${r.outcome.action}: ${r.outcome.detail}`);
    }
    let sent: string | null = null;
    if (b.test) {
      const emails = items.filter((x) => x.subject && x.html);
      if (!emails.length) return NextResponse.json({ error: "There's no email in this one to send yourself." }, { status: 400 });
      const results = [];
      for (const e of emails) results.push(await sendAsAgent({ me: who.me, to: who.me.email, toName: who.me.name, subject: `[Test] ${e.subject}`, html: e.html! }));
      sent = results.every((r) => r.sent) ? `Sent to ${who.me.email}. Have a look in your inbox.` : results.find((r) => !r.sent)?.detail ?? "It didn't send.";
    }
    return NextResponse.json({ ok: true, caught, items, notes, sent });
  } catch (e) {
    return NextResponse.json({ error: publicError(e, "It couldn't be tried just now.") }, { status: 500 });
  }
}
