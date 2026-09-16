"use client";

import { useCallback, useMemo, useState } from "react";
import { missingDocuments, noteAsSent, PLC_CHECKS, scanSummary, type PlcCase } from "@/lib/plc";
import type { Loaded } from "@/components/PlcReview";
import { DEMO_FINDINGS, DEMO_SUBMITTED, DEMO_SUMMARY } from "@/lib/plc-demo";

/**
 * The PLC handover with the network taken out, so it can be walked.
 *
 * This is the state machine that used to live inside /preview/<token>/plc:
 * one invented case, and the four actions the compliance panel sends to the
 * API answered locally. It moved out here the day a second screen needed it -
 * the practice runs in Knowledge - because two copies of "what Approve does
 * when nothing is real" is two copies that drift, and the one that drifts is
 * always the one nobody is looking at.
 *
 * ── The guarantee ─────────────────────────────────────────────────────────
 *
 * NOTHING HERE TOUCHES ANYTHING. No case is created, no document is uploaded,
 * no decision is recorded, no email leaves, and the PLC API is never called.
 * The screens are the real ones; only the answers are invented. That is what
 * makes it safe to hand to somebody on their first morning and tell them to
 * press every button on it.
 *
 * ── Why the real components and not a mock-up ─────────────────────────────
 *
 * A practice run against a drawing of the screen teaches the drawing. When
 * the screen changes next month the drawing does not, and the person who
 * practised arrives at a page they have never seen. `PlcWizard` and
 * `ComplianceSide` take a narrow demo seam for exactly this reason, so the
 * rehearsal follows the product wherever it goes.
 */

/** The scan, as a beat rather than an API call. */
export const SCAN_MS = 1500;

export type Side = "agent" | "compliance";

export interface PlcSandbox {
  /** Which half of the handover is on screen. */
  side: Side;
  setSide: (s: Side) => void;
  /** The invented case, wherever the walk has got it to. */
  kase: PlcCase;
  /** True while the scan's beat is running. */
  scanning: boolean;
  /** What the compliance panel needs, assembled from the case. */
  loaded: Loaded;
  /** The four API actions, answered locally. */
  perform: (action: string, extra: Record<string, unknown>) => Promise<void>;
  /** Back to the beginning, on the agent's side. */
  restart: () => void;
  /**
   * Bumped by restart. The wizard holds its own progress, so remounting it is
   * the honest way to put it back to the start - key a component on this.
   */
  run: number;
  /** Has a decision been made? The last beat of the walk. */
  decided: boolean;
  /**
   * The agent's side sent its own pack. From then on compliance read what
   * was actually attached and written, not the invented full pack.
   */
  handedIn: boolean;
  /** The wizard's Send, answered locally: its pack becomes the one in the queue. */
  handIn: (c: PlcCase) => void;
  /** The wizard's Reopen and fix it, answered locally. */
  reopen: () => PlcCase;
  /**
   * What the agent's screen should resume from, or null for a fresh start.
   *
   * Null until the agent has sent something or compliance have decided, so
   * the walk still opens on an empty wizard even though the queue starts with
   * the invented pack already in it.
   */
  agentCase: PlcCase | null;
}

export function usePlcSandbox(): PlcSandbox {
  const [side, setSide] = useState<Side>("agent");
  const [kase, setKase] = useState<PlcCase>(DEMO_SUBMITTED);
  const [scanning, setScanning] = useState(false);
  const [run, setRun] = useState(0);
  const [handedIn, setHandedIn] = useState(false);

  const loaded: Loaded = useMemo(
    () => ({
      case: kase,
      checks: PLC_CHECKS,
      missing: missingDocuments(kase).map((c) => c.id),
      /* The written summary describes the invented pack. A pack the agent
         assembled themselves gets the product's own one-liner instead. */
      summary: kase.scannedAt ? (handedIn ? scanSummary(kase.findings) : DEMO_SUMMARY) : null,
      /* True, so the panel offers the reading rather than explaining that it
         is switched off. The reading itself is faked below. */
      scanConfigured: true,
    }),
    [kase, handedIn]
  );

  /**
   * What a button does here.
   *
   * The same actions the real panel sends to the API. `decide` is the one
   * worth noting: in the product it is terminal, pushes documents into
   * Propoly and REX, and is recorded against a real person's name. Here it
   * changes a variable.
   */
  const perform = useCallback(
    async (action: string, extra: Record<string, unknown>) => {
      if (action === "scan") {
        setScanning(true);
        await new Promise((r) => setTimeout(r, SCAN_MS));
        setScanning(false);
        /* The invented reading, kept to the checks this pack has a file for
           and pinned to the file that is actually there. A finding about a
           gas certificate nobody attached would teach the wrong thing. */
        setKase((k) => ({
          ...k,
          state: "reviewing",
          scannedAt: new Date().toISOString(),
          findings: DEMO_FINDINGS.flatMap((f) => {
            const doc = k.documents.find((d) => d.checkId === f.checkId);
            return doc ? [{ ...f, documentName: doc.name }] : [];
          }),
        }));
        return;
      }
      if (action === "skip-scan") {
        setKase((k) => ({ ...k, state: "reviewing" }));
        return;
      }
      if (action === "decide") {
        const decision = String(extra.decision ?? "approved");
        /* The same refusal the store makes, so the practice teaches the rule. */
        if (decision !== "approved" && !String(extra.note ?? "").trim()) {
          throw new Error(
            decision === "deferred"
              ? "Say what's missing. The agent only sees this note."
              : "A decline needs a reason on the record."
          );
        }
        setKase((k) => ({
          ...k,
          state: decision as PlcCase["state"],
          decidedAt: new Date().toISOString(),
          decidedBy: "You, in the practice run",
          decisionNote: String(extra.note ?? "").trim(),
        }));
      }
    },
    []
  );

  const handIn = useCallback((c: PlcCase) => {
    setKase({
      ...c,
      state: "submitted",
      submittedAt: new Date().toISOString(),
      agentNote: noteAsSent(c),
      findings: [],
      scannedAt: null,
    });
    setHandedIn(true);
  }, []);

  /* Returned as well as stored: the wizard carries on with the reopened pack
     straight away, without waiting for this state to come back round. */
  const reopen = useCallback((): PlcCase => {
    const reopened: PlcCase = { ...kase, state: "assembling", findings: [], scannedAt: null };
    setKase(reopened);
    setHandedIn(true);
    return reopened;
  }, [kase]);

  const restart = useCallback(() => {
    setKase(DEMO_SUBMITTED);
    setHandedIn(false);
    setSide("agent");
    setScanning(false);
    setRun((n) => n + 1);
  }, []);

  const decided = kase.state === "approved" || kase.state === "deferred" || kase.state === "declined";

  return {
    side,
    setSide,
    kase,
    scanning,
    loaded,
    perform,
    restart,
    run,
    decided,
    handedIn,
    handIn,
    reopen,
    agentCase: handedIn || decided ? kase : null,
  };
}
