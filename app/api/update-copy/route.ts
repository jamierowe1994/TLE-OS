import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { updateCopy, type UpdateKind } from "@/lib/customer-update-copy";

/**
 * GET /api/update-copy?kind=&role=&address=&scotland=1 -> one written
 * customer update as plain words, for the group send (James, 8 Nov 2026:
 * "a different view of what goes out to the landlord or to the tenant").
 * The first name is left as {{firstName}} so each person gets their own.
 */
export const dynamic = "force-dynamic";

const KINDS = new Set<string>(["general", "reference_failed", "guarantor_needed", "agreement_out", "cancelled", "nudge_holding_fee", "nudge_referencing", "nudge_sign_agreement", "nudge_move_in_money", "nudge_documents"]);

const plain = (html: string) =>
  html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*<p[^>]*>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&bull;/g, "•")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

export async function GET(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const p = req.nextUrl.searchParams;
  const kind = p.get("kind") ?? "";
  const role = p.get("role") === "landlord" ? "landlord" : "tenant";
  if (!KINDS.has(kind)) return NextResponse.json({ ok: false, error: "Which update?" }, { status: 400 });
  const first = (actor.name || "").split(/\s+/)[0] || "";
  const c = updateCopy(kind as UpdateKind, role, { address: p.get("address") ?? "the property", firstName: "{{firstName}}", agentName: actor.name || first, scotland: p.get("scotland") === "1" });
  const text = [`Hi {{firstName}},`, plain(c.body), plain(c.nextLine)].filter(Boolean).join("\n\n");
  return NextResponse.json({ ok: true, subject: plain(c.subject), text });
}
