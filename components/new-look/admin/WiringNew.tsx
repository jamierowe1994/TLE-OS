"use client";

import { useMemo, useState } from "react";
import { Badge, type Tone } from "@/components/new-look/Parts";
import { useWiringLive, type LiveStatus } from "@/components/WiringSheet";
import { SYSTEMS, WIRING, rowVerdict, type LockTruth, type RexTruth, type SwitchLine, type SystemKey, type WalkLine } from "@/lib/wiring";
import { JOURNEYS } from "@/lib/testing-journeys";
import { ErrorLine, Loading, Section, Spin, Tab, nd, when } from "@/components/new-look/admin/bits";

/**
 * Admin > System > Wiring in the new look (24 Oct 2026).
 *
 * What the OS is connected to and what is armed, as hairline rows. The three
 * facts other tabs own are read from them (lib/wiring-truth), so the two can
 * never disagree:
 *
 *   REX            REX status's own state: up, down or automatic, and why
 *   locks          the switches store beside the server's own locks, each
 *                  named: "Locked on the server" is not "Off in Switches"
 *   tested         Testing's recorded walks, where a row maps to one; a typed
 *                  note only where nothing can be measured, and it says so
 *
 * It still only reports. Arming is on Switches.
 */

export type Health = {
  db: { connected: boolean; users?: number | null; verificationsPending?: number | null };
  resend: { configured: boolean; canSend: boolean; from: string | null; verdict: string };
  rex: { configured: boolean; writesLocked: boolean; status?: { mode: string; down: boolean; reason: string | null; lastOkAt: string | null } | null };
  docuseal: { configured: boolean; canSend: boolean };
  emailPolicy: { internalDomains: string[]; note: string };
  /* Optional so an older deploy of the API doesn't blank the whole page. */
  launchPad?: { configured: boolean; base: string | null; keySet: boolean };
  propoly?: { configured: boolean; keySet?: boolean; agentSet?: boolean; seen?: string[] };
  payProp?: { configured: boolean };
  ghl?: { configured: boolean };
  tegHub?: { configured: boolean };
};

export type Truth = {
  ok: boolean;
  at: string;
  rex: RexTruth | null;
  rexError: string | null;
  locks: LockTruth | null;
  locksError: string | null;
  walks: Record<string, WalkLine> | null;
  walksError: string | null;
};

type Line = { name: string; tone: Tone; word: string; detail: React.ReactNode; more?: React.ReactNode };

const LIVE: Record<LiveStatus["state"], { tone: Tone; word: string }> = {
  loading: { tone: "neutral", word: "Checking" },
  ok: { tone: "good", word: "All answering" },
  partial: { tone: "warning", word: "Partly connected" },
  down: { tone: "accent", word: "Not answering" },
  unconfigured: { tone: "accent", word: "No keys here yet" },
  none: { tone: "neutral", word: "Nothing to probe" },
};

const REASON: Record<string, string> = {
  forced: "set to down on REX status",
  planned: "inside the planned window on REX status",
  detected: "it stopped answering",
};

/** A switch as Switches holds it, beside the server lock that can override it. */
function switchWord(s: SwitchLine, serverLocked: boolean, brake: boolean): { tone: Tone; word: string } {
  if (brake) return { tone: "accent", word: "Held off on the server" };
  if (s.on && serverLocked) return { tone: "warning", word: "On in Switches, locked on the server" };
  if (s.on) return { tone: "good", word: "On in Switches" };
  return { tone: "neutral", word: "Off in Switches" };
}

function rexLine(t: Truth | null, truthErr: boolean, live: LiveStatus | undefined): Line {
  if (!t) {
    return truthErr
      ? { name: "REX", tone: "accent", word: "Couldn't read", detail: "REX status could not be read, so whether REX is up is not known." }
      : { name: "REX", tone: "neutral", word: "Checking", detail: <><Spin /> Reading REX status…</> };
  }
  const r = t.rex;
  if (!r) return { name: "REX", tone: "accent", word: "Couldn't read", detail: `REX status could not be read: ${nd(t.rexError)}` };
  if (!r.configured) return { name: "REX", tone: "neutral", word: "Not connected", detail: "REX credentials are not set on this environment." };
  const auth = live?.checks.find((c) => c.key === "auth");
  const liveSays =
    r.down
      ? "Not asked while it counts as down."
      : !live || live.state === "loading"
        ? "Checking now…"
        : auth
          ? auth.ok
            ? "Signed in on the office account just now."
            : `Sign-in failed just now: ${nd(auth.detail)}`
          : nd(live.note) || LIVE[live.state].word;
  const status = r.down
    ? { tone: "accent" as Tone, word: "Down" }
    : r.mode === "up"
      ? { tone: "good" as Tone, word: "Forced up" }
      : { tone: "good" as Tone, word: "Answering" };
  return {
    name: "REX",
    ...status,
    detail: (
      <>
        {r.down ? `Down because ${REASON[r.reason ?? ""] ?? "REX status says so"}. Screens show the copy and armed changes wait.` : r.mode === "up" ? "Forced up on REX status: asked live whatever the detection says." : "Automatic on REX status: three failures in two minutes and it switches to the copy."}
        {r.lastOkAt ? ` Last good answer ${when(r.lastOkAt)}.` : ""}
        {r.waiting ? ` ${r.waiting} ${r.waiting === 1 ? "change is" : "changes are"} waiting to go to REX.` : ""}
      </>
    ),
    more: <>Live check: {liveSays}</>,
  };
}

export default function WiringNew({
  h,
  healthErr,
  payprop,
  truth,
  truthErr,
  onRetry,
}: {
  h: Health | null;
  healthErr: boolean;
  payprop: { ok: boolean; detail: string } | null;
  truth: Truth | null;
  truthErr: boolean;
  onRetry: () => void;
}) {
  const live = useWiringLive();
  const [open, setOpen] = useState<SystemKey | null>("rex");
  const titles = useMemo(() => {
    const m: Record<string, string> = {};
    for (const j of JOURNEYS) for (const s of j.steps) m[`${j.id}/${s.id}`] = s.title;
    return m;
  }, []);

  if (healthErr && !h) {
    return (
      <Tab>
        <ErrorLine onRetry={onRetry}>Couldn&apos;t read the wiring.</ErrorLine>
      </Tab>
    );
  }
  if (!h) {
    return (
      <Tab>
        <Loading what="Reading the wiring…" />
      </Tab>
    );
  }

  const locks = truth?.locks ?? null;
  const lockErr = truthErr ? "The locks could not be read." : truth && !locks ? `The locks could not be read: ${nd(truth.locksError)}` : null;

  const email: Line = !locks
    ? lockErr
      ? { name: "Email (Resend)", tone: "accent", word: "Couldn't read", detail: lockErr }
      : { name: "Email (Resend)", tone: "neutral", word: "Checking", detail: <><Spin /> Reading the switches…</> }
    : !locks.email.configured
      ? { name: "Email (Resend)", tone: "accent", word: "Not connected", detail: "RESEND_API_KEY and RESEND_FROM are both needed." }
      : !locks.email.serverOpen
        ? { name: "Email (Resend)", tone: "accent", word: "Locked on the server", detail: "RESEND_ALLOW_SEND isn't \"yes\" in Railway, so no email leaves, staff or customer." }
        : locks.brake
          ? { name: "Email (Resend)", tone: "accent", word: "Staff only: held on the server", detail: "SENDING_LOCKED is set in Railway, so every switch reads off and email to landlords and tenants is held whatever Switches say. Staff email still sends." }
          : locks.email.customers && !locks.email.customers.on
            ? { name: "Email (Resend)", tone: "warning", word: "Staff only", detail: `Staff email sends${h.resend.from ? ` from ${h.resend.from}` : ""}. Email to landlords and tenants is off in Switches.` }
            : { name: "Email (Resend)", tone: "good", word: "Sending", detail: `Staff, and landlords and tenants (on in Switches)${h.resend.from ? `. Staff email from ${h.resend.from}` : ""}.` };

  const docuseal: Line = !locks
    ? lockErr
      ? { name: "DocuSeal", tone: "accent", word: "Couldn't read", detail: lockErr }
      : { name: "DocuSeal", tone: "neutral", word: "Checking", detail: <><Spin /> Reading…</> }
    : !locks.docuseal.configured
      ? { name: "DocuSeal", tone: "neutral", word: "Not connected", detail: "No DocuSeal credentials on this environment." }
      : locks.docuseal.serverOpen
        ? { name: "DocuSeal", tone: "good", word: "Sending", detail: "Signing requests go. There is no switch for this one: DOCUSEAL_ALLOW_SEND in Railway decides it." }
        : { name: "DocuSeal", tone: "warning", word: "Locked on the server", detail: "DOCUSEAL_ALLOW_SEND isn't \"yes\" in Railway, so no signing request goes. There is no switch for it in Switches." };

  const notOnDeploy = "This deploy of the API predates the check.";
  const lines: Line[] = [
    { name: "Database", tone: h.db.connected ? "good" : "accent", word: h.db.connected ? "Connected" : "Not connected", detail: h.db.connected ? `${h.db.users ?? 0} accounts, ${h.db.verificationsPending ?? 0} live links.` : "No database on this environment." },
    rexLine(truth, truthErr, live.rex),
    email,
    docuseal,
    !h.launchPad
      ? { name: "Launch Pad (entitlement)", tone: "neutral", word: "Unknown", detail: notOnDeploy }
      : h.launchPad.configured
        ? { name: "Launch Pad (entitlement)", tone: "good", word: "Connected", detail: h.launchPad.base ?? "" }
        : {
            name: "Launch Pad (entitlement)",
            tone: "accent",
            word: "Not connected",
            detail: `${[h.launchPad.base ? null : "ADS_API_BASE missing", h.launchPad.keySet ? null : "ADS_API_KEY missing"].filter(Boolean).join(", ")}. Tools tells every partner it cannot check their licence.`,
          },
    !h.propoly
      ? { name: "Propoly (deals)", tone: "neutral", word: "Unknown", detail: notOnDeploy }
      : h.propoly.configured
        ? { name: "Propoly (deals)", tone: "good", word: "Connected", detail: "The pre-tenancy board has its deals." }
        : {
            name: "Propoly (deals)",
            tone: "accent",
            word: "Not connected",
            detail:
              h.propoly.keySet && h.propoly.agentSet
                ? "Both variables are set on this deploy, but the client still reports unconfigured: it holds a value read before they existed. Redeploy rather than re-paste."
                : `${[h.propoly.keySet ? null : "No key (PROPOLY_API_KEY or PROPOLY_PASSWORD)", h.propoly.agentSet ? null : "no agent name (PROPOLY_AGENT_NAME or PROPOLY_USERNAME)"].filter(Boolean).join(" and ")}. ${
                  h.propoly.seen?.length
                    ? `This container can see ${h.propoly.seen.join(", ")}, so the names don't match what the code reads.`
                    : "This container sees no Propoly variables at all, so they are on another service or environment."
                }`,
          },
    !h.payProp
      ? { name: "PayProp (rent and arrears)", tone: "neutral", word: "Unknown", detail: notOnDeploy }
      : { name: "PayProp (rent and arrears)", tone: h.payProp.configured ? "good" : "accent", word: h.payProp.configured ? "Connected" : "Not connected", detail: h.payProp.configured ? "Money figures read live." : "Money figures show an error state." },
    !h.tegHub
      ? { name: "TEG Hub (people)", tone: "neutral", word: "Unknown", detail: notOnDeploy }
      : { name: "TEG Hub (people)", tone: h.tegHub.configured ? "good" : "accent", word: h.tegHub.configured ? "Connected" : "Not connected", detail: h.tegHub.configured ? "Packages, bios and headshots pull through." : "Partner packages and bios can't be synced." },
    !h.ghl
      ? { name: "GHL (nurture)", tone: "neutral", word: "Unknown", detail: notOnDeploy }
      : { name: "GHL (nurture)", tone: h.ghl.configured ? "good" : "neutral", word: h.ghl.configured ? "Connected" : "Not connected", detail: h.ghl.configured ? "Nurture campaigns can run." : "The nurture branch stays drawn but unwired." },
  ];

  const rexServerLocked = locks ? locks.rex.serverOpen.length === 0 : false;
  const walks = truth?.walks ?? null;
  const walksErr = truthErr ? "Testing's walks could not be read." : truth?.walksError ? nd(truth.walksError) : null;

  return (
    <Tab>
      <p className="nl-meta nl-adm-lede">What the OS is connected to, and what is armed. This tab only reports: arming is on Switches, REX&apos;s state is REX status&apos;s, and tested means walked on Testing.</p>

      {healthErr && <ErrorLine onRetry={onRetry}>The connection checks could not be read again. What shows is from when the tab opened.</ErrorLine>}

      <Section title="Connections">
        <ul className="nl-adm-rows">
          {lines.map((l) => (
            <li key={l.name}>
              <div className="nl-adm-row-main">
                <span className="nl-strong">{l.name}</span>
                <p className="nl-meta">{l.detail}</p>
                {l.more && <p className="nl-meta">{l.more}</p>}
              </div>
              <div className="nl-adm-row-side">
                <Badge tone={l.tone}>{l.word}</Badge>
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Writes into REX" aside={locks && <span className="nl-meta">{locks.rex.serverOpen.length ? `${locks.rex.serverOpen.length} open on the server` : "Locked on the server"}</span>}>
        <p className="nl-meta">A write reaches REX only when the server names it in REX_ALLOW_WRITES and its switch is on in Switches.</p>
        {!locks ? (
          lockErr ? <ErrorLine onRetry={onRetry}>{lockErr}</ErrorLine> : <Loading what="Reading the switches…" />
        ) : (
          <ul className="nl-adm-rows">
            <li>
              <div className="nl-adm-row-main">
                <span className="nl-strong">On the server</span>
                <p className="nl-meta">
                  {locks.rex.serverOpen.length ? (
                    locks.rex.serverOpen.map((m, i) => (
                      <span key={m}>
                        {i > 0 && ", "}
                        <span className="nl-mono">{m}</span>
                      </span>
                    ))
                  ) : (
                    "REX_ALLOW_WRITES names nothing, so no write reaches REX whatever Switches say."
                  )}
                </p>
              </div>
              <div className="nl-adm-row-side">
                <Badge tone={rexServerLocked ? "neutral" : "warning"}>{rexServerLocked ? "Locked on the server" : "Open on the server"}</Badge>
              </div>
            </li>
            {locks.brake && (
              <li>
                <div className="nl-adm-row-main">
                  <span className="nl-strong">SENDING_LOCKED</span>
                  <p className="nl-meta">Set in Railway. Every switch reads off whatever it says, until it is cleared there.</p>
                </div>
                <div className="nl-adm-row-side">
                  <Badge tone="accent">Brake on</Badge>
                </div>
              </li>
            )}
            {locks.rex.switches.map((s) => {
              const w = switchWord(s, rexServerLocked, locks.brake);
              return (
                <li key={s.key}>
                  <div className="nl-adm-row-main">
                    <span className="nl-strong">{s.label}</span>
                    <p className="nl-meta">
                      {s.fromEnv ? `Still decided by ${s.legacyEnv} in Railway until it is first moved in Switches.` : `Last moved by ${s.changedBy || "somebody"}${s.changedAt ? `, ${when(s.changedAt)}` : ""}.`}
                    </p>
                  </div>
                  <div className="nl-adm-row-side">
                    <Badge tone={w.tone}>{w.word}</Badge>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {/* PayProp England and Wales is connected from here (OAuth); Scotland reads with its own key. */}
      <Section title="PayProp: England and Wales">
        <ul className="nl-adm-rows">
          <li>
            <div className="nl-adm-row-main">
              <span className="nl-strong">Connect at PayProp</span>
              <p className="nl-meta">
                Needs PAYPROP_CLIENT_ID and PAYPROP_CLIENT_SECRET on this service, and https://tle-os.co.uk/api/payprop/callback registered as the redirect on the PayProp client. Press once, approve at PayProp, and every England and Wales money read follows. Scotland reads with its own key.
              </p>
              {payprop && (
                <div className={`nl-adm-panel ${payprop.ok ? "is-good" : "is-bad"}`}>
                  <p>
                    {payprop.ok ? "Connected. " : "Not connected. "}
                    {nd(payprop.detail)}
                  </p>
                </div>
              )}
            </div>
            <div className="nl-adm-row-side">
              <a href="/api/payprop/connect?account=uk" className="nl-btn nl-btn--secondary nl-btn--sm">
                Connect E&amp;W at PayProp
              </a>
            </div>
          </li>
        </ul>
        <p className="nl-meta nl-adm-after">
          Email from this domain goes to colleagues only ({h.emailPolicy.internalDomains.map((d) => `@${d}`).join(", ")}). Anything else is refused at the send path. {nd(h.emailPolicy.note)}
        </p>
      </Section>

      <Section title="By System" aside={<span className="nl-meta">Live checks run each time this tab opens</span>}>
        {walksErr && <ErrorLine onRetry={onRetry}>{walksErr} Rows that map to a walk can&apos;t say whether they are tested.</ErrorLine>}
        <ul className="nl-adm-rows">
          {SYSTEMS.map((sys) => {
            const st = live[sys.key] ?? { state: "loading" as const, checks: [] };
            const word = LIVE[st.state];
            const rows = WIRING.filter((r) => r.system === sys.key);
            const areas = Array.from(new Set(rows.map((r) => r.area)));
            const isOpen = open === sys.key;
            return (
              <li key={sys.key}>
                <button type="button" className="nl-adm-open" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : sys.key)}>
                  <span className="nl-adm-row-main">
                    <span className="nl-strong">{sys.label}</span>
                    <span className="nl-meta nl-adm-blockmeta">{nd(sys.blurb)}</span>
                  </span>
                  <span className="nl-adm-row-side">
                    {st.state === "loading" ? <Spin /> : null}
                    <Badge tone={word.tone}>{word.word}</Badge>
                    <svg className={`nl-adm-chev${isOpen ? " is-open" : ""}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M9 6l6 6-6 6" />
                    </svg>
                  </span>
                </button>
                {isOpen && (
                  <div className="nl-adm-open-body">
                    {sys.endpoint && (
                      <div className="nl-adm-panel">
                        <p className="nl-meta">Right now, on this environment&apos;s credentials</p>
                        {st.state === "loading" ? (
                          <Loading what="Probing…" />
                        ) : st.checks.length ? (
                          <ul className="nl-lines">
                            {st.checks.map((c) => (
                              <li key={c.key}>
                                <Badge tone={c.ok ? "good" : "accent"} bare>
                                  {c.ok ? "OK" : "No"}
                                </Badge>
                                <span>
                                  <span className="nl-strong">{nd(c.label)}</span>
                                  <span className="nl-meta nl-adm-blockmeta">{nd(c.detail)}</span>
                                </span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p>{nd(st.note) || "Nothing came back."}</p>
                        )}
                      </div>
                    )}
                    {areas.map((area) => (
                      <div key={area}>
                        <h3 className="nl-adm-sub">{area}</h3>
                        <ul className="nl-adm-rows">
                          {rows
                            .filter((r) => r.area === area)
                            .map((r) => {
                              const v = rowVerdict(r, walks, titles);
                              const loadingWalks = v.measured && !truth && !truthErr;
                              return (
                                <li key={r.item}>
                                  <div className="nl-adm-row-main">
                                    <span className="nl-strong">{nd(r.item)}</span>
                                    <p className="nl-meta">{nd(r.note)}</p>
                                    {v.detail && <p className="nl-meta">{v.measured ? v.detail : <em>{v.detail}</em>}</p>}
                                  </div>
                                  <div className="nl-adm-row-side">
                                    {loadingWalks ? <Spin /> : <Badge tone={v.tone}>{v.label}</Badge>}
                                  </div>
                                </li>
                              );
                            })}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Section>
    </Tab>
  );
}
