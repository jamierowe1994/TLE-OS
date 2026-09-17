import "server-only";
import { hasDb, q } from "@/lib/db";
import { uid } from "@/lib/auth";
import { findUserByEmail, type OsUser } from "@/lib/users";
import { getContact } from "@/lib/contacts-store";
import { createAppraisal } from "@/lib/appraisal-store";
import { createPassport } from "@/lib/passport";
import { createCase } from "@/lib/plc-store";
import { removeFromOutlook } from "@/lib/outlook-calendar";
import { changeRexEvent } from "@/lib/rex-diary-write";
import { archiveTermsFor, docusealConfigured } from "@/lib/docuseal";
import { KITS, TEST_FILE_SIDES, sideOfKit, type KitId, type TestFileSide, type TestWho } from "@/lib/testing-journeys";
import { KitRefused, londonAt, runKit, TEST_ADDRESS, TEST_POSTCODE, type Refs } from "@/lib/test-kits";

/**
 * TEST FILES: add them, put them back to a stage, delete them, and clear the
 * lot for launch (James, 17 Sep 2026).
 *
 * "If I'm going to be testing as well as Howard, we're going to want to be
 * able to add more test leads, reset them to certain areas, and test that
 * function over and over, trying different things to make sure we can't
 * break it." And for launch: one button that removes all testing, and a
 * Ready for launch that takes the test files away and stops new ones.
 *
 * A file is one row of os_test_kits (lib/test-kits made it). A reset keeps
 * the person - same lead, same links, same name - and takes away everything
 * the flow did to them since: contact attempts, tasks, campaigns, the
 * appraisal, its diary entries in Outlook and REX, queued emails, decks,
 * passports, confirmations. Then it builds the stage asked for. It never
 * sends an email.
 *
 * Everything is found from the ids the file holds - never by a name or an
 * address, which is how a clear-up deletes somebody real. Contacts are only
 * ever deleted while still flagged is_test.
 */

export interface TestFileLink {
  who: TestWho;
  label: string;
  href: string;
}

export interface TestFile {
  id: string;
  side: TestFileSide;
  stage: string;
  stageLabel: string;
  name: string;
  byName: string;
  byEmail: string;
  createdAt: string;
  links: TestFileLink[];
  said: string;
  canRelink: boolean;
}

type Row = {
  id: string; kit: string; created_by: string; by_name: string; created_at: Date | string;
  refs: Refs | null; links: TestFileLink[] | null; said: string;
};

const SETTINGS_KEY = "testing";

/* ── the launch lock ─────────────────────────────────────────────────────── */

export async function testingClosed(): Promise<{ closed: boolean; at?: string; by?: string }> {
  if (!hasDb()) return { closed: false };
  const rows = await q<{ value: { closed?: boolean; at?: string; by?: string } | null }>(
    `SELECT value FROM os_settings WHERE key = $1`, [SETTINGS_KEY]
  ).catch(() => []);
  const v = rows[0]?.value;
  return v?.closed ? { closed: true, at: v.at, by: v.by } : { closed: false };
}

async function setClosed(closed: boolean, me: OsUser): Promise<void> {
  await q(
    `INSERT INTO os_settings (key, value, updated_at, updated_by) VALUES ($1, $2::jsonb, NOW(), $3)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW(), updated_by = EXCLUDED.updated_by`,
    [SETTINGS_KEY, JSON.stringify({ closed, at: new Date().toISOString(), by: me.name || me.email }), me.email]
  );
}

/* ── reading ─────────────────────────────────────────────────────────────── */

async function load(id: string): Promise<Row | null> {
  const rows = await q<Row>(
    `SELECT id, kit, created_by, by_name, created_at, refs, links, said FROM os_test_kits WHERE id = $1 AND cleared_at IS NULL`, [id]
  );
  return rows[0] ?? null;
}

function mayTouch(row: Row, me: OsUser): boolean {
  return row.created_by === me.email.trim().toLowerCase() || me.role === "owner";
}

async function toFile(r: Row): Promise<TestFile> {
  const kit = (r.kit in KITS ? r.kit : "landlord-lead") as KitId;
  const side = sideOfKit(kit);
  const refs = r.refs ?? {};
  const stage = refs.stage ?? (kit === "booked-appraisal" ? "booked" : kit === "tenant-passport" ? "passport" : "new");
  const def = TEST_FILE_SIDES[side].stages.find((s) => s.id === stage);
  const contact = refs.contacts?.[0] ? await getContact(refs.contacts[0]).catch(() => null) : null;
  return {
    id: r.id,
    side,
    stage,
    stageLabel: def?.label ?? stage,
    name: contact?.name ?? (side === "plc" ? "PLC pack" : "Test file"),
    byName: r.by_name,
    byEmail: r.created_by,
    createdAt: new Date(r.created_at).toISOString(),
    links: Array.isArray(r.links) ? r.links : [],
    said: r.said,
    canRelink: Boolean(refs.landlordEmail),
  };
}

/** A tester's own files, or everybody's for an owner who asks. Newest first. */
export async function listTestFiles(me: OsUser, everyone: boolean): Promise<TestFile[]> {
  if (!hasDb()) return [];
  const rows = everyone && me.role === "owner"
    ? await q<Row>(`SELECT id, kit, created_by, by_name, created_at, refs, links, said FROM os_test_kits WHERE cleared_at IS NULL ORDER BY created_at DESC LIMIT 200`)
    : await q<Row>(
        `SELECT id, kit, created_by, by_name, created_at, refs, links, said FROM os_test_kits WHERE created_by = $1 AND cleared_at IS NULL ORDER BY created_at DESC LIMIT 200`,
        [me.email.trim().toLowerCase()]
      );
  return Promise.all(rows.map(toFile));
}

/* ── adding ──────────────────────────────────────────────────────────────── */

const KIT_FOR: Record<TestFileSide, KitId> = { landlord: "landlord-lead", tenant: "tenant-enquiry", plc: "plc-pack" };

export async function addTestFile(side: TestFileSide, me: OsUser, origin: string): Promise<TestFile> {
  const run = await runKit(KIT_FOR[side], me, origin);
  const row = await load(run.id);
  if (!row) throw new KitRefused("The file was made but could not be read back.");
  /* A second landlord is "(test landlord 2)", so two files never look alike. */
  if (side !== "plc" && row.refs?.contacts?.[0]) {
    const same = await q<{ n: number }>(
      `SELECT count(*)::int AS n FROM os_test_kits WHERE created_by = $1 AND cleared_at IS NULL AND kit = ANY($2)`,
      [row.created_by, side === "landlord" ? ["landlord-lead", "booked-appraisal"] : ["tenant-enquiry", "tenant-passport"]]
    );
    const n = same[0]?.n ?? 1;
    if (n > 1) {
      await q(`UPDATE os_contacts SET name = regexp_replace(name, '\\(test (landlord|tenant)\\)$', '(test \\1 ' || $2 || ')') WHERE id = $1 AND is_test`, [row.refs.contacts[0], String(n)]);
    }
  }
  return toFile(row);
}

/* ── taking the flow back off a file ─────────────────────────────────────── */

/**
 * Everything the flow did to this file, undone - the person stays.
 * `owner` is who made the file: their Outlook holds its diary entries.
 */
async function unwind(refs: Refs, ownerEmail: string, since: Date | string): Promise<void> {
  const contacts = refs.contacts ?? [];
  const leadIds = refs.leadIds ?? [];
  /* The kit's appraisal, and any appraisal booked from the lead in the flow
     (lib/appraisal-store: "lead-<lead id>"). */
  const appraisals = [...new Set([...(refs.appraisals ?? []), ...leadIds.map((l) => `lead-${l}`)])];
  const refIds = [...leadIds, ...appraisals];
  const owner = await findUserByEmail(ownerEmail).catch(() => null);
  const run = (sql: string, params: unknown[]) => q(sql, params).catch(() => []);

  /* Queued emails first: a reset must never leave one to go out tomorrow. */
  await run(
    `UPDATE os_scheduled_sends SET state = 'cancelled', error = 'Test file reset' WHERE state = 'queued' AND (ref = ANY($1) OR contact_id = ANY($2))`,
    [refIds, contacts]
  );

  /* Diary entries in the tester's Outlook, and REX's mirror of them. */
  if (owner) {
    const outlook = await q<{ record_id: string }>(
      `SELECT record_id FROM os_case_state WHERE kind = 'outlook-event'
         AND (record_id = ANY($1) OR split_part(record_id, '|', 2) = ANY($2))`,
      [appraisals.map((a) => `appraisal|${a}`), leadIds]
    ).catch(() => []);
    for (const o of outlook) await removeFromOutlook(owner.id, o.record_id).catch(() => null);
    const rex = await q<{ payload: { eventId?: string } }>(
      `SELECT payload FROM os_case_state WHERE (kind = 'rex-diary' AND record_id = ANY($1)) OR (kind = 'rex-viewing' AND split_part(record_id, '|', 1) = ANY($2))`,
      [appraisals, leadIds]
    ).catch(() => []);
    for (const r of rex) {
      if (r.payload?.eventId) await changeRexEvent({ userId: owner.id, eventId: r.payload.eventId, cancel: { reason: "organiser" } }).catch(() => null);
    }
  }

  await run(
    `DELETE FROM os_case_state WHERE record_id = ANY($1)
        OR (kind IN ('outlook-event', 'confirmation-sent') AND (split_part(record_id, '|', 2) = ANY($1)))
        OR (kind = 'rex-viewing' AND split_part(record_id, '|', 1) = ANY($2))`,
    [refIds, leadIds]
  );
  await run(`DELETE FROM os_lead_touches WHERE lead_id = ANY($1)`, [leadIds]);
  await run(`DELETE FROM os_tasks WHERE lead_id = ANY($1)`, [leadIds]);
  await run(`DELETE FROM os_lead_facts WHERE lead_id = ANY($1)`, [leadIds]);
  await run(`DELETE FROM os_campaign_sends WHERE enrolment_id IN (SELECT id FROM os_campaign_enrolments WHERE record_id = ANY($1))`, [leadIds]);
  await run(`DELETE FROM os_campaign_enrolments WHERE record_id = ANY($1)`, [leadIds]);
  /* The contract and everything around the presentations, before the decks
     go: a reset appraisal keeps its id, so anything keyed on it or on a deck
     token came straight back (17 Sep 2026 - the file said "signed"). */
  const deckTokens = (await q<{ token: string }>(`SELECT token FROM os_presentations WHERE ref = ANY($1)`, [refIds]).catch(() => [])).map((t) => t.token);
  await run(
    `DELETE FROM os_case_state
      WHERE (kind IN ('deck-emailed', 'landlord-deck-views') AND record_id = ANY($1))
         OR (kind = 'landlord-deck-read' AND split_part(record_id, '|', 2) = ANY($1))
         OR (kind IN ('deck-build-chase') AND split_part(record_id, '|', 1) = ANY($2))`,
    [deckTokens, appraisals]
  );
  await run(`DELETE FROM os_signed_documents WHERE appraisal_id = ANY($1)`, [appraisals]);
  if (docusealConfigured()) for (const a of appraisals) await archiveTermsFor(a).catch(() => 0);
  await run(`DELETE FROM os_presentations WHERE ref = ANY($1)`, [refIds]);
  await run(`DELETE FROM os_market_appraisals WHERE id = ANY($1) OR lead_id = ANY($2)`, [appraisals, leadIds]);
  /* Passports: the file's own, and any the flow made for this person - a
     viewing confirmation makes one by email, with no contact id on it. The
     email is the tester's own, so only passports made since the file was. */
  const names = contacts.length ? (await q<{ name: string }>(`SELECT name FROM os_contacts WHERE id = ANY($1)`, [contacts]).catch(() => [])).map((c) => c.name) : [];
  const tokens = (await q<{ token: string }>(
    `SELECT token FROM os_tenant_passports WHERE token = ANY($1) OR contact_id = ANY($2)
        OR (lower(email) = $3 AND name = ANY($4) AND created_at >= $5)`,
    [refs.passports ?? [], contacts, ownerEmail.toLowerCase(), names, since]
  ).catch(() => [])).map((t) => t.token);
  await run(`DELETE FROM os_tenant_passports WHERE token = ANY($1)`, [tokens]);
  /* The once-only guards on the automatic tenant emails, so they can fire again. */
  const needles = [...contacts, ...leadIds, ...tokens].map((x) => `%${x}%`);
  if (needles.length) await run(`DELETE FROM os_tenant_email_log WHERE key LIKE ANY($1)`, [needles]);
  await run(`DELETE FROM os_plc_cases WHERE id = ANY($1)`, [refs.plcCases ?? []]);
}

/* ── putting a file at a stage ───────────────────────────────────────────── */

export async function resetTestFile(id: string, stageId: string, me: OsUser, origin: string): Promise<TestFile> {
  if (!hasDb()) throw new KitRefused("There is no database here.");
  if ((await testingClosed()).closed) throw new KitRefused("Testing is closed for launch.");
  const row = await load(id);
  if (!row) throw new KitRefused("That test file has gone. Refresh the list.");
  if (!mayTouch(row, me)) throw new KitRefused("That is somebody else's test file.");
  const kit = (row.kit in KITS ? row.kit : "landlord-lead") as KitId;
  const side = sideOfKit(kit);
  const stage = TEST_FILE_SIDES[side].stages.find((s) => s.id === stageId);
  if (!stage) throw new KitRefused("That is not a stage this file can go back to.");

  const refs = row.refs ?? {};
  await unwind(refs, row.created_by, row.created_at);

  const email = row.created_by;
  const maker = (await findUserByEmail(email).catch(() => null)) ?? me;
  const next: Refs = { contacts: refs.contacts, leadIds: refs.leadIds, stage: stage.id };
  const links: TestFileLink[] = [];
  let nextKit: KitId = kit;
  const contactId = refs.contacts?.[0] ?? null;
  const leadId = refs.leadIds?.[0] ?? null;
  const contact = contactId ? await getContact(contactId).catch(() => null) : null;

  if (side === "landlord") {
    if (!leadId || !contact) throw new KitRefused("This file has lost its lead, so it cannot be reset. Delete it and add another.");
    links.push({ who: "agent", label: "Open the lead", href: `/leads?side=landlord&open=${leadId}` });
    nextKit = "landlord-lead";
    if (stage.id === "booked" || stage.id === "visited") {
      const ma = await createAppraisal({
        leadId,
        landlord: contact.name,
        address: TEST_ADDRESS,
        postcode: TEST_POSTCODE,
        agent: maker.name || email,
        appointmentAt: stage.id === "booked" ? londonAt(3, 11) : londonAt(-1, 11),
      });
      next.appraisals = [ma.id];
      next.landlordEmail = email;
      nextKit = "booked-appraisal";
      links.unshift({ who: "agent", label: "Open the appraisal", href: `/market-appraisals/${encodeURIComponent(ma.id)}` });
    }
  } else if (side === "tenant") {
    if (!leadId || !contact) throw new KitRefused("This file has lost its lead, so it cannot be reset. Delete it and add another.");
    links.push({ who: "agent", label: "Open the lead", href: `/leads?side=tenant&open=${leadId}` });
    nextKit = "tenant-enquiry";
    if (stage.id === "passport") {
      const passport = await createPassport({ name: contact.name, email, contactId: contact.id, agentId: maker.id });
      next.passports = [passport.token];
      nextKit = "tenant-passport";
      links.push({ who: "tenant", label: "Open the passport", href: `/tenant/passport/${passport.token}` });
    }
  } else {
    const ref = `TEST-${uid().slice(0, 6).toUpperCase()}`;
    const pack = await createCase({
      applicationRef: ref,
      address: "Flat 2, 30 Test Road, Didsbury, Manchester M20 2RN",
      agentName: maker.name || email,
      agentEmail: email,
      moveInDate: londonAt(21, 12).slice(0, 10),
    });
    next.plcCases = [pack.id];
    nextKit = "plc-pack";
    links.push({ who: "agent", label: "Open the pack", href: `/plc?case=${encodeURIComponent(pack.id)}` });
    links.push({ who: "compliance", label: "Open it on the PLC queue", href: `/pre-tenancy/plc?case=${encodeURIComponent(pack.id)}` });
  }

  const said = `Reset to ${stage.label} by ${me.name || me.email}. ${stage.says}`;
  await q(`UPDATE os_test_kits SET kit = $2, refs = $3::jsonb, links = $4::jsonb, said = $5 WHERE id = $1`, [
    id, nextKit, JSON.stringify(next), JSON.stringify(links), said,
  ]);
  const fresh = await load(id);
  return toFile(fresh!);
}

/* ── deleting ────────────────────────────────────────────────────────────── */

export async function deleteTestFile(id: string, me: OsUser): Promise<void> {
  if (!hasDb()) return;
  const row = await load(id);
  if (!row) return;
  if (!mayTouch(row, me)) throw new KitRefused("That is somebody else's test file.");
  const refs = row.refs ?? {};
  await unwind(refs, row.created_by, row.created_at);
  await q(`DELETE FROM os_contacts WHERE id = ANY($1) AND is_test`, [refs.contacts ?? []]).catch(() => []);
  if (refs.landlordEmail) {
    /* The tester's landlord portal account and any unspent link, once none of
       their files is a landlord any more. Theirs by email, one of ours. */
    const others = await q<{ n: number }>(
      `SELECT count(*)::int AS n FROM os_test_kits WHERE created_by = $1 AND cleared_at IS NULL AND id <> $2 AND refs ? 'landlordEmail'`,
      [row.created_by, id]
    ).catch(() => [{ n: 1 }]);
    if (!others[0]?.n) {
      await q(`DELETE FROM os_email_verifications WHERE email = $1 AND purpose = 'landlord'`, [row.created_by]).catch(() => []);
      await q(`DELETE FROM os_portal_accounts WHERE email = $1 AND kind = 'landlord'`, [row.created_by]).catch(() => []);
    }
  }
  await q(`UPDATE os_test_kits SET cleared_at = NOW() WHERE id = $1`, [id]);
}

/* ── launch ──────────────────────────────────────────────────────────────── */

/**
 * Every tester's files, gone - and any test contact made some other way.
 * Owners only. Test marks and runs (what was tested, and what failed) stay:
 * they are the record of the testing, not test data.
 */
export async function removeAllTesting(me: OsUser): Promise<{ files: number; strays: number }> {
  if (me.role !== "owner") throw new KitRefused("Only an owner can remove all testing.");
  const rows = await q<{ id: string }>(`SELECT id FROM os_test_kits WHERE cleared_at IS NULL`);
  for (const r of rows) await deleteTestFile(r.id, me);
  const strays = await q<{ id: string; created_by: string; created_at: Date }>(`SELECT id, created_by, created_at FROM os_contacts WHERE is_test`).catch(() => []);
  for (const c of strays) {
    await unwind({ contacts: [c.id], leadIds: [`os-${c.id}`] }, c.created_by || me.email, c.created_at);
    await q(`DELETE FROM os_contacts WHERE id = $1 AND is_test`, [c.id]).catch(() => []);
  }
  return { files: rows.length, strays: strays.length };
}

/** Ready for launch: everything above, and no new test files until reopened. */
export async function readyForLaunch(me: OsUser): Promise<{ files: number; strays: number }> {
  if (me.role !== "owner") throw new KitRefused("Only an owner can close testing.");
  const out = await removeAllTesting(me);
  await setClosed(true, me);
  return out;
}

export async function reopenTesting(me: OsUser): Promise<void> {
  if (me.role !== "owner") throw new KitRefused("Only an owner can reopen testing.");
  await setClosed(false, me);
}
