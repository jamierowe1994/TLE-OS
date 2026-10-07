"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import DoodleIcon from "@/components/DoodleIcon";
import { DoneTick } from "@/components/Bits";
import {
  agentOwnNote,
  caseIdFor,
  PLC_CHECKS,
  gateFor,
  gateOf,
  groupOf,
  rlpAnswered,
  waiverFor,
  type CheckId,
  type LetType,
  type PlcCase,
} from "@/lib/plc";
import PlcDocuments from "@/components/PlcDocuments";
import { DateField } from "@/components/offers/OfferParts";
import type { Prefill } from "@/lib/plc-prefill";
import { demoCase } from "@/lib/plc-demo";
import { prettyWhen } from "@/components/PlcReview";

/**
 * Starting a PLC check.
 *
 * ── Why this is a wizard and not a form ────────────────────────────────────
 *
 * The pack is nine checks and can be a dozen files. As one page it reads as a
 * chore, gets half-filled, and the half that is missing is discovered by
 * compliance two days later. Cut into four screens it reads as four small
 * errands, each of which is obviously finishable, and every one of them ends
 * with the agent having done something rather than having scrolled.
 *
 * The order is deliberate: check what we already know, then the landlord's
 * pile, then the tenant's, then one page confirming the lot. Nothing is asked
 * twice and nothing is asked that the OS could have looked up.
 *
 * ── The pause at the start is real work, mostly ────────────────────────────
 *
 * The first screen reads the application out of REX, which genuinely takes a
 * moment. It is also held to a floor of just over two seconds when the read
 * comes back faster, and that is a deliberate piece of theatre: the whole
 * point of the screen is to show the agent that the details were fetched
 * rather than demanded, and a panel that flickers past teaches them nothing.
 * It never runs the other way - a slow read is never cut short and never
 * faked.
 *
 * ── The case is created LATE ───────────────────────────────────────────────
 *
 * Nothing is written until the agent presses Continue on the details. Opening
 * this screen and closing it again leaves nothing behind, because a list full
 * of empty half-started handovers is indistinguishable from a list of real
 * work.
 *
 * ── A pack that already exists is shown, not restarted ─────────────────────
 *
 * One pack per application. When the agent comes back to one that compliance
 * sent back, or that is still with them, the wizard says so before anything
 * else: a sent-back pack shows what compliance wrote and offers Reopen and fix
 * it, and only then does it become editable again. Without this the screens
 * looked editable, every attach was refused, and the only reopen button lived
 * on the dry-run harness at /plc.
 */

/* ─────────────────────────────── plumbing ─────────────────────────────── */

type Step = "gathering" | "details" | "landlord" | "tenant" | "review" | "sending" | "done" | "returned";

const ORDER: Step[] = ["gathering", "details", "landlord", "tenant", "review", "sending", "done"];

/** How long the opening panel stays up even when REX is quick. */
const THEATRE_MS = 2200;

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.ok === false) throw new Error(body.error ?? `That didn't work (${res.status}).`);
  return body as T;
}

const prettyDate = (v: string | null) =>
  v ? new Date(v).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : null;

/* ──────────────────────────── moving parts ─────────────────────────────── */

/** One dot, then two, then three, then back. */
function Ellipsis() {
  return (
    <span aria-hidden className="plc-dots">
      <span>.</span>
      <span>.</span>
      <span>.</span>
    </span>
  );
}

/** The animations, kept local so globals.css stays out of this. */
function WizardStyles() {
  return (
    <style>{`
      @keyframes plc-in  { from { opacity: 0; transform: translateX(28px); } to { opacity: 1; transform: none; } }
      @keyframes plc-out { from { opacity: 1; transform: none; } to { opacity: 0; transform: translateX(-28px); } }
      .plc-panel-in  { animation: plc-in .34s cubic-bezier(.22,.8,.3,1) both; }
      .plc-panel-out { animation: plc-out .24s cubic-bezier(.5,0,.75,0) both; }

      @keyframes plc-dot { 0%,20% { opacity: 0 } 40%,100% { opacity: 1 } }
      .plc-dots span { animation: plc-dot 1.35s infinite; }
      .plc-dots span:nth-child(2) { animation-delay: .45s; }
      .plc-dots span:nth-child(3) { animation-delay: .9s; }

      @keyframes plc-spin { to { transform: rotate(360deg); } }
      .plc-spinner { animation: plc-spin .9s linear infinite; }

      /* Somebody who has asked not to be moved gets the same screens without
         the motion. The information is in the words, not the animation. */
      @media (prefers-reduced-motion: reduce) {
        .plc-panel-in, .plc-panel-out, .plc-dots span, .plc-spinner { animation: none; }
        .plc-panel-out { opacity: 0; }
      }
    `}</style>
  );
}

/* The primary button. Pink on hover (James, 6 Oct 2026): it used to turn
   white, white text on a white box, and read as switched off. */
const PRIMARY =
  "rounded-lg border border-ink bg-ink px-4 py-2.5 text-sm text-white transition hover:border-accent hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-ink disabled:hover:bg-ink";
const SECONDARY = "rounded-lg border border-line px-4 py-2.5 text-sm transition hover:bg-box";

/* ──────────────────────────────── the wizard ───────────────────────────── */

export default function PlcWizard({
  applicationId,
  listingId,
  demo,
}: {
  applicationId?: string;
  listingId?: string;
  /**
   * Drive the whole wizard against an invented pack, touching nothing.
   *
   * For the public preview at /preview/<token>/plc, which James sends to
   * people who have no account. The real wizard reads a live REX application
   * and creates a real case; neither can happen on a link handed to somebody
   * outside the company.
   *
   * Four seams, and they are all of them - the prefill read, the case
   * creation, the submit, and the document upload. Everything else in here
   * is already local state, so a demo runs the genuine screens in the
   * genuine order rather than a mock-up that will quietly drift.
   */
  demo?: {
    prefill: Prefill;
    /**
     * Where the two buttons at the end go instead.
     *
     * The real wizard finishes by offering "Back to applications" and "See
     * where it is up to", both of which push into the signed-in OS. On a link
     * sent to somebody with no account that is a one-way trip to the sign-in
     * page from the middle of a demonstration, so the preview supplies its
     * own pair and stays where it is.
     */
    onSeeCompliance?: () => void;
    onRestart?: () => void;
    /**
     * The pack as the practice left it, when there is one: sent, decided or
     * reopened. Read once, when the wizard opens, the same moment the real
     * one asks the API whether a pack already exists.
     */
    existing?: PlcCase | null;
    /** Send, answered by the sandbox, so compliance's side reads this pack. */
    onSubmitted?: (c: PlcCase) => void;
    /** Reopen and fix it, answered by the sandbox. Returns the reopened pack. */
    onReopen?: () => PlcCase;
  };
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("gathering");
  const [leaving, setLeaving] = useState(false);
  const [prefill, setPrefill] = useState<Prefill | null>(null);
  const [kase, setKase] = useState<PlcCase | null>(null);
  const [moveIn, setMoveIn] = useState("");
  /** Home or HMO: decides whether the HMO documents are needed. */
  const [letType, setLetType] = useState<LetType | null>(null);
  /** A check the review screen sent the agent back to fill. */
  const [focus, setFocus] = useState<CheckId | null>(null);
  /** Where Continue on the details goes: back to the review when it was opened from there. */
  const [returnTo, setReturnTo] = useState<Step | null>(null);
  /** What REX said when a changed move-in date was sent back to the application. */
  const [rexNote, setRexNote] = useState<{ ok: boolean; note: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** The reason typed against a conditional check, before it is sent. */
  const [why, setWhy] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  /** What the agent wants compliance to know. Optional. */
  const [note, setNote] = useState("");
  /* The demo seam is a fresh object on every render of whatever mounts this.
     Held in a ref so re-rendering the page around the wizard (ticking a
     practice step, say) never re-runs the opening read and yanks the agent
     back to the first screen. */
  const demoRef = useRef(demo);
  demoRef.current = demo;
  const isDemo = !!demo;

  /* Advance with the panel sliding out before the next one slides in, so the
     two are never on screen together. */
  const go = useCallback((to: Step) => {
    setLeaving(true);
    window.setTimeout(() => {
      setStep(to);
      setLeaving(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }, 240);
  }, []);

  useEffect(() => {
    let alive = true;
    const started = Date.now();
    const params = applicationId ? `application=${applicationId}` : `listing=${listingId}`;

    (async () => {
      let got: Prefill | null = null;
      let failed: string | null = null;
      let existing: PlcCase | null = null;
      const d = demoRef.current;
      if (d) {
        /* The theatre below still runs. It is not decoration: the pause is
           what makes "we went and got this for you" legible, and skipping it
           in the preview would show a faster product than the real one. */
        got = d.prefill;
        existing = d.existing ?? null;
      } else {
        try {
          const res = await api<{ prefill: Prefill }>(`/api/plc/prefill?${params}`);
          got = res.prefill;
        } catch (e) {
          failed = (e as Error).message;
        }
        /* Is there already a pack for this application? A 404 is the normal
           answer. Any other failure is treated the same, because Continue
           asks again and lands on the right screen either way. */
        if (got) {
          try {
            const res = await api<{ case: PlcCase }>(`/api/plc/${caseIdFor(got.applicationRef)}`);
            existing = res.case;
          } catch {
            existing = null;
          }
        }
      }
      /* The floor, never a ceiling: a read that took longer than the theatre
         has already told the agent something is happening. */
      const wait = Math.max(0, THEATRE_MS - (Date.now() - started));
      window.setTimeout(() => {
        if (!alive) return;
        setPrefill(got);
        setMoveIn(existing?.moveInDate ?? got?.moveInDate ?? "");
        setLetType(existing?.letType ?? (got ? (got.hmo ? "hmo" : "home") : null));
        setError(failed);
        if (existing) setKase(existing);
        go(existing && existing.state !== "assembling" ? "returned" : "details");
      }, wait);
    })();

    return () => {
      alive = false;
    };
  }, [applicationId, listingId, go, isDemo]);

  /* The note box starts from what is on the pack, whenever a different pack
     or a different state of it arrives (opened, reopened). */
  useEffect(() => {
    setNote(agentOwnNote(kase?.agentNote ?? ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kase?.id, kase?.state]);

  const startAndContinue = async () => {
    if (!prefill) return;
    if (demo) {
      /* No case is created. The pack lives in this component's state for as
         long as the tab is open and then it is gone. A reopened practice pack
         carries on from where it was. */
      setKase(
        kase && kase.state === "assembling"
          ? { ...kase, moveInDate: moveIn || null, letType }
          : { ...demoCase({ moveInDate: moveIn || null, documents: [], agentNote: "" }), letType }
      );
      go(returnTo ?? "landlord");
      setReturnTo(null);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const made = await api<{ case: PlcCase; rexMoveIn?: { ok: boolean; note: string } }>("/api/plc", {
        method: "POST",
        body: JSON.stringify({
          applicationRef: prefill.applicationRef,
          address: prefill.address,
          moveInDate: moveIn || null,
          letType,
          rexStartDate: prefill.moveInDate,
        }),
      });
      if (made.rexMoveIn) setRexNote(made.rexMoveIn);
      let current = made.case;
      /* Already sent, or sent back, since this screen opened. Show that
         rather than a set of screens that will refuse every change. */
      if (current.state !== "assembling") {
        setKase(current);
        go("returned");
        return;
      }
      /* createCase is idempotent on the application, so re-entering the wizard
         returns the pack already started. It deliberately does not overwrite
         anything - which means a move-in date corrected on this screen has to
         be written separately. */
      if ((moveIn && current.moveInDate !== moveIn) || (letType && current.letType !== letType)) {
        const patched = await api<{ case: PlcCase; rexMoveIn?: { ok: boolean; note: string } }>(`/api/plc/${current.id}`, {
          method: "PATCH",
          body: JSON.stringify({ moveInDate: moveIn || current.moveInDate, letType: letType ?? current.letType ?? null }),
        });
        current = patched.case;
        if (patched.rexMoveIn) setRexNote(patched.rexMoveIn);
      }
      setKase(current);
      go(returnTo ?? "landlord");
      setReturnTo(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  /** Save the note if it has changed. Throws on a refusal. */
  const saveNote = async (): Promise<PlcCase | null> => {
    if (!kase || note.trim() === agentOwnNote(kase.agentNote)) return kase;
    if (demo) {
      const next = { ...kase, agentNote: note.trim() };
      setKase(next);
      return next;
    }
    const res = await api<{ case: PlcCase }>(`/api/plc/${kase.id}`, {
      method: "PATCH",
      body: JSON.stringify({ agentNote: note.trim() }),
    });
    setKase(res.case);
    return res.case;
  };

  const submit = async () => {
    if (!kase) return;
    setError(null);
    /* The note first, so what compliance read is what is in the box, even
       when Send is pressed straight from typing it. */
    let current: PlcCase | null;
    try {
      current = await saveNote();
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    if (!current) return;
    go("sending");
    if (demo) {
      const sent: PlcCase = { ...current, state: "submitted", submittedAt: new Date().toISOString() };
      setKase(sent);
      demo.onSubmitted?.(sent);
      window.setTimeout(() => setStep("done"), 1400);
      return;
    }
    try {
      const res = await api<{ case: PlcCase }>(`/api/plc/${kase.id}`, {
        method: "POST",
        body: JSON.stringify({ action: "submit" }),
      });
      setKase(res.case);
      /* A beat on the spinner before the tick, because a state change with no
         duration reads as nothing having happened. */
      window.setTimeout(() => setStep("done"), 1400);
    } catch (e) {
      setError((e as Error).message);
      /* A refusal carries findings (the reader's, or the gate's). Re-read the
         case so the review screen shows the exact lines, not just the sentence. */
      try {
        const fresh = await api<{ case: PlcCase }>(`/api/plc/${kase.id}`);
        setKase(fresh.case);
      } catch {
        /* keep what we had */
      }
      go("review");
    }
  };

  /** Compliance sent it back: make it the agent's again, then show the lot. */
  const reopen = async () => {
    if (!kase) return;
    setError(null);
    if (demo) {
      setKase(demo.onReopen ? demo.onReopen() : { ...kase, state: "assembling", findings: [], scannedAt: null });
      go("review");
      return;
    }
    setBusy(true);
    try {
      const res = await api<{ case: PlcCase }>(`/api/plc/${kase.id}`, {
        method: "POST",
        body: JSON.stringify({ action: "reopen" }),
      });
      setKase(res.case);
      go("review");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  /** Rent and Legal Protection, yes or no. Saved the moment it is picked. */
  const answerRlp = async (wanted: boolean) => {
    if (!kase) return;
    setError(null);
    if (demo) {
      setKase({ ...kase, rlpWanted: wanted });
      return;
    }
    try {
      const res = await api<{ case: PlcCase }>(`/api/plc/${kase.id}`, {
        method: "POST",
        body: JSON.stringify({ action: "rlp", wanted }),
      });
      setKase(res.case);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  /** "Not needed, because…" against one conditional check. */
  const waive = async (checkId: CheckId, undo = false) => {
    if (!kase) return;
    setError(null);
    if (demo) {
      setKase({
        ...kase,
        waivers: undo
          ? kase.waivers.filter((w) => w.checkId !== checkId)
          : [
              ...kase.waivers.filter((w) => w.checkId !== checkId),
              { checkId, reason: why[checkId] ?? "", by: kase.agentName, at: new Date().toISOString() },
            ],
      });
      return;
    }
    try {
      const res = await api<{ case: PlcCase }>(`/api/plc/${kase.id}`, {
        method: "POST",
        body: JSON.stringify(
          undo ? { action: "unwaive", checkId } : { action: "waive", checkId, reason: why[checkId] ?? "" }
        ),
      });
      setKase(res.case);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const documents = kase?.documents ?? [];
  const filedFor = (id: CheckId) => documents.some((d) => d.checkId === id || d.covers?.includes(id));
  const stepNumber = useMemo(() => ORDER.indexOf(step), [step]);

  const panel = `mx-auto w-full max-w-2xl ${leaving ? "plc-panel-out" : "plc-panel-in"}`;

  return (
    <div className="relative mx-auto flex min-h-[70vh] max-w-3xl flex-col justify-center px-4 py-10 sm:px-6">
      <WizardStyles />

      {/* Where you are, once there is somewhere to be. Hidden during the
          opening and the ending, which are moments rather than steps. */}
      {stepNumber > 0 && stepNumber < 5 && (
        <div className="mx-auto mb-8 flex w-full max-w-2xl gap-1.5">
          {["details", "landlord", "tenant", "review"].map((s, i) => (
            <span
              key={s}
              className={`h-1 flex-1 rounded-full transition-colors ${
                i <= stepNumber - 1 ? "bg-ink" : "bg-neutral-200"
              }`}
            />
          ))}
        </div>
      )}

      <div key={step} className={panel}>
        {step === "gathering" && (
          <div className="py-16 text-center">
            <DoodleIcon
              name="search"
              size={56}
              className="mx-auto text-ink opacity-70"
            />
            <h1 className="mt-6 text-2xl tracking-normal text-ink">
              Getting all the details ready
              <Ellipsis />
            </h1>
            <p className="mx-auto mt-3 max-w-md text-sm text-muted">
              Reading the application so you do not have to type any of it again.
            </p>
          </div>
        )}

        {step === "details" && (
          <div>
            <h1 className="text-2xl tracking-normal text-ink">
              Check These Over
            </h1>
            <p className="mt-2 text-sm text-muted">
              Pulled through from the application. Change the move-in date here if it has moved.
            </p>
            {error && (
              <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                {error}
              </p>
            )}
            {prefill && (
              <>
                <dl className="mt-6 divide-y divide-neutral-100 rounded-xl border border-line">
                  <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-3">
                    <dt className="w-full shrink-0 text-xs uppercase tracking-wide text-muted sm:w-32">
                      Property
                    </dt>
                    <dd className="min-w-0 flex-1 text-sm">{prefill.address}</dd>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-3">
                    <dt className="w-full shrink-0 text-xs uppercase tracking-wide text-muted sm:w-32">
                      {prefill.tenants.length > 1 ? "Tenants" : "Tenant"}
                    </dt>
                    <dd className="min-w-0 flex-1 text-sm">
                      {prefill.tenants.length
                        ? prefill.tenants.map((t) => t.name).join(", ")
                        : "Nobody recorded"}
                    </dd>
                  </div>
                  {/* Move-in dates move all the time (James, 6 Oct 2026, on a
                      room whose date came through as the 5th for a Friday the
                      9th). The pack's date is the one every certificate is
                      measured against, so it is changed here, plainly, and
                      can be changed again from the last screen. */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                    <dt className="w-full shrink-0 self-start pt-2.5 text-xs uppercase tracking-wide text-muted sm:w-32">
                      Move-in date
                    </dt>
                    <dd className="min-w-0 flex-1 text-sm">
                      {/* The OS's own calendar, the one the offer screens use,
                          rather than the browser's plain one (7 Oct 2026). */}
                      <div className="max-w-sm">
                        <DateField
                          value={moveIn}
                          onChange={setMoveIn}
                          placeholder="Choose the move-in date"
                          className="block h-10 w-full min-w-0 rounded-[12px] border border-line/80 bg-white px-3.5 text-[14px] outline-none focus:border-accent-dark"
                        />
                      </div>
                      {!prefill.moveInDate ? (
                        <span className="mt-1.5 block text-xs text-amber-700">Not on the application, so add it.</span>
                      ) : moveIn && moveIn !== prefill.moveInDate ? (
                        <span className="mt-1.5 block text-xs text-muted">
                          Changed from {prettyDate(prefill.moveInDate)}
                        </span>
                      ) : null}
                    </dd>
                  </div>
                  {/* Residential or HMO (James, 6 Oct 2026: "this property is an
                      HMO, and therefore it needs a PAT test"). Guessed from the
                      property; the agent has the last word. Two words and no
                      explanation underneath (7 Oct): agents know what an HMO
                      needs. */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                    <dt className="w-full shrink-0 text-xs uppercase tracking-wide text-muted sm:w-32">
                      Property type
                    </dt>
                    <dd className="flex min-w-0 flex-1 flex-wrap gap-2">
                      {([
                        ["home", "Residential"],
                        ["hmo", "HMO"],
                      ] as const).map(([v, label]) => (
                        <button
                          key={v}
                          type="button"
                          aria-pressed={letType === v}
                          onClick={() => setLetType(v)}
                          className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                            letType === v ? "border-ink bg-ink text-white" : "border-line hover:bg-box"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </dd>
                  </div>
                </dl>
                {prefill.warnings.length > 0 && (
                  <ul className="mt-4 space-y-1.5">
                    {prefill.warnings.map((w) => (
                      <li key={w} className="text-sm text-amber-700">
                        {w}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={startAndContinue}
                    disabled={busy || !letType}
                    title={!letType ? "Say whether this is a whole home or an HMO first" : undefined}
                    className={PRIMARY}
                  >
                    {busy ? "One moment…" : "Continue"}
                  </button>
                  {/* The people and the property are the application's, so a
                      wrong name is put right there. Opened in a new tab so the
                      pack in progress is not lost. */}
                  {!demo && (
                    <a
                      href={`/applications?open=${encodeURIComponent(prefill.applicationId)}`}
                      target="_blank"
                      rel="noreferrer"
                      className={SECONDARY}
                    >
                      Open the application
                    </a>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {(step === "landlord" || step === "tenant") && kase && (
          <div>
            <h1 className="text-2xl tracking-normal text-ink">
              {step === "landlord" ? "Landlord Documents" : "Tenant Documents"}
            </h1>
            {rexNote && step === "landlord" && (
              <p className={`mb-3 mt-2 text-xs ${rexNote.ok ? "text-emerald-700" : "text-amber-700"}`}>
                Move-in date {prettyDate(kase.moveInDate)}. {rexNote.note}
              </p>
            )}
            <PlcDocuments
              key={step}
              step={step}
              kase={kase}
              onChanged={setKase}
              context={{
                tenants: prefill?.tenants.map((t) => t.name) ?? [],
                landlord: prefill?.landlordName ?? null,
              }}
              focus={focus}
              demo={Boolean(demo)}
            />
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => go(step === "landlord" ? "details" : "landlord")} className={SECONDARY}>
                Back
              </button>
              <button
                type="button"
                onClick={() => {
                  setFocus(null);
                  go(step === "landlord" ? "tenant" : "review");
                }}
                className={PRIMARY}
              >
                Next
              </button>
              <span className="text-xs text-muted">
                Anything missing is shown on the last screen before it goes anywhere.
              </span>
            </div>
          </div>
        )}
        {step === "review" && kase && (() => {
          const gate = gateFor(kase);
          const blockers = kase.findings.filter((f) => f.level === "blocker");
          /* What the gate asks for on this let, plus anything optional the
             agent has filed anyway, so the list is the whole pack. */
          const gated = PLC_CHECKS.filter((c) => {
            const g = gateOf(c, kase.letType);
            return g === "required" || g === "conditional" || (g === "optional" && filedFor(c.id));
          });
          /* Send the agent to the screen that check lives on, scrolled to it. */
          const fill = (id: CheckId) => {
            setFocus(id);
            go(groupOf(id));
          };
          /* Read when it was dropped: anything that runs out before the move-in
             date, said here rather than by the scan after Send. */
          const runsOut = documents.filter(
            (d) => d.read?.expiryDate && kase.moveInDate && d.read.expiryDate < kase.moveInDate
          );
          return (
          <div>
            <h1 className="text-2xl tracking-normal text-ink">
              {gate.ready && blockers.length === 0 && rlpAnswered(kase) ? "Ready to Send" : "Not Ready to Send Yet"}
            </h1>
            <p className="mt-2 text-sm text-muted">
              {kase.address} · moving in {prettyDate(kase.moveInDate) ?? "date not set"} ·{" "}
              <button
                type="button"
                onClick={() => {
                  setReturnTo("review");
                  go("details");
                }}
                className="underline underline-offset-2 hover:text-ink"
              >
                change
              </button>
            </p>

            {error && (
              <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                {error}
              </p>
            )}

            {/* A pack that came back keeps what compliance wrote in view while
                it is being put right, instead of on a screen already left. */}
            {rexNote && (
              <p className={`mt-2 text-xs ${rexNote.ok ? "text-emerald-700" : "text-amber-700"}`}>{rexNote.note}</p>
            )}
            {kase.decidedAt && kase.decisionNote && (
              <div className="mt-4 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-900">
                <p className="font-medium">What compliance asked for</p>
                <p className="mt-0.5 whitespace-pre-wrap text-orange-800">{kase.decisionNote}</p>
              </div>
            )}

            {/* ── The £60 rule, said once ──
                A pack that reaches the check short of a document fails it,
                and the failed check is charged again. So the empty slot is
                caught here rather than there. */}
            {gate.blocked.length > 0 && (
              <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                Still needed:{" "}
                {gate.blocked.map((k, i) => (
                  <span key={k.id}>
                    {i > 0 && ", "}
                    <button type="button" onClick={() => fill(k.id)} className="underline underline-offset-2 hover:text-rose-950">
                      {k.label}
                    </button>
                  </span>
                ))}
                . A pack that reaches the check without them fails it, and the failed check is charged
                again.
              </p>
            )}
            {runsOut.length > 0 && (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                <p>These run out before the move-in date:</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5">
                  {runsOut.map((d) => (
                    <li key={d.key}>
                      <button type="button" onClick={() => fill(d.checkId)} className="text-left underline underline-offset-2">
                        {d.read?.what || d.name}
                      </button>{" "}
                      - valid until {prettyDate(d.read?.expiryDate ?? null)}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {blockers.length > 0 && (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                <p className="font-medium">The reader found things that would fail the check:</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5">
                  {blockers.map((f, i) => (
                    <li key={i}>{f.message}</li>
                  ))}
                </ul>
                <p className="mt-1 text-xs text-amber-800">Replace the document, or fix the move-in date if that is what is wrong.</p>
              </div>
            )}

            <ul className="mt-6 divide-y divide-neutral-100 rounded-xl border border-line">
              {gated.map((c) => {
                const has = filedFor(c.id);
                const waiver = waiverFor(kase, c.id);
                const count = documents.filter((d) => d.checkId === c.id).length;
                const g = gateOf(c, kase.letType);
                const needsWhy = !has && !waiver && g === "conditional";
                const blocked = !has && g === "required";
                return (
                  <li key={c.id} className="px-4 py-2.5 text-sm">
                    <div className="flex items-center gap-3">
                      {has ? (
                        <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden>
                          <path d="M3 8.5 L6.5 12 L13 4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      ) : waiver ? (
                        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-amber-400 text-[10px] text-amber-700">–</span>
                      ) : (
                        <span className={`h-4 w-4 shrink-0 rounded-full border ${blocked ? "border-rose-400" : "border-line"}`} />
                      )}
                      <button
                        type="button"
                        onClick={() => fill(c.id)}
                        className={`text-left underline-offset-2 hover:underline ${has ? "" : blocked ? "text-rose-800" : "text-muted"}`}
                      >
                        {c.label}
                      </button>
                      <span className="ml-auto text-xs text-muted">
                        {has ? (count === 0 ? "in the reference report" : count === 1 ? "1 file" : `${count} files`) : waiver ? "not needed" : blocked ? "needed" : "nothing attached"}
                      </span>
                      {!has && !waiver && (
                        <button type="button" onClick={() => fill(c.id)} className="text-xs underline underline-offset-2 hover:text-ink">
                          Add
                        </button>
                      )}
                    </div>
                    {waiver && !has && (
                      <p className="mt-1.5 flex items-start gap-2 pl-7 text-xs text-muted">
                        <span className="min-w-0">&ldquo;{waiver.reason}&rdquo;</span>
                        <button type="button" onClick={() => void waive(c.id, true)} className="shrink-0 underline hover:text-ink">
                          undo
                        </button>
                      </p>
                    )}
                    {needsWhy && (
                      <div className="mt-2 flex flex-wrap items-center gap-2 pl-7">
                        <input
                          value={why[c.id] ?? ""}
                          onChange={(e) => setWhy((w) => ({ ...w, [c.id]: e.target.value }))}
                          placeholder={
                            c.id === "gas-safety"
                              ? "Why not needed? e.g. No gas supply to the property"
                              : c.id === "guarantor-checks"
                                ? "Why not needed? e.g. No guarantor on this tenancy"
                                : c.id === "pat"
                                  ? "Why not needed? e.g. The landlord supplies no electrical appliances"
                                  : c.id === "fire-safety"
                                    ? "Why not needed? e.g. Booked for the 8th, will follow"
                                    : c.id === "alarms"
                                      ? "Why not needed? e.g. Tested at check-in, record to follow"
                                      : c.id === "emergency-lighting"
                                        ? "Why not needed? e.g. No emergency lighting fitted at the property"
                                        : c.id === "holding-deposit"
                                          ? "Why not needed? e.g. No holding deposit was taken"
                                          : "Why not needed? e.g. Council has no licensing scheme here"
                          }
                          className="min-w-0 flex-1 rounded-lg border border-line bg-white px-3 py-1.5 text-xs outline-none focus:border-ink"
                        />
                        <button
                          type="button"
                          onClick={() => void waive(c.id)}
                          disabled={(why[c.id] ?? "").trim().length < 8}
                          className="rounded-lg border border-line px-3 py-1.5 text-xs transition hover:bg-box disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Not needed
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 text-xs text-muted">
              Right to Rent is checked separately. The tenancy agreement is generated by compliance
              once this passes, so it is not asked for here. Press any line to add to it.
            </p>

            {documents.some((d) => d.placeholder) && (
              <p className="mt-3 text-xs text-amber-700">
                Some of these were recorded by name only, because file storage is not connected on
                this machine. Compliance will see that too.
              </p>
            )}

            {/* ── Rent and Legal Protection (James, 30 Sep 2026) ──
                Asked here because it used to be a tick on Propoly's PLC form.
                It is a request: compliance check the referencing qualifies
                before it goes to Legal for Landlords. */}
            <fieldset className="mt-6">
              <legend className="text-sm text-ink">Does the landlord want Rent and Legal Protection?</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {([true, false] as const).map((v) => (
                  <button
                    key={String(v)}
                    type="button"
                    onClick={() => void answerRlp(v)}
                    aria-pressed={kase.rlpWanted === v}
                    className={`rounded-lg border px-4 py-2 text-sm transition ${
                      kase.rlpWanted === v ? "border-ink bg-ink text-white" : "border-line hover:bg-box"
                    }`}
                  >
                    {v ? "Yes" : "No"}
                  </button>
                ))}
              </div>
              <span className="mt-1 block text-xs text-muted">
                {kase.rlpWanted === true
                  ? "Compliance request it once the pack is approved and the referencing qualifies."
                  : "Needed before the pack can go."}
              </span>
            </fieldset>

            {/* ── The note ──
                Optional, and the one place to tell compliance what the files
                cannot: a landlord abroad, a certificate booked for Tuesday.
                Saved when the box is left and again on Send. */}
            <label className="mt-6 block">
              <span className="text-sm text-ink">Anything compliance should know</span>
              <span className="ml-2 text-xs text-muted">optional</span>
              <textarea
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onBlur={() => {
                  void saveNote().catch((e: Error) => setError(e.message));
                }}
                placeholder="e.g. The landlord is abroad until the 20th, so anything needing a signature will take a couple of days."
                className="mt-1.5 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-ink"
              />
              <span className="mt-1 block text-xs text-muted">
                Goes with the pack, exactly as you write it.
              </span>
            </label>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={submit}
                disabled={!gate.ready || !rlpAnswered(kase)}
                title={
                  !gate.ready
                    ? "Attach what is needed, or say why it is not, first"
                    : !rlpAnswered(kase)
                      ? "Say whether the landlord wants Rent and Legal Protection first"
                      : undefined
                }
                className={PRIMARY}
              >
                Send to the compliance team
              </button>
              <button type="button" onClick={() => go("tenant")} className={SECONDARY}>
                Back
              </button>
            </div>
          </div>
          );
        })()}

        {step === "sending" && (
          <div className="py-20 text-center">
            <span className="plc-spinner mx-auto block h-12 w-12 rounded-full border-2 border-line border-t-neutral-900" />
            <p className="mt-6 text-lg text-ink">
              Reading the pack and sending it over
              <Ellipsis />
            </p>
            <p className="mt-2 text-sm text-muted">Each document is read for its dates first. A minute, usually.</p>
          </div>
        )}

        {/* ── A pack that already exists ──
            Reached when the application already has a pack that is not the
            agent's to change: sent, sent back, approved or declined. The copy
            matches the agent guide (lib/agent-guides, agent-plc). */}
        {step === "returned" && kase && (
          <div>
            {kase.state === "deferred" ? (
              <>
                <h1 className="text-2xl tracking-normal text-ink">Compliance Sent This Back</h1>
                <p className="mt-2 text-sm text-muted">{kase.address}</p>
                <div className="mt-6 rounded-xl border border-orange-200 bg-orange-50 p-4">
                  <p className="whitespace-pre-wrap text-sm text-orange-900">
                    {kase.decisionNote || "No reason was written. Ask compliance what they need."}
                  </p>
                  <p className="mt-2 text-xs text-orange-700">
                    {kase.decidedBy} · {prettyWhen(kase.decidedAt)}
                  </p>
                </div>
                <p className="mt-4 text-sm text-muted">
                  Reopen it to put right what they asked for, then send it again. It goes back into
                  their queue.
                </p>
              </>
            ) : kase.state === "approved" ? (
              <>
                <h1 className="text-2xl tracking-normal text-ink">This Pack Is Approved</h1>
                <p className="mt-2 text-sm text-muted">{kase.address}</p>
                <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                  <p>
                    Approved by {kase.decidedBy} · {prettyWhen(kase.decidedAt)}
                  </p>
                  {kase.decisionNote && <p className="mt-1 text-emerald-800">{kase.decisionNote}</p>}
                </div>
                <p className="mt-4 text-sm text-muted">
                  Next: finish the deal in Propoly. Open the application and use its link to the deal.
                </p>
              </>
            ) : kase.state === "declined" ? (
              <>
                <h1 className="text-2xl tracking-normal text-ink">This Pack Was Declined</h1>
                <p className="mt-2 text-sm text-muted">{kase.address}</p>
                <div className="mt-6 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
                  <p>
                    Declined by {kase.decidedBy} · {prettyWhen(kase.decidedAt)}
                  </p>
                  {kase.decisionNote && <p className="mt-1 text-rose-800">{kase.decisionNote}</p>}
                </div>
              </>
            ) : (
              <>
                <h1 className="text-2xl tracking-normal text-ink">This Is With the Compliance Team</h1>
                <p className="mt-2 text-sm text-muted">{kase.address}</p>
                <p className="mt-6 text-sm text-muted">
                  Sent {prettyWhen(kase.submittedAt)}. They usually come back within 48 hours, and the
                  pack stays locked until they do.
                </p>
              </>
            )}

            {error && (
              <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                {error}
              </p>
            )}

            <div className="mt-8 flex flex-wrap items-center gap-3">
              {kase.state === "deferred" && (
                <button
                  type="button"
                  onClick={reopen}
                  disabled={busy}
                  className={PRIMARY}
                >
                  {busy ? "One moment…" : "Reopen and fix it"}
                </button>
              )}
              {demo ? (
                kase.state === "deferred" ? null : (kase.state === "submitted" ||
                  kase.state === "scanning" ||
                  kase.state === "reviewing" ||
                  kase.state === "checked") && demo.onSeeCompliance ? (
                  <button
                    type="button"
                    onClick={demo.onSeeCompliance}
                    className="rounded-lg border border-ink bg-ink px-4 py-2.5 text-sm text-white"
                  >
                    See what compliance sees
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={demo.onRestart}
                    className="rounded-lg border border-line px-4 py-2.5 text-sm"
                  >
                    Run it again
                  </button>
                )
              ) : (
                <>
                  {kase.state === "approved" && prefill && (
                    <button
                      type="button"
                      onClick={() => router.push(`/applications?open=${prefill.applicationId}`)}
                      className="rounded-lg border border-ink bg-ink px-4 py-2.5 text-sm text-white"
                    >
                      Open the application
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => router.push("/applications")}
                    className="rounded-lg border border-line px-4 py-2.5 text-sm transition hover:bg-box"
                  >
                    Back to applications
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {step === "done" && kase && (
          <div className="py-16 text-center">
            <div className="flex justify-center">
              <DoneTick size={72} />
            </div>
            <h1 className="mt-6 text-2xl tracking-normal text-ink">
              That Is With the Compliance Team
            </h1>
            <p className="mx-auto mt-3 max-w-md text-sm text-muted">
              They usually come back within 48 hours. You will get it back with a decision, and if
              anything is missing they will say exactly what.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              {demo ? (
                <>
                  <button
                    type="button"
                    onClick={demo.onSeeCompliance}
                    className="rounded-lg border border-ink bg-ink px-4 py-2.5 text-sm text-white"
                  >
                    See what compliance sees
                  </button>
                  <button
                    type="button"
                    onClick={demo.onRestart}
                    className="rounded-lg border border-line px-4 py-2.5 text-sm"
                  >
                    Run it again
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => router.push("/applications")}
                    className="rounded-lg border border-ink bg-ink px-4 py-2.5 text-sm text-white"
                  >
                    Back to applications
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push(`/plc?case=${kase.id}`)}
                    className="rounded-lg border border-line px-4 py-2.5 text-sm"
                  >
                    See where it is up to
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
