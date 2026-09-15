"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

const COL_W = 360;
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
  email,
  steps = LANDLORD_SIGNING,
  height = "94vh",
  closeLabel = "Finish later",
  onClose,
  onDone,
}: {
  url: string;
  email?: string | null;
  /** What they are signing, in their words. See lib/signing-steps. */
  steps?: SigningStep[];
  /** How tall the sheet stands. The presentation leaves its booklet showing. */
  height?: string;
  /** "Finish later" from the file; "Back to the presentation" under the deck. */
  closeLabel?: string;
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
  const colTop = 16 + listH + 14;

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

  /* ── where their panel sits ── */
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
      "  position: fixed !important;",
      "  top: " + colTop + "px !important;",
      "  bottom: auto !important;",
      "  left: auto !important;",
      "  right: 0 !important;",
      "  width: " + COL_W + "px !important;",
      "  border-radius: 0 !important;",
      "  border-color: rgba(86, 66, 62, 0.16) !important;",
      "  box-shadow: 0 30px 70px -34px rgba(30, 20, 16, 0.75) !important;",
      "}",
    ].join("\n");
    /* No room for a column: their panel stays where they put it, lifted clear
       of our own bar so the Next button is never half behind it. */
    const lift = ".form-container { bottom: 60px !important; }";
    el.textContent = (split ? column : lift) + (started ? "" : hide);
  }, [root, split, started, paperW, colTop]);

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
  const rows: SigningStep[] = trust
    ? steps
    : Array.from({ length: live.count }, (_, i) => ({
        field: "",
        label: i === live.current && live.label ? live.label : "Step " + (i + 1),
      }));

  return (
    <div className="relative flex w-full justify-center" style={{ height }} onClick={onClose}>
      <div
        className="relative"
        style={{
          width: sheetW,
          height: "100%",
          /* Square. James, 15 Sep: "the edges aren't rounded over ... it should
             have squared-off corners." */
          transform: "translate(" + (up && started ? 0 : shift) + "px, " + (up ? "0" : "104%") + ")",
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
          className="absolute inset-y-0 left-0 overflow-y-auto"
          style={{ width: paperW }}
        />

        {/* Close floats over the paper - nothing takes a strip off the top of
            the contract. */}
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
          ) : started ? (
            <button type="button" onClick={onClose} className="shrink-0 text-[12px] text-muted underline transition hover:text-ink">
              {closeLabel}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setStarted(true)}
              className="shrink-0 rounded-full bg-accent-dark px-6 py-2.5 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
            >
              Start signing <span aria-hidden>→</span>
            </button>
          )}
        </div>

        {/* THE COLUMN, in the dark beside the contract: everything they are
            being asked for, and their panel underneath it. */}
        {split && (
          <div
            className="absolute right-0 top-4 z-20"
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
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted">What you need to sign</p>
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
          </div>
        )}
      </div>
    </div>
  );
}
