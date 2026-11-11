import { NextRequest, NextResponse } from "next/server";
import { addClaudeShot, CLAUDE_SHOT_MAX_BYTES, CLAUDE_SHOT_TYPES } from "@/lib/bug-media";
import { ticketTokenOk } from "@/lib/claude-tickets";

/**
 * A picture Claude puts on a ticket to show its fix (scripts/claude-ticket.mjs
 * report --shot, 4 Nov 2026), shown on Tickets beside what it says it did.
 *
 * POST multipart { id, t, file }   the token minted for that one ticket, like
 *                                  the rest of /api/bugs/claude; pictures only,
 *                                  a few, and small.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Expected a picture." }, { status: 400 });
  }
  const id = String(form.get("id") ?? "").trim();
  if (!ticketTokenOk(id, String(form.get("t") ?? ""))) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "Expected a picture." }, { status: 400 });
  const mime = file.type.split(";")[0].trim();
  if (!(CLAUDE_SHOT_TYPES as readonly string[]).includes(mime)) return NextResponse.json({ ok: false, error: "PNG, JPEG or WebP only." }, { status: 415 });
  if (file.size === 0 || file.size > CLAUDE_SHOT_MAX_BYTES) {
    return NextResponse.json({ ok: false, error: `Up to ${CLAUDE_SHOT_MAX_BYTES / 1024 / 1024}MB a picture.` }, { status: 413 });
  }
  const result = await addClaudeShot({ bugId: id, mime, body: new Uint8Array(await file.arrayBuffer()) });
  if (result === "ok") return NextResponse.json({ ok: true });
  const status = result === "no-ticket" ? 404 : result === "full" ? 409 : result === "no-storage" ? 503 : 502;
  return NextResponse.json({ ok: false, error: result === "full" ? "That ticket has all the pictures it takes from Claude." : "That picture didn't store." }, { status });
}
