"use client";

import { useCallback, useEffect, useState } from "react";
import PresentBook, { PAGE_H, PAGE_W } from "@/components/PresentBook";
import { DeckStyleCtx, themeVars, INK } from "@/components/present-kit";
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
  onClose,
}: {
  deck: Deck;
  onClose: () => void;
}) {
  const pages = slidesFor(deck).map((s) => s.id);
  const [signOpen, setSignOpen] = useState(false);
  const [page, setPage] = useState({ at: -1, of: 0 });
  const [api, setApi] = useState<{ go: (dir: 1 | -1) => void } | null>(null);
  const [contactOpen, setContactOpen] = useState(false);
  const [room, setRoom] = useState({ w: 0, h: 0 });
  const signUrl = deck.terms?.signUrl ?? null;

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
      if (signOpen) setSignOpen(false);
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [signOpen, onClose]);

  /* The open spread fits the room with air round it. */
  const fit = room.w ? Math.min((room.w - 140) / (PAGE_W * 2), (room.h - 230) / PAGE_H) : 0.4;
  const onSpread = useCallback((at: number, of: number) => setPage({ at, of }), []);
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
        className="fixed inset-0 z-[80] flex flex-col items-center justify-center"
        style={{
          ...themeVars(asStyle(deck.style)),
          color: INK,
          background: "rgba(28, 22, 20, 0.6)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
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

        {/* THE BOOKLET, folding out onto the table. */}
        {room.w > 0 && (
          <div className="relative z-[84]" style={{ transformOrigin: "50% 100%", animation: "present-fold 820ms cubic-bezier(0.22, 1, 0.36, 1) 120ms both" }}>
            <BookActionsCtx.Provider value={{ sign: () => setSignOpen(true) }}>
              <PresentBook deck={deck} pages={pages} fit={fit} onSpread={onSpread} onApi={setApi} />
            </BookActionsCtx.Provider>
          </div>
        )}

        {/* THE FOOT, hung under the booklet itself: the way to sign centred
            under the left-hand page, the arrows centred under the right, both
            a small gap below the pages - James, 13 Sep 2026. */}
        {room.w > 0 && (
          <div className="relative z-[86] mt-6 grid grid-cols-2" style={{ width: PAGE_W * 2 * fit }}>
            <div className="flex items-center justify-center">
              {open && (
                <button
                  type="button"
                  onClick={() => setSignOpen(true)}
                  className="inline-flex h-[48px] items-center gap-3 rounded-full px-7 text-[14px] font-semibold text-white shadow-[0_18px_40px_-18px_rgba(0,0,0,0.6)] transition-transform hover:scale-[1.03]"
                  style={{ background: "#cfa096" }}
                >
                  Sign your contract
                  <svg viewBox="0 0 24 24" aria-hidden className="h-[16px] w-[16px]">
                    <path d="M12 19V5M6 11l6-6 6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              )}
            </div>
            <div className="flex items-center justify-center gap-4">
              <p className="mr-2 text-[12.5px] text-white/70">
                {open ? `${page.at + 1} of ${page.of}` : page.of ? "Open the cover" : ""}
              </p>
              {([["Back", -1], ["Next", 1]] as const).map(([label, dir]) => {
                const can = dir < 0 ? page.at > -1 : page.at < page.of - 1;
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

        {/* CONTACT, above the booklet, only while the agent's page is showing. */}
        {onAgent && (
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

        {/* THE CONTRACT, rising over the booklet. */}
        <div
          className="absolute inset-x-0 bottom-0 z-[88] flex flex-col overflow-hidden rounded-t-[32px] bg-white shadow-[0_-30px_80px_-30px_rgba(0,0,0,0.35)]"
          style={{ height: "calc(100% - 56px)", transform: signOpen ? "translateY(0)" : "translateY(104%)", transition: "transform 620ms cubic-bezier(0.22, 1, 0.36, 1)" }}
          aria-hidden={!signOpen}
        >
          <div className="flex items-center justify-between border-b px-8 py-4" style={{ borderColor: "rgba(0,0,0,0.08)" }}>
            <div>
              <p className="text-[11px] uppercase tracking-[0.3em] text-black/45">Your agreement</p>
              <p className="mt-1 text-[17px]" style={{ fontFamily: "var(--p-display)", fontWeight: 800 }}>Sign to get started</p>
            </div>
            <button type="button" onClick={() => setSignOpen(false)} className="rounded-full border px-5 py-2 text-[13px] font-semibold" style={{ borderColor: "rgba(0,0,0,0.14)" }}>
              Back to the presentation
            </button>
          </div>
          {signUrl ? (
            <iframe title="Sign your agreement" src={signUrl} className="h-full w-full flex-1 border-0" />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
              <p className="max-w-[520px] text-[17px] leading-[1.6] text-black/65">
                Your terms are being prepared. {deck.agent.firstName || "Your agent"} will send them across shortly, and they will appear here ready to sign.
              </p>
            </div>
          )}
        </div>
      </div>
    </DeckStyleCtx.Provider>
  );
}
