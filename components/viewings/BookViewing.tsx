"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import DoodleIcon from "@/components/DoodleIcon";
import { PressButton } from "@/components/Bits";
import ViewingBooker, { type BookedResult } from "@/components/ViewingBooker";
import { OS_LEAD_PREFIX } from "@/lib/contacts-as-leads";
import type { ScoredMatch } from "@/lib/contact-match";

/**
 * Book a viewing from a LISTING or from the Viewings screen (Howard's tickets,
 * approved by James 1 Oct 2026), rather than from the tenant's lead.
 *
 * The first question is who. The agent picks a tenant we already hold - a
 * lead on file or somebody added by hand - or adds someone new, who is saved
 * as a tenant contact exactly as Add new lead saves one (POST /api/contacts).
 * Then the same booker the lead uses, and the same road to the diary: POST
 * /api/viewings/book (the agent's Outlook, the silent mirror) and the
 * confirmation through /api/confirmations. Nothing new is written anywhere.
 *
 * From a listing the home is already chosen and the booker opens on the
 * diary. From Viewings the booker's own property step asks which home.
 */

export type BookHome = {
  id: string;
  name: string;
  locality: string;
  rent: number | null;
  image: string | null;
  propertyId?: string | null;
};

type OnFile = {
  leadId: string;
  name: string;
  email: string;
  phone: string;
  contactId: string | null;
  note: string;
};

export type BookedViewing = { when: string; who: string; property: string; leadId: string; said: string };

const field =
  "w-full rounded-xl border border-line/80 bg-white px-3.5 py-2.5 text-[13px] outline-none transition-colors focus:border-ink";

export default function BookViewing({
  open,
  onClose,
  home = null,
  occupant = null,
  onBooked,
}: {
  open: boolean;
  onClose: () => void;
  /** The listing it was opened from. Null = the agent picks the home. */
  home?: BookHome | null;
  /** The sitting tenant, for the booker's courtesy heads-up. */
  occupant?: { name: string; email: string; phone: string } | null;
  onBooked?: (v: BookedViewing) => void;
}) {
  const [person, setPerson] = useState<OnFile | null>(null);
  const [booker, setBooker] = useState(false);

  useEffect(() => {
    if (!open) {
      setPerson(null);
      setBooker(false);
    }
  }, [open]);

  async function book(p: OnFile, v: Parameters<Parameters<typeof ViewingBooker>[0]["onBooked"]>[0]): Promise<BookedResult> {
    if (!v.startsAt) return { said: "Pick a time first." };
    const confirm = {
      leadId: p.leadId,
      listingId: v.listingId,
      applicantName: p.name,
      applicantEmail: p.email || null,
      address: v.property,
      startsAt: v.startsAt,
      minutes: v.minutes,
      unaccompanied: Boolean(v.unaccompanied),
    };
    const j = await fetch("/api/viewings/book", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...confirm, contactId: p.contactId }),
    })
      .then((r) => r.json() as Promise<{ ok?: boolean; said?: string; viewingId?: string | null; outlook?: { ok?: boolean; detail?: string } }>)
      .catch(() => null);
    const said: string[] = [];
    if (!j) said.push("Couldn't reach the server: check your calendar and tell the applicant yourself.");
    else if (!j.ok) said.push(j.said ?? "That didn't book. Check your calendar before trying again.");
    else said.push(j.outlook?.ok ? "In your Outlook calendar." : (j.outlook?.detail ?? j.said ?? "Booked."));
    if (j?.ok && v.confirmation?.send) {
      const c = await fetch("/api/confirmations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "send", kind: "viewing", booking: confirm, subject: v.confirmation.subject, html: v.confirmation.html, again: v.confirmation.again }),
      })
        .then((r) => r.json() as Promise<{ sent?: boolean; detail?: string; error?: string }>)
        .catch(() => null);
      said.push(c?.sent ? `Confirmation sent. ${c.detail ?? ""}`.trim() : `The confirmation did not send: ${String(c?.detail ?? c?.error ?? "the connection dropped").replace(/\.+$/, "")}. Send it from their lead.`);
    } else if (j?.ok) {
      said.push("No confirmation sent. Send it from their lead when you are ready.");
    }
    if (j?.ok) onBooked?.({ when: v.when, who: p.name, property: v.property, leadId: p.leadId, said: said.join(" ") });
    return {
      said: said.join(" "),
      viewingId: j?.viewingId ?? null,
      failed: !j?.ok,
      goTo: {
        ask: j?.ok ? `The viewing is on ${p.name.split(" ")[0] || "their"}'s file too.` : `${p.name.split(" ")[0] || "Their"}'s file is on the Leads board.`,
        label: "Open their lead",
        href: `/leads?open=${encodeURIComponent(p.leadId)}`,
        stay: home ? "Stay on the listing" : "Stay on Viewings",
      },
    };
  }

  if (!open) return null;

  return (
    <>
      {!booker && (
        <WhoIsViewing
          home={home}
          onClose={onClose}
          onPick={(p) => {
            setPerson(p);
            setBooker(true);
          }}
        />
      )}
      <ViewingBooker
        open={booker && person != null}
        onClose={onClose}
        lead={person ? { name: person.name, email: person.email, phone: person.phone } : null}
        leadId={person?.leadId ?? null}
        occupant={occupant}
        properties={home ? [home] : []}
        firstId={home?.id ?? null}
        skipProperty={Boolean(home)}
        /* Whose diary the grid shows: the person booking it. */
        agent=""
        onBooked={(v) => (person ? book(person, v) : undefined)}
      />
    </>
  );
}

/* ── Who's viewing ──────────────────────────────────────────────────────── */

function WhoIsViewing({ home, onClose, onPick }: { home: BookHome | null; onClose: () => void; onPick: (p: OnFile) => void }) {
  const [mode, setMode] = useState<"file" | "new">("file");
  const [find, setFind] = useState("");
  const [people, setPeople] = useState<OnFile[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  /* Who enquired about this home, before anything is typed; then the search,
     half a second after they stop typing. */
  useEffect(() => {
    if (mode !== "file") return;
    const needle = find.trim();
    if (needle.length > 0 && needle.length < 3) return;
    if (!needle && !home) {
      setPeople([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      setPeople(null);
      setProblem(null);
      const qs = new URLSearchParams();
      if (needle) qs.set("q", needle);
      if (home) qs.set("listing", home.id);
      fetch(`/api/viewings/people?${qs}`, { cache: "no-store", signal: ctrl.signal })
        .then((r) => r.json())
        .then((j: { ok?: boolean; people?: OnFile[]; error?: string }) => {
          if (ctrl.signal.aborted) return;
          if (j.ok && Array.isArray(j.people)) setPeople(j.people);
          else {
            setPeople([]);
            setProblem(j.error ?? "The search didn't answer. Try again.");
          }
        })
        .catch(() => {
          if (!ctrl.signal.aborted) {
            setPeople([]);
            setProblem("The search didn't answer. Try again.");
          }
        });
    }, needle ? 400 : 0);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [find, home, mode]);

  const needle = find.trim();

  return createPortal(
    <div className="fixed inset-0 z-[140] flex items-center justify-center p-4">
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 cursor-default bg-ink/45" />
      <div className="fade-up relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-line/80 bg-page shadow-[0_30px_70px_-20px_rgba(0,0,0,0.5)]">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line/70 px-6 py-4">
          <div className="min-w-0">
            <h2 className="text-[19px] leading-tight">Who&apos;s viewing?</h2>
            <p className="mt-0.5 truncate text-[12px] text-muted">{home ? `${home.name}${home.locality ? `, ${home.locality}` : ""}` : "Pick the person, then the home"}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line/80 text-[12px] text-muted transition-colors hover:text-ink"
          >
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <div className="mb-4 inline-flex rounded-full border border-line/70 bg-white p-1 text-[12px] font-semibold">
            {(
              [
                ["file", "Already on file"],
                ["new", "Someone new"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setMode(id)}
                className={`rounded-full px-3.5 py-1.5 transition-colors ${mode === id ? "bg-ink text-page" : "text-muted hover:text-ink"}`}
              >
                {label}
              </button>
            ))}
          </div>

          {mode === "file" ? (
            <>
              <input
                autoFocus
                value={find}
                onChange={(e) => setFind(e.target.value)}
                placeholder="Name, email or mobile…"
                className={field}
              />
              {!needle && home && people && people.length > 0 && (
                <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-muted">Asked about this home</p>
              )}
              <ul className="mt-3 space-y-2">
                {(people ?? []).map((p) => (
                  <li key={p.leadId}>
                    <button
                      type="button"
                      onClick={() => onPick(p)}
                      className="flex w-full items-center gap-3 rounded-xl border border-line/60 bg-white p-3 text-left transition-colors hover:border-ink/40"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft/60 text-accent-dark">
                        <DoodleIcon name="user" size={14} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="hand block truncate text-[13.5px]">{p.name}</span>
                        <span className="block truncate text-[11px] text-muted">{[p.email, p.phone].filter(Boolean).join(" · ") || "No contact details"}</span>
                      </span>
                      <span className="hidden shrink-0 text-[10.5px] text-muted sm:block">{p.note}</span>
                      <span aria-hidden className="text-muted">›</span>
                    </button>
                  </li>
                ))}
              </ul>
              {people === null && (needle.length >= 3 || (!needle && home)) && (
                <p className="flex items-center justify-center gap-2 py-6 text-[12px] text-muted">
                  <span aria-hidden className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-line border-t-accent-dark" />
                  {needle ? "Looking…" : "Reading who asked about this home…"}
                </p>
              )}
              {problem && <p className="py-4 text-center text-[12px] text-muted">{problem}</p>}
              {people !== null && !problem && people.length === 0 && (
                <p className="py-6 text-center text-[12.5px] leading-relaxed text-muted">
                  {needle.length >= 3
                    ? "Nobody on file matches that."
                    : needle
                      ? "Keep typing: three letters or more."
                      : home
                        ? "Nobody has asked about this home yet. Search for them, or add someone new."
                        : "Search by name, email or mobile."}
                  {needle.length >= 3 && (
                    <>
                      {" "}
                      <button type="button" onClick={() => setMode("new")} className="font-semibold text-accent-dark hover:underline">
                        Add them as someone new
                      </button>
                    </>
                  )}
                </p>
              )}
            </>
          ) : (
            <SomeoneNew seed={needle} onPick={onPick} />
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

/* ── Someone new ────────────────────────────────────────────────────────── */

function SomeoneNew({ seed, onPick }: { seed: string; onPick: (p: OnFile) => void }) {
  const looksLikeEmail = /@/.test(seed);
  const looksLikePhone = /^[+\d\s()-]{6,}$/.test(seed);
  const [name, setName] = useState(!looksLikeEmail && !looksLikePhone ? seed : "");
  const [email, setEmail] = useState(looksLikeEmail ? seed : "");
  const [mobile, setMobile] = useState(looksLikePhone ? seed : "");
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [matches, setMatches] = useState<ScoredMatch[]>([]);
  const [continuing, setContinuing] = useState<ScoredMatch | null>(null);

  /* Already somewhere on the books? Same check Add new lead makes, half a
     second after they stop typing. Choosing one links to it - nothing new is
     created for them anywhere else. */
  useEffect(() => {
    if (continuing) return;
    if (!name.trim() && !email.trim() && !mobile.trim()) {
      setMatches([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch("/api/contacts/match", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, email, mobile }),
        signal: ctrl.signal,
      })
        .then((r) => r.json())
        .then((j) => {
          if (!ctrl.signal.aborted) setMatches(Array.isArray(j.matches) ? (j.matches as ScoredMatch[]).filter((m) => m.score >= 50).slice(0, 3) : []);
        })
        .catch(() => undefined);
    }, 500);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [name, email, mobile, continuing]);

  const missing = [!name.trim() && "a name", !mobile.trim() && "a mobile"].filter(Boolean) as string[];
  const ready = missing.length === 0 && !saving;

  async function save() {
    if (!ready) return;
    setSaving(true);
    setProblem(null);
    try {
      /* A matched record that already has a lead on file: book against that
         lead, rather than starting a second file for the same person. */
      if (continuing?.id) {
        const known = await fetch(`/api/leads/by-contact?ids=${encodeURIComponent(continuing.id)}`, { cache: "no-store" })
          .then((r) => r.json() as Promise<{ ok?: boolean; leads?: Record<string, string> }>)
          .catch(() => null);
        const leadId = known?.leads?.[continuing.id];
        if (leadId) {
          onPick({ leadId, name: name.trim(), email: email.trim(), phone: mobile.trim(), contactId: continuing.id, note: "On file" });
          return;
        }
      }
      const r = await fetch("/api/contacts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "tenant",
          name: name.trim(),
          email: email.trim(),
          mobile: mobile.trim(),
          enquiry: "Viewing",
          rexId: continuing?.id ?? null,
        }),
      });
      const j = (await r.json().catch(() => ({}))) as { contact?: { id?: string; rexId?: string | null }; error?: string };
      if (!r.ok || !j.contact?.id) {
        setProblem(j.error ?? "That didn't save. Nothing has been lost from this form.");
        return;
      }
      onPick({
        leadId: OS_LEAD_PREFIX + j.contact.id,
        name: name.trim(),
        email: email.trim(),
        phone: mobile.trim(),
        contactId: j.contact.rexId ?? null,
        note: "Added just now",
      });
    } catch {
      setProblem("That didn't save - the connection dropped. Nothing has been lost from this form.");
    } finally {
      setSaving(false);
    }
  }

  const label = "mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted";
  return (
    <div className="space-y-3.5">
      <div>
        <label className={label} htmlFor="bv-name">Name</label>
        <input id="bv-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Their full name" className={field} />
      </div>
      <div className="grid gap-3.5 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="bv-mobile">Mobile</label>
          <input id="bv-mobile" value={mobile} onChange={(e) => setMobile(e.target.value)} inputMode="tel" placeholder="07…" className={field} />
        </div>
        <div>
          <label className={label} htmlFor="bv-email">Email</label>
          <input id="bv-email" value={email} onChange={(e) => setEmail(e.target.value)} inputMode="email" placeholder="For the confirmation" className={field} />
        </div>
      </div>

      {continuing ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-accent-dark/40 bg-accent-soft/40 px-4 py-3 text-[12px]">
          <DoodleIcon name="link" size={13} className="text-accent-dark" />
          <span className="min-w-0 flex-1">Carrying on {continuing.name}&apos;s record, already on file.</span>
          <button type="button" onClick={() => setContinuing(null)} className="font-semibold text-muted hover:text-ink">
            Not them
          </button>
        </div>
      ) : matches.length > 0 ? (
        <div className="rounded-xl border border-line/60 bg-white p-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Already on file?</p>
          <ul className="space-y-1.5">
            {matches.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => {
                    setContinuing(m);
                    if (m.name) setName(m.name);
                    if (m.email) setEmail(m.email);
                    if (m.mobile) setMobile(m.mobile);
                    setMatches([]);
                  }}
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-page"
                >
                  <span className="min-w-0 flex-1">
                    <span className="hand block truncate text-[13px]">{m.name}</span>
                    <span className="block truncate text-[10.5px] text-muted">{[m.email, m.mobile].filter(Boolean).join(" · ")}</span>
                  </span>
                  <span className="shrink-0 text-[11px] font-semibold text-accent-dark">Use this record</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <PressButton
        onClick={save}
        disabled={!ready}
        className={`w-full rounded-xl py-3 text-[13.5px] font-semibold transition-opacity ${ready ? "bg-ink text-page" : "cursor-not-allowed bg-ink/30 text-page/60"}`}
      >
        {saving ? "Saving…" : "Save and pick a time"}
      </PressButton>
      {missing.length > 0 && <p className="text-center text-[11px] text-muted">A name and a mobile is enough to start.</p>}
      {problem && (
        <p className="rounded-xl border border-accent-dark/40 bg-accent-soft/40 p-3 text-center text-[11.5px] leading-relaxed">{problem}</p>
      )}
      <p className="text-center text-[11px] leading-relaxed text-muted">They are saved as a tenant lead, the same as Add new lead, and the viewing goes on their file.</p>
    </div>
  );
}
