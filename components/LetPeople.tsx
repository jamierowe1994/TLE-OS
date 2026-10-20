"use client";

import { useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import ContactBlock from "@/components/ContactBlock";
import HomeLandlords, { AddPersonModal, type MainLandlord } from "@/components/HomeLandlords";

/**
 * THE PEOPLE ON A LET, EACH ONE OPENABLE AND CHANGEABLE (James, 20 Oct 2026).
 *
 * "Once a let is on Applications there's no easy way to open the landlord's
 * or the tenants' details and change anything." And: "a home can be owned by
 * several people, so there should always be an Add landlord."
 *
 *   - LandlordsBox: every landlord on the let, each editable where it can
 *     be (REX contacts through the contact block, everyone else kept on the
 *     let), with Add landlord always there. Every let needs one: none held
 *     says so in pink with the button beside it.
 *   - PropolyLine: one line per person saying how they stand on the let's
 *     Propoly deal (lib/let-propoly-sync): the same, different (change it in
 *     Propoly - it can't take changes from here), or missing (Add to the
 *     Propoly deal).
 *   - PropolySummary: the deal, and anyone on it who isn't on the let.
 */

export type Party = {
  key: string;
  role: "tenant" | "landlord";
  source: "rex" | "added" | "propoly" | "record" | "changed";
  name: string;
  email: string | null;
  phone: string | null;
  contactId: string | null;
  isPrimary: boolean;
  address: string | null;
  reference?: boolean;
};
export type Check = { state: "on-deal" | "differs" | "missing" | "sent" | "would" | "failed"; detail: string; canAdd?: boolean };
export type Picture = {
  deal: { id: string; url: string; status: string; how: string } | null;
  live: boolean;
  checks: Record<string, Check>;
  extra: Array<{ role: "tenant" | "landlord"; name: string; email: string | null; phone: string | null }>;
};
export type PeopleAnswer = { ok?: boolean; error?: string; let?: { people?: Party[] } & Record<string, unknown>; propoly?: Picture | null; sync?: { state: string; detail: string } | null };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const eyebrow = "text-[10.5px] font-semibold uppercase tracking-wide text-muted";

/** POST to the let's people route; the answer is the let as GET gives it. */
export async function changePeople(letId: string, body: Record<string, unknown>): Promise<PeopleAnswer> {
  return fetch(`/api/applications/${encodeURIComponent(letId)}/people`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
    .then((r) => r.json() as Promise<PeopleAnswer>)
    .catch(() => ({ ok: false, error: "That didn't go through. Try again." }));
}

/** Where somebody comes from, in a few words under their card. */
export function sourceWords(p: Party): string | null {
  if (p.source === "added") return "Added on this let";
  if (p.source === "propoly") return "From the Propoly deal - changes are kept here";
  if (p.source === "record") return "From the home's record - change them on the home's page";
  if (p.source === "changed") return "Changed in the OS with Change landlord";
  return null;
}

const TONE: Record<Check["state"], { dot: string; text: string }> = {
  "on-deal": { dot: "bg-[#56634a]", text: "text-[#56634a]" },
  sent: { dot: "bg-[#56634a]", text: "text-[#56634a]" },
  differs: { dot: "bg-[#b7791f]", text: "text-[#8a5a12]" },
  would: { dot: "bg-line", text: "text-muted" },
  missing: { dot: "bg-line", text: "text-muted" },
  failed: { dot: "bg-accent-dark", text: "text-accent-dark" },
};

export function PropolyLine({ letId, party, picture, onAnswer }: { letId: string; party: Party; picture: Picture | null; onAnswer: (j: PeopleAnswer) => void }) {
  const [busy, setBusy] = useState(false);
  const check = picture?.checks[party.key];
  if (!picture?.deal || !check) return null;
  const tone = TONE[check.state];
  async function add() {
    setBusy(true);
    onAnswer(await changePeople(letId, { action: "send", key: party.key }));
    setBusy(false);
  }
  return (
    <div className="mt-2.5 flex flex-wrap items-start gap-x-2 gap-y-1.5 rounded-lg bg-card px-3 py-2 text-[11.5px] leading-relaxed">
      <span aria-hidden className={`mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full ${tone.dot}`} />
      {/* Full width on a phone, so a link or button beside it drops underneath rather than squeezing it. */}
      <span className={`min-w-0 flex-1 basis-[calc(100%-1rem)] sm:basis-0 ${tone.text}`}>{check.detail}</span>
      {check.state === "differs" && (
        <a href={picture.deal.url} target="_blank" rel="noreferrer" className="ml-3.5 shrink-0 font-semibold text-ink underline underline-offset-2 sm:ml-0">
          Open the deal ↗
        </a>
      )}
      {check.canAdd && party.source !== "record" && (
        <button type="button" disabled={busy} onClick={() => void add()} className="ml-3.5 shrink-0 rounded-full border sm:ml-0 border-accent-dark/50 bg-white px-2.5 py-0.5 font-semibold text-accent-dark hover:bg-accent-soft disabled:opacity-50">
          {busy ? "Sending…" : picture.live ? "Add to the Propoly deal" : "Rehearse adding to Propoly"}
        </button>
      )}
    </div>
  );
}

/** The deal at the top of the people, and anyone on it this let hasn't got. */
export function PropolySummary({ picture, people }: { picture: Picture | null; people: Party[] }) {
  if (!picture) return null;
  if (!picture.deal) return null;
  const differs = people.filter((p) => picture.checks[p.key]?.state === "differs").length;
  return (
    <div className="rounded-xl border border-line/50 bg-white px-4 py-3 text-[12px] leading-relaxed">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-semibold">
          <DoodleIcon name="key" size={13} className="text-accent-dark" />
          Propoly deal · {picture.deal.status}
        </span>
        <a href={picture.deal.url} target="_blank" rel="noreferrer" className="text-[11.5px] font-semibold text-accent-dark hover:underline">
          Open in Propoly ↗
        </a>
      </div>
      <p className="mt-1 text-muted">
        {differs
          ? `${differs} ${differs === 1 ? "person differs" : "people differ"} from Propoly. Propoly can't take changes from here, so change ${differs === 1 ? "it" : "them"} on the deal in Propoly.`
          : "Everyone here is checked against the deal."}{" "}
        {picture.live
          ? "Anyone added on this let goes onto the deal."
          : "Practice mode: anyone added on this let is rehearsed, nothing is sent to Propoly yet."}
      </p>
      {picture.extra.length > 0 && (
        <p className="mt-1.5 text-muted">
          On the Propoly deal but not on this let:{" "}
          <span className="text-ink">{picture.extra.map((x) => `${x.name} (${x.role})`).join(", ")}</span>.
        </p>
      )}
    </div>
  );
}

export function LandlordsBox({
  letId,
  homeKey,
  people,
  picture,
  problem,
  propertyAddress,
  onAnswer,
  reload,
}: {
  letId: string;
  /** Where the home's extra landlords and points of contact are kept (lib/let-people homeKey). */
  homeKey: string | null;
  people: Party[] | null;
  picture: Picture | null;
  problem: string | null;
  propertyAddress: string;
  onAnswer: (j: PeopleAnswer) => void;
  reload: () => void;
}) {
  /* The landlords the let's records hold; additional ones are the home's, shown by the section. */
  const main: MainLandlord[] | null =
    people === null
      ? null
      : people
          .filter((p) => p.role === "landlord" && !p.key.startsWith("home-person:"))
          .map((p) => ({
            key: p.key,
            name: p.name,
            email: p.email,
            phone: p.phone,
            personRef: refFor(p, homeKey),
            saver: p.source === "propoly" ? saverFor(letId, p, onAnswer) : undefined,
            note: sourceWords(p),
            after: <PropolyLine letId={letId} party={p} picture={picture} onAnswer={onAnswer} />,
            onSaved: () => void changePeople(letId, { action: "changed", key: p.key }).then(onAnswer),
          }));
  return (
    <div className="mt-5" data-steve="application.landlords">
      <HomeLandlords
        homeKey={homeKey}
        address={propertyAddress}
        main={main}
        mainProblem={problem}
        addLandlord={async (f) => {
          const j = await changePeople(letId, { action: "add-landlord", name: f.name, email: f.email, phone: f.phone, address: f.address, relation: f.relation });
          if (!j.ok) return { ok: false, error: j.error ?? "That didn't save." };
          onAnswer(j);
          return { ok: true };
        }}
        extraLine={(h) => {
          const party = (people ?? []).find((p) => p.key === `home-person:${h.id}`);
          return party ? <PropolyLine letId={letId} party={party} picture={picture} onAnswer={onAnswer} /> : null;
        }}
        onChanged={(h) => {
          /* A changed additional landlord is checked against Propoly again; anything else just reads again. */
          if (h?.kind === "joint_landlord") void changePeople(letId, { action: "changed", key: `home-person:${h.id}` }).then((j) => (j.ok ? onAnswer(j) : reload()));
          else reload();
        }}
      />
    </div>
  );
}

/** How a person on the let is changed: REX, the home's record, or (null) the screen's own saver. */
export function refFor(p: Party, homeKey: string | null): string | null {
  if (p.source === "rex" && p.contactId && /^\d+$/.test(p.contactId)) return `rex:${p.contactId}`;
  if (p.source === "record" && homeKey) return `home:${homeKey}`;
  return null;
}

/** Somebody only the let holds (Propoly's copy, added on the let): saved on the let. */
export function saverFor(letId: string, p: Party, onAnswer: (j: PeopleAnswer) => void) {
  return async (field: "name" | "email" | "phone", value: string) => {
    const j = await changePeople(letId, { action: "edit", key: p.key, [field]: value });
    if (j.ok) onAnswer(j);
    return { ok: Boolean(j.ok), error: j.error, detail: j.sync?.detail ?? "Saved on the let." };
  };
}

/**
 * One person's phone and email, changeable. REX contacts save through the
 * contact block's own route (and REX); anybody else saves on the let. Either
 * way the let is then checked against Propoly again.
 */
export function PartyContact({ letId, party, propertyAddress, onAnswer, showName = false, homeKey = null }: { letId: string; party: Party; propertyAddress?: string; onAnswer: (j: PeopleAnswer) => void; showName?: boolean; homeKey?: string | null }) {
  const ref = refFor(party, homeKey);
  const editable = !ref && (party.source === "added" || party.source === "propoly");
  return (
    <ContactBlock
      showName={showName}
      role={party.role === "landlord" ? "landlord" : party.isPrimary ? "lead applicant" : "applicant"}
      person={{ name: party.name, email: party.email, phone: party.phone }}
      personRef={ref}
      home={party.role === "landlord" ? { propertyAddress } : undefined}
      about={propertyAddress}
      onSaved={ref ? () => void changePeople(letId, { action: "changed", key: party.key }).then(onAnswer) : undefined}
      saver={editable ? saverFor(letId, party, onAnswer) : undefined}
    />
  );
}

/** Add a landlord from the let (its drawer): onto the home, then to Propoly where the let has a deal. */
export function AddLandlord({ letId, hasDeal, live, propertyAddress, onClose, onAdded }: { letId: string; hasDeal: boolean; live: boolean; propertyAddress: string; onClose: () => void; onAdded: (j: PeopleAnswer) => void }) {
  const note = !hasDeal
    ? "Kept on the home, so they show on its listing, its lets and its page. There's no Propoly deal for this let yet: once there is, press Add to the Propoly deal on them."
    : live
      ? "Kept on the home, and sent to Propoly straight away: found or created as a landlord and linked to the home. Propoly needs an email and a mobile number."
      : "Kept on the home. Practice mode: Propoly isn't sent anything yet, the let shows what would go. Propoly needs an email and a mobile number.";
  return (
    <AddPersonModal
      kind="joint_landlord"
      address={propertyAddress}
      note={note}
      onClose={onClose}
      onSubmit={async (f) => {
        const j = await changePeople(letId, { action: "add-landlord", name: f.name, email: f.email, phone: f.phone, address: f.address, relation: f.relation });
        if (!j.ok) return { ok: false, error: j.error ?? "That didn't save." };
        onAdded(j);
        return { ok: true };
      }}
    />
  );
}
