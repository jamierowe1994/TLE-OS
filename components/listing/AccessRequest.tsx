"use client";

import { useEffect, useMemo, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";

/**
 * HOW WE GET INTO THE PROPERTY (James, 11 Sep 2026).
 *
 * "Email to tenants" was ambiguous: the sitting tenant, or the database?
 * This is the sitting-tenant half, and it is not always a tenant. Every
 * listing records how access works - vacant, through the tenant, or through
 * the landlord - and the one button on the record morphs to match:
 *
 *   nothing recorded  → "Request access" opens the choice
 *   vacant            → "Vacant · take keys", pressed once the keys are in
 *   tenant / landlord → an email asking for access on a day, drafted from
 *                       the record, editable, and previewed in the OS's
 *                       branded shell before it goes
 *
 * The arrangement is kept in os_case_state under "access", so it is set
 * once - here, or on the Documents tab - and read everywhere.
 */

export type AccessKind = "vacant" | "tenant" | "landlord";

export interface AccessRequestRecord {
  viewingId: string;
  /** The viewing's start, ISO. */
  when: string;
  to: string;
  requestedAt: string;
  /** Set by hand from the viewing once they have said yes - a call, a text, a reply. */
  grantedAt: string | null;
}

export interface Access {
  kind: AccessKind | null;
  name: string;
  email: string;
  phone: string;
  /** Vacant: the keys are in the office. */
  keysCollected: boolean;
  /** Access asked for, by viewing. */
  requests: Record<string, AccessRequestRecord>;
}

export const NO_ACCESS: Access = { kind: null, name: "", email: "", phone: "", keysCollected: false, requests: {} };

/** A viewing already in the diary, for the request to hang off. */
export interface ViewingOption {
  id: string;
  startsAt: string;
  who: string;
}

const KINDS: { id: AccessKind; label: string; sub: string; icon: string }[] = [
  { id: "vacant", label: "Vacant", sub: "Nobody living there. We hold the keys.", icon: "key" },
  { id: "tenant", label: "Through the tenant", sub: "Somebody lives there and we ask them.", icon: "user" },
  { id: "landlord", label: "Through the landlord", sub: "The landlord lets us in, or arranges it.", icon: "home" },
];

const firstName = (n: string) => n.trim().split(/\s+/)[0] ?? "";

const pretty = (date: string, time: string) => {
  if (!date) return "a day that suits";
  const d = new Date(`${date}T${time || "10:00"}:00`);
  return Number.isFinite(d.getTime())
    ? d.toLocaleString("en-GB", { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" })
    : "a day that suits";
};

/** The words, drafted from the record. Edited by the agent from there. */
export function draftAccessEmail(a: Access, address: string, date: string, time: string, agent: string): { subject: string; body: string } {
  const when = pretty(date, time);
  if (a.kind === "landlord") {
    return {
      subject: `Access to ${address} for a viewing`,
      body:
        `Hi ${firstName(a.name) || "there"},\n\n` +
        `We have a viewing lined up for ${address} and would like to hold it on ${when}.\n\n` +
        `Are you happy for us to go ahead then? If the property is vacant we will use the keys we hold; if not, let us know how you would like access arranged and we will work around it.\n\n` +
        `Thanks,\n${agent}\nThe Letting Experts`,
    };
  }
  return {
    subject: `Viewing at ${address} - can we arrange access?`,
    body:
      `Hi ${firstName(a.name) || "there"},\n\n` +
      `We have somebody keen to view ${address} and would like to bring them round on ${when}.\n\n` +
      `Would that be convenient? If it is, there is nothing you need to do; the viewing takes around 20 minutes and we will be with them the whole time. If that day does not work, reply with a couple of times that suit you better and we will fit around you.\n\n` +
      `Thank you for your help,\n${agent}\nThe Letting Experts`,
  };
}

/* ── the button on the record ──────────────────────────────────────────── */

export default function AccessRequest({
  value: access,
  onChange: setAccess,
  loading = false,
  address,
  agent,
  tenant,
  landlord,
  viewings = [],
  onBook,
  className = "",
}: {
  /** The arrangement, owned by the record so the Documents tab and this button agree. */
  value: Access;
  onChange: (a: Access) => void;
  loading?: boolean;
  address: string;
  /** The upcoming viewings on the listing - a request has to hang off one. */
  viewings?: ViewingOption[];
  /** Where to go when there is no viewing to link yet. */
  onBook?: () => void;
  /** Whoever is signed in, for the sign-off. */
  agent: string;
  tenant?: { name: string; email: string; phone: string } | null;
  landlord?: { name: string; email: string | null; phone: string | null } | null;
  className?: string;
}) {
  const [choosing, setChoosing] = useState(false);
  const [composing, setComposing] = useState(false);

  const label =
    loading
      ? "Request access"
      : access.kind === "vacant"
        ? access.keysCollected ? "Keys in the office" : "Vacant · take keys"
        : access.kind === "tenant"
          ? "Ask the tenant for access"
          : access.kind === "landlord"
            ? "Ask the landlord for access"
            : "Request access";

  const icon = access.kind === "vacant" ? "key" : access.kind ? "mail" : "lock";

  function press() {
    if (!access.kind) return setChoosing(true);
    if (access.kind === "vacant") return setAccess({ ...access, keysCollected: !access.keysCollected });
    setComposing(true);
  }

  return (
    <>
      <button
        type="button"
        onClick={press}
        title={access.kind ? "Change how we get in from the Documents tab" : "Record how we get into the property"}
        className={`press-ring flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90 ${className}`}
        style={{ background: access.kind === "vacant" && access.keysCollected ? "#56634a" : "var(--brown)" }}
      >
        <DoodleIcon name={icon} size={14} />
        {label}
      </button>

      {choosing && (
        <Sheet title="How do we get in?" onClose={() => setChoosing(false)}>
          <AccessSettings
            value={access}
            onChange={setAccess}
            tenant={tenant}
            landlord={landlord}
            onDone={() => setChoosing(false)}
          />
        </Sheet>
      )}

      {composing && access.kind && access.kind !== "vacant" && (
        <Sheet title={access.kind === "tenant" ? "Ask the tenant for access" : "Ask the landlord for access"} onClose={() => setComposing(false)} wide>
          <Composer
            access={access}
            address={address}
            agent={agent}
            viewings={viewings}
            onBook={onBook}
            onSent={(r) => {
              setAccess({ ...access, requests: { ...(access.requests ?? {}), [r.viewingId]: r } });
              setComposing(false);
            }}
            onClose={() => setComposing(false)}
          />
        </Sheet>
      )}
    </>
  );
}

/* ── the arrangement, set once ─────────────────────────────────────────── */

export function AccessSettings({
  value,
  onChange,
  tenant,
  landlord,
  onDone,
}: {
  value: Access;
  onChange: (a: Access) => void;
  tenant?: { name: string; email: string; phone: string } | null;
  landlord?: { name: string; email: string | null; phone: string | null } | null;
  onDone?: () => void;
}) {
  const pick = (kind: AccessKind) => {
    /* Prefill the person from the record, once, so the agent is confirming
       rather than typing. */
    const from = kind === "tenant" ? tenant : kind === "landlord" ? landlord : null;
    onChange({
      ...value,
      kind,
      name: value.kind === kind && value.name ? value.name : (from?.name ?? ""),
      email: value.kind === kind && value.email ? value.email : (from?.email ?? ""),
      phone: value.kind === kind && value.phone ? value.phone : (from?.phone ?? ""),
    });
  };
  const field = "h-10 w-full rounded-xl border border-line/70 bg-white px-3.5 text-[13px] outline-none focus:border-ink";
  return (
    <div>
      <div className="grid gap-2 sm:grid-cols-3">
        {KINDS.map((k) => {
          const on = value.kind === k.id;
          return (
            <button
              key={k.id}
              type="button"
              onClick={() => pick(k.id)}
              className={`rounded-2xl border p-4 text-left transition-colors ${on ? "border-accent-dark bg-accent-soft/50" : "border-line/60 bg-white hover:border-ink/40"}`}
            >
              <DoodleIcon name={k.icon} size={16} className={on ? "text-accent-dark" : "text-muted"} />
              <span className="mt-2 block text-[13.5px] font-semibold">{k.label}</span>
              <span className="mt-0.5 block text-[11.5px] leading-snug text-muted">{k.sub}</span>
            </button>
          );
        })}
      </div>
      {value.kind && value.kind !== "vacant" && (
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted">Name</span>
            <input className={field} value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} />
          </label>
          <label className="block">
            <span className="mb-1 block text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted">Email</span>
            <input className={field} type="email" value={value.email} onChange={(e) => onChange({ ...value, email: e.target.value })} />
          </label>
          <label className="block">
            <span className="mb-1 block text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted">Mobile</span>
            <input className={field} value={value.phone} onChange={(e) => onChange({ ...value, phone: e.target.value })} />
          </label>
        </div>
      )}
      {value.kind === "vacant" && (
        <label className="mt-4 flex items-center gap-2.5 text-[13px]">
          <input type="checkbox" checked={value.keysCollected} onChange={(e) => onChange({ ...value, keysCollected: e.target.checked })} className="h-4 w-4 accent-[var(--brown)]" />
          The keys are in the office
        </label>
      )}
      {onDone && (
        <div className="mt-5 flex justify-end">
          <button type="button" onClick={onDone} disabled={!value.kind} className="rounded-full px-5 py-2.5 text-[12.5px] font-semibold text-white disabled:opacity-50" style={{ background: "var(--brown)" }}>
            Done
          </button>
        </div>
      )}
    </div>
  );
}

/* ── the email, drafted and previewed ──────────────────────────────────── */

function Composer({
  access,
  address,
  agent,
  viewings,
  onBook,
  onSent,
  onClose,
}: {
  access: Access;
  address: string;
  agent: string;
  viewings: ViewingOption[];
  onBook?: () => void;
  onSent: (r: AccessRequestRecord) => void;
  onClose: () => void;
}) {
  /* THE VIEWING FIRST (James, 11 Sep): we cannot ask for access to nothing.
     The request hangs off a viewing already in the diary, and the day and
     time in the email come from it. */
  const open = viewings.filter((v) => !(access.requests ?? {})[v.id]?.grantedAt);
  const [viewingId, setViewingId] = useState<string | null>(open.length === 1 ? open[0].id : null);
  const viewing = viewings.find((v) => v.id === viewingId) ?? null;
  const date = viewing ? viewing.startsAt.slice(0, 10) : "";
  const time = viewing ? new Date(viewing.startsAt).toTimeString().slice(0, 5) : "10:00";
  const drafted = useMemo(() => draftAccessEmail(access, address, date, time, agent), [access, address, date, time, agent]);
  const [to, setTo] = useState(access.email);
  const [subject, setSubject] = useState(drafted.subject);
  const [body, setBody] = useState(drafted.body);
  const [touched, setTouched] = useState(false);
  /* The day changes the draft until the agent has edited the words. */
  useEffect(() => {
    if (!touched) {
      setSubject(drafted.subject);
      setBody(drafted.body);
    }
  }, [drafted, touched]);

  const [preview, setPreview] = useState<{ html: string; sendEnabled: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function call(intent: "preview" | "send") {
    setBusy(true);
    setResult(null);
    try {
      const r = await fetch("/api/messages/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ to, subject, body, intent }),
      });
      const j = (await r.json()) as { ok?: boolean; html?: string; sendEnabled?: boolean; sent?: boolean; reason?: string; error?: string };
      if (j.html) setPreview({ html: j.html, sendEnabled: Boolean(j.sendEnabled) });
      if (intent === "send") {
        setResult(j.sent ? "Sent." : (j.reason ?? j.error ?? "Not sent."));
        /* Sent, so the viewing carries "access requested" from here. */
        if (j.sent && viewing) {
          onSent({ viewingId: viewing.id, when: viewing.startsAt, to, requestedAt: new Date().toISOString(), grantedAt: null });
        }
      }
    } catch (e) {
      setResult((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const field = "w-full rounded-xl border border-line/70 bg-white px-3.5 py-2.5 text-[13px] outline-none focus:border-ink";
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div>
        <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted">The viewing this is for</p>
        {open.length ? (
          <div className="space-y-1.5">
            {open.map((v) => {
              const on = v.id === viewingId;
              const asked = (access.requests ?? {})[v.id];
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setViewingId(v.id)}
                  className={`flex w-full items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-colors ${on ? "border-accent-dark bg-accent-soft/50" : "border-line/60 bg-white hover:border-ink/40"}`}
                >
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] ${on ? "border-accent-dark bg-accent-dark text-white" : "border-line/80 text-transparent"}`}>✓</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold">{new Date(v.startsAt).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                    <span className="block truncate text-[11.5px] text-muted">{v.who || "Viewing"}{asked ? " · access already requested" : ""}</span>
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-line/70 bg-page px-4 py-4 text-[12.5px] leading-relaxed text-muted">
            No viewing is booked on this property yet, and a request has to hang off one.{" "}
            {onBook ? (
              <button type="button" onClick={onBook} className="font-semibold text-accent-dark hover:underline">Book the viewing first</button>
            ) : (
              "Book it in REX first."
            )}
            .
          </div>
        )}
        <label className="mt-3 block">
          <span className="mb-1 block text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted">To</span>
          <input className={field} value={to} onChange={(e) => setTo(e.target.value)} placeholder="their@email.com" />
        </label>
        <label className="mt-3 block">
          <span className="mb-1 block text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted">Subject</span>
          <input className={field} value={subject} onChange={(e) => { setTouched(true); setSubject(e.target.value); }} />
        </label>
        <label className="mt-3 block">
          <span className="mb-1 block text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted">The email</span>
          <textarea rows={11} className={`${field} resize-y leading-relaxed`} value={body} onChange={(e) => { setTouched(true); setBody(e.target.value); }} />
        </label>
        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          <button type="button" onClick={() => void call("preview")} disabled={busy} className="rounded-full border border-line/60 bg-white px-4 py-2.5 text-[12.5px] font-semibold transition-colors hover:border-ink/40 disabled:opacity-50">
            {busy ? "Working…" : "Preview it"}
          </button>
          <button
            type="button"
            onClick={() => void call("send")}
            disabled={busy || !to.includes("@") || !viewing}
            title={viewing ? undefined : "Pick the viewing first"}
            className="rounded-full px-5 py-2.5 text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: "var(--brown)" }}
          >
            Send it
          </button>
          <button type="button" onClick={onClose} className="text-[12.5px] text-muted hover:text-ink">Cancel</button>
        </div>
        {result && <p className="mt-3 text-[12px] leading-relaxed text-accent-dark">{result}</p>}
      </div>
      <div className="min-w-0">
        <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted">How it lands</p>
        {preview ? (
          <iframe title="Email preview" srcDoc={preview.html} className="h-[520px] w-full rounded-2xl border border-line/50 bg-white" />
        ) : (
          <div className="flex h-[520px] items-center justify-center rounded-2xl border border-dashed border-line/70 bg-page px-6 text-center text-[12.5px] text-muted">
            Press Preview it to see the email in the Letting Experts&rsquo; shell before it goes.
          </div>
        )}
      </div>
    </div>
  );
}

/* ── a sheet over the drawer ───────────────────────────────────────────── */

function Sheet({ title, wide, children, onClose }: { title: string; wide?: boolean; children: React.ReactNode; onClose: () => void }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const t = requestAnimationFrame(() => setShown(true));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      cancelAnimationFrame(t);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[160] flex items-center justify-center p-4 sm:p-8">
      <button type="button" aria-label="Close" onClick={onClose} className={`absolute inset-0 cursor-default bg-ink/40 transition-opacity duration-500 ${shown ? "opacity-100" : "opacity-0"}`} />
      <div
        className={`relative flex max-h-full w-full flex-col overflow-hidden rounded-[26px] border border-line/50 bg-white shadow-[0_40px_90px_-30px_rgba(0,0,0,0.5)] ${wide ? "max-w-5xl" : "max-w-2xl"}`}
        style={{
          transform: shown ? "scaleY(1)" : "scaleY(0.02)",
          opacity: shown ? 1 : 0.4,
          transformOrigin: "50% 50%",
          transition: "transform 620ms cubic-bezier(0.18, 1.35, 0.32, 1), opacity 260ms ease-out",
        }}
      >
        <div className="flex items-start justify-between gap-4 px-7 pt-6">
          <h2 className="hand text-[24px] leading-tight">{title}</h2>
          <button type="button" onClick={onClose} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line/60 text-[13px] text-muted transition-colors hover:border-ink/40 hover:text-ink" title="Close (Esc)">✕</button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-7 pb-7 pt-5">{children}</div>
      </div>
    </div>
  );
}
