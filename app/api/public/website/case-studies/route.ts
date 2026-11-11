import { NextRequest } from "next/server";
import { forWebsite, listCaseStudies } from "@/lib/case-studies";
import { publicOrigin } from "@/lib/origin";
import { websiteAuth, websiteError, websiteJson } from "../_lib/auth";

/**
 * GET /api/public/website/case-studies - every published case study, newest
 * first, for /case-studies and the agents' pages. Bearer WEBSITE_API_TOKEN.
 * Photos the agent uploaded come back as full addresses on this server's
 * /case-img; REX's come back as they are.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const refused = websiteAuth(req);
  if (refused) return refused;
  try {
    const origin = publicOrigin(req);
    const all = await listCaseStudies({ publishedOnly: true });
    return websiteJson({ ok: true, caseStudies: all.map((c) => forWebsite(c, origin)), pulledAt: new Date().toISOString() });
  } catch (e) {
    return websiteError(e);
  }
}
