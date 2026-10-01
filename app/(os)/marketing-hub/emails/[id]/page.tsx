"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Studio from "@/components/email-studio/Studio";
import Results from "@/components/newsletter/Results";
import type { Block } from "@/components/email-studio/tree";
import { renderNewsletter } from "@/lib/newsletter-render";
import { Pill } from "@/components/Wire";
import { tleBrand, tleSocial } from "@/lib/campaign-mail";
import { londonParts, londonTime } from "@/lib/london-time";
import type { Newsletter, Person, Recipient } from "@/lib/newsletters";
import { statusLine, whenText } from "../status";

/**
 * One newsletter or event email, start to finish (James, 30 Sep 2026: "it
 * should be an all-in-one process"). Three steps on one page:
 *
 *   1  Design   the drag-and-drop builder, full screen, opened straight away
 *               for a new email (?design=1)
 *   2  Who      everybody who could get it, signed up to the OS or not
 *   3  When     now, or a London date and time
 *
 * then Send me a test, and Publish. Once published it is read-only; Unpublish
 * puts it back to a draft as long as nothing has gone yet.
 */

type Loaded = { newsletter: Newsletter; preview: string };

export default function EmailPageWrapper() {
  return (
    <Suspense fallback={<Spinner text="Opening the email…" />}>
      <EmailPage />
    </Suspense>
  );
}

function Spinner({ text }: { text: string }) {
  return (
    <p className="mt-10 flex items-center gap-2 text-[12.5px] text-muted">
      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-ink" /> {text}
    </p>
  );
}

function EmailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const search = useSearchParams();
  const [data, setData] = useState<Loaded | null>(null);
  const [armed, setArmed] = useState(true);
  const [people, setPeople] = useState<Person[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [designing, setDesigning] = useState(search.get("design") === "1");
  const [busy, setBusy] = useState<string | null>(null);
  const [saved, setSaved] = useState<"" | "saving" | "saved">("");

  const load = useCallback(async () => {
    const [one, all] = await Promise.all([
      fetch(`/api/newsletters/${id}`, { cache: "no-store" }).then((r) => r.json()),
      fetch(`/api/newsletters`, { cache: "no-store" }).then((r) => r.json()),
    ]);
    if (!one.ok) throw new Error(one.error || "Couldn't open that email.");
    setData({ newsletter: one.newsletter, preview: one.preview });
    setArmed(Boolean(all.armed));
  }, [id]);

  useEffect(() => {
    load().catch((e) => setErr(e.message));
    fetch("/api/newsletters/audience", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setPeople(j.ok ? j.people : []))
      .catch(() => setPeople([]));
  }, [load]);

  /* While it sends, keep the numbers moving. */
  const status = data?.newsletter.status;
  useEffect(() => {
    if (status !== "sending" && status !== "scheduled") return;
    const t = setInterval(() => void load().catch(() => null), 20_000);
    return () => clearInterval(t);
  }, [status, load]);

  /* Saves quietly as she goes: the name, the inbox line and the list. */
  const pending = useRef<Record<string, unknown>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const save = useCallback(
    (patch: Record<string, unknown>) => {
      setData((d) => (d ? { ...d, newsletter: { ...d.newsletter, ...patch } as Newsletter } : d));
      pending.current = { ...pending.current, ...patch };
      setSaved("saving");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(async () => {
        const body = pending.current;
        pending.current = {};
        const j = await (await fetch(`/api/newsletters/${id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })).json().catch(() => ({ ok: false }));
        if (j.ok) {
          setSaved("saved");
          if ("preheader" in body) void load().catch(() => null);
        } else {
          setSaved("");
          setErr(j.error || "That didn't save.");
        }
      }, 600);
    },
    [id, load]
  );

  if (err && !data) return <p className="mt-10 rounded-xl border border-accent-dark/40 bg-accent-soft/40 p-3 text-[12.5px]">{err}</p>;
  if (!data) return <Spinner text="Opening the email…" />;

  const n = data.newsletter;
  const draft = n.status === "draft";
  const s = statusLine(n, armed);

  async function act(label: string, fn: () => Promise<Response>, done?: (j: { ok: boolean; message?: string; error?: string }) => void) {
    setBusy(label);
    setErr(null);
    setFlash(null);
    try {
      const j = await (await fn()).json();
      if (!j.ok) setErr(j.error || "That didn't work.");
      else {
        done?.(j);
        await load();
      }
    } catch {
      setErr("The OS could not be reached.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="fade-up px-4 pb-10 md:px-0">
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <Link href="/marketing-hub/emails" className="text-[12px] text-muted hover:text-ink">
          ← All emails
        </Link>
        <span className="text-[11.5px] text-muted">{saved === "saving" ? "Saving…" : saved === "saved" ? "Saved" : ""}</span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <input
          value={n.name}
          disabled={!draft}
          onChange={(e) => save({ name: e.target.value })}
          aria-label="Name"
          className="min-w-0 flex-1 basis-full bg-transparent text-[24px] font-extrabold tracking-[-0.02em] outline-none disabled:opacity-100 sm:basis-0 sm:text-[30px]"
          style={{ fontFamily: "var(--font-heading)" }}
        />
        <Pill tone="neutral">{n.kind === "event" ? "Event" : "Newsletter"}</Pill>
        <Pill tone={s.tone}>{s.text}</Pill>
      </div>
      <p className="mt-1 text-[12px] text-muted">Only you see the name. The subject line is what people see in their inbox.</p>

      {err && <p className="mt-4 rounded-xl border border-accent-dark/40 bg-accent-soft/40 p-3 text-[12.5px]">{err}</p>}
      {flash && <p className="mt-4 rounded-xl border border-line bg-panel p-3 text-[12.5px]">{flash}</p>}

      {!draft && <Published n={n} armed={armed} busy={busy} onUnpublish={() => act("unpublish", () => fetch(`/api/newsletters/${id}/publish`, { method: "DELETE" }), () => setFlash("Back to a draft. Nothing was sent."))} />}

      {(n.status === "sent" || n.status === "sending") && <Results id={id} live={n.status === "sending"} />}

      {/* ── 1 Design ── */}
      <Step n={1} title="Design">
        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_260px]">
          <PreviewFrame html={data.preview} />
          <div className="space-y-4">
            <div>
              <p className="text-[10.5px] uppercase tracking-wide text-muted">Subject line</p>
              <p className="mt-1 text-[14px] font-semibold">{n.subject || "No subject yet"}</p>
              <p className="mt-0.5 text-[11px] text-muted">Change it in the designer.</p>
            </div>
            <label className="block">
              <span className="text-[10.5px] uppercase tracking-wide text-muted">Inbox preview line</span>
              <input
                value={n.preheader}
                disabled={!draft}
                onChange={(e) => save({ preheader: e.target.value })}
                placeholder="The grey line after the subject"
                className="mt-1 w-full rounded-lg border border-line bg-card px-3 py-2 text-[13px] outline-none focus:border-ink/40 disabled:opacity-60"
              />
            </label>
            {draft && (
              <button type="button" onClick={() => setDesigning(true)} className="w-full rounded-full bg-ink px-4 py-2.5 text-[13px] font-semibold text-page">
                Open the designer
              </button>
            )}
          </div>
        </div>
      </Step>

      {/* ── 2 Who ── */}
      <Step n={2} title="Who Gets It">
        <Audience people={people} chosen={n.recipients} disabled={!draft} onChange={(recipients) => save({ recipients })} />
      </Step>

      {/* ── 3 When ── */}
      {draft && (
        <Step n={3} title="When It Goes">
          <SendPanel
            n={n}
            armed={armed}
            busy={busy}
            onTest={() => act("test", () => fetch(`/api/newsletters/${id}/test`, { method: "POST" }), (j) => setFlash(j.message ?? "Test sent."))}
            onPublish={(sendAt) =>
              act(
                "publish",
                () => fetch(`/api/newsletters/${id}/publish`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sendAt }) }),
                () => setFlash(sendAt ? `Published. It goes ${whenText(sendAt)}.` : "Published. It goes out within five minutes.")
              )
            }
            onDelete={() => {
              if (!window.confirm("Delete this draft? This cannot be undone.")) return;
              void act("delete", () => fetch(`/api/newsletters/${id}`, { method: "DELETE" }), () => router.push("/marketing-hub/emails"));
            }}
          />
        </Step>
      )}

      {designing && draft && (
        <Studio
          title={n.name || "Untitled"}
          kindLabel={n.kind === "event" ? "Event email" : "Newsletter"}
          initial={{ subject: n.subject, preheader: n.preheader, blocks: n.blocks as Block[] }}
          brand={{ ...tleBrand("internal"), ...tleSocial() }}
          uploadImage={async (file) => {
            const fd = new FormData();
            fd.append("file", file);
            const j = await (await fetch("/api/newsletters/image", { method: "POST", body: fd })).json();
            if (!j.ok) throw new Error(j.error || "That didn't upload.");
            return j.url as string;
          }}
          previewHtml={(copy) => renderNewsletter(copy, { email: "", name: "Sam Example" }).html}
          onSave={async (copy) => {
            const j = await (await fetch(`/api/newsletters/${id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(copy) })).json().catch(() => ({ ok: false }));
            if (j.ok) void load().catch(() => null);
            return j.ok ? null : j.error || "It didn't save.";
          }}
          onSendTest={async () => {
            const j = await (await fetch(`/api/newsletters/${id}/test`, { method: "POST" })).json();
            if (!j.ok) throw new Error(j.error || "The test didn't send.");
            return j.message as string;
          }}
          onClose={() => {
            setDesigning(false);
            if (search.get("design")) router.replace(`/marketing-hub/emails/${id}`);
            void load().catch(() => null);
          }}
        />
      )}
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 rounded-[22px] border border-line/60 bg-white p-5">
      <div className="mb-4 flex items-center gap-3">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-ink text-[12.5px] font-bold text-page">{n}</span>
        <h2 className="hand text-[18px] leading-tight">{title}</h2>
      </div>
      {children}
    </section>
  );
}

/** The real email, as the person looking would get it, at inbox width. */
function PreviewFrame({ html }: { html: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [h, setH] = useState(640);
  return (
    <div className="overflow-hidden rounded-xl border border-line/70 bg-[#f6f4f2]">
      <iframe
        ref={ref}
        title="Preview"
        srcDoc={html}
        sandbox="allow-same-origin"
        className="block w-full border-0"
        style={{ height: h }}
        onLoad={() => {
          const doc = ref.current?.contentDocument;
          if (!doc) return;
          const fit = () => setH(Math.min(1400, doc.documentElement.scrollHeight + 4));
          fit();
          doc.querySelectorAll("img").forEach((img) => img.addEventListener("load", fit));
        }}
      />
    </div>
  );
}

/* ── Who ─────────────────────────────────────────────────────────────────── */

function Audience({
  people,
  chosen,
  disabled,
  onChange,
}: {
  people: Person[] | null;
  chosen: Recipient[];
  disabled: boolean;
  onChange: (r: Recipient[]) => void;
}) {
  const [find, setFind] = useState("");
  const picked = useMemo(() => new Set(chosen.map((c) => c.email.toLowerCase())), [chosen]);

  if (people === null) return <Spinner text="Gathering everybody from REX and the OS…" />;

  const set = (list: Person[]) => onChange(list.map((p) => ({ email: p.email, name: p.name })));
  const toggle = (p: Person) =>
    picked.has(p.email)
      ? onChange(chosen.filter((c) => c.email.toLowerCase() !== p.email))
      : onChange([...chosen, { email: p.email, name: p.name }]);

  const q = find.trim().toLowerCase();
  const shown = q ? people.filter((p) => p.name.toLowerCase().includes(q) || p.email.includes(q)) : people;
  const signedUp = people.filter((p) => p.signedUp).length;

  /* Anyone picked who is no longer on the list (left, or renamed) still
     counts, and is shown, so nobody is sent to without being visible. */
  const orphans = chosen.filter((c) => !people.some((p) => p.email === c.email.toLowerCase()));

  const quick = [
    { label: `Everyone (${people.length})`, list: people },
    { label: `Signed up (${signedUp})`, list: people.filter((p) => p.signedUp) },
    { label: `Not signed up (${people.length - signedUp})`, list: people.filter((p) => !p.signedUp) },
    { label: `Agents only (${people.filter((p) => p.agent).length})`, list: people.filter((p) => p.agent) },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {quick.map((b) => (
          <button
            key={b.label}
            type="button"
            disabled={disabled}
            onClick={() => set(b.list)}
            className="rounded-full border border-line/80 px-3 py-1.5 text-[12px] hover:border-ink/40 disabled:opacity-40"
          >
            {b.label}
          </button>
        ))}
        <button type="button" disabled={disabled || !chosen.length} onClick={() => onChange([])} className="px-2 text-[12px] font-semibold text-muted hover:text-ink disabled:opacity-40">
          Clear
        </button>
        <span className="ml-auto text-[12.5px] font-semibold">
          {chosen.length} {chosen.length === 1 ? "person" : "people"} picked
        </span>
      </div>

      <input
        value={find}
        onChange={(e) => setFind(e.target.value)}
        placeholder="Find someone by name or email"
        className="mt-3 w-full rounded-lg border border-line bg-card px-3 py-2 text-[13px] outline-none focus:border-ink/40"
      />

      <ul className="mt-3 max-h-[420px] divide-y divide-line/50 overflow-y-auto rounded-xl border border-line/60">
        {shown.map((p) => (
          <li key={p.email}>
            <label className={`flex items-center gap-3 px-3.5 py-2.5 ${disabled ? "" : "cursor-pointer hover:bg-panel"}`}>
              <input type="checkbox" checked={picked.has(p.email)} disabled={disabled} onChange={() => toggle(p)} className="h-4 w-4 accent-[#56423e]" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px]">{p.name}</span>
                <span className="block truncate text-[11.5px] text-muted">{p.email}</span>
              </span>
              <span className="hidden text-[11px] text-muted sm:inline">{p.agent ? "Agent" : "Office"}</span>
              <Pill tone={p.signedUp ? "good" : "neutral"}>{p.signedUp ? "Signed up" : "Not signed up"}</Pill>
            </label>
          </li>
        ))}
        {orphans.map((o) => (
          <li key={o.email} className="flex items-center gap-3 px-3.5 py-2.5">
            <input type="checkbox" checked disabled={disabled} onChange={() => onChange(chosen.filter((c) => c.email !== o.email))} className="h-4 w-4 accent-[#56423e]" />
            <span className="min-w-0 flex-1 truncate text-[13px]">{o.name || o.email}</span>
            <Pill tone="accent">No longer on the list</Pill>
          </li>
        ))}
        {!shown.length && !orphans.length && <li className="px-3.5 py-6 text-center text-[12.5px] text-muted">Nobody matches that.</li>}
      </ul>
    </div>
  );
}

/* ── When ────────────────────────────────────────────────────────────────── */

/** Tomorrow at 9, London, as the default - the time most newsletters want. */
function tomorrowNine(): { date: string; time: string } {
  const p = londonParts(Date.now() + 24 * 60 * 60 * 1000);
  const pad = (x: number) => String(x).padStart(2, "0");
  return { date: `${p.year}-${pad(p.month)}-${pad(p.day)}`, time: "09:00" };
}

function SendPanel({
  n,
  armed,
  busy,
  onTest,
  onPublish,
  onDelete,
}: {
  n: Newsletter;
  armed: boolean;
  busy: string | null;
  onTest: () => void;
  onPublish: (sendAt: string | null) => void;
  onDelete: () => void;
}) {
  const [mode, setMode] = useState<"now" | "later">("later");
  const [{ date, time }, setWhen] = useState(tomorrowNine);

  const sendAt = useMemo(() => {
    if (mode === "now") return null;
    const [y, m, d] = date.split("-").map(Number);
    const [hh, mm] = time.split(":").map(Number);
    if (!y || !m || !d || Number.isNaN(hh) || Number.isNaN(mm)) return undefined;
    return londonTime(y, m, d, hh, mm).toISOString();
  }, [mode, date, time]);

  const count = n.recipients.length;
  const problem = !n.subject.trim()
    ? "Give it a subject line in the designer."
    : !n.blocks.length
      ? "The email is empty. Open the designer."
      : !count
        ? "Pick who it goes to in step 2."
        : sendAt === undefined
          ? "That date or time isn't complete."
          : sendAt && Date.parse(sendAt) < Date.now()
            ? "That time has already passed."
            : null;

  const publish = () => {
    const when = sendAt ? whenText(sendAt) : "now";
    if (!window.confirm(`Send "${n.subject}" to ${count} ${count === 1 ? "person" : "people"} ${sendAt ? "at " + when : "now"}?`)) return;
    onPublish(sendAt ?? null);
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {(
          [
            { v: "now", label: "Send now" },
            { v: "later", label: "Schedule it" },
          ] as const
        ).map((o) => (
          <button
            key={o.v}
            type="button"
            onClick={() => setMode(o.v)}
            className={`rounded-full border px-4 py-1.5 text-[12.5px] ${mode === o.v ? "border-ink bg-ink font-semibold text-page" : "border-line/80 hover:border-ink/40"}`}
          >
            {o.label}
          </button>
        ))}
      </div>

      {mode === "later" && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input type="date" value={date} onChange={(e) => setWhen((w) => ({ ...w, date: e.target.value }))} className="rounded-lg border border-line bg-card px-3 py-2 text-[13px] outline-none focus:border-ink/40" />
          <input type="time" value={time} step={300} onChange={(e) => setWhen((w) => ({ ...w, time: e.target.value }))} className="rounded-lg border border-line bg-card px-3 py-2 text-[13px] outline-none focus:border-ink/40" />
          <span className="text-[12px] text-muted">UK time{sendAt ? `: ${whenText(sendAt)}` : ""}</span>
        </div>
      )}
      <p className="mt-2 text-[11.5px] text-muted">
        {mode === "now" ? "It goes out within five minutes of publishing." : "It goes out within five minutes of that time."} From the TLE OS address.
        {!armed && " Sending is switched off for now, so it will wait, marked Held, until James switches it on."}
      </p>

      {problem && <p className="mt-4 text-[12.5px] text-accent-dark">{problem}</p>}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <button type="button" disabled={busy !== null} onClick={onTest} className="rounded-full border border-line/80 px-4 py-2.5 text-[13px] font-semibold hover:border-ink/40 disabled:opacity-40">
          {busy === "test" ? "Sending…" : "Send me a test"}
        </button>
        <button
          type="button"
          disabled={busy !== null || Boolean(problem)}
          onClick={publish}
          className="rounded-full bg-[#56423e] px-5 py-2.5 text-[13px] font-semibold text-white disabled:opacity-40"
        >
          {busy === "publish" ? "Publishing…" : `Publish to ${count} ${count === 1 ? "person" : "people"}`}
        </button>
        <button type="button" disabled={busy !== null} onClick={onDelete} className="ml-auto text-[12px] font-semibold text-muted hover:text-ink disabled:opacity-40">
          Delete draft
        </button>
      </div>
    </div>
  );
}

/* ── After publishing ────────────────────────────────────────────────────── */

function Published({ n, armed, busy, onUnpublish }: { n: Newsletter; armed: boolean; busy: string | null; onUnpublish: () => void }) {
  const p = n.progress;
  const total = p ? p.sent + p.failed + p.queued : n.recipients.length;
  const canUnpublish = n.status === "scheduled" || n.status === "missed";
  return (
    <section className="mt-5 rounded-[22px] border border-line/60 bg-panel p-5">
      {n.status === "scheduled" && (
        <p className="text-[14px]">
          <b>Published.</b> It goes to {n.recipients.length} {n.recipients.length === 1 ? "person" : "people"} {n.sendAt ? whenText(n.sendAt) : "shortly"}.
          {!armed && " Sending is switched off, so it will wait, marked Held, until James switches it on."}
        </p>
      )}
      {n.status === "sending" && (
        <p className="text-[14px]">
          <b>Sending.</b> {p?.sent ?? 0} of {total} sent{p?.failed ? `, ${p.failed} failed` : ""}. It sends a few dozen at a time, every five minutes.
        </p>
      )}
      {n.status === "sent" && (
        <p className="text-[14px]">
          <b>Sent</b> to {p?.sent ?? total} {(p?.sent ?? total) === 1 ? "person" : "people"}
          {n.finishedAt ? `, finished ${whenText(n.finishedAt)}` : ""}.{p?.failed ? ` ${p.failed} could not be sent.` : ""}
        </p>
      )}
      {n.status === "missed" && <p className="text-[14px]"><b>Missed.</b> It was held for more than a day past its time, so it was not sent late. Unpublish it to send it again.</p>}
      {canUnpublish && (
        <button type="button" disabled={busy !== null} onClick={onUnpublish} className="mt-3 rounded-full border border-line/80 bg-card px-4 py-2 text-[12.5px] font-semibold hover:border-ink/40 disabled:opacity-40">
          {busy === "unpublish" ? "Unpublishing…" : "Unpublish and edit"}
        </button>
      )}
    </section>
  );
}
