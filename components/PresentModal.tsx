"use client";

import { useCallback, useEffect, useState } from "react";
import SignSheet from "@/components/landlord/SignSheet";
import { useSigning } from "@/lib/use-signing";
import PresentBook, { PAGE_H, PAGE_W } from "@/components/PresentBook";
import PresentPages from "@/components/PresentPages";
import { CREAM, DeckStyleCtx, themeVars, INK } from "@/components/present-kit";
import { asStyle, slidesFor, type PresentDeck as Deck } from "@/lib/present";
import { BookActionsCtx } from "@/components/PresentBookPages";

/**
 * THE POP-OUT. What happens when a landlord presses "View presentation" on
 * their portal: the page dims and blurs, and their booklet folds out onto
 * it, closed, cover up, in the middle of the screen. They open it and turn
 * the pages. Along the foot, the page they are on and - once it is open -
 * the button that lifts the CONTRACT: a panel that rises over the booklet
 * with the signing in it.
 *
 * James, 13 Sep 2026: "I think we can drop the entrance animation ... when
 * they click it, it should then just fold out the booklet, which will be
 * in the middle of the page." Everything else - the street, the fold-in,
 * the squeeze - is gone from here; the deck's own entrance is untouched.
 *
 * The signing link is DocuSeal's, per landlord, and it is null until the
 * office has sent the terms - the deck's own rule. With no link the panel
 * still rises and says the terms are on their way, so the button is never
 * a dead end.
 */
export default function PresentModal({
  deck,
  sign,
  onClose,
}: {
  deck: Deck;
  /**
   * This landlord's contract, from the portal that opened the booklet.
   *
   * The button along the foot used to read the DECK's own signUrl, which is
   * null until a deck is looked up per landlord - so on the harness and on
   * every real portal it rose an empty panel. James, 15 Sep 2026: "we have a
   * Sign your contract button, and that is not working. It's not putting up
   * the contract still." The portal knows where the contract is; the deck does
   * not have to.
   */
  sign?: { appraisalId?: string | null; url?: string | null };
  onClose: () => void;
}) {
  const pages = slidesFor(deck).map((s) => s.id);
  /**
   * THE BOOKLET GETS OUT OF THE WAY. James, 15 Sep 2026: "when we're on the
   * presentation and they click Sign, we should swipe the presentation off the
   * screen ... the contract will pop up in its place, and we should have a
   * Back to Presentation button. It will then work in reverse."
   *
   * Which is right: a contract rising over a booklet left two documents on the
   * screen at once, one of them half visible behind the other, and the reason
   * the flipbook was ruled out for the contract was exactly that - two things
   * stacked read as a glitch.
   *
   * Two pieces of state, because a thing that leaves has to be animated on the
   * way out as well as in. `signOpen` is what was ASKED for and drives both
   * transitions; `signUp` keeps the sheet mounted until it has finished
   * falling.
   */
  const [signOpen, setSignOpen] = useState(false);
  const [signUp, setSignUp] = useState(false);
  const [page, setPage] = useState({ at: -1, of: 0 });
  const [api, setApi] = useState<{ go: (dir: 1 | -1) => void } | null>(null);
  const [contactOpen, setContactOpen] = useState(false);
  const [room, setRoom] = useState({ w: 0, h: 0 });
  /* The portal's contract first, the deck's own as the fallback. */
  const { open: mint, signing, busy, note } = useSigning({
    appraisalId: sign?.appraisalId ?? null,
    url: sign?.url ?? deck.terms?.signUrl ?? null,
  });
  const signUrl = signing;
  const canSign = Boolean(sign?.appraisalId || sign?.url || deck.terms?.signUrl);

  const openSign = useCallback(() => {
    setSignUp(true);
    setSignOpen(true);
    void mint();
  }, [mint]);
  /* Down first, then gone: unmounting on the click would cut the fall off at
     the first frame and the booklet would slide back in behind nothing. */
  const closeSign = useCallback(() => {
    setSignOpen(false);
    window.setTimeout(() => setSignUp(false), 640);
  }, []);

  useEffect(() => {
    const measure = () => setRoom({ w: window.innerWidth, h: window.innerHeight });
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  /* Escape closes the contract first, then the booklet. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (signOpen) closeSign();
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [signOpen, closeSign, onClose]);

  /* The open spread fits the room with air round it. */
  const fit = room.w ? Math.min((room.w - 140) / (PAGE_W * 2), (room.h - 230) / PAGE_H) : 0.4;
  /**
   * A PHONE GETS SINGLE PAGES. A 2880-wide spread fitted into a 375px screen
   * is a 160px postcard with six-point type on it - which is what a landlord
   * opening their presentation on the bus was actually handed, and most of
   * them open it on a phone. See PresentPages.
   */
  const phone = room.w > 0 && room.w < 760;
  const onSpread = useCallback((at: number, of: number) => setPage({ at, of }), []);
  /* The phone has no cover to open, so page one is page one - where the
     booklet reports -1 until the cover is turned. */
  const onPage = useCallback((at: number, of: number) => setPage({ at, of }), []);
  const open = page.at >= 0;
  /* The agent's spread: a "Contact" button appears above the booklet while
     it is showing - James, 13 Sep 2026: "the most call-to-action ... not
     affecting the page scroll or anything like that". */
  const onAgent = open && [pages[2 * page.at], pages[2 * page.at + 1]].includes("agent");
  const agent = deck.agent;
  const tel = agent.phone.replace(/\s+/g, "");
  const wa = tel.replace(/^0/, "44");
  const first = agent.firstName || "us";

  return (
    <DeckStyleCtx.Provider value={asStyle(deck.style)}>
      <div
        className="fixed inset-0 z-[80] flex flex-col items-center justify-center overflow-hidden"
        style={{
          ...themeVars(asStyle(deck.style)),
          color: INK,
          /**
           * A PHONE GETS THE PAPER, NOT A FRAME AROUND IT.
           *
           * The dim and the blur are what make a pop-out read as a pop-out on
           * a desktop, where the booklet sits on a table with the portal
           * visible around it. On a phone the slide fills the screen, so all
           * the dark did was put a band of somebody else's page along the
           * bottom, under the controls. James, 15 Sep 2026: the presentation
           * "doesn't look great".
           */
          background: phone ? CREAM : "rgba(28, 22, 20, 0.6)",
          backdropFilter: phone ? undefined : "blur(10px)",
          WebkitBackdropFilter: phone ? undefined : "blur(10px)",
          animation: "present-dim 520ms ease-out both",
        }}
        data-present-style={asStyle(deck.style)}
        role="dialog"
        aria-modal="true"
        aria-label="Your presentation"
      >
        <style>{`
          @keyframes present-dim { from { opacity: 0 } to { opacity: 1 } }
          @keyframes present-fold { from { opacity: 0; transform: perspective(2000px) rotateX(-55deg) scale(0.92) } 60% { opacity: 1 } to { opacity: 1; transform: none } }
        `}</style>

        {/* Close, always. */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-6 top-6 z-[90] flex h-11 w-11 items-center justify-center rounded-full border transition-transform hover:scale-[1.05]"
          style={{ background: "rgba(255,255,255,0.9)", borderColor: "rgba(0,0,0,0.14)", backdropFilter: "blur(6px)" }}
        >
          <svg viewBox="0 0 24 24" aria-hidden className="h-[18px] w-[18px]">
            <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>

        {/* THE BOOKLET AND ITS FOOT, which travel together.
            The swipe is on THIS wrapper and the fold-out stays on the inner
            one: a CSS animation beats an inline transform, so the two cannot
            share an element. */}
        {room.w > 0 && (
          <div
            /* w-full on a phone: the strip inside measures its own width, and
               a column flex with items-center sizes to CONTENT - so without
               this the strip asks how wide it is, gets nothing, and draws
               nothing. */
            className={phone ? "flex w-full flex-col items-center" : "flex flex-col items-center"}
            style={{
              transform: signOpen ? "translateX(-118vw)" : "translateX(0)",
              transition: "transform 620ms cubic-bezier(0.5, 0, 0.18, 1)",
              pointerEvents: signOpen ? "none" : undefined,
            }}
            aria-hidden={signOpen}
          >
          <div
            className={phone ? "relative z-[84] w-full" : "relative z-[84]"}
            style={phone ? undefined : { transformOrigin: "50% 100%", animation: "present-fold 820ms cubic-bezier(0.22, 1, 0.36, 1) 120ms both" }}
          >
            <BookActionsCtx.Provider value={{ sign: openSign }}>
              {phone ? (
                <PresentPages deck={deck} pages={pages} onPage={onPage} onApi={setApi} />
              ) : (
                <PresentBook deck={deck} pages={pages} fit={fit} onSpread={onSpread} onApi={setApi} />
              )}
            </BookActionsCtx.Provider>
          </div>

          {/* THE FOOT. On a phone it stacks: the way to sign across the full
              width, the page count and the arrows under it. Side by side at
              375px the button wrapped onto two lines and sat on top of the
              count. */}
          {phone ? (
            <div className="relative z-[86] mt-4 w-full px-4 pb-1">
              {open && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={openSign}
                  className="mb-3 inline-flex h-[50px] w-full items-center justify-center gap-2.5 rounded-full text-[14.5px] font-semibold text-white shadow-[0_18px_40px_-18px_rgba(0,0,0,0.6)]"
                  style={{ background: "#cfa096" }}
                >
                  {busy ? "Opening…" : "Sign your contract"}
                  <svg viewBox="0 0 24 24" aria-hidden className="h-[16px] w-[16px]">
                    <path d="M12 19V5M6 11l6-6 6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              )}
              {/* Back on the left, Next on the right, the count between them -
                  where a thumb expects each of them to be. */}
              <div className="flex items-center gap-3">
                {(() => {
                  const arrow = (label: "Back" | "Next", dir: 1 | -1) => {
                    const can = dir < 0 ? page.at > 0 : page.at < page.of - 1;
                    return (
                      <button
                        type="button"
                        aria-label={label}
                        disabled={!can}
                        onClick={() => api?.go(dir)}
                        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border"
                        style={{ opacity: can ? 1 : 0.3, background: "#fff", borderColor: "rgba(0,0,0,0.12)", color: INK }}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden className="h-[18px] w-[18px]" style={{ transform: dir < 0 ? "scaleX(-1)" : undefined }}>
                          <path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                    );
                  };
                  return (
                    <>
                      {arrow("Back", -1)}
                      <p className="flex-1 text-center text-[12.5px]" style={{ color: "rgba(59,59,60,0.55)" }}>
                        {page.at + 1} of {page.of}
                      </p>
                      {arrow("Next", 1)}
                    </>
                  );
                })()}
              </div>
            </div>
          ) : (
            /* Hung under the booklet itself: the way to sign centred under the
               left-hand page, the arrows centred under the right, both a small
               gap below the pages - James, 13 Sep 2026. */
            <div className="relative z-[86] mt-6 grid grid-cols-2" style={{ width: PAGE_W * 2 * fit }}>
            <div className="flex items-center justify-center">
              {open && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={openSign}
                  className={`inline-flex h-[48px] items-center gap-2.5 rounded-full text-[13.5px] font-semibold text-white shadow-[0_18px_40px_-18px_rgba(0,0,0,0.6)] transition-transform hover:scale-[1.03] ${phone ? "px-4" : "gap-3 px-7"}`}
                  style={{ background: "#cfa096" }}
                >
                  {busy ? "Opening…" : "Sign your contract"}
                  <svg viewBox="0 0 24 24" aria-hidden className="h-[16px] w-[16px]">
                    <path d="M12 19V5M6 11l6-6 6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              )}
            </div>
            <div className="flex items-center justify-center gap-4">
              <p className="mr-2 text-[12.5px] text-white/70">
                {phone ? `${page.at + 1} of ${page.of}` : open ? `${page.at + 1} of ${page.of}` : page.of ? "Open the cover" : ""}
              </p>
              {([["Back", -1], ["Next", 1]] as const).map(([label, dir]) => {
                const can = dir < 0 ? page.at > (phone ? 0 : -1) : page.at < page.of - 1;
                return (
                  <button
                    key={label}
                    type="button"
                    aria-label={label}
                    disabled={!can}
                    onClick={() => api?.go(dir)}
                    className="flex h-11 w-11 items-center justify-center rounded-full border transition-transform hover:scale-[1.05] disabled:hover:scale-100"
                    style={{ opacity: can ? 1 : 0.3, background: "rgba(255,255,255,0.9)", borderColor: "rgba(0,0,0,0.14)", color: INK }}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden className="h-[18px] w-[18px]" style={{ transform: dir < 0 ? "scaleX(-1)" : undefined }}>
                      <path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                );
              })}
            </div>
          </div>
          )}
          </div>
        )}

        {/* CONTACT, above the booklet, only while the agent's page is showing.
            It goes with the booklet when the contract takes the screen. */}
        {onAgent && !signOpen && (
          <div className="absolute left-1/2 top-6 z-[87] flex -translate-x-1/2 flex-col items-center gap-3" style={{ animation: "present-dim 360ms ease-out both" }}>
            <button
              type="button"
              onClick={() => setContactOpen((v) => !v)}
              className="inline-flex h-[44px] items-center gap-3 rounded-full border px-6 text-[14px] font-semibold shadow-[0_18px_40px_-18px_rgba(0,0,0,0.5)] transition-transform hover:scale-[1.03]"
              style={{ background: "rgba(255,255,255,0.95)", borderColor: "rgba(0,0,0,0.12)", color: INK }}
            >
              Contact {first}
              <svg viewBox="0 0 24 24" aria-hidden className="h-[16px] w-[16px]" style={{ transform: contactOpen ? "rotate(180deg)" : undefined }}>
                <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {contactOpen && (
              <div className="flex items-center gap-2 rounded-full bg-white p-1.5 shadow-[0_18px_40px_-18px_rgba(0,0,0,0.5)]">
                {agent.phone && (
                  <a href={`tel:${tel}`} className="rounded-full px-5 py-2.5 text-[13px] font-semibold text-white" style={{ background: "#cfa096" }}>Call {first}</a>
                )}
                {agent.phone && (
                  <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" className="rounded-full px-5 py-2.5 text-[13px] font-semibold" style={{ background: "#f1f4ec", color: "#56634a" }}>WhatsApp</a>
                )}
                {agent.email && (
                  <a href={`mailto:${agent.email}`} className="rounded-full px-5 py-2.5 text-[13px] font-semibold" style={{ background: "var(--p-tint)", color: INK }}>Email</a>
                )}
              </div>
            )}
          </div>
        )}

        {/* THE CONTRACT, rising over the booklet. The same sheet the landlord
            gets from their file - square, no masthead, the signing beside the
            paper rather than over it. */}
        {signUp && (
          <div className="absolute inset-0 z-[88] flex items-end justify-center">
            {signUrl ? (
              <SignSheet
                url={signUrl}
                open={signOpen}
                height="calc(100% - 56px)"
                closeLabel="Back to the presentation"
                onClose={closeSign}
                onDone={closeSign}
              />
            ) : (
              <div
                className="flex w-full max-w-[1040px] flex-col items-center justify-center bg-white px-8 text-center"
                style={{ height: "calc(100% - 56px)" }}
                onClick={(e) => e.stopPropagation()}
              >
                <p className="max-w-[520px] text-[17px] leading-[1.6] text-black/65">
                  {busy
                    ? "Opening your contract\u2026"
                    : note
                      ? note
                      : canSign
                        ? "Opening your contract\u2026"
                        : "Your terms are being prepared. " +
                          (deck.agent.firstName || "Your agent") +
                          " will send them across shortly, and they will appear here ready to sign."}
                </p>
                <button
                  type="button"
                  onClick={closeSign}
                  className="mt-6 rounded-full border px-5 py-2 text-[13px] font-semibold"
                  style={{ borderColor: "rgba(0,0,0,0.14)" }}
                >
                  Back to the presentation
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </DeckStyleCtx.Provider>
  );
}
