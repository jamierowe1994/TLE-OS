"use client";

import { useCallback, useEffect, useState } from "react";
import TermsSendScreen, { type Editions, type StaffParty, type StaffTerms } from "@/components/terms/TermsSendScreen";
import { Badge, Ico } from "@/components/new-look/Parts";

/**
 * TERMS OF BUSINESS ON A HOME (James, 23 Oct 2026).
 *
 * "We'll have a nice little orange button that we can send it with... they
 * should just be able to send out the terms." With or without an appraisal:
 * the agent sends from the home's Compliance tab, signs their part there and
 * then, and every landlord gets their own link from the agent's mailbox.
 *
 * The banner says where it is: nothing sent, your part to sign, who has and
 * hasn't signed (with Send again and their link to copy), or signed with the
 * copy. Drawn in the new look; it carries its own [data-look] so it reads the
 * same wherever it is placed.
 *
 * Sending, adjusting and signing your part all open the one full-page screen
 * James designed (components/terms/TermsSendScreen, 24 Oct 2026): the contract
 * on the left, three steps on the right. It replaced the side drawer and the
 * DocuSeal signing sheet.
 */

/** One tick sent, two ticks read (James, 24 Oct 2026: "one tick next to it for Sent and two ticks for Read, just so the guys know"). */
function Ticks({ read, when }: { read: boolean; when?: string }) {
  return (
    <span className={`nl-tob-ticks${read ? " is-read" : ""}`} title={read ? "Opened" : "Sent, not opened yet"}>
      <svg viewBox="0 0 28 16" width="22" height="13" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M2 8.5l4 4 8.5-9" />
        {read ? <path d="M12 12.5l8.5-9" /> : null}
      </svg>
      {read ? "Read" : "Sent"}
      {when ? ` ${when}` : ""}
    </span>
  );
}

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "");
const names = (ps: { name: string }[]) => (ps.length < 2 ? ps[0]?.name ?? "" : `${ps.slice(0, -1).map((p) => p.name).join(", ")} and ${ps[ps.length - 1].name}`);

export default function TermsPanel({
  listingId = null,
  propertyId = null,
  appraisalId = null,
  propertyAddress,
  landlords = [],
  agentLarn = null,
  serviceOnRecord = null,
  scottish = null,
  feesOnRecord = null,
  onChanged,
  more,
}: {
  listingId?: string | null;
  propertyId?: string | null;
  appraisalId?: string | null;
  propertyAddress: string;
  /** Who we already know owns it, to start the list of who signs. */
  landlords?: Array<{ name?: string | null; email?: string | null; phone?: string | null }>;
  agentLarn?: string | null;
  serviceOnRecord?: string | null;
  /** What the home's own record says (its Scotland flag); null to go by the address alone. */
  scottish?: boolean | null;
  /** Fees already agreed (the appraisal's), in the contract's words, to start the drawer from instead of the standard ones. */
  feesOnRecord?: { setUpFee?: string | null; managementFee?: string | null } | null;
  onChanged?: () => void;
  /** Beside the button while nothing has gone (the listing's "Upload a signed copy"). */
  more?: React.ReactNode;
}) {
  const [all, setAll] = useState<StaffTerms[] | null>(null);
  const [preview, setPreview] = useState(false);
  const [editions, setEditions] = useState<Editions>({ scotland: null, england: null });
  /* The send screen, open: a fresh send, Adjust contract (James, 23 Oct 2026: filled in from the
     set out now), or Sign your part on one made and waiting for the agent. */
  const [screen, setScreen] = useState<{ mode: "new" } | { mode: "adjust"; from: StaffTerms } | { mode: "sign"; terms: StaffTerms } | null>(null);
  const [remindAsk, setRemindAsk] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [withdrawAsk, setWithdrawAsk] = useState(false);
  const [justSent, setJustSent] = useState(false);

  const load = useCallback(async () => {
    const qs = new URLSearchParams();
    if (listingId) qs.set("listingId", listingId);
    if (propertyId) qs.set("propertyId", propertyId);
    if (appraisalId) qs.set("appraisalId", appraisalId);
    const j = await fetch(`/api/terms?${qs}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    if (j?.ok) {
      setAll(j.terms);
      setPreview(Boolean(j.preview));
      if (j.editions) setEditions(j.editions);
    } else setAll([]);
  }, [listingId, propertyId, appraisalId]);
  useEffect(() => {
    void load();
  }, [load]);

  const live = (all ?? []).find((t) => t.status !== "cancelled") ?? null;
  /* While an adjusted set waits for the agent's signature, the one it replaces is still out. */
  const replacing = live?.replaces ? (all ?? []).find((t) => t.id === live.replaces && t.status === "sent") ?? null : null;

  async function act(t: StaffTerms, body: Record<string, string>, key: string): Promise<string | null> {
    setBusy(key);
    setSaid(null);
    const j = await fetch(`/api/terms/${t.id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
      .then((r) => r.json())
      .catch(() => null);
    setBusy(null);
    if (!j?.ok) return j?.error ?? "That didn't work. Try again in a moment.";
    await load();
    onChanged?.();
    return null;
  }

  const copy = (p: StaffParty) => {
    navigator.clipboard?.writeText(p.link).then(() => {
      setCopied(p.key);
      window.setTimeout(() => setCopied(null), 1600);
    }).catch(() => window.prompt("Their link", p.link));
  };

  if (all === null) {
    return (
      <section data-look="new" className="nl-cmp-tob">
        <p className="nl-meta">Reading the terms…</p>
      </section>
    );
  }

  const signedCount = live ? live.parties.filter((p) => p.signedAt).length : 0;
  /* Said after the agent signs, from what actually went: never "in their inbox" over an email that didn't. */
  const unsent = live ? live.parties.filter((p) => p.emailError && !p.emailedAt) : [];
  const sentLine =
    justSent && live?.status === "sent"
      ? !unsent.length
        ? "Signed and sent. Each person has their own link in their inbox."
        : unsent.length === live.parties.length
          ? "Signed, but the emails didn't go. Copy each person's link below and send it to them yourself."
          : `Signed and sent, but the email to ${names(unsent)} didn't go. Copy their link below.`
      : null;
  const tone = live?.status === "signed" ? " is-signed" : "";

  return (
    <div data-look="new" className="nl-terms-wrap">
      <section className={`nl-terms${tone}`}>
        <span className="nl-terms-ic" aria-hidden>
          {live?.status === "signed" ? <Ico name="check" size={18} /> : <Ico name="pen" size={17} />}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="nl-block-title">Terms of Business</h3>
          <p className="nl-meta mt-1">
            {!live
              ? `Nothing has gone yet. Send them and everyone who owns ${propertyAddress.split(",")[0] || "the home"} gets their own link to read and sign.`
              : live.status === "agent"
                ? replacing
                  ? `Adjusted, but nothing has gone: sign your part and it goes out. The contract sent ${day(replacing.sentAt)} stays live until you do.`
                  : "Made, but nothing has gone: sign your part and they go out."
                : live.status === "sent"
                  ? `Sent ${day(live.sentAt)} to ${names(live.parties)}. ${signedCount} of ${live.parties.length} signed.`
                  : `Signed by ${names(live.parties)} on ${day(live.completedAt)}.${live.signedR2Key ? " Copy on file." : ""}`}
          </p>
        </div>
        {!live ? (
          <span className="flex shrink-0 items-center gap-2">
            <button type="button" className="nl-btn nl-btn--primary" onClick={() => setScreen({ mode: "new" })}>
              <Ico name="arrow" size={15} /> Send Terms of Business
            </button>
            {more}
          </span>
        ) : live.status === "agent" ? (
          <button type="button" className="nl-btn nl-btn--primary" onClick={() => setScreen({ mode: "sign", terms: live })}>
            <Ico name="pen" size={15} /> Sign your part
          </button>
        ) : live.status === "sent" ? (
          <span className="nl-terms-acts">
            <Ticks read={live.parties.every((p) => p.openedAt || p.signedAt)} />
            {remindAsk ? (
              <>
                <button
                  type="button"
                  className="nl-btn nl-btn--secondary nl-btn--sm"
                  disabled={busy === "remind"}
                  onClick={async () => {
                    const waitingOn = live.parties.filter((p) => !p.signedAt);
                    const problem = await act(live, { action: "remind" }, "remind");
                    setRemindAsk(false);
                    setSaid(problem ?? `Reminder sent to ${names(waitingOn)}.`);
                  }}
                >
                  {busy === "remind" ? "Sending…" : `Email ${names(live.parties.filter((p) => !p.signedAt))}`}
                </button>
                <button type="button" className="nl-btn nl-btn--quiet nl-btn--sm" onClick={() => setRemindAsk(false)}>Cancel</button>
              </>
            ) : (
              <button type="button" className="nl-btn nl-btn--secondary nl-btn--sm" onClick={() => setRemindAsk(true)}>Send a reminder</button>
            )}
            <button type="button" className="nl-btn nl-btn--quiet nl-btn--sm" onClick={() => setScreen({ mode: "adjust", from: live })}>Adjust contract</button>
          </span>
        ) : live.status === "signed" ? (
          live.signedR2Key ? (
            <a className="nl-btn nl-btn--secondary nl-btn--sm" href={`/api/terms/${live.id}/document`} target="_blank" rel="noreferrer">
              View the signed copy
            </a>
          ) : (
            <span className="nl-terms-done"><Ico name="check" size={14} /> Signed</span>
          )
        ) : null}
      </section>

      {(said ?? sentLine) && <p className={`nl-meta ${unsent.length && !said ? "text-[var(--accent-dark)]" : "text-[var(--sage-ink)]"}`}>{said ?? sentLine}</p>}

      {live && live.status !== "signed" && live.status !== "agent" && (
        <ul className="nl-terms-people">
          {live.parties.map((p) => (
            <li key={p.key}>
              <span className="nl-strong">{p.name}</span>
              <span className="nl-meta">{p.email}{p.emailError ? ` · ${p.emailError}` : ""}</span>
              {p.signedAt ? (
                <Badge tone="good">Signed {day(p.signedAt)}</Badge>
              ) : p.emailError && !p.emailedAt ? (
                <Badge tone="warning">Email didn&apos;t go</Badge>
              ) : p.openedAt ? (
                <Ticks read when={day(p.openedAt)} />
              ) : (
                <Ticks read={false} when={day(p.emailedAt)} />
              )}
              {!p.signedAt && <button type="button" className="nl-link" onClick={() => copy(p)}>{copied === p.key ? "Copied" : "Copy their link"}</button>}
            </li>
          ))}
        </ul>
      )}

      {live && live.status === "agent" && (
        <div className="flex flex-wrap items-center gap-3">
          {!withdrawAsk ? (
            <button type="button" className="nl-link" onClick={() => setWithdrawAsk(true)}>{replacing ? "Drop the adjusted one" : "Withdraw and start again"}</button>
          ) : (
            <span className="nl-confirm m-0 w-full">
              <p>{replacing ? `Drop the adjusted contract? The one sent ${day(replacing.sentAt)} carries on as it was.` : "Withdraw these terms? Their links stop working, and you can send a fresh set straight away."}</p>
              <button type="button" className="nl-btn nl-btn--quiet nl-btn--sm" onClick={() => setWithdrawAsk(false)}>Keep them</button>
              <button
                type="button"
                className="nl-btn nl-btn--danger nl-btn--sm"
                disabled={busy === "cancel"}
                onClick={async () => {
                  const p = await act(live, { action: "cancel" }, "cancel");
                  setWithdrawAsk(false);
                  setSaid(p ?? (replacing ? "Dropped. The contract that was out carries on." : "Withdrawn. Send a fresh set whenever you're ready."));
                }}
              >
                {busy === "cancel" ? "Withdrawing…" : "Withdraw"}
              </button>
            </span>
          )}
        </div>
      )}

      {screen && (
        <TermsSendScreen
          from={screen.mode === "adjust" ? screen.from : null}
          signing={screen.mode === "sign" ? screen.terms : null}
          onWithdraw={screen.mode === "adjust" ? async () => {
            const p = await act(screen.from, { action: "cancel" }, "cancel");
            if (!p) {
              setScreen(null);
              setSaid("Withdrawn. Their links have stopped working. Send a fresh set whenever you're ready.");
            }
            return p;
          } : undefined}
          propertyAddress={propertyAddress}
          listingId={listingId}
          propertyId={propertyId}
          appraisalId={appraisalId}
          landlords={landlords}
          agentLarn={agentLarn}
          serviceOnRecord={serviceOnRecord}
          feesOnRecord={feesOnRecord}
          scottish={scottish}
          editions={editions}
          preview={preview}
          onClose={(changed) => {
            setScreen(null);
            /* A contract was made on the way but not signed: the banner now offers Sign your part. */
            if (changed) {
              void load();
              onChanged?.();
            }
          }}
          onSent={async () => {
            setScreen(null);
            setSaid(null);
            setJustSent(true);
            await load();
            onChanged?.();
          }}
        />
      )}
    </div>
  );
}

