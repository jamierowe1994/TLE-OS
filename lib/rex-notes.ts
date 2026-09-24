import "server-only";
import { hasDb, q } from "@/lib/db";
import { isExpiredToken, rexCall, RexWriteBlocked } from "@/lib/rex";
import { rexTokenFor } from "@/lib/rex-user";
import { isTestFile, TEST_REFUSAL } from "@/lib/test-guard";

/**
 * A NOTE WRITTEN IN THE OS IS A NOTE IN REX TOO (Howard, 24 Sep 2026).
 *
 * "Until we do a full migration" the team reads REX as well as the OS, so a
 * note that only lives here is a note half of them never see. Every lead note
 * is written to REX as a Note on the person's contact - REX keeps notes on
 * contacts and properties, not on leads - with the agent's own REX sign-in, so
 * REX shows who wrote it. Never the office account: a note under the wrong
 * name is worse than one that says it did not go.
 *
 * The shape is REX's own, read off live notes on 24 Sep:
 *   { note, note_type: { id: "note" }, related: { note_contacts: [{ contact: { id } }] } }
 * note_type is one of note, sms, letter, email, phonecall, meeting.
 *
 * Every refusal is said in a sentence the agent can act on; the note itself is
 * already saved in the OS by the time this runs, so nothing is lost either way.
 */

export type RexNoteResult = { ok: true; id: string } | { ok: false; why: string };

/** The REX contact behind a lead: a REX enquiry carries it, an OS lead is os-<our contact id>. */
export async function rexContactFor(leadId: string, contactId: string | null): Promise<string | null> {
  if (leadId.startsWith("os-")) {
    if (!hasDb()) return null;
    const rows = await q<{ rex_id: string | null }>(
      `SELECT rex_id FROM os_contacts WHERE id::text = $1`,
      [leadId.slice(3)]
    ).catch(() => []);
    return rows[0]?.rex_id ? String(rows[0].rex_id) : null;
  }
  return contactId && /^\d+$/.test(contactId) ? contactId : null;
}

export async function noteToRex(p: {
  leadId: string;
  /** The REX contact id the drawer holds for a REX enquiry. */
  contactId: string | null;
  text: string;
  /** The OS user whose REX sign-in writes it. */
  byUserId: string;
}): Promise<RexNoteResult> {
  const text = p.text.trim();
  if (!text) return { ok: false, why: "An empty note has nothing to send." };
  if (await isTestFile({ leadId: p.leadId, contactId: p.contactId })) return { ok: false, why: TEST_REFUSAL };

  const contact = await rexContactFor(p.leadId, p.contactId);
  if (!contact) return { ok: false, why: "This person is not in REX yet, so the note stays in the OS." };

  const token = await rexTokenFor(p.byUserId).catch(() => null);
  if (!token) return { ok: false, why: "Connect your REX sign-in in your profile and notes go to REX with your name on them." };

  try {
    const res = await rexCall(
      "Notes",
      "create",
      {
        data: {
          note: text.slice(0, 5000),
          note_type: { id: "note" },
          related: { note_contacts: [{ contact: { id: Number(contact) } }] },
        },
        return_id: true,
      },
      token
    );
    if (!res.ok) {
      if (isExpiredToken(res)) return { ok: false, why: "Your REX sign-in has lapsed. Reconnect it in your profile and new notes go to REX again." };
      return { ok: false, why: `REX did not take the note: ${res.error ?? `it answered ${res.status}`}.` };
    }
    const r = res.result as unknown;
    const id = typeof r === "number" || typeof r === "string" ? String(r) : String((r as { id?: unknown } | null)?.id ?? "");
    return id ? { ok: true, id } : { ok: false, why: "REX took the note but did not say where it put it." };
  } catch (e) {
    if (e instanceof RexWriteBlocked) return { ok: false, why: "Sending notes to REX is not switched on yet, so this one stays in the OS." };
    return { ok: false, why: "REX did not answer, so the note stays in the OS for now." };
  }
}
