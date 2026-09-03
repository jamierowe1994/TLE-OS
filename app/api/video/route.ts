import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { createRecording, flowConfigured, flowOrigin, getRecording } from "@/lib/flow-video";
import { attachVideo, newVideoKey, readPresentation, updateVideoByKey } from "@/lib/present-store";
import type { WelcomeVideo } from "@/lib/present";
import { hasDb, q } from "@/lib/db";

/**
 * The agent's welcome video, for one pre-appraisal page.
 *
 * POST /api/video   { token }        → reserve a slot, get a recorder URL
 * GET  /api/video?token=…            → where that recording has got to
 *
 * The webhook is meant to be authoritative, and on Flow's own account it has
 * never been delivered to a real endpoint. So GET does not merely read our
 * copy — it asks Flow directly and writes back what it learns. Whichever of
 * the two arrives first wins, and neither depends on the other working.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * The recorder link for a slot, kept OFF the deck.
 *
 * The recorder URL carries a two-hour token that lets its holder record into
 * the slot. The deck JSON travels to the landlord's browser, so it must never
 * sit there; it lives in os_cache under the video's own key instead, and is
 * only ever handed to a signed-in agent by this route.
 *
 * Why keep it at all: a laptop and a phone must share ONE slot. Measured
 * 3 Sep: the laptop opened a slot, the phone scanned the code and opened a
 * second one, the deck's pointer moved, and the take recorded on the laptop
 * came back from Flow with a key nothing was watching.
 */
const recorderKey = (videoKey: string) => `recorder:${videoKey}`;

async function rememberRecorder(videoKey: string, recorderUrl: string, expiresAt: string | null) {
  if (!hasDb()) return;
  await q(
    `INSERT INTO os_cache (key, payload, computed_at) VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET payload = EXCLUDED.payload, computed_at = NOW()`,
    [recorderKey(videoKey), JSON.stringify({ recorderUrl, expiresAt })]
  ).catch(() => []);
}

async function recallRecorder(videoKey: string): Promise<{ recorderUrl: string; expiresAt: string | null } | null> {
  if (!hasDb()) return null;
  const rows = await q<{ payload: { recorderUrl?: string; expiresAt?: string | null } }>(
    `SELECT payload FROM os_cache WHERE key = $1`,
    [recorderKey(videoKey)]
  ).catch(() => []);
  const p = rows[0]?.payload;
  if (!p?.recorderUrl) return null;
  /* A minute of slack: a link that dies while the camera warms up is worse
     than a fresh slot. */
  if (p.expiresAt && new Date(p.expiresAt).getTime() < Date.now() + 60_000) return null;
  return { recorderUrl: p.recorderUrl, expiresAt: p.expiresAt ?? null };
}

async function qrFor(url: string): Promise<string | null> {
  return QRCode.toString(url, { type: "svg", errorCorrectionLevel: "M", margin: 1 }).catch(() => null);
}

export async function POST(req: NextRequest) {
  if (!flowConfigured()) {
    return NextResponse.json(
      { error: "Flow isn't connected here — set FLOW_API_KEY." },
      { status: 503 }
    );
  }
  let body: { token?: string; replace?: boolean };
  try {
    body = (await req.json()) as { token?: string; replace?: boolean };
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const token = (body.token ?? "").trim();
  if (!token) return NextResponse.json({ error: "token is required" }, { status: 400 });

  const row = await readPresentation(token);
  if (!row) return NextResponse.json({ error: "No such presentation." }, { status: 404 });

  // Already has one that is going somewhere? Hand back what exists rather than
  // stranding a recording on Flow's side that nothing will ever reference.
  const held = row.deck.welcomeVideo;
  /* `replace` is the re-record: a fresh slot over the top of a finished one.
     The old recording is left on Flow's side to expire with its retention -
     deleting it here would race the landlord who has the page open. */
  if (held && held.status === "ready" && !body.replace) {
    return NextResponse.json({ ok: true, video: held, alreadyRecorded: true });
  }
  /* IN FLIGHT IS HELD TOO. Measured 3 Sep: an 8-second take was stopped, and
     twelve seconds later a second slot was opened over it - the deck's
     pointer moved to the empty slot, the finished recording came back from
     Flow with a key nothing was listening for, and the page waited for ever.
     While a take is uploading or processing the page reopening (a reload,
     a second tab, the phone after the laptop) gets the held one back and
     carries on watching it. Only an explicit re-record moves the pointer. */
  if (held && (held.status === "uploading" || held.status === "processing") && !body.replace) {
    return NextResponse.json({ ok: true, video: held, inFlight: true });
  }
  /* AN OPEN SLOT IS SHARED. The phone that scanned the laptop's code joins
     the laptop's slot; whichever device finishes first fills the deck, and
     the other sees it land. Only when the link has expired, or the caller
     asked for a fresh one, is a new slot opened. */
  if (held && held.status === "awaiting_recording" && !body.replace) {
    const kept = await recallRecorder(held.key);
    if (kept) {
      return NextResponse.json({
        ok: true,
        video: held,
        recorderUrl: kept.recorderUrl,
        qrSvg: await qrFor(kept.recorderUrl),
        expiresAt: kept.expiresAt,
        origin: flowOrigin(),
        reused: true,
      });
    }
  }

  const key = newVideoKey();
  const { recording, error } = await createRecording({
    reference: key,
    title: `Welcome — ${row.deck.property.address}`,
    /* Five minutes. The brief was ninety seconds to two, and the page says
       a minute is plenty, but a cap that cuts an agent off mid-sentence is
       worse than a long take - James, 3 Sep, on seeing "up to two and a
       half minutes": "is there a reason?" There was not a good one. */
    maxDurationSecs: 300,
    metadata: {
      // Deliberately no token, no landlord name, no address beyond the title:
      // this is stored on a third party and read back on every webhook.
      kind: "pre-appraisal-welcome",
      agent: row.authorName,
    },
  });
  if (!recording || error) {
    return NextResponse.json({ error: error ?? "Flow wouldn't start a recording." }, { status: 502 });
  }

  const video: WelcomeVideo = {
    key,
    recordingId: recording.recordingId,
    status: recording.status ?? "awaiting_recording",
    embedUrl: null,
    thumbnailUrl: null,
    durationSecs: null,
    recordedAt: null,
  };
  const saved = await attachVideo(token, video);
  if (saved && recording.recorderUrl) {
    await rememberRecorder(key, recording.recorderUrl, recording.expiresAt ?? null);
  }
  if (!saved) {
    return NextResponse.json(
      { error: "Couldn't attach the recording to the page." },
      { status: 500 }
    );
  }

  /* The same recorder URL as a QR code, so an agent can finish the job on a
     phone — which is where a warm, hand-held welcome actually gets recorded.
     Generated on the server as an SVG string: the browser gets a picture, not
     an encoder, and the URL is not re-derived anywhere it could drift.

     SIZE IS NOT COSMETIC HERE. The recorder URL carries a JWT, so it runs
     around 300 characters, and measured: 270ch at EC=M is a 67-module code,
     370ch is 79. A phone needs roughly 2.5 screen pixels per module to scan
     first time. So the display size in the modal is ~190px, NOT the 86px
     thumbnail it started as — at 86px this code was 1.1px per module and
     would simply never have scanned. If Flow's tokens ever get longer, that
     display size has to grow with them.

     Error correction M rather than L: it costs eight more modules and buys
     tolerance for the actual failure mode, which is glare on a laptop screen
     rather than a damaged print. */
  const qrSvg = recording.recorderUrl ? await qrFor(recording.recorderUrl) : null;

  return NextResponse.json({
    ok: true,
    video,
    // Single-use, two-hour token. Safe to hand to a browser: it grants the
    // ability to record into this one slot and nothing else.
    recorderUrl: recording.recorderUrl,
    qrSvg,
    expiresAt: recording.expiresAt,
    // For the iframe's postMessage origin check, which must never be "*".
    origin: flowOrigin(),
  });
}

export async function GET(req: NextRequest) {
  const token = (req.nextUrl.searchParams.get("token") ?? "").trim();
  if (!token) return NextResponse.json({ error: "token is required" }, { status: 400 });

  const row = await readPresentation(token);
  if (!row) return NextResponse.json({ error: "No such presentation." }, { status: 404 });
  const held = row.deck.welcomeVideo ?? null;
  if (!held) return NextResponse.json({ video: null });
  if (held.status === "ready" || held.status === "failed" || !flowConfigured()) {
    return NextResponse.json({ video: held });
  }

  // Ask Flow. If it can't answer, our copy is still a perfectly good answer —
  // a video service being slow must never look like a broken page.
  const { recording } = await getRecording(held.recordingId);
  if (!recording) return NextResponse.json({ video: held });

  const patch: Partial<WelcomeVideo> = {
    status: recording.status,
    embedUrl: recording.embedUrl ?? null,
    thumbnailUrl: recording.thumbnailUrl ?? null,
    durationSecs: recording.durationSecs ?? null,
  };
  if (recording.status === "ready" && !held.recordedAt) {
    patch.recordedAt = new Date().toISOString();
  }
  await updateVideoByKey(held.key, patch);
  return NextResponse.json({ video: { ...held, ...patch } });
}
