/**
 * GIFs in the team chat (12 Oct 2026). A GIF is sent as a message whose whole
 * body is one GIPHY media address, so nothing about how messages are stored
 * changes; the screens (the OS's Huddles and the phone's Chats) draw it as a
 * picture. Only GIPHY's own media hosts count, so a pasted link to anywhere
 * else stays text and no screen loads a picture from a stranger's server.
 *
 * Client-safe: no server-only imports.
 */

const GIF = /^https:\/\/(?:media\d?|i)\.giphy\.com\/media\/[A-Za-z0-9/_.-]+\.(?:gif|webp)(?:\?[A-Za-z0-9=&_.-]*)?$/;
/* Our own, served from public/gifs on this site. */
const OWN = /^\/gifs\/[a-z0-9-]+\.gif$/;

export function isGif(body: string | null | undefined): boolean {
  const b = body?.trim() ?? "";
  return GIF.test(b) || OWN.test(b);
}

/**
 * The team's own GIFs, at the top of the GIF tray before GIPHY's
 * (James, 12 Oct 2026: "add the waving Susan as a GIF"). Susan is the tour's
 * rigged 3D model playing her Wave, rendered to a loop on the brand pink.
 * A changed picture gets a new file name: public files are cached for hours.
 */
export const TEAM_GIFS: Array<{ id: string; title: string; url: string; width: number; height: number; words: string[] }> = [
  { id: "susan-wave", title: "Susan waving", url: "/gifs/susan-wave.gif", width: 320, height: 320, words: ["susan", "wave", "waving", "hi", "hello", "hiya", "morning", "bye", "welcome"] },
];

/** What a list shows for the last message: "GIF" rather than an address. */
export function previewOf(body: string): string {
  return isGif(body) ? "GIF" : body;
}
