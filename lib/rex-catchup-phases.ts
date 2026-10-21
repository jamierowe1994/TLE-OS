import "server-only";
import { q } from "@/lib/db";
import type { CatchupItem, Phase } from "@/lib/rex-catchup";

/* ==========================================================================
   THE CATCH-UP, PHASE BY PHASE (21 Oct 2026, lib/rex-catchup).

   In the order a file moves, and in an order that matters: a contact has to
   be in REX before a note, a document or a viewing can be joined to it.
   Each phase finds what the OS holds that REX does not, from the OS's own
   marker for "this reached REX", and pushes it with the function the screen
   uses - so the REX id lands where the OS looks for it, and a second run
   finds nothing to do.

   The phases whose screens keep nothing when REX refuses (a new listing,
   photos, publishing, an application, an e-sign request) cannot be found
   this way. They are in the backlog the write queue kept overnight, listed
   on Admin > REX status for somebody to redo by hand - lib/rex-catchup's
   handList.
   ========================================================================== */

const when = (d: Date | string | null) =>
  d
    ? new Date(d).toLocaleString("en-GB", { weekday: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Europe/London" })
    : "";

/** The OS user behind a name or email who has REX connected - whose sign-in a push needs. */
async function userWithRex(nameOrEmail: string | null | undefined): Promise<string | null> {
  const key = (nameOrEmail ?? "").trim().toLowerCase();
  if (!key) return null;
  const rows = await q<{ id: string }>(
    `SELECT u.id FROM os_users u JOIN os_rex_tokens t ON t.user_id = u.id
      WHERE lower(trim(u.name)) = $1 OR lower(u.email) = $1 LIMIT 1`,
    [key]
  ).catch(() => []);
  return rows[0]?.id ?? null;
}

/** The REX contact behind a lead: a REX enquiry's own, or an OS contact once phase 1 has pushed it. */
async function rexContactOf(leadId: string): Promise<string | null> {
  if (leadId.startsWith("os-")) {
    const rows = await q<{ rex_id: string | null }>(`SELECT rex_id FROM os_contacts WHERE id = $1`, [leadId.slice(3)]).catch(() => []);
    return rows[0]?.rex_id ?? null;
  }
  const rows = await q<{ contact_id: string | null }>(`SELECT contact_id FROM os_leads WHERE id = $1`, [leadId]).catch(() => []);
  return rows[0]?.contact_id ?? null;
}

const contacts: Phase = {
  key: "contacts",
  covers: ["Contacts/create"],
  label: "Leads and Contacts",
  what: "People added in the OS while REX was down: new leads, landlords, tenants booked for viewings.",
  async find(since) {
    const rows = await q<{ id: string; name: string; kind: string; created_by: string; created_at: Date; rex_detail: string }>(
      `SELECT id, name, kind, created_by, created_at, rex_detail FROM os_contacts
        WHERE rex_id IS NULL AND NOT is_test AND created_at > $1
          AND rex_state IN ('failed','held') AND rex_detail <> 'Saved without attempting REX.'
        ORDER BY created_at`,
      [since.toISOString()]
    );
    return rows.map((r) => ({
      id: r.id,
      label: r.name || "(no name)",
      detail: `${r.kind}, added ${when(r.created_at)} by ${r.created_by || "somebody"}. ${r.rex_detail}`.trim(),
      at: new Date(r.created_at).toISOString(),
      href: `/leads?open=os-${r.id}`,
    }));
  },
  async push(item) {
    const { getContact, markRex } = await import("@/lib/contacts-store");
    const { pushContactToRex } = await import("@/lib/rex-contacts");
    const c = await getContact(item.id);
    if (!c) return { ok: false, error: "That contact is gone." };
    if (c.rexId) return { ok: true };
    const rows = await q<{ created_by: string }>(`SELECT created_by FROM os_contacts WHERE id = $1`, [item.id]);
    const userId = await userWithRex(rows[0]?.created_by);
    const out = await pushContactToRex(c, userId);
    const state = out.ok ? "sent" : out.reason === "refused" || out.reason === "rex_session_expired" ? "failed" : "held";
    await markRex(c.id, state, out.detail, out.ok ? out.rexId : null, "REX catch-up");
    return out.ok ? { ok: true } : { ok: false, error: out.detail };
  },
};

const notes: Phase = {
  key: "notes",
  covers: ["Notes/create"],
  label: "Lead Notes",
  what: "Notes written on a lead while REX was down, onto the person's REX record under the writer's name.",
  async find(since) {
    const rows = await q<{ id: string; lead_id: string; body: string; by_name: string; at: Date }>(
      `SELECT id, lead_id, body, by_name, at FROM os_lead_touches
        WHERE kind = 'note' AND rex_note_id IS NULL AND by_id IS NOT NULL AND at > $1 ORDER BY at`,
      [since.toISOString()]
    );
    return rows.map((r) => ({
      id: r.id,
      label: r.body.slice(0, 80) || "(empty note)",
      detail: `On lead ${r.lead_id}, by ${r.by_name || "somebody"} at ${when(r.at)}.`,
      at: new Date(r.at).toISOString(),
      href: `/leads?open=${encodeURIComponent(r.lead_id)}`,
    }));
  },
  async push(item) {
    const rows = await q<{ lead_id: string; body: string; by_id: string }>(
      `SELECT lead_id, body, by_id FROM os_lead_touches WHERE id = $1 AND rex_note_id IS NULL`,
      [item.id]
    );
    const t = rows[0];
    if (!t) return { ok: true };
    const { noteToRex } = await import("@/lib/rex-notes");
    const { setRexNoteId } = await import("@/lib/lead-touches");
    const r = await noteToRex({ leadId: t.lead_id, contactId: await rexContactOf(t.lead_id), text: t.body, byUserId: t.by_id });
    if (r.ok) {
      await setRexNoteId(item.id, r.id);
      return { ok: true };
    }
    /* Never meant for REX (the person is not in REX, a test file): not a
       refusal that should stop the phase. */
    if (/not in REX yet|test file|viewing as/i.test(r.why)) return { ok: true };
    return { ok: false, error: r.why };
  },
};

const documents: Phase = {
  key: "documents",
  covers: ["Upload/uploadFileFromUrl"],
  label: "Lead Documents",
  what: "Files added to a lead while REX was down, copied onto the person's REX record.",
  async find(since) {
    const rows = await q<{ id: string; lead_id: string; name: string; by_name: string; at: Date }>(
      `SELECT id, lead_id, name, by_name, at FROM os_lead_documents
        WHERE rex_at IS NULL AND by_id IS NOT NULL AND at > $1 ORDER BY at`,
      [since.toISOString()]
    );
    return rows.map((r) => ({
      id: r.id,
      label: r.name,
      detail: `On lead ${r.lead_id}, added by ${r.by_name || "somebody"} at ${when(r.at)}.`,
      at: new Date(r.at).toISOString(),
      href: `/leads?open=${encodeURIComponent(r.lead_id)}`,
    }));
  },
  async push(item) {
    const rows = await q<{ lead_id: string; by_id: string }>(`SELECT lead_id, by_id FROM os_lead_documents WHERE id = $1`, [item.id]);
    const d = rows[0];
    if (!d) return { ok: true };
    const { docToRex } = await import("@/lib/lead-documents");
    const r = await docToRex({ leadId: d.lead_id, docId: item.id, contactId: await rexContactOf(d.lead_id), byUserId: d.by_id });
    if (r.ok || /test file|not in REX/i.test(r.why)) return { ok: true };
    return { ok: false, error: r.why };
  },
};

const appraisals: Phase = {
  key: "appraisals",
  covers: [],
  label: "Market Appraisals",
  what: "Appraisals booked while REX was down, into the agent's REX diary.",
  async find(since) {
    const rows = await q<{ id: string; address: string; agent: string | null; appointment_at: Date; created_at: Date }>(
      `SELECT a.id, a.address, a.agent, a.appointment_at, a.created_at FROM os_market_appraisals a
        WHERE a.appointment_at IS NOT NULL AND a.cancelled_at IS NULL AND a.stage <> 'lost' AND a.created_at > $1
          AND NOT EXISTS (SELECT 1 FROM os_case_state s WHERE s.kind = 'rex-diary' AND s.record_id = a.id)
        ORDER BY a.created_at`,
      [since.toISOString()]
    );
    return rows.map((r) => ({
      id: r.id,
      label: r.address,
      detail: `${r.agent || "No agent"}, for ${when(r.appointment_at)}, booked ${when(r.created_at)}.`,
      at: new Date(r.created_at).toISOString(),
      href: `/market-appraisals?open=${encodeURIComponent(r.id)}`,
    }));
  },
  async push(item) {
    const { getAppraisal } = await import("@/lib/appraisal-store");
    const { putAppraisalInRexDiary } = await import("@/lib/rex-diary-write");
    const ma = await getAppraisal(item.id);
    if (!ma) return { ok: true };
    const userId = await userWithRex(ma.agent);
    if (!userId) return { ok: false, error: `${ma.agent || "The agent"} has no REX sign-in in the OS, so the diary entry cannot be made in their name.` };
    const r = await putAppraisalInRexDiary({ ma, userId });
    if (r.ok || r.reason === "test_file" || r.reason === "no_time") return { ok: true };
    return { ok: false, error: r.detail };
  },
};

const viewings: Phase = {
  key: "viewings",
  covers: ["CalendarEvents/create"],
  label: "Viewings",
  what: "Viewings booked while REX was down, into the agent's REX diary and joined to the applicant.",
  async find(since) {
    const rows = await q<{ id: string; title: string; author_name: string; starts_at: Date; created_at: Date }>(
      `SELECT id, title, author_name, starts_at, created_at FROM os_appointments
        WHERE kind = 'viewing' AND booking IS NOT NULL AND rex_event_id IS NULL AND cancelled_at IS NULL
          AND author_id IS NOT NULL AND created_at > $1
          AND COALESCE(booking->>'listingId', '') ~ '^[0-9]+$'
        ORDER BY created_at`,
      [since.toISOString()]
    );
    return rows.map((r) => ({
      id: r.id,
      label: r.title,
      detail: `By ${r.author_name || "somebody"}, for ${when(r.starts_at)}, booked ${when(r.created_at)}.`,
      at: new Date(r.created_at).toISOString(),
    }));
  },
  async push(item) {
    const rows = await q<{
      author_id: string;
      author_name: string;
      booking: { leadId: string; listingId: string; applicantName: string; applicantEmail: string | null; applicantPhone: string | null; address: string; startsAt: string; minutes: number; unaccompanied: boolean };
    }>(`SELECT author_id, author_name, booking FROM os_appointments WHERE id = $1 AND rex_event_id IS NULL`, [item.id]);
    const a = rows[0];
    if (!a) return { ok: true };
    const b = a.booking;
    const { putViewingInRexDiary } = await import("@/lib/rex-diary-write");
    const { viewingBrief } = await import("@/lib/viewing-brief");
    const contactId = await rexContactOf(b.leadId);
    const r = await putViewingInRexDiary({
      userId: a.author_id,
      leadId: b.leadId,
      listingId: b.listingId,
      contactId,
      applicantName: b.applicantName,
      address: b.address,
      startsAt: b.startsAt,
      minutes: b.minutes,
      unaccompanied: b.unaccompanied,
      description: viewingBrief({
        address: b.address,
        applicantName: b.applicantName,
        phone: b.applicantPhone,
        email: b.applicantEmail,
        access: null,
        unaccompanied: b.unaccompanied,
        agentName: a.author_name,
      }),
    });
    if (r.ok) {
      /* As the booking does when REX takes it: so the viewing shows once. */
      await q(`UPDATE os_appointments SET rex_event_id = $2, synced_at = NOW() WHERE id = $1`, [item.id, String(r.eventId)]);
      return { ok: true };
    }
    if (r.reason === "test_file" || r.reason === "no_listing") return { ok: true };
    return { ok: false, error: r.detail };
  },
};

const signedTerms: Phase = {
  key: "signed-terms",
  covers: ["Properties/create"],
  label: "Signed Terms",
  what: "Landlords who signed while REX was down: the landlord and the property into REX (the hourly retry does this too).",
  async find(since) {
    const rows = await q<{ appraisal_id: string; address: string; completed_at: Date }>(
      `SELECT DISTINCT ON (d.appraisal_id) d.appraisal_id, a.address, d.completed_at
         FROM os_signed_documents d JOIN os_market_appraisals a ON a.id = d.appraisal_id
        WHERE d.completed_at IS NOT NULL AND d.submitter_id > 0 AND d.completed_at > $1
          AND (a.rex_property_id IS NULL OR a.rex_property_id = '')
        ORDER BY d.appraisal_id, d.completed_at`,
      [since.toISOString()]
    );
    return rows.map((r) => ({
      id: r.appraisal_id,
      label: r.address,
      detail: `Signed ${when(r.completed_at)}; no REX property yet.`,
      at: new Date(r.completed_at).toISOString(),
      href: `/market-appraisals?open=${encodeURIComponent(r.appraisal_id)}`,
    }));
  },
  async push(item) {
    const { putInstructionInRex } = await import("@/lib/rex-instruct");
    const r = await putInstructionInRex(item.id, { by: "REX catch-up" });
    return r.propertyId ? { ok: true } : { ok: false, error: r.detail };
  },
};

const certificates: Phase = {
  key: "certificates",
  covers: ["ComplianceEntries/create"],
  label: "Certificates",
  what: "Certificates filed while REX was down, onto the home's REX compliance tab (Michael's checked ones only).",
  async find(since) {
    const rows = await q<{ id: string; property_name: string; type_id: string; added_by: string; added_at: Date; rex_note: string }>(
      `SELECT id, property_name, type_id, added_by, added_at, rex_note FROM os_certificates
        WHERE (rex_entry_id IS NULL OR rex_entry_id = '') AND NOT awaiting_check
          AND property_id ~ '^[0-9]+$' AND added_at > $1
        ORDER BY added_at`,
      [since.toISOString()]
    );
    return rows.map((r) => ({
      id: r.id,
      label: `${r.property_name || "A home"} - ${r.type_id}`,
      detail: `Filed ${when(r.added_at)} by ${r.added_by || "somebody"}. ${r.rex_note}`.trim(),
      at: new Date(r.added_at).toISOString(),
    }));
  },
  async push(item) {
    const { writeCertificateRow } = await import("@/lib/certificate-intake");
    const rows = await q<Record<string, unknown>>(`SELECT * FROM os_certificates WHERE id = $1`, [item.id]);
    if (!rows[0]) return { ok: true };
    const r = await writeCertificateRow(rows[0] as Parameters<typeof writeCertificateRow>[0], `Written by TLE OS after the REX outage (${String(rows[0].name)}).`);
    return r.rex_entry_id ? { ok: true } : { ok: false, error: String(r.rex_note || "REX did not take it.") };
  },
};

export const CATCHUP_PHASES: Phase[] = [contacts, notes, documents, appraisals, viewings, signedTerms, certificates];

/** What can only be redone by hand: the screens kept nothing when REX said no. */
export const BY_HAND = new Set([
  "Listings/create",
  "Upload/uploadFileFromUrl", // listing photos and plans only - see handList
  "ListingPublication/publish",
  "ListingPublication/setActivePublicationChannels",
  "TenancyApplications/create",
  "EsignRequests/create",
  "MailMerge/queueMergeUsingObjects",
]);

export type { CatchupItem };
