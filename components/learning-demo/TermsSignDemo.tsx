"use client";

import { useCallback, useRef, useState } from "react";
import SignPage from "@/app/sign/[token]/page";
import { editionFor } from "@/lib/terms/catalogue";
import { servicesFor } from "@/lib/terms/services";
import type { LandlordDetails, TermsValues } from "@/lib/terms/types";
import DemoFrame, { type DemoAnswer } from "./DemoFrame";

/**
 * The landlord's signing page, the real one (app/sign/[token]), on the
 * invented story: Raj Chauhan signing the England October 2026 terms for
 * 8 Recreation Terrace, Sam Whitaker having signed his half. For the Systems
 * tour (lib/learning/pages).
 *
 * The page reads its terms from GET /api/sign/<token> and posts details and
 * the signature back; here DemoFrame answers both on the page, from the view
 * below. So check your details, choose when we start and sign all work, the
 * sealing moment plays (marked "Preview only: nothing is sealed"), and the
 * done screen follows - with nothing posted, saved or sent.
 *
 * Raj's home address is left out so "check your details" asks for it.
 */

/* The same shape as the page's own View (app/sign/[token]/page.tsx). */
type View = {
  ok: true;
  doc: NonNullable<ReturnType<typeof editionFor>>;
  termsId: string;
  values: TermsValues;
  status: "agent" | "sent" | "signed" | "cancelled";
  agent: { name: string; email: string; phone: string; signedAt: string | null; signature: string | null };
  mine: { signature: string; startNow: boolean | null } | null;
  agentSigned: boolean;
  completedAt: string | null;
  hasCopy: boolean;
  me: { key: string; name: string; details: Partial<LandlordDetails>; signedAt: string | null };
  people: Array<{ key: string; name: string; signed: boolean; you: boolean }>;
  preview: boolean;
};

/** Sam's half, as ink: a hand-set signature drawn as an image, as the page shows a real one. */
const SAM_INK =
  "data:image/svg+xml;charset=utf-8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="110" viewBox="0 0 360 110">` +
      `<text x="14" y="72" font-family="'Snell Roundhand','Segoe Script','Brush Script MT','Apple Chancery',cursive" font-size="50" fill="#141413">Sam Whitaker</text>` +
      `<path d="M18 86c70-6 170-9 300-4" fill="none" stroke="#141413" stroke-width="1.6" stroke-linecap="round"/>` +
      `</svg>`
  );

const londonLong = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" });

function freshView(): View {
  const doc = editionFor("england");
  if (!doc) throw new Error("No England edition of the terms.");
  const service = servicesFor("england").find((s) => s.id === "experts-management") ?? servicesFor("england")[0];
  /* Sam sent and signed his half yesterday; the dates roll with the calendar. */
  const sent = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return {
    ok: true,
    doc,
    termsId: "DEMO-8RT",
    values: {
      agentName: "Sam Whitaker",
      agentLarn: "",
      propertyAddress: "8 Recreation Terrace, Nottingham NG2 3AB",
      serviceLevel: service.label,
      setUpFee: service.setUpFee,
      managementFee: service.managementFee,
      additionalFees: "None",
      dateIssued: londonLong(sent),
    },
    status: "sent",
    agent: { name: "Sam Whitaker", email: "sam@thelettingexperts.co.uk", phone: "0115 123 4567", signedAt: sent.toISOString(), signature: SAM_INK },
    mine: null,
    agentSigned: true,
    completedAt: null,
    hasCopy: false,
    me: {
      key: "landlord-1",
      name: "Raj Chauhan",
      details: { name: "Raj Chauhan", email: "raj.sample@example.com", phone: "07700 900456", address: "" },
      signedAt: null,
    },
    people: [{ key: "landlord-1", name: "Raj Chauhan", signed: false, you: true }],
    /* The sealing moment says "Preview only: nothing is sealed". */
    preview: true,
  };
}

export default function TermsSignDemo() {
  const view = useRef<View>(freshView());
  const [run, setRun] = useState(0);

  const answer = useCallback<DemoAnswer>((method, url, body) => {
    if (!url.pathname.startsWith("/api/sign/")) return { status: 404, json: { ok: false, error: "That isn't part of the demo." } };
    /* The signed copy, if anything ever asks for it: there is none in the demo. */
    if (/\/document$/.test(url.pathname)) return { status: 404, json: { ok: false, error: "There's no signed copy in the demo." } };
    if (method === "GET") return { json: view.current };
    if (method !== "POST") return { status: 405, json: { ok: false, error: "Not in the demo." } };
    const b = (body ?? {}) as { action?: string; details?: Partial<LandlordDetails>; signature?: string; startNow?: boolean | null };
    const v = view.current;
    if (b.action === "details" && b.details) {
      const details = { ...v.me.details, ...b.details };
      const name = String(details.name ?? "").trim() || v.me.name;
      view.current = { ...v, me: { ...v.me, details, name }, people: v.people.map((p) => (p.you ? { ...p, name } : p)) };
      return { json: { ok: true } };
    }
    if (b.action === "sign" && typeof b.signature === "string" && b.signature) {
      const now = new Date().toISOString();
      view.current = {
        ...v,
        status: "signed",
        completedAt: now,
        mine: { signature: b.signature, startNow: b.startNow ?? null },
        me: { ...v.me, signedAt: now },
        people: v.people.map((p) => (p.you ? { ...p, signed: true } : p)),
      };
      return { json: { ok: true, done: true } };
    }
    return { status: 400, json: { ok: false, error: "That isn't part of the demo." } };
  }, []);

  const restart = () => {
    view.current = freshView();
    setRun((n) => n + 1);
    window.scrollTo({ top: 0 });
  };

  return (
    <DemoFrame answer={answer} label="Demo" onRestart={restart}>
      <SignPage key={run} />
    </DemoFrame>
  );
}
