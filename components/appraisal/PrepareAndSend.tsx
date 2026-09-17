"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import PresentBook, { PAGE_H, PAGE_W } from "@/components/PresentBook";
import { DeckStyleCtx, themeVars, INK } from "@/components/present-kit";
import SignModal from "@/components/landlord/SignModal";
import { AGENT_SIGNING } from "@/lib/signing-steps";
import { asStyle, slidesFor, type PresentDeck } from "@/lib/present";

/**
 * PREPARE, CHECK, SIGN, SEND.
 *
 * The screen between recording a figure and a contract arriving in a
 * landlord's inbox. James, 15 Sep 2026: "once they've put in their
 * post-valuation, it will say Prepare presentation and sign. They would then
 * prepare everything ... almost like a mirror image ... they're going to want
 * to flick through it to make sure it's all correct. They're also going to
 * sign it ... and then there'll be a big button that says Send. It'll make it
 * super obvious that it is sending it."
 *
 * ── Why the deck is on the screen at all ──────────────────────────────────
 *
 * Because it is the thing being sent, and until now nobody saw it before a
 * landlord did. The agent built it in a wizard, it went into a database, and
 * the next pair of eyes on it belonged to the customer. So the booklet is
 * here, the same one, turned the same way, with the last pages one arrow
 * away - which is where the figure and the fee live and where a mistake
 * costs the instruction.
 *
 * ── Nothing leaves until four things are true ─────────────────────────────
 *
 * Read it, check the details, sign your half, then send. The Send button is
 * dead until then, and says which one is missing rather than just being grey.
 */

type Party = {
  role: "agent" | "landlord";
  name: string | null;
  email: string;
  status: string;
  embedSrc: string;
  sentAt: string | null;
  openedAt: string | null;
  completedAt: string | null;
};

export interface SendSubject {
  id: string;
  landlord: string;
  landlordEmail: string | null;
  address: string;
  postcode: string | null;
  agent: string | null;
  valuation: number | null;
  serviceLabel: string | null;
  feePct: number | null;
  setupFee: number | null;
  valuedAt: string | null;
  appointmentAt: string | null;
}

const money = (n: number | null) => (n == null ? null : `£${n.toLocaleString("en-GB")}`);
const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : null;

export default function PrepareAndSend({ ma, deck }: { ma: SendSubject; deck: PresentDeck | null }) {
  const [parties, setParties] = useState<Party[] | null>(null);
  const [sendUnlocked, setSendUnlocked] = useState<boolean | null>(null);
  const [read, setRead] = useState(false);
  const [checked, setChecked] = useState(false);
  const [signing, setSigning] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "sign" | "send">(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [page, setPage] = useState({ at: -1, of: 0 });
  const [api, setApi] = useState<{ go: (dir: 1 | -1) => void } | null>(null);
  const stage = useRef<HTMLDivElement | null>(null);
  const [room, setRoom] = useState(0);
  const [tall, setTall] = useState(0);

  const pull = useCallback(async () => {
    try {
      const r = await fetch(`/api/appraisals/${ma.id}/terms`, { cache: "no-store" });
      const j = (await r.json()) as { parties?: Party[]; sendUnlocked?: boolean };
      setParties(j.parties ?? []);
      setSendUnlocked(j.sendUnlocked ?? false);
    } catch {
      setParties([]);
    }
  }, [ma.id]);

  useEffect(() => {
    void pull();
  }, [pull]);

  useEffect(() => {
    const measure = () => {
      setRoom(stage.current?.clientWidth ?? 0);
      setTall(window.innerHeight);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [deck]);

  const agent = parties?.find((p) => p.role === "agent") ?? null;
  const landlord = parties?.find((p) => p.role === "landlord") ?? null;
  /* A signature older than the figures is a signature on different figures
     (Susan, 14 Sep 2026: the fees must be right before it reaches the
     landlord). Recording a new rent or fee after signing puts step 3 back, and
     drawing it up again makes a fresh contract that carries them. */
  const staleSignature = Boolean(agent?.completedAt && ma.valuedAt && agent.completedAt < ma.valuedAt);
  const signed = Boolean(agent?.completedAt) && !staleSignature;
  const gone = Boolean(landlord?.sentAt);

  /* Read means READ: the last spread has been reached, not the deck opened.
     That is the whole point of putting it here. */
  const onSpread = useCallback((at: number, of: number) => {
    setPage({ at, of });
    if (of > 0 && at >= of - 1) setRead(true);
  }, []);

  async function openSigning(replace = false) {
    if (busy) return;
    setError(null);
    if (agent?.embedSrc && !replace) return setSigning(agent.embedSrc);
    setBusy("sign");
    try {
      /* No contract yet: this is what draws it up, with the figure and the fee
         already on it. It emails nobody - see app/api/docuseal/sign. */
      const r = await fetch("/api/docuseal/sign", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: ma.id, replace }),
      });
      const j = (await r.json()) as { ok?: boolean; embedSrc?: string; error?: string };
      if (j.ok && j.embedSrc) setSigning(j.embedSrc);
      else setError(j.error ?? "Couldn't draw up the contract.");
    } catch {
      setError("Couldn't draw up the contract just now.");
    } finally {
      setBusy(null);
    }
  }

  async function send() {
    if (busy) return;
    setBusy("send");
    setError(null);
    try {
      const r = await fetch(`/api/appraisals/${ma.id}/terms`, { method: "POST" });
      const j = (await r.json()) as { ok?: boolean; message?: string; error?: string };
      if (j.ok) {
        setSent(j.message ?? "Sent.");
        void pull();
      } else setError(j.error ?? "Couldn't send it.");
    } catch {
      setError("Couldn't send it just now.");
    } finally {
      setBusy(null);
    }
  }

  /* AS BIG AS THE SCREEN ALLOWS (James, 17 Sep 2026). In a column beside
     the steps it was drawn at about a quarter size, and text that small
     lays out a hair differently - lines wrapped and pages looked cut off
     that are whole on the landlord's copy. Full width, and tall enough that
     the Back and Next buttons stay on screen with the spread. */
  const fit = room ? Math.min((room - 48) / (PAGE_W * 2), Math.max(0.3, (tall - 250) / PAGE_H)) : 0.3;
  const pages = deck ? slidesFor(deck).map((s) => s.id) : [];
  const open = page.at >= 0;

  const blocking = !read
    ? "Turn to the last page first."
    : !checked
      ? "Tick the details once you have read them."
      : !signed
        ? "Sign your half before it goes."
        : null;

  const details: Array<[string, string | null]> = [
    ["Landlord", ma.landlord],
    ["Their email", ma.landlordEmail],
    ["Property", [ma.address, ma.postcode].filter(Boolean).join(", ")],
    ["Service", ma.serviceLabel],
    ["Rent", money(ma.valuation) ? `${money(ma.valuation)} per month` : null],
    ["Management fee", ma.feePct != null ? `${ma.feePct}% of rent` : null],
    ["Set-up fee", money(ma.setupFee)],
    ["Valued on", day(ma.valuedAt)],
    ["Visit", day(ma.appointmentAt)],
  ];

  const step = (n: number, done: boolean, title: string, body: React.ReactNode) => (
    <li className="flex gap-3.5">
      <span
        className="mt-0.5 flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full text-[12px] font-semibold"
        style={done ? { background: "#56423e", color: "#fff" } : { background: "#f0ebe9", color: "#8d7b76" }}
      >
        {done ? (
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          n
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-semibold leading-tight">{title}</p>
        <div className="mt-1.5">{body}</div>
      </div>
    </li>
  );

  return (
    <div className="space-y-6">
      {/* ── the booklet, exactly as they will get it ── */}
      <section>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-[17px]">What {ma.landlord} will see</h2>
          <p className="text-[11.5px] text-muted">
            {open ? `Page ${page.at + 1} of ${page.of}` : page.of ? "Open the cover" : "No deck on this file"}
          </p>
        </div>
        <div ref={stage} className="rounded-[20px] border border-line/60 bg-[#efe9e6] p-5">
          {deck && room > 0 ? (
            <DeckStyleCtx.Provider value={asStyle(deck.style)}>
              <div style={{ ...themeVars(asStyle(deck.style)), color: INK }} className="flex flex-col items-center">
                <PresentBook deck={deck} pages={pages} fit={fit} onSpread={onSpread} onApi={setApi} />
                <div className="mt-5 flex items-center gap-3">
                  {([["Back", -1], ["Next", 1]] as const).map(([label, dir]) => {
                    const can = dir < 0 ? page.at > -1 : page.at < page.of - 1;
                    return (
                      <button
                        key={label}
                        type="button"
                        onClick={() => api?.go(dir)}
                        disabled={!can}
                        className="rounded-full border border-line/70 bg-white px-4 py-2 text-[12.5px] font-semibold disabled:opacity-40"
                      >
                        {label}
                      </button>
                    );
                  })}
                  {!read && page.of > 0 && (
                    <p className="ml-1 text-[11.5px] text-muted">Turn to the end - the figure and the fee are on the last pages.</p>
                  )}
                </div>
              </div>
            </DeckStyleCtx.Provider>
          ) : (
            <p className="px-2 py-10 text-center text-[13px] text-muted">
              {deck ? "Laying it out…" : "There is no post-appraisal deck on this file yet."}
            </p>
          )}
        </div>
      </section>

      {/* ── the four things: reading and checking on the left, signing and
            sending on the right ── */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ol className="space-y-6 rounded-[20px] border border-line/60 bg-white p-6">
          {step(1, read, "Read it through", <p className="text-[12px] leading-relaxed text-muted">{read ? "You have been to the last page." : "Turn to the last page of the booklet."}</p>)}

          {step(
            2,
            checked,
            "Check the details",
            <div>
              <dl className="mb-2.5 space-y-1">
                {details.map(([k, v]) => (
                  <div key={k} className="flex gap-3 text-[12px]">
                    <dt className="w-[128px] shrink-0 text-muted">{k}</dt>
                    <dd className={v ? "font-medium" : "text-accent-dark"}>{v ?? "Not on the file"}</dd>
                  </div>
                ))}
              </dl>
              <label className="flex cursor-pointer items-start gap-2.5 text-[12px] leading-relaxed">
                <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="mt-0.5" />
                <span>These are right, and the dates are right.</span>
              </label>
            </div>
          )}
        </ol>

        <div>
        <ol start={3} className="space-y-6 rounded-[20px] border border-line/60 bg-white p-6">
          {step(
            3,
            signed,
            "Sign your half",
            signed ? (
              <div className="flex items-start gap-3">
                <p className="min-w-0 flex-1 text-[12px] leading-relaxed text-muted">
                  Signed on {day(agent!.completedAt)}.
                  {gone ? " Change it and their file opens the new one - nothing to send again." : " Spotted a mistake? Change draws it up again for you to sign."}
                </p>
                {/* A typo in the landlord's address, a wrong box: draw it up
                    again (James, 17 Sep 2026). The old one is archived. */}
                {!landlord?.completedAt && (
                  <button
                    type="button"
                    onClick={() => void openSigning(true)}
                    disabled={busy === "sign"}
                    className="shrink-0 rounded-full border border-line/80 px-4 py-2 text-[12px] font-semibold transition-colors hover:border-ink/40 disabled:opacity-60"
                  >
                    {busy === "sign" ? "Drawing it up…" : "Change"}
                  </button>
                )}
              </div>
            ) : (
              <div>
                <button
                  type="button"
                  onClick={() => void openSigning()}
                  disabled={busy === "sign"}
                  className="rounded-full bg-accent-dark px-5 py-2.5 text-[12.5px] font-semibold text-white disabled:opacity-60"
                >
                  {busy === "sign" ? "Drawing it up…" : staleSignature ? "Draw it up with the new figures" : agent ? "Open the contract" : "Draw up the contract"}
                </button>
                <p className="mt-2 text-[11.5px] leading-relaxed text-muted">
                  Your name, the date and your signature. The landlord cannot open theirs until this is done.
                </p>
              </div>
            )
          )}

          {step(
            4,
            gone,
            "Send it",
            <div>
              {gone ? (
                <p className="text-[12px] leading-relaxed text-muted">
                  With {landlord?.email}. Chase it from the file whenever you like.
                </p>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={send}
                    disabled={Boolean(blocking) || busy === "send" || sendUnlocked === false}
                    className="w-full rounded-2xl bg-accent-dark px-6 py-4 text-[15px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                  >
                    {busy === "send" ? "Sending…" : `Send it to ${ma.landlord}`}
                  </button>
                  <p className="mt-2 text-[11.5px] leading-relaxed text-muted">
                    {blocking ??
                      (sendUnlocked === false
                        ? "Sending is switched off on this environment, so the button is inert."
                        : `One email from you to ${ma.landlordEmail ?? "them"}: the presentation, and a link into their file to sign.`)}
                  </p>
                </>
              )}
            </div>
          )}
        </ol>

        {sent && <p className="mt-4 rounded-xl bg-accent-soft px-4 py-3 text-[12.5px] font-semibold">{sent}</p>}
        {error && <p className="mt-4 rounded-xl border border-accent-dark/30 px-4 py-3 text-[12.5px] leading-relaxed text-accent-dark">{error}</p>}

        <Link href={`/market-appraisals/${ma.id}`} className="mt-5 inline-block text-[12.5px] text-muted underline underline-offset-4">
          Back to the file
        </Link>
        </div>
      </div>

      {signing && (
        <SignModal
          url={signing}
          steps={AGENT_SIGNING}
          closeLabel="Finish later"
          onClose={() => setSigning(null)}
          onDone={() => {
            setSigning(null);
            void pull();
          }}
        />
      )}
    </div>
  );
}
