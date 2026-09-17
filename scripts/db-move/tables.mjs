/**
 * WHICH TABLES ARE WHOSE - the one list the move is decided from (16 Sep 2026).
 *
 * The OS runs on TLE-portal's production Postgres. Tracker n01 was written as
 * "move the os_ tables and leave the portal's alone", and measuring the live
 * database showed that is not true: the OS itself reads AND WRITES fifteen of
 * the seventeen un-prefixed tables, through lib/business (deal notes, PayProp
 * tokens, company figures, Steve's knowledge, users and more). Moving only the
 * os_ tables would have cut the OS off from all of them on the first request.
 *
 * So there are three groups, and the middle one is a decision, not a fact:
 *
 *   OS        every os_ table. Only the OS uses them. They move.
 *   SHARED    both apps write them today. After a split, a note added in one
 *             app is invisible in the other - so whether they move is James's
 *             call, and it turns on whether the portal is still used after
 *             launch. See RUNBOOK.md.
 *   PORTAL    only the portal uses them. They stay.
 *
 * Measured by grepping both repositories for INSERT / UPDATE / DELETE against
 * each table, 16 Sep 2026. plan.mjs checks this list against the live database
 * every time it runs and stops on any table that is not in it, because a table
 * added since would otherwise be silently left behind.
 */

export const SHARED = [
  "actual_overrides",   // lib/business/actuals-store
  "arrears_snapshots",  // lib/business/arrears-history
  "assistant_knowledge",// lib/business/knowledge-store - Steve's knowledge base
  "deal_meta",          // lib/business/deal-store
  "deal_notes",         // lib/business/deal-store
  "deal_tasks",         // lib/business/deal-store
  "forecasts",          // lib/business/forecast-store
  "gci_months",         // lib/business/gci-history, app/api/business/backfill
  "history_funnels",    // lib/business/business-history
  "integration_cache",  // lib/business/integration-cache
  "payprop_tokens",     // lib/business/payprop-tokens - the PayProp connections
  "property_notes",     // lib/business/property-notes-store
  "propoly_cache",      // lib/business/propoly-snapshot
  "user_mailboxes",     // lib/business/mailbox-store
  "users",              // lib/business/users-store
];

export const PORTAL_ONLY = ["invoice_profiles", "todos"];

export const isOs = (name) => name.startsWith("os_");

/**
 * What moves, given the decision about SHARED.
 *   "copy"  the OS takes its own copy of the shared tables (the portal keeps its
 *           own too, and the two drift apart from the moment of the move)
 *   "leave" the shared tables stay put - only possible if the OS keeps a second
 *           connection to the portal's database for them, which it does not
 *           have today
 */
export function tablesToMove(allTables, shared = "copy") {
  const unknown = allTables.filter((t) => !isOs(t) && !SHARED.includes(t) && !PORTAL_ONLY.includes(t));
  const move = allTables.filter((t) => isOs(t) || (shared === "copy" && SHARED.includes(t)));
  return { move, unknown };
}
