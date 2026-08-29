"use client";
import { useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { Pill } from "@/components/Wire";
import WiringSheet from "@/components/WiringSheet";

/**
 * The switches — moved here off Profile, where an agent could see them.
 *
 * Reads /api/os-health, which reports booleans and names and never a key,
 * a token or a connection string. Safe to have open while on a call.
 */

type Health = {
  db: { connected: boolean; users?: number | null; verificationsPending?: number | null };
  resend: { configured: boolean; canSend: boolean; from: string | null; verdict: string };
  rex: { configured: boolean; writesLocked: boolean };
  docuseal: { configured: boolean; canSend: boolean };
  emailPolicy: { internalDomains: string[]; note: string };
  /* Optional so an older deploy of the API doesn't blank the whole page. */
  launchPad?: { configured: boolean; base: string | null; keySet: boolean };
  propoly?: { configured: boolean };
  payProp?: { configured: boolean };
  ghl?: { configured: boolean };
  tegHub?: { configured: boolean };
};

export default function AdminConnections() {
  const [h, setH] = useState<Health | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    fetch("/api/os-health").then((r) => (r.ok ? r.json() : Promise.reject(new Error()))).then(setH).catch(() => setErr(true));
  }, []);

  if (err) return <p className="mt-6 text-[12.5px] text-accent-dark">Couldn&apos;t read the wiring.</p>;
  if (!h) return <p className="text-[12.5px] text-muted">Loading…</p>;

  const rows: Array<[string, boolean, string]> = [
    ["Database", h.db.connected, h.db.connected ? `${h.db.users ?? 0} accounts · ${h.db.verificationsPending ?? 0} live links` : "Not connected"],
    ["Resend (email)", h.resend.configured && h.resend.canSend, h.resend.verdict],
    ["REX", h.rex.configured, h.rex.writesLocked ? "Connected · writes LOCKED" : "Connected · writes unlocked"],
    ["DocuSeal", h.docuseal.configured, h.docuseal.configured ? (h.docuseal.canSend ? "Connected and unlocked" : "Connected, sending locked") : "Not connected"],
    /* Named separately rather than as one "off", because the two halves fail
       independently and the fix is different: a missing base URL is a typo in
       Railway, a missing key is a value nobody pasted. Reported as "no answer
       about who may open Launch Pad" because that is the visible symptom on
       the Tools page — every partner is told we cannot check their licence. */
    [
      "Launch Pad (entitlement)",
      Boolean(h.launchPad?.configured),
      h.launchPad
        ? h.launchPad.configured
          ? `Connected · ${h.launchPad.base}`
          : `Not connected — ${[
              h.launchPad.base ? null : "ADS_API_BASE missing",
              h.launchPad.keySet ? null : "ADS_API_KEY missing",
            ]
              .filter(Boolean)
              .join(", ")}. Tools tells every partner it cannot check their licence.`
        : "This deploy of the API predates the check.",
    ],
    /* Propoly first of the four, because it is the source of truth for the
       whole deal pipeline and its absence is the loudest: with it unset the
       pre-tenancy board is empty and says so, which is how this omission was
       found — by reading a banner on Kirstie's screen rather than the page
       whose job this is.

       BOTH naming schemes are listed, and that matters. lib/business/propoly
       reads PROPOLY_API_KEY ?? PROPOLY_PASSWORD and PROPOLY_AGENT_NAME ??
       PROPOLY_USERNAME, because the Railway variables predate our seeing the
       real header names. Naming only the newer pair sent James looking for two
       variables he does not have and never needed — the older pair he already
       uses on the portal works exactly as well. */
    [
      "Propoly (deals)",
      Boolean(h.propoly?.configured),
      h.propoly
        ? h.propoly.configured
          ? "Connected · the pre-tenancy board has its deals"
          : "Not connected — needs a key and an agent name: either PROPOLY_API_KEY + PROPOLY_AGENT_NAME, or the older PROPOLY_PASSWORD + PROPOLY_USERNAME. Kirstie's board stays empty until both are set."
        : "This deploy of the API predates the check.",
    ],
    [
      "PayProp (rent & arrears)",
      Boolean(h.payProp?.configured),
      h.payProp
        ? h.payProp.configured
          ? "Connected"
          : "Not connected — money figures fall back or show an error state."
        : "This deploy of the API predates the check.",
    ],
    [
      "TEG Hub (people)",
      Boolean(h.tegHub?.configured),
      h.tegHub
        ? h.tegHub.configured
          ? "Connected · packages, bios and headshots pull through"
          : "Not connected — partner packages and bios cannot be synced."
        : "This deploy of the API predates the check.",
    ],
    [
      "GHL (nurture)",
      Boolean(h.ghl?.configured),
      h.ghl
        ? h.ghl.configured
          ? "Connected"
          : "Not connected — the nurture branch stays drawn but unwired."
        : "This deploy of the API predates the check.",
    ],
  ];

  return (
    <>
      <PageHeader title="Connections" blurb="What's wired up, and what's armed." />
      <ul className="fade-up mt-8 space-y-2">
        {rows.map(([name, ok, detail]) => (
          <li key={name} className="rounded-2xl border border-line/80 bg-panel p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-[13.5px]">{name}</span>
              <Pill tone={ok ? "accent" : "neutral"}>{ok ? "on" : "off"}</Pill>
            </div>
            <p className="mt-1 text-[11.5px] leading-relaxed text-muted">{detail}</p>
          </li>
        ))}
      </ul>
      <p className="mt-4 rounded-2xl border border-line/80 bg-panel p-4 text-[11.5px] leading-relaxed text-muted">
        <span className="font-semibold">Email from this domain goes to colleagues only</span> —
        {" "}{h.emailPolicy.internalDomains.map((d) => `@${d}`).join(", ")}. Anything else is refused
        at the send path. {h.emailPolicy.note}
      </p>
      <p className="mt-3 text-[11px] leading-relaxed text-muted">
        Switches live in Railway, not here. This page reports; it never changes anything — a page
        that could arm a send is a page that can arm one by accident.
      </p>

      {/* The full wiring sheet, moved off an agent's profile. James: "they
          don't need to see that, that's for my referencing and testing."
          Their own Connections tab stays where it was; this is the detail
          behind it, and it belongs to whoever is debugging. */}
      <section className="fade-up mt-4">
        <WiringSheet />
      </section>
    </>
  );
}
