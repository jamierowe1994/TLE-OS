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

export function isGif(body: string | null | undefined): boolean {
  return Boolean(body && GIF.test(body.trim()));
}

/** What a list shows for the last message: "GIF" rather than an address. */
export function previewOf(body: string): string {
  return isGif(body) ? "GIF" : body;
}
