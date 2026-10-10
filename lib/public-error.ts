/**
 * What a route may say to the screen about an error (Rig run 4, P-085,
 * 10 Oct 2026).
 *
 * Routes answered `e.message` straight through, so a database refusal arrived
 * on screen as "invalid byte sequence for encoding \"UTF8\": 0x00". Our own
 * thrown messages ("A quote needs a figure.") are written for people and pass
 * through. A Postgres or system error carries a code (a SQLSTATE, ECONNREFUSED)
 * and is replaced with the plain sentence the route gives, while the detail
 * goes to the server log where it is useful.
 */
export function publicError(e: unknown, fallback = "Something went wrong. Try again in a minute."): string {
  if (!(e instanceof Error)) return fallback;
  const sys = e as Error & { code?: unknown; severity?: unknown; routine?: unknown };
  if (sys.code !== undefined || sys.severity !== undefined || sys.routine !== undefined) {
    console.error("[route error]", e);
    return fallback;
  }
  return e.message || fallback;
}
