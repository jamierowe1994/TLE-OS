/**
 * WHAT IS OPEN IN FRONT OF THEM, for the assistant to read.
 *
 * Steve sits in the corner of every screen, and the single most common thing
 * anyone says to something in the corner of a screen is "this one". Without
 * this he has to ask which property they mean while it is filling most of
 * their monitor, which is the moment an assistant stops feeling like one.
 *
 * Deliberately module state and not React state. Nothing re-renders when this
 * changes — the value is read once, at the instant a message is sent — so
 * putting it in a context would make every screen in the app re-render each
 * time a drawer opened, to feed a string to a component that isn't looking.
 *
 * Set it when a record opens, clear it when it closes. Clearing matters more
 * than setting: a stale id would silently answer questions about the property
 * they were looking at ten minutes ago.
 */

let openListingId: string | null = null;

export function setOpenListing(id: string | null): void {
  openListingId = id;
}

export function getOpenListing(): string | null {
  return openListingId;
}
