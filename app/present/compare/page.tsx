import { DECK_KINDS, SAMPLE_DECK, slidesFor, type DeckKind } from "@/lib/present";
import CompareHarness from "@/components/CompareHarness";

/**
 * The before-and-after harness: one slide, two decks, side by side.
 *
 * ── Why two servers ───────────────────────────────────────────────────────
 *
 * "Before" is not a variant of the deck, it is a different commit. There is
 * no copy of the old headings in this tree and there should not be: a second
 * set of every slide, kept only so it can be compared against, is a second
 * set of every slide somebody eventually edits by mistake.
 *
 * So the old deck is served by a second dev server running a worktree at the
 * pre-rewrite commit, and this page frames both. The frames are different
 * origins, which means this page cannot script them - so stepping a slide
 * reloads both at `?at=N` rather than talking to them. That is the whole
 * reason `startAt` exists on PresentDeck.
 *
 * ── Local only ────────────────────────────────────────────────────────────
 *
 * The `before` origin is checked against localhost before it is framed. This
 * route is a reviewing tool for one machine; an arbitrary origin in a query
 * string that the page will then frame is a hole, however briefly it exists.
 */

export const dynamic = "force-dynamic";

const DEFAULT_BEFORE = "http://localhost:3317";

/** localhost only, and only an origin - no path, no query, no credentials. */
function safeOrigin(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (u.hostname !== "localhost" && u.hostname !== "127.0.0.1") return null;
    if (u.username || u.password) return null;
    return u.origin;
  } catch {
    return null;
  }
}

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; at?: string; before?: string }>;
}) {
  const { kind, at, before } = await searchParams;
  const asked: DeckKind = DECK_KINDS.find((k) => k.id === kind)?.id ?? "post-appraisal";

  /* The slide LIST comes from the current tree, which is the honest thing to
     do: the rewrite did not add or remove a slide, so both decks carry the
     same twenty-eight and the same index means the same slide in each. If a
     future change does add one, the names below stop lining up and that is
     visible immediately rather than silently mis-pairing two slides. */
  const slides = slidesFor({ ...SAMPLE_DECK, kind: asked }).map((s) => ({ id: s.id, title: s.title }));

  const n = Number.parseInt(at ?? "0", 10);
  const index = Number.isFinite(n) ? Math.min(Math.max(n, 0), slides.length - 1) : 0;

  return (
    <CompareHarness
      slides={slides}
      index={index}
      kind={asked}
      kinds={DECK_KINDS.map((k) => ({ id: k.id, label: k.label }))}
      beforeOrigin={safeOrigin(before) ?? DEFAULT_BEFORE}
    />
  );
}
