"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import DoodleIcon from "@/components/DoodleIcon";
import { DoneTick } from "@/components/Bits";
import {
  CHECK_GROUPS,
  guessCheck,
  PLC_CHECKS,
  type CheckId,
  type PlcCase,
  type PlcDocument,
} from "@/lib/plc";
import type { Prefill } from "@/lib/plc-prefill";

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
 */

/* ─────────────────────────────── plumbing ─────────────────────────────── */

type Step = "gathering" | "details" | "landlord" | "tenant" | "review" | "sending" | "done";

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

/* ─────────────────────────────── drop zone ─────────────────────────────── */

type Pending = {
  id: string;
  file: File;
  checkId: CheckId | null;
  state: "waiting" | "sending" | "done" | "failed";
  error?: string;
  placeholder?: boolean;
};

/**
 * The whole window is the target.
 *
 * The dotted box is where the eye goes, but an agent dragging four files off
 * a desktop aims roughly, and a drop that lands two pixels outside a box and
 * silently does nothing is the most annoying possible failure. So the listener
 * is on the window and the box is a label for it.
 */
function useWindowDrop(onFiles: (files: File[]) => void, active: boolean) {
  const [over, setOver] = useState(false);
  const depth = useRef(0);

  useEffect(() => {
    if (!active) return;
    const enter = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes("Files")) return;
      depth.current += 1;
      setOver(true);
    };
    /* Counted rather than toggled: dragging across a child element fires a
       leave on the parent, and a boolean flickers the whole page. */
    const leave = () => {
      depth.current = Math.max(0, depth.current - 1);
      if (!depth.current) setOver(false);
    };
    const over_ = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("Files")) e.preventDefault();
    };
    const drop = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes("Files")) return;
      e.preventDefault();
      depth.current = 0;
      setOver(false);
      const files = Array.from(e.dataTransfer.files ?? []);
      if (files.length) onFiles(files);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over_);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", over_);
      window.removeEventListener("drop", drop);
    };
  }, [onFiles, active]);

  return over;
}

function DocumentStep({
  group,
  caseId,
  documents,
  onChanged,
  illustration,
}: {
  group: (typeof CHECK_GROUPS)[number];
  caseId: string;
  documents: PlcDocument[];
  onChanged: (c: PlcCase) => void;
  illustration: string;
}) {
  const [pending, setPending] = useState<Pending[]>([]);
  const input = useRef<HTMLInputElement | null>(null);
  /** Set while an attach is in flight — see the effect below. */
  const inFlight = useRef(false);
  const checks = PLC_CHECKS.filter((c) => group.checks.includes(c.id));

  const take = useCallback(
    (files: File[]) => {
      setPending((p) => [
        ...p,
        ...files.map((file, i) => ({
          id: `${file.name}-${p.length + i}`,
          file,
          checkId: guessCheck(file.name, group.checks),
          state: "waiting" as const,
        })),
      ]);
    },
    [group.checks]
  );

  const over = useWindowDrop(take, true);

  const send = async (row: Pending) => {
    if (!row.checkId) return;
    inFlight.current = true;
    setPending((p) => p.map((x) => (x.id === row.id ? { ...x, state: "sending" } : x)));
    try {
      let key: string;
      let name = row.file.name;
      let placeholder = false;

      const form = new FormData();
      form.append("file", row.file);
      form.append("scope", "document");
      form.append("ref", caseId);
      const up = await fetch("/api/r2/upload", { method: "POST", body: form });
      const stored = await up.json().catch(() => ({}));

      if (up.ok && stored.ok) {
        key = stored.key;
        name = stored.name;
      } else if (up.status === 503) {
        /* No bucket on this environment. Recorded by name so the walkthrough
           can finish, and flagged all the way down so nothing ever shows it
           as a document on file. */
        key = `documents/${caseId}/${row.file.name.replace(/[^\w.\- ]+/g, "")}`;
        placeholder = true;
      } else {
        throw new Error(stored.error ?? "The upload failed.");
      }

      const res = await api<{ case: PlcCase }>(`/api/plc/${caseId}/documents`, {
        method: "POST",
        body: JSON.stringify({ checkId: row.checkId, name, key, placeholder }),
      });
      onChanged(res.case);
      setPending((p) => p.map((x) => (x.id === row.id ? { ...x, state: "done", placeholder } : x)));
    } catch (e) {
      setPending((p) =>
        p.map((x) => (x.id === row.id ? { ...x, state: "failed", error: (e as Error).message } : x))
      );
    } finally {
      /* Cleared before the state update above settles, so the effect picks up
         the next waiting file on the very next render rather than stalling. */
      inFlight.current = false;
    }
  };

  /* Anything with a check against it goes up on its own. The agent only has to
     touch the ones we guessed wrong, or could not guess at all.

     ONE AT A TIME, and the lock is the whole reason this works. Each attach
     returns the case as it stood when that request was served, so five in
     flight together means the last response to land overwrites the other
     four — which showed up as a tick list where only one of five dropped
     files had registered. Serialising makes every response the newest one. */
  useEffect(() => {
    if (inFlight.current) return;
    const next = pending.find((p) => p.state === "waiting" && p.checkId);
    if (next) void send(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  const unsure = pending.filter((p) => p.state === "waiting" && !p.checkId);

  return (
    <div>
      <p className="text-sm text-neutral-500">{group.blurb}</p>

      <div
        role="button"
        tabIndex={0}
        onClick={() => input.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
        className={`relative mt-5 flex min-h-[15rem] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition ${
          over
            ? "border-neutral-900 bg-neutral-50 dark:border-white dark:bg-neutral-900"
            : "border-neutral-300 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
        }`}
      >
        <DoodleIcon
          name={illustration}
          size={104}
          className="pointer-events-none absolute text-neutral-900 opacity-[0.06] dark:text-white"
        />
        <p className="relative text-base text-neutral-900 dark:text-neutral-100">
          {over ? "Let go" : "Drop the documents here"}
        </p>
        <p className="relative mt-1 text-sm text-neutral-500">
          Anywhere on the page works. Or click to choose them.
        </p>
        <input
          ref={input}
          type="file"
          multiple
          accept="application/pdf,image/*"
          className="hidden"
          onChange={(e) => {
            take(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
      </div>

      {unsure.length > 0 && (
        <p className="mt-4 text-sm text-amber-700 dark:text-amber-300">
          {unsure.length === 1 ? "One file" : `${unsure.length} files`} we could not place. Pick the
          check each one belongs to.
        </p>
      )}

      {pending.length > 0 && (
        <ul className="mt-4 space-y-2">
          {pending.map((p) => (
            <li
              key={p.id}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800"
            >
              <span className="min-w-0 flex-1 truncate">{p.file.name}</span>
              {p.state === "waiting" && (
                <select
                  value={p.checkId ?? ""}
                  onChange={(e) =>
                    setPending((all) =>
                      all.map((x) =>
                        x.id === p.id ? { ...x, checkId: (e.target.value || null) as CheckId | null } : x
                      )
                    )
                  }
                  className="rounded-lg border border-neutral-300 bg-transparent px-2 py-1 text-sm dark:border-neutral-700"
                >
                  <option value="">Which check?</option>
                  {checks.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              )}
              {p.state === "sending" && <span className="text-neutral-500">Filing…</span>}
              {p.state === "done" && (
                <span className="text-emerald-700 dark:text-emerald-300">
                  {p.placeholder ? "Recorded by name only" : "Filed"}
                </span>
              )}
              {p.state === "failed" && (
                <span className="text-rose-700 dark:text-rose-300">{p.error}</span>
              )}
            </li>
          ))}
        </ul>
      )}

      <ul className="mt-6 space-y-1.5">
        {checks.map((c) => {
          const filed = documents.filter((d) => d.checkId === c.id);
          return (
            <li key={c.id} className="flex items-baseline gap-2 text-sm">
              <span
                className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                  filed.length ? "bg-emerald-500" : "bg-neutral-300 dark:bg-neutral-700"
                }`}
              />
              <span className={filed.length ? "" : "text-neutral-500"}>{c.label}</span>
              <span className="min-w-0 truncate text-xs text-neutral-400">
                {filed.length ? filed.map((f) => f.name).join(", ") : c.needs}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ──────────────────────────────── the wizard ───────────────────────────── */

export default function PlcWizard({
  applicationId,
  listingId,
}: {
  applicationId?: string;
  listingId?: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("gathering");
  const [leaving, setLeaving] = useState(false);
  const [prefill, setPrefill] = useState<Prefill | null>(null);
  const [kase, setKase] = useState<PlcCase | null>(null);
  const [moveIn, setMoveIn] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fixing, setFixing] = useState(false);

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
      try {
        const res = await api<{ prefill: Prefill }>(`/api/plc/prefill?${params}`);
        got = res.prefill;
      } catch (e) {
        failed = (e as Error).message;
      }
      /* The floor, never a ceiling: a read that took longer than the theatre
         has already told the agent something is happening. */
      const wait = Math.max(0, THEATRE_MS - (Date.now() - started));
      window.setTimeout(() => {
        if (!alive) return;
        setPrefill(got);
        setMoveIn(got?.moveInDate ?? "");
        setError(failed);
        go("details");
      }, wait);
    })();

    return () => {
      alive = false;
    };
  }, [applicationId, listingId, go]);

  const startAndContinue = async () => {
    if (!prefill) return;
    setBusy(true);
    setError(null);
    try {
      const made = await api<{ case: PlcCase }>("/api/plc", {
        method: "POST",
        body: JSON.stringify({
          applicationRef: prefill.applicationRef,
          address: prefill.address,
          moveInDate: moveIn || null,
        }),
      });
      let current = made.case;
      /* createCase is idempotent on the application, so re-entering the wizard
         returns the pack already started. It deliberately does not overwrite
         anything - which means a move-in date corrected on this screen has to
         be written separately. */
      if (moveIn && current.moveInDate !== moveIn) {
        const patched = await api<{ case: PlcCase }>(`/api/plc/${current.id}`, {
          method: "PATCH",
          body: JSON.stringify({ moveInDate: moveIn }),
        });
        current = patched.case;
      }
      setKase(current);
      go("landlord");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!kase) return;
    go("sending");
    setError(null);
    try {
      const res = await api<{ case: PlcCase }>(`/api/plc/${kase.id}`, {
        method: "POST",
        body: JSON.stringify({ action: "submit", force: true }),
      });
      setKase(res.case);
      /* A beat on the spinner before the tick, because a state change with no
         duration reads as nothing having happened. */
      window.setTimeout(() => setStep("done"), 1400);
    } catch (e) {
      setError((e as Error).message);
      go("review");
    }
  };

  const documents = kase?.documents ?? [];
  const filedFor = (id: CheckId) => documents.some((d) => d.checkId === id);
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
                i <= stepNumber - 1 ? "bg-neutral-900 dark:bg-white" : "bg-neutral-200 dark:bg-neutral-800"
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
              className="mx-auto text-neutral-900 opacity-70 dark:text-white"
            />
            <h1 className="mt-6 text-2xl tracking-normal text-neutral-900 dark:text-neutral-100">
              Getting all the details ready
              <Ellipsis />
            </h1>
            <p className="mx-auto mt-3 max-w-md text-sm text-neutral-500">
              Reading the application so you do not have to type any of it again.
            </p>
          </div>
        )}

        {step === "details" && (
          <div>
            <h1 className="text-2xl tracking-normal text-neutral-900 dark:text-neutral-100">
              Check These Over
            </h1>
            <p className="mt-2 text-sm text-neutral-500">
              Pulled through from the application. If any of it is wrong, fix it on the file first.
            </p>

            {error && (
              <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200">
                {error}
              </p>
            )}

            {prefill && (
              <>
                <dl className="mt-6 divide-y divide-neutral-100 rounded-xl border border-neutral-200 dark:divide-neutral-900 dark:border-neutral-800">
                  <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-3">
                    <dt className="w-32 shrink-0 text-xs uppercase tracking-wide text-neutral-500">
                      Property
                    </dt>
                    <dd className="min-w-0 flex-1 text-sm">{prefill.address}</dd>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-3">
                    <dt className="w-32 shrink-0 text-xs uppercase tracking-wide text-neutral-500">
                      {prefill.tenants.length > 1 ? "Tenants" : "Tenant"}
                    </dt>
                    <dd className="min-w-0 flex-1 text-sm">
                      {prefill.tenants.length
                        ? prefill.tenants.map((t) => t.name).join(", ")
                        : "Nobody recorded"}
                    </dd>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-3">
                    <dt className="w-32 shrink-0 text-xs uppercase tracking-wide text-neutral-500">
                      Move-in date
                    </dt>
                    <dd className="min-w-0 flex-1 text-sm">
                      <input
                        type="date"
                        value={moveIn}
                        onChange={(e) => setMoveIn(e.target.value)}
                        className="rounded-lg border border-neutral-300 bg-transparent px-2 py-1 text-sm dark:border-neutral-700"
                      />
                      {!prefill.moveInDate && (
                        <span className="ml-2 text-xs text-amber-700 dark:text-amber-300">
                          not on the application
                        </span>
                      )}
                    </dd>
                  </div>
                </dl>

                {prefill.warnings.length > 0 && (
                  <ul className="mt-4 space-y-1.5">
                    {prefill.warnings.map((w) => (
                      <li key={w} className="text-sm text-amber-700 dark:text-amber-300">
                        {w}
                      </li>
                    ))}
                  </ul>
                )}

                {fixing ? (
                  <div className="mt-6 rounded-xl border border-neutral-200 p-4 text-sm dark:border-neutral-800">
                    <p className="text-neutral-900 dark:text-neutral-100">
                      Fix it on the application, then come back
                    </p>
                    <p className="mt-1 text-neutral-500">
                      The property, the people and the dates all live on the application record.
                      Changing them here would only change them here, and compliance would get the
                      old ones.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => router.push(`/applications?open=${prefill.applicationId}`)}
                        className="rounded-lg border border-neutral-900 bg-neutral-900 px-3.5 py-2 text-sm text-white dark:border-white dark:bg-white dark:text-neutral-900"
                      >
                        Open the application
                      </button>
                      <button
                        type="button"
                        onClick={() => setFixing(false)}
                        className="rounded-lg border border-neutral-300 px-3.5 py-2 text-sm dark:border-neutral-700"
                      >
                        Never mind, it is fine
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-8 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={startAndContinue}
                      disabled={busy}
                      className="rounded-lg border border-neutral-900 bg-neutral-900 px-4 py-2.5 text-sm text-white transition hover:bg-neutral-800 disabled:opacity-40 dark:border-white dark:bg-white dark:text-neutral-900"
                    >
                      {busy ? "One moment…" : "Continue"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setFixing(true)}
                      className="rounded-lg border border-neutral-300 px-4 py-2.5 text-sm transition hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
                    >
                      Something is not right
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {(step === "landlord" || step === "tenant") && kase && (
          <div>
            <h1 className="text-2xl tracking-normal text-neutral-900 dark:text-neutral-100">
              {step === "landlord" ? "Landlord Submission Documents" : "Tenant and Tenancy"}
            </h1>
            <DocumentStep
              group={CHECK_GROUPS.find((g) => g.id === step)!}
              caseId={kase.id}
              documents={documents}
              onChanged={setKase}
              illustration={step === "landlord" ? "home" : "file-contract"}
            />
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => go(step === "landlord" ? "tenant" : "review")}
                className="rounded-lg border border-neutral-900 bg-neutral-900 px-4 py-2.5 text-sm text-white transition hover:bg-neutral-800 dark:border-white dark:bg-white dark:text-neutral-900"
              >
                Next
              </button>
              <span className="text-xs text-neutral-500">
                You can send what you have and add the rest later.
              </span>
            </div>
          </div>
        )}

        {step === "review" && kase && (
          <div>
            <h1 className="text-2xl tracking-normal text-neutral-900 dark:text-neutral-100">
              Ready to Send
            </h1>
            <p className="mt-2 text-sm text-neutral-500">
              {kase.address} · moving in {prettyDate(kase.moveInDate) ?? "date not set"}
            </p>

            {error && (
              <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200">
                {error}
              </p>
            )}

            <ul className="mt-6 divide-y divide-neutral-100 rounded-xl border border-neutral-200 dark:divide-neutral-900 dark:border-neutral-800">
              {PLC_CHECKS.map((c) => {
                const has = filedFor(c.id);
                return (
                  <li key={c.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    {has ? (
                      <svg
                        viewBox="0 0 16 16"
                        className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400"
                        aria-hidden
                      >
                        <path
                          d="M3 8.5 L6.5 12 L13 4.5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ) : (
                      <span className="h-4 w-4 shrink-0 rounded-full border border-neutral-300 dark:border-neutral-700" />
                    )}
                    <span className={has ? "" : "text-neutral-500"}>{c.label}</span>
                    <span className="ml-auto text-xs text-neutral-400">
                      {has
                        ? documents.filter((d) => d.checkId === c.id).length === 1
                          ? "1 file"
                          : `${documents.filter((d) => d.checkId === c.id).length} files`
                        : "nothing attached"}
                    </span>
                  </li>
                );
              })}
            </ul>

            {documents.some((d) => d.placeholder) && (
              <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">
                Some of these were recorded by name only, because file storage is not connected on
                this machine. Compliance will see that too.
              </p>
            )}

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={submit}
                className="rounded-lg border border-neutral-900 bg-neutral-900 px-4 py-2.5 text-sm text-white transition hover:bg-neutral-800 dark:border-white dark:bg-white dark:text-neutral-900"
              >
                Send to the compliance team
              </button>
              <button
                type="button"
                onClick={() => go("landlord")}
                className="rounded-lg border border-neutral-300 px-4 py-2.5 text-sm transition hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
              >
                Add something else
              </button>
            </div>
          </div>
        )}

        {step === "sending" && (
          <div className="py-20 text-center">
            <span className="plc-spinner mx-auto block h-12 w-12 rounded-full border-2 border-neutral-200 border-t-neutral-900 dark:border-neutral-800 dark:border-t-white" />
            <p className="mt-6 text-lg text-neutral-900 dark:text-neutral-100">
              Sending it over
              <Ellipsis />
            </p>
          </div>
        )}

        {step === "done" && kase && (
          <div className="py-16 text-center">
            <div className="flex justify-center">
              <DoneTick size={72} />
            </div>
            <h1 className="mt-6 text-2xl tracking-normal text-neutral-900 dark:text-neutral-100">
              That Is With the Compliance Team
            </h1>
            <p className="mx-auto mt-3 max-w-md text-sm text-neutral-500">
              They usually come back within 48 hours. You will get it back with a decision, and if
              anything is missing they will say exactly what.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={() => router.push("/applications")}
                className="rounded-lg border border-neutral-900 bg-neutral-900 px-4 py-2.5 text-sm text-white dark:border-white dark:bg-white dark:text-neutral-900"
              >
                Back to applications
              </button>
              <button
                type="button"
                onClick={() => router.push(`/plc?case=${kase.id}`)}
                className="rounded-lg border border-neutral-300 px-4 py-2.5 text-sm dark:border-neutral-700"
              >
                See where it is up to
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
