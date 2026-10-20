"use client";

import { useEffect, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import ContactBlock from "@/components/ContactBlock";

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
  people,
  picture,
  problem,
  propertyAddress,
  onAnswer,
  onOpen,
}: {
  letId: string;
  people: Party[] | null;
  picture: Picture | null;
  problem: string | null;
  propertyAddress: string;
  onAnswer: (j: PeopleAnswer) => void;
  onOpen: (index: number) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const landlords = (people ?? []).filter((p) => p.role === "landlord");

  async function remove(p: Party) {
    setMsg(null);
    const j = await changePeople(letId, { action: "remove-landlord", key: p.key });
    if (!j.ok) return setMsg(j.error ?? "That didn't save.");
    onAnswer(j);
    if (j.sync?.detail) setMsg(j.sync.detail);
  }

  return (
    <div data-steve="application.landlords">
      <div className="mb-3 mt-5 flex items-center justify-between gap-3">
        <p className={eyebrow}>{landlords.length > 1 ? `The landlords · ${landlords.length}` : "The landlord"}</p>
        <button
          type="button"
          onClick={() => setAdding(true)}
          disabled={people === null}
          className="inline-flex items-center gap-1.5 rounded-full border border-accent-dark/50 bg-white px-3 py-1 text-[11.5px] font-semibold text-accent-dark transition-colors hover:bg-accent-soft disabled:opacity-50"
        >
          + Add landlord
        </button>
      </div>
      {people === null ? (
        <p className="flex items-center gap-2 text-[12px] text-muted">
          <span aria-hidden className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-line border-t-accent-dark" />
          Looking up the landlord&hellip;
        </p>
      ) : landlords.length ? (
        <ul className="grid grid-cols-1 gap-3 2xl:grid-cols-2">
          {landlords.map((p, i) => (
            <li key={p.key} className="rounded-xl border border-line/50 bg-white p-3.5">
              <div className="mb-2 flex items-center justify-between gap-2">
                <button type="button" onClick={() => onOpen(i)} className="truncate text-left text-[13px] font-semibold underline-offset-2 hover:underline">
                  {p.name}
                </button>
                {p.source === "added" && landlords.length > 1 && (
                  <button type="button" onClick={() => void remove(p)} className="shrink-0 text-[11.5px] font-semibold text-muted hover:text-ink">Take off</button>
                )}
              </div>
              <PartyContact letId={letId} party={p} propertyAddress={propertyAddress} onAnswer={onAnswer} />
              {sourceWords(p) && <p className="mt-1.5 text-[11px] text-muted">{sourceWords(p)}</p>}
              <PropolyLine letId={letId} party={p} picture={picture} onAnswer={onAnswer} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#fdefec] px-4 py-3 text-[12.5px] text-[#9d4340]">
          <span>
            <b className="font-semibold">No landlord on this let.</b> Every let needs one.{problem ? ` ${problem}` : ""}
          </span>
          <button type="button" onClick={() => setAdding(true)} className="shrink-0 rounded-full bg-accent-dark px-3.5 py-1.5 text-[12px] font-semibold text-page">
            Add the landlord
          </button>
        </div>
      )}
      {msg && <p className="mt-2 text-[12px] text-muted">{msg}</p>}
      {adding && (
        <AddLandlord
          letId={letId}
          hasDeal={Boolean(picture?.deal)}
          live={Boolean(picture?.live)}
          propertyAddress={propertyAddress}
          onClose={() => setAdding(false)}
          onAdded={(j) => {
            setAdding(false);
            onAnswer(j);
            /* With a deal, their own Propoly line says what happened. */
            if (j.sync?.detail && !j.propoly?.deal) setMsg(j.sync.detail);
          }}
        />
      )}
    </div>
  );
}

/**
 * One person's phone and email, changeable. REX contacts save through the
 * contact block's own route (and REX); anybody else saves on the let. Either
 * way the let is then checked against Propoly again.
 */
export function PartyContact({ letId, party, propertyAddress, onAnswer, showName = false }: { letId: string; party: Party; propertyAddress?: string; onAnswer: (j: PeopleAnswer) => void; showName?: boolean }) {
  const rex = party.source === "rex" && party.contactId && /^\d+$/.test(party.contactId);
  const editable = party.source === "added" || party.source === "propoly";
  return (
    <ContactBlock
      showName={showName}
      role={party.role === "landlord" ? "landlord" : party.isPrimary ? "lead applicant" : "applicant"}
      person={{ name: party.name, email: party.email, phone: party.phone }}
      personRef={rex ? `rex:${party.contactId}` : null}
      home={party.role === "landlord" ? { propertyAddress } : undefined}
      about={propertyAddress}
      onSaved={rex ? () => void changePeople(letId, { action: "changed", key: party.key }).then(onAnswer) : undefined}
      saver={
        editable
          ? async (field, value) => {
              const j = await changePeople(letId, { action: "edit", key: party.key, [field]: value });
              if (j.ok) onAnswer(j);
              return { ok: Boolean(j.ok), error: j.error, detail: j.sync?.detail ?? "Saved on the let." };
            }
          : undefined
      }
    />
  );
}

export function AddLandlord({ letId, hasDeal, live, propertyAddress, onClose, onAdded }: { letId: string; hasDeal: boolean; live: boolean; propertyAddress: string; onClose: () => void; onAdded: (j: PeopleAnswer) => void }) {
  const [d, setD] = useState({ name: "", email: "", phone: "", address: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function save() {
    if (!d.name.trim()) return setMsg("What is the landlord's name?");
    if (!d.email.trim()) return setMsg("They need an email address - the contracts and Propoly go to it.");
    if (!EMAIL.test(d.email.trim())) return setMsg("That email doesn't look right.");
    setBusy(true);
    setMsg(null);
    const j = await changePeople(letId, { action: "add-landlord", ...d });
    setBusy(false);
    if (!j.ok) return setMsg(j.error ?? "That didn't save. Try again.");
    onAdded(j);
  }

  const where = !hasDeal
    ? "Kept on the let. There's no Propoly deal for it yet: once there is, press Add to the Propoly deal on them."
    : live
      ? "Goes to Propoly straight away: found or created as a landlord and linked to the home."
      : "Kept on the let. Practice mode: Propoly isn't sent anything yet, the let shows what would go.";
  const field = "mt-1 w-full rounded-xl border border-line/80 bg-white px-3 py-2 text-[13px] outline-none focus:border-ink/40";
  const label = "block text-[11px] font-semibold text-muted";
  return (
    <div className="fixed inset-0 z-[160] flex items-center justify-center p-4">
      <button type="button" aria-label="Cancel" onClick={() => !busy && onClose()} className="absolute inset-0 cursor-default bg-ink/45" />
      <div role="dialog" aria-label="Add a landlord" className="fade-up relative max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-3xl border border-line/80 bg-page shadow-[0_30px_70px_-20px_rgba(0,0,0,0.5)]">
        <div className="px-6 pb-2 pt-5">
          <h2 className="text-[20px] font-normal tracking-normal">Add a Landlord</h2>
          <p className="mt-1 text-[12.5px] leading-relaxed text-muted">Somebody else who owns {propertyAddress || "the home"}, or the landlord if none is held.</p>
          <div
            className="mt-4 space-y-3"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") {
                e.preventDefault();
                void save();
              }
            }}
          >
            <label className="block"><span className={label}>Full name</span><input autoFocus value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} className={field} placeholder="As on their ID, or the company's name" /></label>
            <label className="block"><span className={label}>Email</span><input type="email" value={d.email} onChange={(e) => setD({ ...d, email: e.target.value })} className={field} placeholder="name@example.com" /></label>
            <label className="block"><span className={label}>Mobile</span><input type="tel" value={d.phone} onChange={(e) => setD({ ...d, phone: e.target.value })} className={field} placeholder="07..." /></label>
            <label className="block">
              <span className={label}>Their own home address</span>
              <input value={d.address} onChange={(e) => setD({ ...d, address: e.target.value })} className={field} placeholder="Where they live, with the postcode" />
            </label>
            {propertyAddress && (
              <button type="button" onClick={() => setD({ ...d, address: propertyAddress })} className="text-[11.5px] font-semibold text-accent-dark hover:underline">
                Same as the let property
              </button>
            )}
            <p className="text-[11.5px] leading-relaxed text-muted">{where} Propoly needs an email and a mobile number.</p>
          </div>
          {msg && <p className="mt-3 text-[12.5px] font-semibold text-accent-dark">{msg}</p>}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-line/60 px-6 py-4">
          <button type="button" onClick={onClose} disabled={busy} className="rounded-full border border-line/80 px-4 py-2 text-[12.5px] font-semibold hover:border-ink/40 disabled:opacity-50">Cancel</button>
          <button type="button" onClick={() => void save()} disabled={busy} className="rounded-full bg-accent-dark px-5 py-2 text-[12.5px] font-semibold text-page disabled:opacity-50">{busy ? "Saving…" : "Add them"}</button>
        </div>
      </div>
    </div>
  );
}
