/**
 * Address lookup for the tenant passport.
 *
 * The same handler as /api/address, reached on a path the session gate lets
 * through: a tenant filling in their passport has a token and no session,
 * and the middleware exempts everything under api/tenant/passport. The key
 * stays on the server either way; see app/api/address/route.ts for the two
 * providers and the history of the key trap.
 */
export { GET } from "@/app/api/address/route";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
