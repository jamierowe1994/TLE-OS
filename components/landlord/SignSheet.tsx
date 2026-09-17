"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import SignedNext from "@/components/landlord/SignedNext";
import DocusealEmbed from "@/components/landlord/DocusealEmbed";
import { LANDLORD_SIGNING, type SigningStep } from "@/lib/signing-steps";

/**
 * THE CONTRACT, AND THE SIGNING BESIDE IT.
 *
 * One surface, used by both places a landlord signs: the modal from their
 * file (SignModal) and the panel that rises under the presentation
 * (PresentModal). It rises from the foot of the screen, square cornered,
 * with nothing over the paper.
 *
 * ── It does not start signing until they say so ───────────────────────────
 *
 * James, 15 Sep 2026: "the bottom will serve as the top that will say Start
 * signing. As soon as we click Start signing, the contract will move slightly
 * over to the left-hand side, and a box will appear on the right-hand side in
 * the black area ... therefore we can then not have to have it over the top of
 * the contract."
 *
 * Which is the difference between a document and a form. A landlord who opens
 * their terms and is immediately asked to type into a panel lying across the
 * page has not been given a chance to read it. So: the contract, on its own,
 * and one button. Press it and the sheet slides left and the signing appears
 * in the dark beside it - or they press a box on the document itself, which
 * starts it too.
 *
 * ── How the panel gets over there ─────────────────────────────────────────
 *
 * The panel is DOCUSEAL'S. It walks the fields, draws the signature, keeps
 * the dates valid and submits - reimplementing it would mean owning a
 * signature canvas and a validation model, and getting either wrong is
 * somebody's contract. So it is moved, not replaced: their .form-container is
 * position: fixed inside their shadow root, which resolves against THIS sheet
 * because the sheet carries a transform, and lands in the column. Their own
 * sticky-to-the-bottom placement is what put it over the page.
 *
 * Everything that reads their DOM is somebody else's internal markup and can
 * rot: the class names are read defensively and the column simply does not
 * draw if they are not there. What never depends on it is the signing itself.
 */

/**
 * Wide enough for the signature. Their drawing canvas is the column's width
 * less padding, at a 3:1 ratio they fix themselves - so the only way to give
 * somebody more room to sign is to give the column more room. 360 made it
 * 294x98; this makes it ~354x118. See the note in DocusealEmbed.
 */
const COL_W = 420;
const GAP = 24;
const PAPER_MAX = 1040;
/** Under this there is no dark left to put a column in, so the panel stays theirs. */
const SPLIT_MIN = 1240;

const BROWN = "#56423e";

type Live = {
  /** How many steps DocuSeal is showing. 0 means we cannot see them. */
  count: number;
  /** Index of the one they are on, or -1. */
  current: number;
  done: boolean[];
  /** The current step's own label, in DocuSeal's words. */
  label: string | null;
};

const NO_LIVE: Live = { count: 0, current: -1, done: [], label: null };
const DOTS = 'button[aria-label^="Step "]';

export default function SignSheet({
  url,
  appraisalId,
  email,
  steps = LANDLORD_SIGNING,
  height,
  closeLabel = "Finish later",
  open = true,
  onClose,
  onDone,
}: {
  url: string;
  /** The landlord's appraisal. Set, finishing brings up what comes next
   *  (SignedNext); left out - the agent's own signing - it just says done. */
  appraisalId?: string | null;
  email?: string | null;
  /** What they are signing, in their words. See lib/signing-steps. */
  steps?: SigningStep[];
  /**
   * How tall the sheet stands. The presentation leaves its booklet showing and
   * passes its own; left unset it is 94vh, and the whole screen on a phone,
   * where 6vh of dimmed portal is a strip of somewhere else on the screen with
   * the least room and the most to read.
   */
  height?: string;
  /** "Finish later" from the file; "Back to the presentation" under the deck. */
  closeLabel?: string;
  /**
   * Set false to send it back down. The caller keeps it mounted for the length
   * of the fall and then unmounts - which is how the presentation gets its
   * contract to drop away before the booklet slides back in.
   */
  open?: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [root, setRoot] = useState<ShadowRoot | null>(null);
  const [started, setStarted] = useState(false);
  const [up, setUp] = useState(false);
  const [done, setDone] = useState(false);
  const [vw, setVw] = useState(0);
  const [live, setLive] = useState<Live>(NO_LIVE);
  const [listH, setListH] = useState(0);
  const list = useRef<HTMLDivElement | null>(null);
  /* The empty marker under the card that says where their panel belongs. */
  const slot = useRef<HTMLDivElement | null>(null);
  /**
   * Whether their panel is actually sitting in the column.
   *
   * It starts false and only becomes true once the panel has been measured
   * INTO place and seen to paint there. Everything else - the sheet's width,
   * the shift, the checklist - depends on the viewport alone, so the layout
   * never jumps around while this settles.
   */
  const [placed, setPlaced] = useState(false);
  /**
   * HOW BIG THE PAGES ARE, on a phone.
   *
   * An A4 page drawn 375px wide is 47% of size, which puts the clause text at
   * about six pixels. That is not small, it is unreadable - and this is the
   * one document in the product where "they could not read it" is a real
   * problem rather than a nuisance. So the pages can be drawn larger than the
   * screen and the contract scrolls sideways, the way every phone PDF reader
   * works.
   *
   * It starts at "fit" because the first thing a landlord should see is a
   * whole page they recognise as their contract. One tap makes it readable.
   */
  const [zoom, setZoom] = useState<"fit" | "read">("fit");

  /* Mounted shut, opened a frame later, so the rise has somewhere to come
     from. Rendered straight at rest there is no arrival. */
  useEffect(() => {
    const t = requestAnimationFrame(() => setUp(true));
    return () => cancelAnimationFrame(t);
  }, []);

  useEffect(() => {
    const measure = () => setVw(window.innerWidth);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const split = vw >= SPLIT_MIN;
  const phone = vw > 0 && vw < 640;
  /* A caller that asked for a height gets it - the presentation wants its
     booklet showing under the contract. Only the default changes. */
  const tall = height ?? (phone ? "100dvh" : "94vh");
  /* With a column beside it the contract gives up the room the column needs,
     rather than the pair running off the edge of the screen. On a phone it
     takes the whole width - 24px of dark either side of a contract is 24px
     not being read. */
  const inset = vw < 640 ? 0 : 48;
  const paperW = Math.min(PAPER_MAX, Math.max(280, vw - inset - (split ? GAP + COL_W : 0)));
  const sheetW = split ? paperW + GAP + COL_W : paperW;
  /* Half the column, so the CONTRACT is centred before signing starts and
     slides off centre by exactly the room the column needs. */
  const shift = split ? (GAP + COL_W) / 2 : 0;
  /* The card's height is measured only so the layout settles; the panel's own
     place comes from the slot beneath it. */
  void listH;

  /* ── what they have done, read off their form ── */
  useEffect(() => {
    if (!root) return setLive(NO_LIVE);
    const read = () => {
      const dots = Array.from(root.querySelectorAll(DOTS)) as HTMLElement[];
      const label = (root.querySelector("form.steps-form label")?.textContent ?? "").trim();
      setLive({
        count: dots.length,
        current: dots.findIndex((d) => d.className.includes("steps-progress-current")),
        /* Their filled dot is the base content colour; upcoming ones are white. */
        done: dots.map((d) => d.className.includes("bg-base-content")),
        label: label || null,
      });
    };
    read();
    const t = window.setInterval(read, 500);
    return () => window.clearInterval(t);
  }, [root]);

  /* Pressing a box on the document is also "start signing" - they have said
     what they want more plainly than the button would have. */
  useEffect(() => {
    if (!root || started) return;
    const on = (e: Event) => {
      const t = e.composedPath()[0];
      if (t instanceof Element && t.closest(".field-area")) setStarted(true);
    };
    root.addEventListener("click", on, true);
    return () => root.removeEventListener("click", on, true);
  }, [root, started]);

  /* ── how their panel LOOKS. Where it sits is done in the effect below. ── */
  useEffect(() => {
    if (!root) return;
    let el = root.querySelector("style#tle-sheet") as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement("style");
      el.id = "tle-sheet";
      root.appendChild(el);
    }
    const hide = "\n.form-container { display: none !important; }";
    const column = [
      ".scrollbox { width: " + paperW + "px !important; }",
      ".form-container {",
      "  border-radius: 0 !important;",
      "  border-color: rgba(86, 66, 62, 0.14) !important;",
      /* Pink, taken from the page's own token: custom properties cross the
         shadow boundary, class names do not. The checklist above it stays
         white - James, 15 Sep: "change the What you need to sign box back to
         its original colour, and keep the bottom box in pink". */
      "  background-color: var(--accent-soft, #ffe4df) !important;",
      "  box-shadow: 0 30px 70px -34px rgba(30, 20, 16, 0.6) !important;",
      "}",
    ].join("\n");
    /**
     * THE LIFT IS ALWAYS ON, and that is the safety net.
     *
     * Their panel is sticky to the foot of the scroller. If our placing never
     * happens - the element renamed, the effect never reached, anything at all
     * - this is where it stays, and it stays somewhere a landlord can see and
     * use: over the foot of the contract, clear of our own bar. The column is
     * an improvement on that, never a precondition for signing.
     */
    const lift = ".form-container { bottom: 60px !important; }";
    /* Wider than the screen on purpose - the scroller around it takes the
       sideways scroll, and the white paper behind stays under the strip that
       is actually in view. */
    const big = phone && zoom === "read"
      ? "\n.scrollbox { width: " + Math.round(paperW * 1.7) + "px !important; }"
      : "";
    el.textContent = lift + (split ? column : "") + big + (started ? "" : hide);
  }, [root, split, started, paperW, phone, zoom]);

  /**
   * WHERE THEIR PANEL SITS, MEASURED RATHER THAN ASSUMED.
   *
   * This was a CSS rule - position: fixed, top, right - which relies on the
   * panel resolving against THIS sheet because the sheet carries a transform.
   * That held on my machine and did not on James's: "it's still not showing
   * the landlord box underneath", on a build that was otherwise his. Which
   * containing block a fixed element inside a shadow root picks up, with a
   * transform on one ancestor and a backdrop-filter on another, is not
   * something to bet a landlord's signature on.
   *
   * So it is calibrated. Put it at 0,0, read where 0,0 actually landed, and
   * offset by the difference to the slot under our card - which lands it in
   * the right place whatever the browser decided the containing block was.
   *
   * AND IT CHECKS ITSELF. If the panel ends up with no size or off the screen,
   * the column is abandoned and their own layout comes back. A signing panel
   * over the contract is a compromise; a signing panel nobody can see is a
   * landlord who cannot sign.
   */
  useEffect(() => {
    if (!root || !started || vw < SPLIT_MIN) return;
    let stop = false;
    let raf = 0;
    /* Frames spent trying to put it in place without it landing there. */
    let tries = 0;
    const clear = (st: CSSStyleDeclaration) =>
      ["position", "right", "bottom", "width", "top", "left"].forEach((k) => st.removeProperty(k));
    /**
     * PLACED EVERY FRAME, CHECKED BY WHERE IT IS (17 Sep 2026).
     *
     * James: "sometimes the right-hand side box is not showing ... it's really
     * inconsistent". Two things did that. Their form replaces .form-container
     * when it moves between steps, and the new element arrived without our
     * styles - but the slot had not moved, so nothing re-placed it and it fell
     * to the foot of the contract. And the old "is it painted" test asked the
     * document what sat at the panel's centre, misread it on some opens, and
     * gave the column up for good.
     *
     * So every frame: find the panel as it is now, and if it is not exactly on
     * the slot (a new element, a moved slot, anything), put it there again.
     * It counts as placed when its own box sits on the slot. Only if it will
     * not land there for two seconds straight is the column given up, which
     * is the one case the foot of the contract is better than nothing.
     */
    const tick = () => {
      if (stop) return;
      const fc = root.querySelector(".form-container");
      const to = slot.current?.getBoundingClientRect();
      if (fc instanceof HTMLElement && to) {
        /* HIDDEN, SO BRING IT BACK - with THEIR expand button (17 Sep 2026).
           This used to press .minimize-form-button, on the belief that it
           toggles. It does not: minimizeForm() only ever hides the panel and
           puts a "Sign now" bar at the foot instead - the brown bar James saw
           poking out from behind the paper, with the column empty and the
           "at the foot of the contract" note showing. Read off their form.js. */
        if (fc.offsetWidth === 0 || fc.offsetHeight === 0) {
          const expand = root.querySelector("#expand_form_button, .expand-form-button");
          if (expand instanceof HTMLElement) expand.click();
          raf = window.requestAnimationFrame(tick);
          return;
        }
        const now = fc.getBoundingClientRect();
        const onSlot =
          fc.style.getPropertyValue("position") === "fixed" &&
          Math.abs(now.left - to.left) < 1.5 &&
          Math.abs(now.top - to.top) < 1.5 &&
          Math.abs(now.width - COL_W) < 1.5;
        if (onSlot && now.height > 8) {
          tries = 0;
          setPlaced(true);
        } else {
          const st = fc.style;
          st.setProperty("position", "fixed", "important");
          st.setProperty("right", "auto", "important");
          st.setProperty("bottom", "auto", "important");
          st.setProperty("width", COL_W + "px", "important");
          st.setProperty("top", "0px", "important");
          st.setProperty("left", "0px", "important");
          const origin = fc.getBoundingClientRect();
          st.setProperty("top", to.top - origin.top + "px", "important");
          st.setProperty("left", to.left - origin.left + "px", "important");
          if (++tries > 120) {
            clear(st);
            setPlaced(false);
            return;
          }
        }
      }
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => {
      stop = true;
      window.cancelAnimationFrame(raf);
      const fc = root.querySelector(".form-container");
      if (fc instanceof HTMLElement) clear(fc.style);
    };
  }, [root, started, vw]);

  useEffect(() => {
    if (!list.current) return;
    const ro = new ResizeObserver(() => setListH(list.current?.offsetHeight ?? 0));
    ro.observe(list.current);
    setListH(list.current.offsetHeight);
    return () => ro.disconnect();
  }, [started, split]);

  const completed = useCallback(() => setDone(true), []);
  const jump = useCallback(
    (i: number) => {
      const dot = root?.querySelectorAll(DOTS)[i];
      if (dot instanceof HTMLElement) dot.click();
    },
    [root]
  );

  /**
   * Starting takes them TO the first thing they have to do.
   *
   * Their panel appears on the right showing "Your name" while the document is
   * still open at the cover - the box being asked for is eleven pages away and
   * nothing says so. Pressing their own step dot is what makes the document
   * scroll to it (data-autoscroll-fields), so that is what this does.
   */
  const jumped = useRef(false);
  useEffect(() => {
    if (!started || jumped.current || live.count === 0) return;
    const first = live.current >= 0 ? live.current : live.done.findIndex((d) => !d);
    jumped.current = true;
    jump(first < 0 ? 0 : first);
  }, [started, live, jump]);

  /* Our wording when it lines up with theirs, theirs when it does not. A list
     written for one version of the contract must never label the boxes of
     another. */
  const trust = live.count > 0 && live.count === steps.length;

  /**
   * SKIP, for the steps that are optional (James, 17 Sep 2026: "it's not
   * obvious that they can skip that ... we'll give them a skip button").
   *
   * Their form moves past an optional box left empty when its own Next is
   * pressed, so that is what Skip presses. The cooling-off waiver comes as a
   * pair - a signature and the date of it - and a date for a waiver they did
   * not sign means nothing, so skipping one skips the rest of the optional
   * run. Only offered when our list is known to match their steps.
   */
  const currentOptional = trust && live.current >= 0 && steps[live.current]?.optional === true;
  const skipsToEnd = currentOptional && steps.slice(live.current).every((x) => x.optional);
  const skipping = useRef(false);
  const skip = useCallback(() => {
    if (!root || skipping.current) return;
    skipping.current = true;
    const press = () => {
      const btn =
        root.querySelector('form.steps-form button[type="submit"]') ??
        root.querySelector(".submit-form-button, .complete-button");
      if (btn instanceof HTMLElement) btn.click();
    };
    const from = live.current;
    press();
    /* Then keep going while the step they land on is also optional. */
    let waited = 0;
    const t = window.setInterval(() => {
      waited++;
      const dots = Array.from(root.querySelectorAll(DOTS)) as HTMLElement[];
      const at = dots.findIndex((d) => d.className.includes("steps-progress-current"));
      if (at > from && steps[at]?.optional) {
        window.clearInterval(t);
        press();
        skipping.current = false;
      } else if (at > from || waited > 20) {
        window.clearInterval(t);
        skipping.current = false;
      }
    }, 150);
  }, [root, live.current, steps]);
  const rows: SigningStep[] = trust
    ? steps
    : Array.from({ length: live.count }, (_, i) => ({
        field: "",
        label: i === live.current && live.label ? live.label : "Step " + (i + 1),
      }));

  return (
    <div className="relative flex w-full justify-center" style={{ height: tall }} onClick={onClose}>
      {done && appraisalId && <SignedNext appraisalId={appraisalId} />}
      {/* The agent's own half: said in the middle of the screen, with one
          button (James, 17 Sep 2026 - he pressed the X thinking he was done,
          and it had not saved). */}
      {done && !appraisalId && <AgentSigned onDone={onDone} />}
      <div
        className="relative"
        style={{
          width: sheetW,
          height: "100%",
          /* Square. James, 15 Sep: "the edges aren't rounded over ... it should
             have squared-off corners." */
          transform: "translate(" + (up && started ? 0 : shift) + "px, " + (up && open ? "0" : "104%") + ")",
          transition: "transform 620ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Your terms of business"
      >
        {/* The paper. The sheet itself is wider than the contract and carries
            no colour, so the column lands in the dark beside it. */}
        <div
          className="absolute inset-y-0 left-0 bg-white shadow-[0_-30px_80px_-30px_rgba(40,25,20,0.5)]"
          style={{ width: paperW }}
        />

        <DocusealEmbed
          url={url}
          email={email}
          onCompleted={completed}
          onRoot={setRoot}
          /**
           * FULL WIDTH OF THE SHEET, not just the paper - and this is the fix
           * for the panel James could not see.
           *
           * An overflow scroller clips its descendants UNLESS the descendant's
           * containing block is an ancestor of the scroller. Their panel is
           * position: fixed, so which ancestor that is depends on what carries
           * a transform, a filter or a backdrop-filter - our sheet here, but
           * something inside their own shadow root on his machine, in which
           * case a scroller only as wide as the PAPER clips the panel away
           * completely while getBoundingClientRect still reports it sitting
           * politely in the column.
           *
           * With the scroller spanning the whole sheet the panel is inside its
           * box either way, so the question stops mattering. The pages stay on
           * the paper because .scrollbox is width-clamped instead.
           */
          className="absolute inset-0 overflow-y-auto"
        />

        {/* READ IT LARGER. Phone only: on anything wider the page already
            draws at a size the clauses survive. */}
        {phone && (
          <button
            type="button"
            onClick={() => setZoom((z) => (z === "fit" ? "read" : "fit"))}
            className="absolute left-4 top-4 z-20 flex items-center gap-1.5 rounded-full bg-white/85 px-3 py-2 text-[12px] font-semibold text-muted shadow-sm backdrop-blur transition hover:text-ink"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
              <circle cx="11" cy="11" r="7" />
              <path strokeLinecap="round" d="M20 20l-3.5-3.5" />
              {zoom === "fit" && <path strokeLinecap="round" d="M11 8v6M8 11h6" />}
            </svg>
            {zoom === "fit" ? "Read it larger" : "Fit the page"}
          </button>
        )}

        {/* Close floats over the paper until signing starts; once the column
            is up it moves beside "What you need to sign", out of the contract's
            way (James, 17 Sep 2026). */}
        {!(split && started) && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute top-4 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-white/85 text-muted shadow-sm backdrop-blur transition hover:text-ink"
            style={{ left: paperW - 52 }}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        )}

        {/* THE FOOT. One button, and it is the only thing asked of them until
            they press it. */}
        <div
          className="absolute bottom-0 left-0 z-20 flex items-center justify-end gap-4 border-t border-line/60 bg-card px-5 py-3"
          style={{ width: paperW }}
        >
          <p className="hidden min-w-0 flex-1 text-[11.5px] leading-relaxed text-muted sm:block">
            {done
              ? "Signed. Your copy is on its way to your file."
              : started
                ? "Nothing is final until you press the last one."
                : "Read it through. Nothing is signed until you say so."}
          </p>
          {done ? (
            <button
              type="button"
              onClick={onDone}
              className="shrink-0 rounded-full bg-accent-dark px-5 py-2.5 text-[12.5px] font-semibold text-white"
            >
              All done
            </button>
          ) : (
            <>
              {/* The way back is offered before they start as well as after.
                  Reading a contract and deciding not to sign it today is a
                  perfectly good outcome and should not need the Escape key. */}
              {/* No "Finish later" down here any more (James, 17 Sep 2026) -
                  the X is the way out. Kept only where there is no X beside
                  the column to find: the presentation's "Back" label. */}
              {closeLabel !== "Finish later" && (
                <button type="button" onClick={onClose} className="shrink-0 text-[12px] text-muted underline transition hover:text-ink">
                  {closeLabel}
                </button>
              )}
              {/* No column on a smaller screen, so the skip lives here. */}
              {started && currentOptional && !split && (
                <button
                  type="button"
                  onClick={skip}
                  className="shrink-0 rounded-full border border-[#56423e]/40 px-4 py-2 text-[12.5px] font-semibold text-[#56423e]"
                >
                  {skipsToEnd ? "Skip this and finish" : "Skip this, it's optional"}
                </button>
              )}
              {!started && (
                <button
                  type="button"
                  onClick={() => setStarted(true)}
                  className="shrink-0 rounded-full bg-accent-dark px-6 py-2.5 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
                >
                  Start signing <span aria-hidden>→</span>
                </button>
              )}
            </>
          )}
        </div>

        {/* THE COLUMN, in the dark beside the contract: everything they are
            being asked for, and their panel underneath it. */}
        {split && (
          <div
            className="absolute right-0 top-0 z-20"
            style={{
              width: COL_W,
              opacity: started ? 1 : 0,
              transform: started ? "none" : "translateX(18px)",
              transition: "opacity 300ms ease-out 200ms, transform 520ms cubic-bezier(0.22, 1, 0.36, 1) 160ms",
              pointerEvents: started ? "auto" : "none",
            }}
            aria-hidden={!started}
          >
            <div ref={list} className="bg-white px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted">What you need to sign</p>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  title="Close - nothing is saved until the last step"
                  className="-mr-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-black/5 hover:text-ink"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </div>
              {rows.length === 0 ? (
                <p className="mt-3 text-[12.5px] leading-relaxed text-muted">
                  Opening your boxes&hellip; they will appear on the contract as well.
                </p>
              ) : (
                <ol className="mt-3 space-y-1">
                  {rows.map((s, i) => {
                    const isDone = live.done[i] === true;
                    const isNow = live.current === i;
                    return (
                      <li key={s.field || i}>
                        <button
                          type="button"
                          onClick={() => jump(i)}
                          className="flex w-full items-start gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-accent-soft/50"
                          style={isNow ? { background: "rgba(86, 66, 62, 0.07)" } : undefined}
                        >
                          <span
                            className="mt-px flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
                            style={
                              isDone
                                ? { background: BROWN, color: "#fff" }
                                : isNow
                                  ? { background: "#fff", color: BROWN, boxShadow: "inset 0 0 0 1.5px " + BROWN }
                                  : { background: "#f0ebe9", color: "#8d7b76" }
                            }
                          >
                            {isDone ? (
                              <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            ) : (
                              i + 1
                            )}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[13px] font-semibold leading-tight">
                              {s.label}
                              {s.optional ? (
                                <span className="ml-1.5 text-[10.5px] font-normal text-muted">optional</span>
                              ) : null}
                            </span>
                            {s.sub ? (
                              <span className="mt-0.5 block text-[11px] leading-snug text-muted">{s.sub}</span>
                            ) : null}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
            {/* Optional, said plainly, with the way past it. */}
            {started && currentOptional && (
              <div className="mt-3 flex items-center gap-3 bg-white px-5 py-3">
                <p className="min-w-0 flex-1 text-[12px] leading-relaxed text-muted">
                  This one is optional. You can sign your contract without it.
                </p>
                <button
                  type="button"
                  onClick={skip}
                  className="shrink-0 rounded-full border border-[#56423e]/40 px-4 py-2 text-[12.5px] font-semibold text-[#56423e] transition-colors hover:bg-[#56423e] hover:text-white"
                >
                  {skipsToEnd ? "Skip and finish" : "Skip"}
                </button>
              </div>
            )}
            {/* Where their panel goes. It is measured, never computed - the one
                thing that says where the column's second box belongs. */}
            <div ref={slot} className="mt-3 h-px w-full" aria-hidden />
            {/* And if it could not be put there, SAY SO rather than leaving
                them looking at a list with no box under it. This is the state
                James was stuck in twice, with nothing on the screen to explain
                where the signing had gone. */}
            {started && !placed && (
              <p className="mt-3 bg-white px-5 py-3 text-[12px] leading-relaxed text-muted">
                Your signing box is at the foot of the contract, on the left.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** "You finished the contract" - the agent's side, over everything. */
function AgentSigned({ onDone }: { onDone: () => void }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-[#2b201d]/60 p-4 backdrop-blur-sm"
      style={{ animation: "agent-signed-in 280ms ease-out both" }}
      onClick={(e) => e.stopPropagation()}
    >
      <style>{`
        @keyframes agent-signed-in { from { opacity: 0 } to { opacity: 1 } }
        @keyframes agent-signed-card { from { opacity: 0; transform: translateY(14px) scale(.98) } to { opacity: 1; transform: none } }
      `}</style>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="You finished the contract"
        className="w-full max-w-[440px] rounded-[28px] bg-white p-8 text-center shadow-2xl"
        style={{ animation: "agent-signed-card 420ms cubic-bezier(.2,.9,.3,1.1) 60ms both" }}
      >
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-accent-dark text-white">
          <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={2.8} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </span>
        <h2 className="mt-5 text-[28px] leading-tight">Congratulations, You Finished the Contract</h2>
        <p className="mt-3 text-[14px] leading-relaxed text-muted">Your half is signed and saved. Next, send it to the landlord.</p>
        <button
          type="button"
          onClick={onDone}
          autoFocus
          className="mt-7 w-full rounded-full bg-accent-dark px-6 py-4 text-[15px] font-semibold text-white transition-opacity hover:opacity-90"
        >
          Done
        </button>
      </div>
    </div>,
    document.body
  );
}
