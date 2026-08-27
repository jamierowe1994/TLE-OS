import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import {
  DocusealBlocked,
  docusealConfigured,
  docusealSendUnlocked,
  sendForSignature,
  submission,
  templates,
} from "@/lib/docuseal";

/**
 * DocuSeal — status, templates, and the one send.
 *
 * GET  → what is connected and what can be signed
 * POST → send a document for signature
 *
 * The GET deliberately answers "connected" and "allowed to send" SEPARATELY.
 * A panel that shows one flag cannot tell an agent the difference between "we
 * haven't wired it yet" and "it's wired but nobody may email a landlord from
 * this environment" — and those need completely different actions from
 * completely different people.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** The signed-in user's id, or null. `verifySessionToken` returns the id itself. */
function requireUser(req: NextRequest): string | null {
  return verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
}

export async function GET(req: NextRequest) {
  if (!requireUser(req)) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const connected = docusealConfigured();
  const canSend = docusealSendUnlocked();

  if (!connected) {
    return NextResponse.json({
      connected: false,
      canSend: false,
      templates: [],
      /* Named exactly, because the person reading this is the person who sets
         them, and "configure DocuSeal" is not an instruction. */
      needs: ["DOCUSEAL_URL", "DOCUSEAL_API_KEY"],
    });
  }

  try {
    return NextResponse.json({
      connected: true,
      canSend,
      templates: await templates(),
      needs: canSend ? [] : ["DOCUSEAL_ALLOW_SEND"],
    });
  } catch (e) {
    const msg = e instanceof DocusealBlocked ? e.message : "DocuSeal didn't answer.";
    // An error state, never an empty list dressed up as "no templates yet".
    return NextResponse.json({ connected: true, canSend, error: msg }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  if (!requireUser(req)) {
    return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  }

  let body: {
    templateId?: number;
    signers?: Array<{ email: string; name?: string; role?: string }>;
    ref?: string;
    submissionId?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Expected JSON." }, { status: 400 });
  }

  // Reading a submission back is a READ and must not need the send lock.
  if (body.submissionId) {
    try {
      return NextResponse.json({ ok: true, submission: await submission(body.submissionId) });
    } catch (e) {
      const msg = e instanceof DocusealBlocked ? e.message : "DocuSeal didn't answer.";
      return NextResponse.json({ ok: false, error: msg }, { status: 502 });
    }
  }

  if (!body.templateId || !Array.isArray(body.signers)) {
    return NextResponse.json(
      { ok: false, error: "Needs a templateId and at least one signer." },
      { status: 400 }
    );
  }

  try {
    const sub = await sendForSignature({
      templateId: body.templateId,
      signers: body.signers,
      ref: body.ref,
    });
    return NextResponse.json({ ok: true, submission: sub });
  } catch (e) {
    if (e instanceof DocusealBlocked) {
      /* 423 Locked, not 500. The lock is a correct, deliberate refusal and the
         UI should say so in the agent's words rather than show a crash. */
      const locked = !docusealSendUnlocked() || !docusealConfigured();
      return NextResponse.json({ ok: false, error: e.message }, { status: locked ? 423 : 502 });
    }
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
