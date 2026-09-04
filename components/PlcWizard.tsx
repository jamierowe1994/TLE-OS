"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import DoodleIcon from "@/components/DoodleIcon";
import { DoneTick } from "@/components/Bits";
import {
  CHECK_GROUPS,
  guessCheck,
  PLC_CHECKS,
  gateFor,
  waiverFor,
  type CheckId,
  type PlcCase,
  type PlcDocument,
} from "@/lib/plc";
import type { Prefill } from "@/lib/plc-prefill";
import { demoCase } from "@/lib/plc-demo";

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
  demo,
}: {
  group: (typeof CHECK_GROUPS)[number];
  caseId: string;
  documents: PlcDocument[];
  onChanged: (c: PlcCase) => void;
  illustration: string;
  /** Attach for show: nothing is uploaded and nothing is recorded. */
  demo?: { case: PlcCase };
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

      if (demo) {
        /* Recorded by name only, and flagged a placeholder - the same shape
           the 503 branch below produces on an environment with no bucket, so
           nothing downstream can mistake it for a document on file. The
           bytes never leave the browser. */
        const doc: PlcDocument = {
          checkId: row.checkId,
          name,
          key: `documents/sample/${name.replace(/[^\w.\- ]+/g, "")}`,
          url: "#",
          addedAt: new Date().toISOString(),
          addedBy: demo.case.agentName,
          placeholder: true,
        };
        onChanged({ ...demo.case, documents: [...demo.case.documents, doc] });
        setPending((p) => p.map((x) => (x.id === row.id ? { ...x, state: "done", placeholder: true } : x)));
        inFlight.current = false;
        return;
      }

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
      <p className="text-sm text-muted">{group.blurb}</p>

      <div
        role="button"
        tabIndex={0}
        onClick={() => input.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
        className={`relative mt-5 flex min-h-[15rem] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition ${
          over
            ? "border-ink bg-box"
            : "border-line hover:bg-box"
        }`}
      >
        <DoodleIcon
          name={illustration}
          size={104}
          className="pointer-events-none absolute text-ink opacity-[0.06]"
        />
        <p className="relative text-base text-ink">
          {over ? "Let go" : "Drop the documents here"}
        </p>
        <p className="relative mt-1 text-sm text-muted">
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
        <p className="mt-4 text-sm text-amber-700">
          {unsure.length === 1 ? "One file" : `${unsure.length} files`} we could not place. Pick the
          check each one belongs to.
        </p>
      )}

      {pending.length > 0 && (
        <ul className="mt-4 space-y-2">
          {pending.map((p) => (
            <li
              key={p.id}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-line px-3 py-2 text-sm"
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
                  className="rounded-lg border border-line bg-transparent px-2 py-1 text-sm"
                >
                  <option value="">Which check?</option>
                  {checks.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              )}
              {p.state === "sending" && <span className="text-muted">Filing…</span>}
              {p.state === "done" && (
                <span className="text-emerald-700">
                  {p.placeholder ? "Recorded by name only" : "Filed"}
                </span>
              )}
              {p.state === "failed" && (
                <span className="text-rose-700">{p.error}</span>
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
                  filed.length ? "bg-emerald-500" : "bg-neutral-300"
                }`}
              />
              <span className={filed.length ? "" : "text-muted"}>{c.label}</span>
              <span className="min-w-0 truncate text-xs text-muted">
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
  };
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("gathering");
  const [leaving, setLeaving] = useState(false);
  const [prefill, setPrefill] = useState<Prefill | null>(null);
  const [kase, setKase] = useState<PlcCase | null>(null);
  const [moveIn, setMoveIn] = useState("");
  const [error, setError] = useState<string | null>(null);
  /** The reason typed against a conditional check, before it is sent. */
  const [why, setWhy] = useState<Record<string, string>>({});
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
      if (demo) {
        /* The theatre below still runs. It is not decoration: the pause is
           what makes "we went and got this for you" legible, and skipping it
           in the preview would show a faster product than the real one. */
        got = demo.prefill;
      } else {
        try {
          const res = await api<{ prefill: Prefill }>(`/api/plc/prefill?${params}`);
          got = res.prefill;
        } catch (e) {
          failed = (e as Error).message;
        }
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
  }, [applicationId, listingId, go, demo]);

  const startAndContinue = async () => {
    if (!prefill) return;
    if (demo) {
      /* No case is created. The pack lives in this component's state for as
         long as the tab is open and then it is gone. */
      setKase(demoCase({ moveInDate: moveIn || null, documents: [] }));
      go("landlord");
      return;
    }
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
    if (demo) {
      setKase({ ...kase, state: "submitted", submittedAt: new Date().toISOString() });
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
              Pulled through from the application. If any of it is wrong, fix it on the file first.
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
                    <dt className="w-32 shrink-0 text-xs uppercase tracking-wide text-muted">
                      Property
                    </dt>
                    <dd className="min-w-0 flex-1 text-sm">{prefill.address}</dd>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-3">
                    <dt className="w-32 shrink-0 text-xs uppercase tracking-wide text-muted">
                      {prefill.tenants.length > 1 ? "Tenants" : "Tenant"}
                    </dt>
                    <dd className="min-w-0 flex-1 text-sm">
                      {prefill.tenants.length
                        ? prefill.tenants.map((t) => t.name).join(", ")
                        : "Nobody recorded"}
                    </dd>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-3">
                    <dt className="w-32 shrink-0 text-xs uppercase tracking-wide text-muted">
                      Move-in date
                    </dt>
                    <dd className="min-w-0 flex-1 text-sm">
                      <input
                        type="date"
                        value={moveIn}
                        onChange={(e) => setMoveIn(e.target.value)}
                        className="rounded-lg border border-line bg-transparent px-2 py-1 text-sm"
                      />
                      {!prefill.moveInDate && (
                        <span className="ml-2 text-xs text-amber-700">
                          not on the application
                        </span>
                      )}
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

                {fixing ? (
                  <div className="mt-6 rounded-xl border border-line p-4 text-sm">
                    <p className="text-ink">
                      Fix it on the application, then come back
                    </p>
                    <p className="mt-1 text-muted">
                      The property, the people and the dates all live on the application record.
                      Changing them here would only change them here, and compliance would get the
                      old ones.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-3">
                      {/* Also a door out of the preview, so it is closed
                          there. The sentence above still makes the point
                          that the fix belongs on the application record. */}
                      {!demo && (
                        <button
                          type="button"
                          onClick={() => router.push(`/applications?open=${prefill.applicationId}`)}
                          className="rounded-lg border border-ink bg-ink px-3.5 py-2 text-sm text-white"
                        >
                          Open the application
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setFixing(false)}
                        className="rounded-lg border border-line px-3.5 py-2 text-sm"
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
                      className="rounded-lg border border-ink bg-ink px-4 py-2.5 text-sm text-white transition hover:bg-box disabled:opacity-40"
                    >
                      {busy ? "One moment…" : "Continue"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setFixing(true)}
                      className="rounded-lg border border-line px-4 py-2.5 text-sm transition hover:bg-box"
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
            <h1 className="text-2xl tracking-normal text-ink">
              {step === "landlord" ? "Landlord Submission Documents" : "Tenant and Tenancy"}
            </h1>
            <DocumentStep
              group={CHECK_GROUPS.find((g) => g.id === step)!}
              caseId={kase.id}
              documents={documents}
              onChanged={setKase}
              illustration={step === "landlord" ? "home" : "file-contract"}
              demo={demo ? { case: kase } : undefined}
            />
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => go(step === "landlord" ? "tenant" : "review")}
                className="rounded-lg border border-ink bg-ink px-4 py-2.5 text-sm text-white transition hover:bg-box"
              >
                Next
              </button>
              <span className="text-xs text-muted">
                Anything missing is shown on the next screen before it goes anywhere.
              </span>
            </div>
          </div>
        )}

        {step === "review" && kase && (() => {
          const gate = gateFor(kase);
          const blockers = kase.findings.filter((f) => f.level === "blocker");
          const gated = PLC_CHECKS.filter((c) => c.gate === "required" || c.gate === "conditional");
          return (
          <div>
            <h1 className="text-2xl tracking-normal text-ink">
              {gate.ready && blockers.length === 0 ? "Ready to Send" : "Not Ready to Send Yet"}
            </h1>
            <p className="mt-2 text-sm text-muted">
              {kase.address} · moving in {prettyDate(kase.moveInDate) ?? "date not set"}
            </p>

            {error && (
              <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                {error}
              </p>
            )}

            {/* ── The £60 rule, said once ──
                A pack that reaches the check short of a document fails it,
                and the failed check is charged again. So the empty slot is
                caught here rather than there. */}
            {gate.blocked.length > 0 && (
              <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                Every let needs {gate.blocked.map((k) => k.label).join(", ")}. A pack that reaches the
                check without them fails it and the failed check is charged again, so it cannot go until
                they are attached.
              </p>
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
                const needsWhy = !has && !waiver && c.gate === "conditional";
                const blocked = !has && c.gate === "required";
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
                      <span className={has ? "" : blocked ? "text-rose-800" : "text-muted"}>{c.label}</span>
                      <span className="ml-auto text-xs text-muted">
                        {has ? (count === 1 ? "1 file" : `${count} files`) : waiver ? "not needed" : blocked ? "needed" : "nothing attached"}
                      </span>
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
              once this passes, so it is not asked for here.
            </p>

            {documents.some((d) => d.placeholder) && (
              <p className="mt-3 text-xs text-amber-700">
                Some of these were recorded by name only, because file storage is not connected on
                this machine. Compliance will see that too.
              </p>
            )}

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={submit}
                disabled={!gate.ready}
                title={gate.ready ? undefined : "Attach what is needed, or say why it is not, first"}
                className="rounded-lg border border-ink bg-ink px-4 py-2.5 text-sm text-white transition hover:bg-box disabled:cursor-not-allowed disabled:opacity-40"
              >
                Send to the compliance team
              </button>
              <button
                type="button"
                onClick={() => go("landlord")}
                className="rounded-lg border border-line px-4 py-2.5 text-sm transition hover:bg-box"
              >
                Add something else
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
