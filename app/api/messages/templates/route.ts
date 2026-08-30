import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import {
  BUILT_IN,
  deleteTemplate,
  listTemplates,
  MERGE_FIELDS,
  saveTemplate,
  type Audience,
} from "@/lib/message-templates";

/**
 * The template library.
 *
 * GET is open to any signed-in agent — these are the words they send.
 * POST and DELETE are the words that go out under the company's name, so they
 * need a session and record who changed them.
 *
 * DELETE on a built-in id is a REVERT, not a destruction: the row goes and the
 * code's version comes back. That is the only undo anybody actually wants.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/* verifySessionToken returns the USER ID, synchronously — it is not a session
   object and it does not carry an email. Same pattern as
   app/api/email-templates, which records the id in updated_by. */
function actor(req: NextRequest): string | null {
  return verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    templates: await listTemplates(),
    mergeFields: MERGE_FIELDS,
  });
}

export async function POST(req: NextRequest) {
  const who = actor(req);
  if (!who) {
    return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  }
  const b = (await req.json().catch(() => ({}))) as {
    id?: string;
    name?: string;
    subject?: string;
    body?: string;
    audience?: string;
  };
  const id = (b.id ?? "").trim();
  const name = (b.name ?? "").trim();
  if (!id || !name) {
    return NextResponse.json(
      { ok: false, error: "A template needs an id and a name." },
      { status: 400 }
    );
  }
  const audience: Audience = ["landlord", "tenant", "any"].includes(b.audience ?? "")
    ? (b.audience as Audience)
    : "any";
  try {
    await saveTemplate(
      { id, name, subject: b.subject ?? "", body: b.body ?? "", audience },
      who
    );
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 503 });
  }
  return NextResponse.json({ ok: true, templates: await listTemplates() });
}

export async function DELETE(req: NextRequest) {
  const who = actor(req);
  if (!who) {
    return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  }
  const id = (req.nextUrl.searchParams.get("id") ?? "").trim();
  if (!id) {
    return NextResponse.json({ ok: false, error: "Which template?" }, { status: 400 });
  }
  await deleteTemplate(id);
  const wasBuiltIn = BUILT_IN.some((t) => t.id === id);
  return NextResponse.json({
    ok: true,
    reverted: wasBuiltIn,
    note: wasBuiltIn
      ? "Reverted to the version that ships with the system."
      : "Deleted.",
    templates: await listTemplates(),
  });
}
