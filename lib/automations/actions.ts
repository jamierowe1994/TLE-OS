import "server-only";
import { randomBytes } from "node:crypto";
import { q } from "@/lib/db";
import type { OsUser } from "@/lib/users";
import { applyMerge, listTemplates, type MergeValues } from "@/lib/message-templates";
import { proseEmail } from "@/lib/email/prose";
import { smsNumber, sendSms, smsConfigured } from "@/lib/sms";
import { switchOn } from "@/lib/switches";
import { isInternalAddress } from "@/lib/email-policy";
import { createTask } from "@/lib/tasks";
import { AUTOMATION_STARTERS, actionDef, type Step, type ActionKey } from "@/lib/automations/catalogue";
import type { ActionOutcome, Automation, PreviewItem, Subject } from "@/lib/automations/store";

/**
 * Doing an automation's actions - or, for the first send, only showing them.
 *
 * Every road here is one the OS already has, with its own brakes kept:
 *
 *   email     queued on os_scheduled_sends (kind "automation") and sent by
 *             its five-minute runner through lib/send-as-agent: the agent's
 *             own Outlook where that is armed, the customer email switch,
 *             SENDING_LOCKED. Nothing here calls a mailbox itself.
 *   text      lib/sms (Twilio), only with customer email on as well - a text
 *             is a message to a customer like any other.
 *   passport  lib/passport-invite, the very send behind Send passports.
 *   task      lib/tasks, kind "automation".
 *   bell      kept on the run itself; lib/notifications reads it.
 *   Huddle    a message in the room, as the agent.
 *   tag       an OS-only label on the customer's lead. Never REX.
 *
 * No REX, PayProp or Propoly write anywhere in this file, by design.
 */

export { AUTOMATION_SEND_KIND } from "@/lib/automations/stands";
import { AUTOMATION_SEND_KIND } from "@/lib/automations/stands";

export function mergeFor(s: Subject, owner: OsUser): MergeValues {
  const first = s.name.trim().split(/\s+/)[0] ?? "";
  return {
    firstName: first,
    name: s.name.trim(),
    address: s.address.trim(),
    postcode: (s.postcode ?? "").trim(),
    agent: owner.name || "",
  };
}

/** Internal words (a task, the bell) never refuse over a blank: a gap reads better than {{name}}. */
function fillSoft(text: string, m: MergeValues): string {
  return applyMerge(text, m).text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => (k === "name" || k === "firstName" ? "them" : k === "address" ? "the home" : "")).trim();
}

/** The words of an email action, from the agent's own templates, the automation starters, or their own. */
export async function emailWords(a: Step<ActionKey>): Promise<{ subject: string; body: string } | null> {
  const tpl = String(a.params.template ?? "custom");
  if (tpl === "custom") return { subject: String(a.params.subject ?? ""), body: String(a.params.body ?? "") };
  const starter = AUTOMATION_STARTERS.find((t) => t.id === tpl);
  if (starter) return { subject: String(a.params.subject || starter.subject), body: String(a.params.body || starter.body) };
  if (tpl.startsWith("msg:")) {
    const t = (await listTemplates()).find((x) => x.id === tpl.slice(4));
    if (t) return { subject: String(a.params.subject || t.subject), body: String(a.params.body || t.body) };
  }
  return null;
}

/* ── Homes nearby ─────────────────────────────────────────────────────────── */

const miles = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const r = 3958.8;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
};
const outward = (pc: string | null | undefined) => (pc ?? "").trim().toUpperCase().split(/\s+/)[0] ?? "";

/**
 * The agent's OTHER live homes near the one the customer asked about: their
 * own book only, published and not let agreed, within five miles (or the same
 * postcode district when a home has no pin), nearest first, four at most.
 */
export async function homesNearby(owner: OsUser, s: Subject) {
  const { bookFor } = await import("@/lib/listings-cache");
  const book = await bookFor(owner.rexUserId ?? "__none__");
  const live = book.listings.filter((l) => l.publicationStatus === "published" && !l.letAgreed && String(l.id) !== String(s.listingId ?? ""));
  const here = book.listings.find((l) => String(l.id) === String(s.listingId ?? ""));
  const pin = here?.lat != null && here?.lng != null ? { lat: here.lat, lng: here.lng } : null;
  const district = outward(here?.postcode ?? s.postcode);
  const scored = live
    .map((l) => ({ l, d: pin && l.lat != null && l.lng != null ? miles(pin, { lat: l.lat, lng: l.lng }) : outward(l.postcode) === district && district ? 2.5 : Infinity }))
    .filter((x) => x.d <= 5)
    .sort((a, b) => a.d - b.d)
    .slice(0, 4);
  return scored.map(({ l }) => ({ id: l.id, name: l.name, locality: l.locality, rent: l.rent, rentPeriod: l.rentPeriod }));
}

/* ── One action ───────────────────────────────────────────────────────────── */

export interface ActCtx {
  automation: Automation;
  runId: string;
  index: number;
  owner: OsUser;
  subject: Subject;
  origin: string;
  /** "preview" renders and returns what would go; "send" does it. */
  mode: "preview" | "send";
}

export type ActResult = { outcome: ActionOutcome; preview?: PreviewItem; reached: boolean };

const skip = (action: string, to: string, detail: string): ActResult => ({ outcome: { action, state: "skipped", to, detail }, reached: false });

export async function act(a: Step<ActionKey>, c: ActCtx): Promise<ActResult> {
  const def = actionDef(a.key);
  const label = def?.label ?? a.key;
  const m = mergeFor(c.subject, c.owner);
  switch (a.key) {
    case "email": {
      const to = (c.subject.email ?? "").trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return skip(label, "-", "No email address on their record, so no email.");
      let subject: string;
      let html: string;
      if (String(a.params.template) === "homes-nearby") {
        const homes = await homesNearby(c.owner, c.subject).catch(() => []);
        if (!homes.length) return skip(label, to, "None of your other homes nearby are on the market right now, so nothing was sent.");
        const { renderHomesThatFit } = await import("@/lib/homes-that-fit");
        ({ subject, html } = await renderHomesThatFit({ name: c.subject.name, homes, agentName: c.owner.name || "The Letting Experts", link: `${c.origin}/tenant/sign-in` }));
      } else {
        const words = await emailWords(a);
        if (!words) return skip(label, to, "That email template no longer exists.");
        const s = applyMerge(words.subject, m);
        const b = applyMerge(words.body, m);
        const missing = [...new Set([...s.missing, ...b.missing])];
        /* "Hi ," must never reach anyone: a blank merge field stops it. */
        if (missing.length) return skip(label, to, `Not sent: nothing on their record for ${missing.map((x) => `{{${x}}}`).join(", ")}.`);
        subject = s.text;
        html = proseEmail(b.text);
      }
      if (c.mode === "preview") return { outcome: { action: label, state: "queued", to, detail: "Waiting for you to check it.", subject }, preview: { action: label, to, subject, html }, reached: false };
      const id = randomBytes(9).toString("base64url");
      await q(
        `INSERT INTO os_scheduled_sends (id, kind, ref, to_email, subject, body, html, send_at, queued_by, queued_by_id)
         VALUES ($1, $2, $3, $4, $5, '', $6, NOW(), $7, $8)`,
        [id, AUTOMATION_SEND_KIND, `${c.automation.id}:${c.runId}:${c.index}`, to, subject, html, c.owner.name || c.owner.email, c.owner.id]
      );
      return { outcome: { action: label, state: "queued", to, detail: "Queued: goes out on the next five-minute send.", subject, sendId: id }, reached: true };
    }

    case "text": {
      const to = smsNumber(c.subject.phone);
      if (!to) return skip(label, c.subject.phone || "-", "No mobile number on their record, so no text.");
      const b = applyMerge(String(a.params.body ?? ""), m);
      if (b.missing.length) return skip(label, to, `Not sent: nothing on their record for ${b.missing.map((x) => `{{${x}}}`).join(", ")}.`);
      if (c.mode === "preview") return { outcome: { action: label, state: "queued", to, detail: "Waiting for you to check it." }, preview: { action: label, to, text: b.text }, reached: false };
      if (!(await switchOn("customer_email"))) return { outcome: { action: label, state: "held", to, detail: "Email to landlords and tenants is off on Admin, Switches, which holds texts to customers too." }, reached: false };
      if (!smsConfigured()) return { outcome: { action: label, state: "held", to, detail: "Texting isn't connected here." }, reached: false };
      const key = `automation:${c.runId}:${c.index}`;
      const r = await sendSms(to, b.text);
      await q(
        `INSERT INTO os_sms_log (key, kind, to_number, to_name, agent, body, outcome, detail, twilio_sid) VALUES ($1,'automation',$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (key) DO NOTHING`,
        [key, to, c.subject.name, c.owner.name, b.text, r.sent ? "sent" : "failed", r.detail, r.sid ?? null]
      ).catch(() => null);
      return { outcome: { action: label, state: r.sent ? "sent" : "failed", to, detail: r.detail }, reached: r.sent };
    }

    case "passport": {
      const to = (c.subject.email ?? "").trim();
      if (!to) return skip(label, "-", "No email address on their record, so no passport.");
      if (c.mode === "preview") return { outcome: { action: label, state: "queued", to, detail: "Waiting for you to check it." }, preview: { action: label, to, note: "Their tenant passport invite - the same email as Send passports, from you." }, reached: false };
      const { sendPassportInvite } = await import("@/lib/passport-invite");
      const r = await sendPassportInvite({ me: c.owner, origin: c.origin, name: c.subject.name, email: to, home: c.subject.address });
      if (!r.ok) return { outcome: { action: label, state: r.status === 409 ? "held" : "failed", to, detail: r.error }, reached: false };
      if (r.alreadySent) return skip(label, to, "They already had their passport from you.");
      return { outcome: { action: label, state: "sent", to, detail: r.said }, reached: true };
    }

    case "task": {
      const title = fillSoft(String(a.params.title || "Follow up {{name}}"), m) || "Follow up";
      const days = Math.max(0, Math.min(60, Number(a.params.dueDays) || 0));
      if (c.mode === "preview") return { outcome: { action: label, state: "queued", to: "you", detail: title }, preview: { action: label, to: "you", note: `A task for you: "${title}"` }, reached: false };
      const t = await createTask({
        userId: c.owner.id,
        title,
        detail: `From your automation "${c.automation.name}": ${c.subject.what}`,
        dueAt: new Date(Date.now() + days * 86_400_000).toISOString(),
        leadId: c.subject.leadId,
        listingId: c.subject.listingId,
        propertyId: c.subject.propertyId,
        kind: "automation",
        createdBy: `Automation: ${c.automation.name}`,
      });
      return { outcome: { action: label, state: t ? "done" : "failed", to: c.owner.name || "you", toId: c.owner.id, detail: t ? title : "The task could not be saved." }, reached: false };
    }

    case "notify": {
      const who = String(a.params.who || "me");
      const toId = who === "me" ? c.owner.id : who;
      const toName = who === "me" ? c.owner.name || "you" : ((await q<{ name: string }>(`SELECT name FROM os_users WHERE id = $1`, [toId]).catch(() => []))[0]?.name ?? "");
      if (!toName) return skip(label, who, "That person no longer has an account.");
      const message = fillSoft(String(a.params.message || "{{name}} - {{address}}"), m);
      if (c.mode === "preview") return { outcome: { action: label, state: "queued", to: toName, detail: message }, preview: { action: label, to: toName, note: `In the bell: "${message}"` }, reached: false };
      /* The run carries it; lib/notifications reads it into their bell. */
      return { outcome: { action: label, state: "done", to: toName, toId, detail: message }, reached: false };
    }

    case "huddle": {
      const room = String(a.params.room ?? "").trim();
      const message = fillSoft(String(a.params.message || "{{name}} - {{address}}"), m);
      if (c.mode === "preview") return { outcome: { action: label, state: "queued", to: room, detail: message }, preview: { action: label, to: room, note: `In ${room}: "${message}"` }, reached: false };
      const { postToHuddle } = await import("@/lib/automations/huddle");
      const r = await postToHuddle({ owner: c.owner, room, text: `${message}\n(Automation: ${c.automation.name})` });
      return { outcome: { action: label, state: r.ok ? "done" : "failed", to: room, detail: r.ok ? message : r.error }, reached: false };
    }

    case "tag": {
      const tag = fillSoft(String(a.params.tag ?? ""), m).slice(0, 40);
      if (!c.subject.leadId) return skip(label, "-", "There is no lead to tag.");
      if (c.mode === "preview") return { outcome: { action: label, state: "queued", to: c.subject.name, detail: tag }, preview: { action: label, to: c.subject.name, note: `Tag "${tag}" on their lead in the OS` }, reached: false };
      const { tagLead } = await import("@/lib/automations/tags");
      const r = await tagLead({ leadId: c.subject.leadId, tag, by: c.owner });
      return { outcome: { action: label, state: r.ok ? "done" : "failed", to: c.subject.name, detail: r.ok ? `Tagged "${tag}".` : r.error }, reached: false };
    }
  }
  return skip(label, "-", "The OS doesn't know that action.");
}

/** A customer address that is really one of ours: a test that may go whatever the switches say about customers. */
export function isOurs(to: string | null | undefined): boolean {
  return !!to && isInternalAddress(to);
}
