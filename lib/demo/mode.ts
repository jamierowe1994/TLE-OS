/**
 * THE DEMO COPY (James, 17 Nov 2026).
 *
 * "One of the recruiters has asked if they can have a sandbox version of the
 * account, to show it off ... filled with fake data ... without caging the
 * system. Every time I make a change to the new system it needs to be linked
 * so it will be updated as well."
 *
 * So the demo is not a mode inside the live system. It is the SAME CODE run a
 * second time, as its own service with its own empty database, with
 * DEMO_MODE=1 set. Every push builds both, so the demo never falls behind.
 *
 * ── What DEMO_MODE=1 changes, all of it ───────────────────────────────────
 *
 *   1. REX is never called. lib/rex and lib/business/rex hand every question
 *      to lib/demo/rex, which answers from an invented world held in this
 *      process (lib/demo/world). There is no network request to refuse: the
 *      code that would make one is not reached.
 *   2. Outgoing requests to anything that could reach a real person or a real
 *      record are refused at the door (lib/demo/net-guard, installed at boot).
 *   3. The shell says "Demo" on every screen (components/DemoMark).
 *
 * The live service does not set DEMO_MODE, so none of this runs there. And a
 * demo service that somehow also held real keys still could not use the REX
 * ones, because of (1).
 *
 * Nothing here may import server-only modules: the shell reads it too.
 */

export function demoMode(): boolean {
  return (process.env.DEMO_MODE ?? "").trim() === "1";
}

/** Where the demo's own pictures are served from: its public address. */
export function demoOrigin(): string {
  return (process.env.DEMO_ORIGIN || process.env.OS_ORIGIN || process.env.NEXT_PUBLIC_OS_ORIGIN || "").replace(/\/+$/, "");
}
