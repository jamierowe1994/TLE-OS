/**
 * WHAT IS OPEN IN FRONT OF THEM, for the assistant to read.
 *
 * Steve sits in the corner of every screen, and the single most common thing
 * anyone says to something in the corner of a screen is "this one". Without
 * this he has to ask which record they mean while it is filling most of their
 * monitor, which is the moment an assistant stops feeling like one.
 *
 * ── Why this is a STACK, not one id ────────────────────────────────────────
 *
 * It used to hold a single listing id, registered by exactly one component.
 * James, 30 Aug, hit the consequence: he opened a lead, opened the email
 * composer on top of it, asked Steve to "draft an email to this landlord", and
 * Steve asked which landlord — with the name and the address on screen behind
 * the composer and the recipient printed at the top of it.
 *
 * That is not a missing id, it is the wrong shape. Screens here layer: a
 * drawer over a board, a composer over the drawer. What somebody means by
 * "this" is the TOP of that pile, and the useful context is the whole pile —
 * the composer says who the email is to, the drawer underneath says who they
 * are and what has been said to them already.
 *
 * So surfaces push themselves on as they open and pop off as they close, and
 * the assistant gets the stack in the order it is layered.
 *
 * ── Deliberately module state, not React state ─────────────────────────────
 *
 * Nothing re-renders when this changes. The value is read once, at the instant
 * a message is sent, so putting it in a context would make every screen in the
 * app re-render each time a drawer opened, to feed a string to a component
 * that is not looking.
 *
 * ── Clearing matters more than setting ─────────────────────────────────────
 *
 * A stale entry silently answers questions about the record they were looking
 * at ten minutes ago, which is worse than no context at all: wrong with
 * confidence rather than asking. Every register() returns its own unregister,
 * and removal is by identity rather than by position — a drawer that closes
 * while a composer is still open must take out ITS entry, not whatever
 * happens to be on top.
 */

export type SurfaceKind = "listing" | "lead" | "contact" | "compose" | "case" | "record";

export interface OpenSurface {
  kind: SurfaceKind;
  /** The record's id, where it has one the tools can look up. */
  id: string | null;
  /** What a person would call it. "James Rowe", "41 Harewood Road". */
  label: string;
  /**
   * The handful of facts visible on that surface, as label/value pairs.
   *
   * Deliberately not the whole record. This is what is ON THE SCREEN, and its
   * job is to let Steve answer without a round trip — an email address, a
   * stage, a next action. Anything deeper he should fetch with a tool, so it
   * is fresh and so the fetch is visible in his working.
   */
  fields?: { label: string; value: string }[];
  /**
   * Notes on the record, newest last, already on screen.
   *
   * Carried because the notes are the context nobody can reconstruct: "he
   * wants a 2-bed, said call after 6" is not in any API, it is what the agent
   * typed. Steve writing an email without them writes a worse email than the
   * agent would.
   */
  notes?: string[];
  /**
   * This surface can have a draft typed into it.
   *
   * Serialisable, unlike `apply` below, so the server can tell the model that
   * filling is possible here — and refuse the tool when it is not.
   */
  canFill?: boolean;
  /**
   * Type a draft into the surface.
   *
   * Client-side only and never crosses the wire: JSON.stringify drops function
   * properties, which is why the boolean above exists separately rather than
   * being inferred from this.
   *
   * It fills. It does NOT send, and there is deliberately no send here for it
   * to reach — the surface owns its own send button and a person presses it.
   */
  apply?: (draft: { subject?: string; body?: string }) => void;
}

/* Order is layering order: index 0 is furthest back, the last is what they are
   actually looking at. */
let stack: OpenSurface[] = [];

/**
 * Say that something is open. Returns the function that says it has closed.
 *
 * Call it from an effect and return the result as the cleanup, so closing can
 * never be forgotten:
 *
 *     useEffect(() => registerOpen({ kind: "lead", ... }), [lead?.id]);
 */
export function registerOpen(surface: OpenSurface): () => void {
  const entry = { ...surface };
  stack = [...stack, entry];
  return () => {
    stack = stack.filter((s) => s !== entry);
  };
}

/** Everything open, furthest back first. */
export function getOpenSurfaces(): OpenSurface[] {
  return stack;
}

/** The one they are actually looking at, which is what "this" means. */
export function getFrontSurface(): OpenSurface | null {
  return stack.length ? stack[stack.length - 1] : null;
}

/* ── The old single-listing API, kept working ────────────────────────────────

   ListingDrawer has called these since before there was a stack, and the
   assistant's tools still take an openListingId. Rewriting both to move one
   caller would have put this change in three files instead of one, so they
   stay — implemented over the stack rather than beside it, because two places
   holding "what is open" is exactly how one of them goes stale. */

export function setOpenListing(id: string | null): void {
  stack = stack.filter((s) => s.kind !== "listing");
  if (id) stack = [...stack, { kind: "listing", id, label: id }];
}

export function getOpenListing(): string | null {
  /* Searched from the front, so the listing they most recently opened wins. */
  for (let i = stack.length - 1; i >= 0; i--) {
    if (stack[i].kind === "listing" && stack[i].id) return stack[i].id;
  }
  return null;
}

/**
 * Type a draft into the composer they have open.
 *
 * Returns whether anything was filled, so the caller can say what happened
 * rather than claim it. Searched from the front, because with two composers
 * open the one they are looking at is the one they mean.
 */
export function fillFrontCompose(draft: { subject?: string; body?: string }): boolean {
  for (let i = stack.length - 1; i >= 0; i--) {
    const s = stack[i];
    if (s.kind === "compose" && s.apply) {
      s.apply(draft);
      return true;
    }
  }
  return false;
}
