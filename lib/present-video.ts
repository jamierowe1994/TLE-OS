import "server-only";
import { getRecording, mp4UrlFor } from "@/lib/flow-video";
import type { PresentDeck } from "@/lib/present";

/**
 * The welcome video, only when a landlord can actually watch it. On 17 Sep
 * 2026 Flow's player sent everyone who was not signed in to its login page,
 * then played an iPhone recording Chrome could not decode, so a button
 * opened a blank box. Asked once per open, by the deck page and the
 * pre-appraisal pack alike (moved here from app/present/[token], 23 Oct 2026).
 *
 * Our own player plays the MP4 itself, so that is what is asked for: two
 * bytes of it, following Flow's redirect to the file. Until Flow has
 * converted the recording there is no file, and the deck goes without the
 * video rather than with a player that will not play. The shape is asked for
 * alongside when it was not saved, so a portrait video opens portrait.
 */
export async function withPlayableVideo(deck: PresentDeck): Promise<PresentDeck> {
  const video = deck.welcomeVideo;
  if (!(video?.status === "ready" && video.recordingId)) return deck;
  const videoUrl = video.videoUrl || mp4UrlFor(video.recordingId);
  const [playable, shape] = await Promise.all([
    fetch(videoUrl, { method: "GET", headers: { range: "bytes=0-1" }, cache: "no-store", signal: AbortSignal.timeout(5000) })
      .then(async (r) => {
        await r.body?.cancel().catch(() => {});
        return r.status === 200 || r.status === 206;
      })
      .catch(() => false),
    video.width && video.height
      ? Promise.resolve({ width: video.width, height: video.height })
      : getRecording(video.recordingId)
          .then(({ recording }) => ({ width: recording?.width ?? null, height: recording?.height ?? null }))
          .catch(() => ({ width: null, height: null })),
  ]);
  return playable ? { ...deck, welcomeVideo: { ...video, videoUrl, ...shape } } : { ...deck, welcomeVideo: null };
}

