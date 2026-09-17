import { notFound } from "next/navigation";
import { readPresentation, presentationExpiry, deletePresentation } from "@/lib/present-store";
import { SAMPLE_DECK, DECK_KINDS, asStyle, slidesFor } from "@/lib/present";
import StylePicker from "@/components/StylePicker";
import PresentDeck from "@/components/PresentDeck";
import { getRecording, mp4UrlFor } from "@/lib/flow-video";

/**
 * The landlord's copy.
 *
 * Public by necessity — they have no account, and they will open this on a
 * phone, from a mail client, quite possibly after forwarding it to whoever
 * else owns the property. The token is the credential; what it protects is
 * one visit's worth of detail (see lib/present-store.ts).
 *
 * A bad token gets a plain 404, not "no such presentation". Confirming that a
 * token is merely wrong rather than unknown is free information to anyone
 * trying them, and there is nothing useful to say to a real landlord who has
 * mangled a link anyway — they will ring the agent, which is the right
 * outcome.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function PresentPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ kind?: string; style?: string; at?: string; embed?: string }>;
}) {
  const { token } = await params;

  /* The showroom copy. Reserved word, no customer data in it, and the only
     way an agent can look at the deck before sending their first one. It is
     also what renders on a machine with no database.

     ?kind= SWITCHES WHICH OF THE THREE IS SHOWN, and it earns its keep: the
     decks differ only by which slides they are made of, so the sample is the
     only way to see that difference without minting three real decks against
     a real landlord's address. /present/sample?kind=appraisal is what to open
     when reviewing the comparables and market slides — the pre-appraisal deck
     deliberately carries neither. */
  if (token === "sample") {
    const { kind, style, at, embed } = await searchParams;
    /* A BARE /present/sample IS THE FULL DECK. It used to be the pre-appraisal
       one, which is five slides on purpose, and that is how a link to "the
       presentation" went out to people who then saw a fifth of it and had no
       way of knowing there was more. The showroom's job is to show the most
       there is; the other two are one click away on the bar. */
    const asked = DECK_KINDS.find((k) => k.id === kind)?.id ?? "post-appraisal";
    /* ?style= SWITCHES THE LOOK, and the picker below makes it clickable.
       James, 4 Sep: the team are split on the drawn style, so rather than
       argue it they get all three side by side and choose. The picker is on
       the SAMPLE only - a landlord opening a real deck sees the one look the
       agent sent, with no controls on it. */
    const chosen = asStyle(style);
    const deck = { ...SAMPLE_DECK, kind: asked, style: chosen };
    /* ?embed=1&at=N - for the before-and-after harness at /present/compare,
       which loads two whole decks in two frames and steps both by reloading
       them on a slide. SAMPLE ONLY: a real landlord's deck must not be
       frameable, and must not be deep-linkable past its own first screen. */
    const frame = embed === "1";
    const startAt = Number.parseInt(at ?? "", 10);
    /* The three decks with what each one actually renders. Counted by running
       the same filter the viewer runs, not by counting the slide list: the
       filter drops a slide whose data is missing, and a picker that promised
       thirty-three where the page shows thirty-one would be a new version of
       exactly the confusion it is here to end. */
    const kinds = DECK_KINDS.map((k) => ({
      ...k,
      count: slidesFor({ ...SAMPLE_DECK, kind: k.id }).length,
    }));
    return (
      <>
        <PresentDeck
          token="sample"
          deck={deck}
          slides={slidesFor(deck)}
          framed={frame}
          startAt={Number.isFinite(startAt) ? startAt : undefined}
        />
        {!frame && <StylePicker kind={asked} style={chosen} kinds={kinds} />}
      </>
    );
  }

  const row = await readPresentation(token);
  if (!row) notFound();

  /* Past its fortnight: say so, and delete it on the way out. The link a
     landlord kept in their inbox stops working, and the rent figure and
     comparables behind it are gone rather than merely hidden. */
  const expiry = await presentationExpiry(row);
  if (expiry.getTime() < Date.now()) {
    await deletePresentation(row.token);
    return <Expired agent={row.authorName} />;
  }

  /* The welcome video, only when a landlord can actually watch it. On 17 Sep
     2026 Flow's player sent everyone who was not signed in to its login
     page, then played an iPhone recording Chrome could not decode, so a
     button here opened a blank box. Asked once per open. */
  let deck = row.deck;
  const video = deck.welcomeVideo;
  if (video?.status === "ready" && video.recordingId) {
    /* Our own player plays the MP4 itself (James, 17 Sep 2026), so that is
       what is asked for: two bytes of it, following Flow's redirect to the
       file. Until Flow has converted the recording there is no file, and the
       deck goes without the button rather than with a player that will not
       play. The shape is asked for alongside when it was not saved, so a
       portrait video opens in a portrait frame instead of changing shape. */
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
    deck = playable ? { ...deck, welcomeVideo: { ...video, videoUrl, ...shape } } : { ...deck, welcomeVideo: null };
  }

  /* The builder's own ticks are for the builder; the landlord's page has no use for them. */
  deck = { ...deck, builder: null, terms: deck.terms ? { ...deck.terms, signUrl: null } : deck.terms };
  return <PresentDeck token={row.token} deck={deck} slides={slidesFor(deck)} />;
}

/** The quiet page a link shows once its fortnight is up. */
function Expired({ agent }: { agent: string }) {
  return (
    <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#ffffff", color: "#101014", fontFamily: "Montserrat, system-ui, sans-serif", padding: 24 }}>
      <div style={{ maxWidth: 440, textAlign: "center" }}>
        <p style={{ fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", color: "#6b6b70", margin: 0 }}>The Letting Experts</p>
        <h1 style={{ fontSize: 26, fontWeight: 500, margin: "14px 0 0", letterSpacing: 0 }}>This presentation has expired</h1>
        <p style={{ fontSize: 14.5, lineHeight: 1.6, color: "#6b6b70", margin: "12px 0 0" }}>
          Presentations are taken down two weeks after the appraisal. {agent ? `${agent} can send you a fresh copy` : "Your agent can send you a fresh copy"} - just ask.
        </p>
      </div>
    </main>
  );
}
