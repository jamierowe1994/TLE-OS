/**
 * A request's JSON body as a plain object (Rig runs 3-4, P-027 and P-048):
 * `{}` for null, a list, a number or no JSON at all. `req.json().catch(() => ({}))`
 * let a literal `null` body through, and the next `body.x` was an empty 500.
 */
export async function jsonObject(req: Request): Promise<Record<string, unknown>> {
  const raw: unknown = await req.json().catch(() => null);
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
}

/** A field as text: "" unless it is a string, so .trim() never meets a number. */
export const asText = (v: unknown): string => (typeof v === "string" ? v : "");
