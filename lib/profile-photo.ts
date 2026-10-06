/**
 * The largest headshot the profile will hold, as data-URL characters.
 *
 * ONE NUMBER, read by both ends. On 17 Sep 2026 the uploader went from a 256px
 * square to 1200px on the long side, and the server's cap stayed at 400,000 -
 * so a sharp 1200px photo was refused with a 413 the page never looked at. It
 * said "Saved", the photo stayed in browser storage, and it never reached
 * os_users: no face in the sidebar, none in the deck builder, none filled into
 * decks already sent. Rhiannon Dodge's (474,023 characters) was the first one
 * caught, 6 Oct 2026.
 *
 * A million characters is about 750KB of JPEG, which a 1200px headshot at the
 * uploader's quality sits well under. The uploader steps its quality down
 * until it fits, so the cap is never what stops a real photo.
 */
export const PHOTO_MAX_CHARS = 1_000_000;
