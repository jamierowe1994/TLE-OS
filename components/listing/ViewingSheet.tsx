"use client";

import { useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import {
  AccessComposer,
  AccessSettings,
  AccessSheet,
  type Access,
  type AccessRequestRecord,
} from "@/components/listing/AccessRequest";

/**
 * ONE VIEWING, OPENED (James, 20 Sep 2026: "you click it, and then it will
 * open out a separate window showing the viewing, all of the details, and
 * whether we've got access or not").
 *
 * The listing's Viewings tab used to expand a row in place, which had the
 * details but buried the thing that decides whether the viewing can happen at
 * all. Here access is the second thing on the screen, and it reads as one
 * sentence: how we get in, whether we have asked, whether they have said yes.
 *
 * Three states, and only one of them is a dead end:
 *
 *   nothing recorded   → Add access details, and nothing else is offered.
 *                        You cannot ask a person we have not named.
 *   vacant             → the keys, and whether they are in the office
 *   tenant / landlord  → ask them (the draft, hanging off THIS viewing),
 *                        then Access confirmed when they say yes
 *
 * The record itself is the listing's (os_case_state "access"); this only ever
 * hands changes back up.
 */

export interface SheetViewing {
  id: string;
  startsAt: string;
  mins: number;
  type: string | null;
  status: string | null;
  cancelled: boolean;
  agent: string | null;
  description: string | null;
  feedbackId: string | null;
  contacts: Array<{ id: string; name: string; email: string | null; phone: string | null; leadId?: string | null }>;
}

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    timeZone: "Europe/London", weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit",
  });

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

export default function ViewingSheet({
  viewing: v,
  address,
  agent,
  access,
  onAccess,
  accessLoading = false,
  tenant,
  landlord,
  onApply,
  onClose,
}: {
  viewing: SheetViewing;
  address: string;
  agent: string;
  access: Access;
  onAccess: (a: Access) => void;
  accessLoading?: boolean;
  tenant?: { name: string; email: string; phone: string } | null;
  landlord?: { name: string; email: string | null; phone: string | null } | null;
  onApply?: (p: { id: string; name: string; phone?: string | null }) => void;
  onClose: () => void;
}) {
  const [setting, setSetting] = useState(false);
  const [asking, setAsking] = useState(false);
  const past = new Date(v.startsAt).getTime() < Date.now();
  const request: AccessRequestRecord | undefined = (access.requests ?? {})[v.id];
  const who = access.kind === "tenant" ? "tenant" : "landlord";

  const confirm = () =>
    onAccess({
      ...access,
      requests: {
        ...(access.requests ?? {}),
        [v.id]: {
          viewingId: v.id,
          when: v.startsAt,
          to: request?.to ?? access.email,
          requestedAt: request?.requestedAt ?? new Date().toISOString(),
          grantedAt: new Date().toISOString(),
        },
      },
    });

  /** The access line, in a word, and its colour. */
  const state = !access.kind
    ? { tone: "bg-accent-soft/70 text-accent-dark", text: "No access details yet" }
    : access.kind === "vacant"
      ? access.keysCollected
        ? { tone: "bg-[#e7ece0] text-[#43513a]", text: "Vacant · keys in the office" }
        : { tone: "bg-accent-soft/70 text-accent-dark", text: "Vacant · keys not collected" }
      : request?.grantedAt
        ? { tone: "bg-[#e7ece0] text-[#43513a]", text: `Access confirmed ${day(request.grantedAt)}` }
        : request
          ? { tone: "bg-accent-soft/70 text-accent-dark", text: `Asked ${day(request.requestedAt)} · no answer yet` }
          : { tone: "bg-accent-soft/70 text-accent-dark", text: `Access not asked for yet` };

  const pill = "rounded-full border border-line/80 bg-white px-3.5 py-1.5 text-[12px] font-semibold transition-colors hover:border-ink/40";
  const solid = "rounded-full bg-accent-dark px-4 py-1.5 text-[12px] font-semibold text-white transition-opacity hover:opacity-90";

  return (
    <AccessSheet title="The viewing" onClose={onClose} wide>
      <div className="space-y-4">
        {/* ── when and where ── */}
        <section className="rounded-2xl border border-line/60 p-4">
          <p className="text-[15px] font-semibold">{address}</p>
          <p className="mt-1 text-[13px]">{when(v.startsAt)}</p>
          <p className="mt-1 text-[11.5px] text-muted">
            {v.mins} minutes
            {v.type ? ` · ${v.type}` : ""}
            {v.agent ? ` · with ${v.agent}` : ""}
            {v.cancelled ? " · cancelled" : past ? (v.feedbackId ? " · feedback in" : " · been") : ` · ${v.status ?? "booked"}`}
          </p>
          {v.description && <p className="mt-2 whitespace-pre-line text-[12px] leading-relaxed text-muted">{v.description}</p>}
        </section>

        {/* ── can we get in? ── */}
        <section className="rounded-2xl border border-line/60 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="hand flex items-center gap-2 text-[15px]">
              <DoodleIcon name="key" size={14} className="text-accent-dark" />
              Getting in
            </p>
            <span className={`rounded-full px-3 py-1 text-[11.5px] font-semibold ${state.tone}`}>{state.text}</span>
          </div>

          {accessLoading ? (
            <p className="mt-3 text-[12.5px] text-muted">Reading the property&rsquo;s access&hellip;</p>
          ) : !access.kind ? (
            <>
              <p className="mt-2 max-w-xl text-[12.5px] leading-relaxed text-muted">
                Nobody has said how we get into this property yet - keys, the tenant, or the landlord. Add that first and the
                asking follows from it.
              </p>
              <button type="button" onClick={() => setSetting(true)} className={`${solid} mt-3`}>
                Add access details
              </button>
            </>
          ) : (
            <>
              <dl className="mt-3 space-y-1.5 text-[12.5px]">
                <div className="flex gap-3">
                  <dt className="w-[110px] shrink-0 text-muted">How</dt>
                  <dd className="font-medium">
                    {access.kind === "vacant" ? "Vacant - we hold the keys" : access.kind === "tenant" ? "Through the tenant" : "Through the landlord"}
                  </dd>
                </div>
                {access.kind !== "vacant" && (
                  <>
                    <div className="flex gap-3">
                      <dt className="w-[110px] shrink-0 text-muted">Who</dt>
                      <dd className="font-medium">{access.name || <span className="text-accent-dark">No name recorded</span>}</dd>
                    </div>
                    <div className="flex gap-3">
                      <dt className="w-[110px] shrink-0 text-muted">Number</dt>
                      <dd>{access.phone ? <a href={`tel:${access.phone.replace(/\s+/g, "")}`} className="hover:underline">{access.phone}</a> : <span className="text-muted">Not recorded</span>}</dd>
                    </div>
                    <div className="flex gap-3">
                      <dt className="w-[110px] shrink-0 text-muted">Email</dt>
                      <dd>{access.email ? <a href={`mailto:${access.email}`} className="hover:underline">{access.email}</a> : <span className="text-muted">Not recorded</span>}</dd>
                    </div>
                  </>
                )}
                {request && (
                  <div className="flex gap-3">
                    <dt className="w-[110px] shrink-0 text-muted">Asked</dt>
                    <dd>
                      {day(request.requestedAt)}
                      {request.to ? ` · ${request.to}` : ""}
                    </dd>
                  </div>
                )}
              </dl>

              <div className="mt-3.5 flex flex-wrap items-center gap-2">
                {access.kind === "vacant" ? (
                  <button type="button" onClick={() => onAccess({ ...access, keysCollected: !access.keysCollected })} className={pill}>
                    {access.keysCollected ? "Keys are back in the office" : "Keys collected"}
                  </button>
                ) : (
                  <>
                    {!past && (
                      <button type="button" onClick={() => setAsking(true)} className={request ? pill : solid} disabled={!access.email}>
                        {request ? `Ask the ${who} again` : `Ask the ${who} for access`}
                      </button>
                    )}
                    {!request?.grantedAt && (
                      <button type="button" onClick={confirm} className={request ? solid : pill}>
                        Access confirmed
                      </button>
                    )}
                    {!access.email && <span className="text-[11.5px] text-accent-dark">No email for the {who} yet - add one to ask by email.</span>}
                  </>
                )}
                <button type="button" onClick={() => setSetting(true)} className="text-[11.5px] font-semibold text-muted underline underline-offset-2 hover:text-ink">
                  Change how we get in
                </button>
              </div>
            </>
          )}
        </section>

        {/* ── who is coming ── */}
        <section className="rounded-2xl border border-line/60 p-4">
          <p className="hand flex items-center gap-2 text-[15px]">
            <DoodleIcon name="user" size={14} className="text-accent-dark" />
            Who is coming
          </p>
          {v.contacts.length === 0 ? (
            <p className="mt-2 text-[12.5px] text-muted">Nobody is named on this viewing.</p>
          ) : (
            <ul className="mt-3 space-y-2.5">
              {v.contacts.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12.5px]">
                  {c.leadId ? (
                    <a href={`/leads?open=${encodeURIComponent(c.leadId)}`} className="font-semibold underline decoration-line underline-offset-2 hover:decoration-ink">
                      {c.name}
                    </a>
                  ) : (
                    <span className="font-semibold">{c.name}</span>
                  )}
                  {c.phone && <a href={`tel:${c.phone.replace(/\s+/g, "")}`} className="text-muted hover:text-ink">{c.phone}</a>}
                  {c.email && <a href={`mailto:${c.email}`} className="text-muted hover:text-ink">{c.email}</a>}
                  {c.leadId && (
                    <a href={`/leads?open=${encodeURIComponent(c.leadId)}`} className="rounded-full border border-line/80 px-2.5 py-0.5 text-[11px] hover:border-ink/40">
                      Open the tenant
                    </a>
                  )}
                  {onApply && (
                    <button
                      type="button"
                      onClick={() => onApply({ id: c.id, name: c.name, phone: c.phone })}
                      className="rounded-full border border-accent-dark/50 px-2.5 py-0.5 text-[11px] font-semibold text-accent-dark hover:border-accent-dark"
                    >
                      Make an application
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {setting && (
        <AccessSheet title="How do we get in?" onClose={() => setSetting(false)}>
          <AccessSettings value={access} onChange={onAccess} tenant={tenant} landlord={landlord} onDone={() => setSetting(false)} />
        </AccessSheet>
      )}

      {asking && access.kind && access.kind !== "vacant" && (
        <AccessSheet title={`Ask the ${who} for access`} onClose={() => setAsking(false)} wide>
          {/* This viewing, and only this one - the request is for the day on
              the screen behind it. */}
          <AccessComposer
            access={access}
            address={address}
            agent={agent}
            viewings={[{ id: v.id, startsAt: v.startsAt, who: v.contacts[0]?.name ?? "" }]}
            onSent={(r) => {
              onAccess({ ...access, requests: { ...(access.requests ?? {}), [r.viewingId]: r } });
              setAsking(false);
            }}
            onClose={() => setAsking(false)}
          />
        </AccessSheet>
      )}
    </AccessSheet>
  );
}
