import { NextRequest, NextResponse } from "next/server";
import { verifyWebhook, webhookSecret } from "@/lib/flow-video";
import { updateVideoByKey } from "@/lib/present-store";
import type { WelcomeVideo } from "@/lib/present";

/**
 * Flow tells us a recording moved on.
 *
 * Answer 2xx inside ten seconds or Flow retries at 1m, 5m, 30m, 2h, 6h and
 * then gives up. So this does one indexed update and returns — no REX call, no
 * email, nothing that could take longer than the budget.
 *
 * Deliveries arrive MORE THAN ONCE and OUT OF ORDER. Both are handled by the
 * update itself rather than by a seen-events table: the patch is keyed on the
 * video's own key and refuses to move a `ready` video backwards, so a
 * duplicate is a no-op and a late `uploading` cannot undo a finished one.
 *
 * Registered on Flow with POST /api/integration/v1/webhooks (the app's own
 * secret key mints the endpoint and its whsec_ secret; that secret is
 * FLOW_WEBHOOK_SECRET here). Proven live 3 Sep 2026: a recording.deleted
 * from Flow's delivery job answered 200 on this route in production.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Event = {
  id?: string;
  type?: string;
  data?: {
    recordingId?: string;
    reference?: string;
    status?: WelcomeVideo["status"];
    embedUrl?: string;
    thumbnailUrl?: string;
    durationSecs?: number;
    error?: string;
  };
};

export async function POST(req: NextRequest) {
  const secret = webhookSecret();
  if (!secret) {
    // 503 rather than 401: the delivery is fine, we aren't ready for it. Flow
    // will retry, and once the secret is set the retry lands.
    return NextResponse.json({ error: "No webhook secret configured." }, { status: 503 });
  }

  // RAW body, before any parsing. Re-serialising changes the bytes and the
  // signature can never match.
  const raw = await req.text();
  if (!verifyWebhook(raw, req.headers.get("flow-signature"), secret)) {
    return NextResponse.json({ error: "Bad signature." }, { status: 401 });
  }

  let event: Event;
  try {
    event = JSON.parse(raw) as Event;
  } catch {
    // Signed but unparseable. Retrying won't fix it, so accept and drop.
    return NextResponse.json({ ok: true, handled: false }, { status: 200 });
  }

  const key = event.data?.reference;
  if (!key || !event.type) {
    return NextResponse.json({ ok: true, handled: false }, { status: 200 });
  }

  const patch: Partial<WelcomeVideo> = {};
  switch (event.type) {
    case "recording.started":
    case "recording.uploaded":
      patch.status = event.type === "recording.started" ? "awaiting_recording" : "uploading";
      break;
    case "recording.ready":
      patch.status = "ready";
      patch.embedUrl = event.data?.embedUrl ?? null;
      patch.thumbnailUrl = event.data?.thumbnailUrl ?? null;
      patch.durationSecs = event.data?.durationSecs ?? null;
      patch.recordedAt = new Date().toISOString();
      break;
    case "recording.failed":
      patch.status = "failed";
      break;
    case "recording.deleted":
      // The media is gone. Leaving a dead embedUrl on the deck would render a
      // broken player on a landlord's page, which is worse than no video.
      patch.status = "failed";
      patch.embedUrl = null;
      break;
    default:
      // transcript_ready and anything Flow adds later. Acknowledged, ignored —
      // a welcome video has no use for a transcript.
      return NextResponse.json({ ok: true, handled: false }, { status: 200 });
  }

  await updateVideoByKey(key, patch);
  return NextResponse.json({ ok: true, handled: true }, { status: 200 });
}
