"use client";

import { STEPS, type SetupStepId } from "@/lib/setup";

/**
 * The frame every setup screen sits in: the wordmark, the progress rail, the
 * question, and nothing else to click.
 *
 * Deliberately outside the (os) layout. There is no sidebar here, because a
 * sidebar is an invitation to go and look at something instead of finishing,
 * and because half of it would be pointing at screens that will be empty
 * until the step behind this one is done.
 *
 * ── No card ───────────────────────────────────────────────────────────────
 *
 * These screens sat in a bordered panel until James saw them (30 Aug). A card
 * is for separating one thing from the other things beside it, and there is
 * nothing else on the page: all the border did was draw a box around empty
 * space and make the screen look like a form. Without it the question sits in
 * the middle of the paper, which is what one-thing-at-a-time is supposed to
 * feel like.
 *
 * ── The progress rail earns its place ─────────────────────────────────────
 *
 * A five-step wizard without one is five identical screens and no sense of an
 * end. It also carries the only mention Password gets: it is already ticked
 * when somebody arrives, because the magic link signed them in as it burned.
 * Showing it ticked rather than skipping it silently is what makes the bar
 * start at one-fifth instead of zero, which is both true and kinder.
 */

function Pip({ state }: { state: "done" | "now" | "todo" }) {
  if (state === "done") {
    return (
      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent-dark text-page">
        <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M2.5 6.4 4.8 8.7 9.5 3.6" />
        </svg>
      </span>
    );
  }
  if (state === "now") {
    return (
      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-[1.6px] border-accent-dark">
        <span className="h-1.5 w-1.5 rounded-full bg-accent-dark" />
      </span>
    );
  }
  return <span className="h-4 w-4 shrink-0 rounded-full border-[1.6px] border-line" />;
}

export default function Frame({
  current,
  done,
  children,
  direction = "forward",
  demo = false,
}: {
  /** null on the welcome and finish screens, which sit outside the five. */
  current: SetupStepId | null;
  done: (id: SetupStepId) => boolean;
  children: React.ReactNode;
  direction?: "forward" | "back";
  demo?: boolean;
}) {
  const index = current ? STEPS.findIndex((s) => s.id === current) : -1;

  return (
    /* Centred on the screen rather than sitting at the top. justify-center
       with min-h-screen, so a short screen floats in the middle and a tall
       one still scrolls from the top instead of being clipped. */
    <main className="flex min-h-screen flex-col items-center justify-center px-5 py-10">
      <div className="flex w-full max-w-md flex-col">
        {/* Wordmark. Small, and the only branding on the page - the screen is
            about them, not us. */}
        <div className="mb-8 flex items-center justify-center gap-2">
          <img src="/brand/house.png" alt="" aria-hidden className="art h-7 w-7 object-contain" />
          <span className="hand text-[15px]">TLE OS</span>
        </div>

        {/* The rail. Labels hide on the narrowest screens, where five words
            across would wrap and turn one line into three. */}
        {index >= 0 && (
          <ol className="mb-7 flex items-center gap-1.5" aria-label="Setting up your account">
            {STEPS.map((s, i) => {
              const state = done(s.id) ? "done" : i === index ? "now" : "todo";
              return (
                <li key={s.id} className="flex min-w-0 flex-1 items-center gap-1.5">
                  <Pip state={state} />
                  <span
                    className={`hidden truncate text-[10.5px] sm:block ${
                      state === "todo" ? "text-muted/70" : "text-muted"
                    }`}
                  >
                    {s.short}
                  </span>
                  {i < STEPS.length - 1 && (
                    <span
                      className={`h-px min-w-2 flex-1 ${
                        done(s.id) ? "bg-accent-dark/40" : "bg-line"
                      }`}
                    />
                  )}
                </li>
              );
            })}
          </ol>
        )}

        {/* One question, on the paper. The key remounts it per step so the
            animation actually replays; --from carries the direction, so Back
            reads as going backwards rather than as another step forwards. */}
        <div
          key={current ?? "edge"}
          style={
            {
              animation: "slideIn 0.42s cubic-bezier(0.22,1,0.36,1) both",
              ["--from" as string]: direction === "back" ? "-26px" : "26px",
            } as React.CSSProperties
          }
        >
          {children}
        </div>

        {/* Said once, plainly, and only when it is true. A preview that
            silently forgets everything on refresh is how a demo gets reported
            as a bug. */}
        {demo && (
          <p className="mt-4 text-center text-[10.5px] leading-relaxed text-muted">
            Preview mode. There is no database on this machine, so your answers
            live in this tab only and REX will not really connect.
          </p>
        )}

        <p className="mt-4 text-center text-[11px] text-muted">The Lettings Experts</p>
      </div>
    </main>
  );
}
