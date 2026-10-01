/**
 * A RIGHTMOVE BEST PRICE GUIDE, in place of ticked comparables.
 *
 * Howard's ticket, approved by James 1 Oct 2026: "Allow agents to upload a
 * RM best price guide for comparables instead of using the homesearch
 * selection, then present as a button on the presented link, linking
 * externally either to a file or url".
 *
 * Two shapes, and nothing else:
 *   - a PDF the agent uploaded, held privately in R2 under
 *     documents/rm-guide-<appraisal ref>/..., and handed to the landlord
 *     through /api/present/rm-guide/<id> - a five-minute signed link, only
 *     while the presentation itself is still open (see that route);
 *   - a link the agent pasted, https only, opened in a new tab.
 *
 * It lives on the deck (PresentDeck.rmGuide), snapshotted like the
 * comparables, and on the builder's picks so Update presentation opens with
 * it still attached. Shared by the builder (client) and the presentations
 * route (server), so nothing here may import server-only code.
 *
 * WHAT IT CHANGES. With a guide attached the "needs 3 comparables" rule is
 * met by the guide: the What's letting nearby slide shows when there are
 * three ticked comparables OR a guide, and carries the button either way.
 */

export type RmGuide =
  | { kind: "file"; id: string; key: string; name: string }
  | { kind: "url"; url: string };

/**
 * 10MB, not the document scope's 25MB. Next cuts a request body off at 10MB
 * once middleware has seen it, so a bigger file never reaches
 * /api/r2/upload whatever the scope says. A Rightmove guide is a few pages.
 */
export const RM_GUIDE_MAX_BYTES = 10 * 1024 * 1024;

/** What the landlord's button says, everywhere. */
export const RM_GUIDE_LABEL = "See the Rightmove price guide";

/** The R2 ref an upload is filed under: documents/<this>/<file>. */
export function rmGuideRef(appraisalRef: string): string {
  const clean = (appraisalRef || "unfiled").replace(/[^\w-]+/g, "-").slice(0, 80);
  return `rm-guide-${clean}`;
}

const KEY_RE = /^documents\/rm-guide-[\w-]+\/[^/]+$/;
const ID_RE = /^[\w-]{16,64}$/;

/** A sentence when this is not a link we will put in front of a landlord, else null. */
export function guideUrlProblem(raw: string): string | null {
  const s = raw.trim();
  if (!s) return "Paste the link to the guide.";
  if (s.length > 2000) return "That link is too long.";
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return "That isn't a web link. It should start https://";
  }
  if (u.protocol !== "https:") return "The link must start https://";
  if (!u.hostname.includes(".")) return "That isn't a web link.";
  return null;
}

/**
 * The guide as stored, from whatever a browser sent. Null for anything that
 * is not exactly one of the two shapes: a file key outside the guide's own
 * folder, or a link that is not https, never reaches a landlord.
 */
export function guideIn(raw: unknown): RmGuide | null {
  if (!raw || typeof raw !== "object") return null;
  const g = raw as Record<string, unknown>;
  if (g.kind === "url" && typeof g.url === "string" && !guideUrlProblem(g.url)) {
    return { kind: "url", url: new URL(g.url.trim()).toString() };
  }
  if (
    g.kind === "file" &&
    typeof g.key === "string" &&
    KEY_RE.test(g.key) &&
    !g.key.includes("..") &&
    typeof g.id === "string" &&
    ID_RE.test(g.id)
  ) {
    const name = typeof g.name === "string" && g.name.trim() ? g.name.trim().slice(0, 140) : "Rightmove price guide.pdf";
    return { kind: "file", id: g.id, key: g.key, name };
  }
  return null;
}

/** Where the LANDLORD's button goes. */
export function guideHref(g: RmGuide): string {
  return g.kind === "url" ? g.url : `/api/present/rm-guide/${encodeURIComponent(g.id)}`;
}

/** Where the AGENT's own Open goes, before or after the deck exists. */
export function guideAgentHref(g: RmGuide): string {
  return g.kind === "url" ? g.url : `/api/r2/file?key=${encodeURIComponent(g.key)}`;
}

/** One line for the agent: what is attached. */
export function guideLabel(g: RmGuide): string {
  if (g.kind === "file") return g.name;
  try {
    const u = new URL(g.url);
    return `${u.hostname.replace(/^www\./, "")}${u.pathname.length > 1 ? u.pathname : ""}`;
  } catch {
    return g.url;
  }
}
