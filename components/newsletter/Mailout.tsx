"use client";

import { useEffect, useMemo, useState } from "react";
import { searchMatches } from "@/lib/search-match";

/**
 * A mail-out to landlords and tenants (James, 14 Nov 2026): the two parts of
 * the email page that only a mail-out has.
 *
 *   MailoutLists   Who Gets It - the eight live lists (lib/mail-lists), each
 *                  with today's count, ticked on or off. Nobody is picked by
 *                  name: a list is whoever is on it when the email sends.
 *   SenderBox      Who It Comes From - the name, address and reply address
 *                  every mail-out goes out under (lib/mail-sender).
 *
 * Every figure here is read live from /api/newsletters/lists. While it loads
 * there is a spinner; if it cannot be read there is a sentence saying so and
 * no number at all.
 */

export type ListRow = { id: string; group: "landlords" | "tenants"; who: "current" | "other"; nation: "ew" | "sc"; label: string; short: string; blurb: string; count: number };
export type Sender = { name: string; email: string; replyTo: string };
export type MailoutInfo = {
  lists: ListRow[];
  unplaced: Record<string, number>;
  optedOut: number;
  pickedTotal: number;
  days: number;
  sender: Sender | null;
  domains: string[];
  pace: { cap: number; sentToday: number; left: number; warming: boolean; ramp: number[] };
  armed: { customerEmail: boolean; mailouts: boolean };
};

const num = (n: number) => n.toLocaleString("en-GB");
const people = (n: number) => `${num(n)} ${n === 1 ? "person" : "people"}`;

function Spinner({ text }: { text: string }) {
  return (
    <p className="flex items-center gap-2 text-[12.5px] text-muted">
      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-ink" /> {text}
    </p>
  );
}

const SECTIONS: { group: ListRow["group"]; who: ListRow["who"]; title: string; note: string }[] = [
  { group: "landlords", who: "current", title: "Current Landlords", note: "A home on Portfolio, or terms signed." },
  { group: "landlords", who: "other", title: "Landlords Not on Our Books", note: "Leads, valuation requests, appraisals not won, and landlords whose homes have left us." },
  { group: "tenants", who: "current", title: "Current Tenants", note: "Living in a home on Portfolio today." },
  { group: "tenants", who: "other", title: "Not a Tenant With Us", note: "Letting enquiries from the last twelve months, tenant passports, and past tenants." },
];

export function MailoutLists({
  info,
  error,
  picked,
  disabled,
  onChange,
}: {
  info: MailoutInfo | null;
  error: string | null;
  picked: string[];
  disabled: boolean;
  onChange: (lists: string[]) => void;
}) {
  const [peek, setPeek] = useState<ListRow | null>(null);
  if (error) return <p className="rounded-xl border border-accent-dark/40 bg-accent-soft/40 p-3 text-[12.5px]">{error}</p>;
  if (!info) return <Spinner text="Counting who is on each list…" />;

  const on = new Set(picked);
  const toggle = (id: string) => onChange(on.has(id) ? picked.filter((p) => p !== id) : [...picked, id]);
  const unplacedTotal = Object.values(info.unplaced).reduce((a, b) => a + b, 0);

  return (
    <div>
      <p className="text-[12.5px] leading-relaxed text-muted">
        These lists keep themselves up to date. Whoever is on a list when the email sends gets it, so a landlord who signs tomorrow is included and one who leaves is
        not. England and Wales or Scotland is decided by the home they own, rent or asked about.
      </p>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {SECTIONS.map((s) => (
          <div key={`${s.group}-${s.who}`} className="rounded-xl border border-line/60 p-4">
            <h3 className="text-[14px] font-semibold">{s.title}</h3>
            <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted">{s.note}</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {info.lists
                .filter((l) => l.group === s.group && l.who === s.who)
                .map((l) => (
                  <div key={l.id} className={`rounded-lg border p-3 ${on.has(l.id) ? "border-[#56423e] bg-[#56423e]/[0.04]" : "border-line/70"}`}>
                    <label className={`flex items-start gap-2.5 ${disabled ? "" : "cursor-pointer"}`}>
                      <input type="checkbox" checked={on.has(l.id)} disabled={disabled} onChange={() => toggle(l.id)} className="mt-0.5 h-4 w-4 shrink-0 accent-[#56423e]" />
                      <span className="min-w-0">
                        <span className="block text-[13px] font-semibold">{l.short}</span>
                        <span className="block text-[12px] text-muted">{people(l.count)}</span>
                      </span>
                    </label>
                    <button type="button" disabled={!l.count} onClick={() => setPeek(l)} className="mt-2 text-[11.5px] font-semibold text-muted underline-offset-2 hover:text-ink hover:underline disabled:opacity-40">
                      See who is on it
                    </button>
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-xl bg-panel p-3.5 text-[12.5px] leading-relaxed">
        {picked.length ? (
          <p>
            <b>{people(info.pickedTotal)}</b> on {picked.length === 1 ? "the list" : `the ${picked.length} lists`} picked today. Anybody on more than one gets a single copy.
          </p>
        ) : (
          <p>No list picked yet.</p>
        )}
        {info.optedOut > 0 && <p className="mt-1 text-muted">{people(info.optedOut)} unsubscribed or bounced, and left off every list.</p>}
        {unplacedTotal > 0 && (
          <p className="mt-1 text-muted">
            {people(unplacedTotal)} not on any list, because nothing on file says which country their home is in.
          </p>
        )}
      </div>

      {peek && <Peek list={peek} onClose={() => setPeek(null)} />}
    </div>
  );
}

function Peek({ list, onClose }: { list: ListRow; onClose: () => void }) {
  const [rows, setRows] = useState<{ email: string; name: string; home: string }[] | null>(null);
  const [total, setTotal] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [find, setFind] = useState("");
  useEffect(() => {
    let live = true;
    fetch(`/api/newsletters/lists?people=${encodeURIComponent(list.id)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!live) return;
        if (!j.ok) setErr(j.error || "The list could not be read.");
        else {
          setRows(j.people);
          setTotal(j.total);
        }
      })
      .catch(() => live && setErr("The OS could not be reached."));
    return () => {
      live = false;
    };
  }, [list.id]);
  const q = find.trim();
  const shown = useMemo(() => (rows && q ? rows.filter((p) => searchMatches(q, p.name, p.email, p.home)) : rows), [rows, q]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 p-4 backdrop-blur-sm" onClick={onClose}>
      <div role="dialog" aria-label={list.label} className="flex max-h-[84vh] w-full max-w-[620px] flex-col rounded-2xl border border-line bg-card p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="hand text-[19px] leading-tight">{list.label}</h2>
            <p className="mt-1 text-[12px] text-muted">{rows ? `${people(total)} today.` : "As it stands today."} Nobody is added or removed here: it follows Portfolio, leads and tenancies.</p>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 rounded-full border border-line/80 px-3 py-1.5 text-[12px] font-semibold hover:border-ink/40">
            Close
          </button>
        </div>
        <input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find someone by name, email or home" className="mt-4 w-full rounded-lg border border-line bg-card px-3 py-2 text-[13px] outline-none focus:border-ink/40" />
        <div className="mt-3 min-h-[120px] flex-1 overflow-y-auto rounded-xl border border-line/60">
          {err ? (
            <p className="p-4 text-[12.5px] text-accent-dark">{err}</p>
          ) : !shown ? (
            <div className="p-4">
              <Spinner text="Reading the list…" />
            </div>
          ) : !shown.length ? (
            <p className="p-4 text-center text-[12.5px] text-muted">Nobody matches that.</p>
          ) : (
            <ul className="divide-y divide-line/50">
              {shown.slice(0, 400).map((p) => (
                <li key={p.email} className="px-3.5 py-2.5">
                  <span className="block truncate text-[13px]">{p.name}</span>
                  <span className="block truncate text-[11.5px] text-muted">
                    {p.email}
                    {p.home ? ` · ${p.home}` : ""}
                  </span>
                </li>
              ))}
              {shown.length > 400 && <li className="px-3.5 py-2.5 text-[11.5px] text-muted">Showing the first 400 of {num(shown.length)}. Search to find someone.</li>}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Who it comes from ───────────────────────────────────────────────────── */

export function SenderBox({ info, disabled, onSaved }: { info: MailoutInfo | null; disabled: boolean; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const sender = info?.sender ?? null;
  useEffect(() => {
    setName(sender?.name ?? "The Letting Experts");
    setEmail(sender?.email ?? "");
    setReplyTo(sender?.replyTo ?? "");
  }, [sender?.name, sender?.email, sender?.replyTo]);

  if (!info) return <Spinner text="Reading the sending address…" />;
  const domains = info.domains;
  const open = editing || !sender;

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const j = await (await fetch("/api/newsletters/sender", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, email, replyTo }) })).json();
      if (!j.ok) setErr(j.error || "It didn't save.");
      else {
        setEditing(false);
        onSaved();
      }
    } catch {
      setErr("The OS could not be reached.");
    } finally {
      setBusy(false);
    }
  }

  if (!domains.length) {
    return <p className="rounded-xl border border-accent-dark/40 bg-accent-soft/40 p-3 text-[12.5px]">No sending domain is set up for mail-outs yet. Ask James.</p>;
  }

  if (!open && sender) {
    return (
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="min-w-0">
          <p className="text-[10.5px] uppercase tracking-wide text-muted">From</p>
          <p className="mt-0.5 break-words text-[14px] font-semibold">
            {sender.name} <span className="font-normal text-muted">&lt;{sender.email}&gt;</span>
          </p>
        </div>
        <div className="min-w-0">
          <p className="text-[10.5px] uppercase tracking-wide text-muted">Replies Go To</p>
          <p className="mt-0.5 break-words text-[14px]">{sender.replyTo || sender.email}</p>
        </div>
        <button type="button" disabled={disabled} onClick={() => setEditing(true)} className="rounded-full border border-line/80 px-4 py-1.5 text-[12.5px] font-semibold hover:border-ink/40 disabled:opacity-40 sm:ml-auto">
          Change
        </button>
        <p className="basis-full text-[11.5px] text-muted">Used for every mail-out to landlords and tenants. Changing it changes the next one to send.</p>
      </div>
    );
  }

  const field = "mt-1 w-full rounded-lg border border-line bg-card px-3 py-2 text-[13px] outline-none focus:border-ink/40 disabled:opacity-60";
  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="text-[10.5px] uppercase tracking-wide text-muted">Name People See</span>
          <input value={name} disabled={disabled || busy} onChange={(e) => setName(e.target.value)} placeholder="The Letting Experts" className={field} />
        </label>
        <label className="block">
          <span className="text-[10.5px] uppercase tracking-wide text-muted">Address It Comes From</span>
          <input value={email} disabled={disabled || busy} onChange={(e) => setEmail(e.target.value)} inputMode="email" autoCapitalize="none" placeholder={`news@${domains[0]}`} className={field} />
        </label>
        <label className="block">
          <span className="text-[10.5px] uppercase tracking-wide text-muted">Replies Go To</span>
          <input value={replyTo} disabled={disabled || busy} onChange={(e) => setReplyTo(e.target.value)} inputMode="email" autoCapitalize="none" placeholder="Same address, if left blank" className={field} />
        </label>
      </div>
      <p className="mt-2 text-[11.5px] leading-relaxed text-muted">
        Any address ending {domains.map((d) => `@${d}`).join(" or ")} works straight away. The address does not need a mailbox, but replies do: put a mailbox somebody reads
        in Replies Go To. A different domain has to be set up for sending first, which is one for James.
      </p>
      {err && <p className="mt-3 text-[12.5px] text-accent-dark">{err}</p>}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" disabled={disabled || busy || !email.trim()} onClick={() => void save()} className="rounded-full bg-[#56423e] px-5 py-2 text-[13px] font-semibold text-white disabled:opacity-40">
          {busy ? "Saving…" : "Save the Address"}
        </button>
        {sender && (
          <button type="button" disabled={busy} onClick={() => setEditing(false)} className="px-2 text-[12px] font-semibold text-muted hover:text-ink">
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

/** The line under When It Goes: how long it takes at today's pace. */
export function paceLine(info: MailoutInfo): string {
  const { pace, pickedTotal, days } = info;
  const rate = `Up to ${num(pace.cap)} a day${pace.warming ? " for now, rising over the first week of mail-outs so they are not treated as junk" : ""}, between 8am and 8pm.`;
  if (!pickedTotal) return rate;
  if (days <= 1) return `${rate} ${people(pickedTotal)} goes out in a day.`;
  return `${rate} ${people(pickedTotal)} takes about ${days} days.`;
}
