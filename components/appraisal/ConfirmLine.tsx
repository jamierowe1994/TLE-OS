"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import DoodleIcon from "@/components/DoodleIcon";
import ConfirmSheet from "@/components/ConfirmSheet";

/**
 * What the landlord has been sent, on the appointment card.
 *
 * Booking no longer sends the confirmation (17 Sep 2026), so until it has
 * gone the card says so and offers it: Not sent yet, or The time has changed.
 * After that it shows only the MOST RECENT thing the landlord was sent -
 * "Confirmation sent", then "Pre-appraisal deck sent" once that goes - with
 * See it, and View more sent items for the rest, each one openable as it
 * went (James, 17 Sep 2026).
 *
 * Arriving with ?confirm=1 opens the confirmation at once, and the parameter
 * is dropped so a refresh does not reopen it.
 */
type Draft = { ok?: boolean; alreadySent?: { at: string }; moved?: { from: string }; blocked?: string };
type Item = { id: string; subject: string; sentAt: string; label: string };
type Email = Item & { html: string; to: string; deck?: { href: string } | null };

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" });

export default function ConfirmLine({ appraisalId, appointmentAt }: { appraisalId: string; appointmentAt: string }) {
  const [draft, setDraft] = useState<Draft | null | "error">(null);
  const [items, setItems] = useState<Item[] | null>(null);
  const [open, setOpen] = useState(false);
  const [list, setList] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/confirmations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "draft", kind: "appraisal", id: appraisalId }),
    })
      .then((r) => r.json())
      .then((d: Draft) => setDraft(d.ok ? d : "error"))
      .catch(() => setDraft("error"));
    fetch(`/api/appraisals/${encodeURIComponent(appraisalId)}/sent`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; items?: Item[] }) => setItems(j.ok ? j.items ?? [] : []))
      .catch(() => setItems([]));
  }, [appraisalId]);

  // Re-read when the time changes: a moved appointment needs a new email.
  useEffect(() => load(), [load, appointmentAt]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("confirm") !== "1") return;
    setOpen(true);
    params.delete("confirm");
    const qs = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
  }, []);

  const loading = draft === null || items === null;
  const d = draft === "error" ? null : draft;
  const needsConfirming = Boolean(d && !d.alreadySent && !d.blocked);
  const latest = items?.[0] ?? null;
  /* "More" is everything the headline line is not already showing. */
  const more = (items?.length ?? 0) - (needsConfirming ? 0 : latest ? 1 : 0);

  return (
    <div className="mt-3.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-line/50 bg-white/60 px-3.5 py-2.5">
        <DoodleIcon name="mail" size={14} className="shrink-0 text-accent-dark" />
        <p className="min-w-0 flex-1 text-[12px] leading-snug">
          {loading ? (
            <span className="flex items-center gap-2 text-muted">
              <span aria-hidden className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-line border-t-accent-dark" />
              Checking what they have been sent…
            </span>
          ) : draft === "error" && !latest ? (
            <span className="text-muted">Couldn&apos;t check what they have been sent.</span>
          ) : needsConfirming ? (
            d?.moved ? (
              <>
                <span className="block font-semibold">The time has changed</span>
                <span className="block text-muted">Send them the new time.</span>
              </>
            ) : (
              <>
                <span className="block font-semibold">Confirmation not sent yet</span>
                <span className="block text-muted">Nothing goes until you send it.</span>
              </>
            )
          ) : latest ? (
            <>
              <span className="block font-semibold">{latest.label}</span>
              <span className="block text-muted">{when(latest.sentAt)}</span>
            </>
          ) : d?.blocked ? (
            <span className="text-muted">{d.blocked}</span>
          ) : (
            <span className="text-muted">Nothing sent yet.</span>
          )}
        </p>
        {!loading && needsConfirming && (
          <button type="button" onClick={() => setOpen(true)} className="shrink-0 rounded-full bg-[var(--brown)] px-3.5 py-1.5 text-[11.5px] font-semibold text-white">
            Review and send
          </button>
        )}
        {!loading && !needsConfirming && latest && (
          <button type="button" onClick={() => setViewing(latest.id)} className="shrink-0 text-[11.5px] font-semibold text-muted underline-offset-2 hover:text-ink hover:underline">
            See it
          </button>
        )}
      </div>
      {!loading && more > 0 && (
        <button type="button" onClick={() => setList(true)} className="mt-2 pl-1 text-[11.5px] font-semibold text-muted underline-offset-2 hover:text-ink hover:underline">
          View more sent items ({more})
        </button>
      )}

      {open && (
        <ConfirmSheet title="Confirm the appraisal" target={{ kind: "appraisal", id: appraisalId }} onClose={() => setOpen(false)} onSent={() => load()} />
      )}
      {list && items && (
        <SentList items={items} onClose={() => setList(false)} onOpen={(id) => setViewing(id)} />
      )}
      {viewing && <SentEmail appraisalId={appraisalId} emailId={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

function Modal({ title, sub, onClose, children, wide = false, deck = false }: { title: string; sub?: string; onClose: () => void; children: React.ReactNode; wide?: boolean; deck?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-[170] flex items-center justify-center bg-ink/40 p-3 backdrop-blur-sm sm:p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={`popout-in flex w-full flex-col overflow-hidden rounded-3xl border border-line bg-page shadow-2xl ${deck ? "h-full max-h-[940px] max-w-6xl" : wide ? "h-full max-h-[900px] max-w-3xl" : "max-h-[80vh] max-w-lg"}`}
      >
        <div className="flex items-start gap-3 border-b border-line/70 px-5 py-4">
          <div className="min-w-0">
            <h3 className="truncate text-[16px] leading-tight">{title}</h3>
            {sub && <p className="mt-0.5 truncate text-[12px] text-muted">{sub}</p>}
          </div>
          <button type="button" onClick={onClose} className="ml-auto shrink-0 rounded-full border border-line/70 px-3 py-1.5 text-[11.5px] transition-colors hover:border-ink/30">
            Close
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}

function SentList({ items, onClose, onOpen }: { items: Item[]; onClose: () => void; onOpen: (id: string) => void }) {
  return (
    <Modal title="Sent to the landlord" sub="Newest first. Open any of them to see it as it went." onClose={onClose}>
      <ul className="min-h-0 flex-1 divide-y divide-line/50 overflow-y-auto px-5 py-2">
        {items.map((i) => (
          <li key={i.id} className="flex items-center gap-3 py-3">
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold">{i.label}</span>
              <span className="block truncate text-[11.5px] text-muted">{i.subject}</span>
              <span className="block text-[11px] text-muted">{when(i.sentAt)}</span>
            </span>
            <button type="button" onClick={() => onOpen(i.id)} className="shrink-0 rounded-full border border-line/80 px-3 py-1.5 text-[11.5px] font-semibold transition-colors hover:border-ink/40">
              See it
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

/** Every link in a sent email opens in its own tab, where the page it leads to can run. */
const linksInNewTab = (html: string) => {
  const base = '<base target="_blank">';
  return /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (h) => h + base) : base + html;
};

function SentEmail({ appraisalId, emailId, onClose }: { appraisalId: string; emailId: string; onClose: () => void }) {
  const [email, setEmail] = useState<Email | null | "error">(null);
  useEffect(() => {
    let live = true;
    fetch(`/api/appraisals/${encodeURIComponent(appraisalId)}/sent?email=${encodeURIComponent(emailId)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; email?: Email }) => live && setEmail(j.ok && j.email ? j.email : "error"))
      .catch(() => live && setEmail("error"));
    return () => {
      live = false;
    };
  }, [appraisalId, emailId]);
  const e = email && email !== "error" ? email : null;
  /* A pre-appraisal email opens on the pack it sent, as the landlord sees it; the email is one tap away. */
  const [show, setShow] = useState<"deck" | "email">("deck");
  const deck = e?.deck && show === "deck" ? e.deck : null;
  return (
    <Modal wide deck={Boolean(e?.deck)} title={e?.deck ? "The pre-presentation they were sent" : e?.subject ?? "The email"} sub={e ? `To ${e.to} · ${when(e.sentAt)}` : undefined} onClose={onClose}>
      {e?.deck ? (
        <div className="flex gap-1 px-5 pt-4">
          {(["deck", "email"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setShow(k)}
              className={`rounded-full px-3 py-1.5 text-[11.5px] font-semibold transition-colors ${show === k ? "bg-ink text-white" : "border border-line/80 text-muted hover:text-ink"}`}
            >
              {k === "deck" ? "The pre-presentation" : "The email"}
            </button>
          ))}
          <a href={e.deck.href} target="_blank" rel="noopener" className="ml-auto self-center text-[11.5px] font-semibold text-muted underline-offset-2 hover:text-ink hover:underline">
            Open in a new tab
          </a>
        </div>
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col p-5">
        {email === null ? (
          <p className="flex flex-1 items-center justify-center gap-2 text-[12.5px] text-muted">
            <span aria-hidden className="h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-line border-t-accent-dark" />
            Opening the email…
          </p>
        ) : email === "error" ? (
          <p className="flex flex-1 items-center justify-center text-[12.5px] text-muted">Couldn&apos;t open that email.</p>
        ) : deck ? (
          <iframe title="The pre-presentation as they see it" src={deck.href} className="min-h-0 w-full flex-1 rounded-2xl border border-line/80 bg-white" />
        ) : (
          /* Same origin allowed, scripts still not: some browsers draw a fully sandboxed srcdoc as a blank page.
             Its links open in a new tab: followed inside this scriptless frame, the pack behind "View your
             pre-presentation" drew as a blank page with only the logo (Rhiannon, 23 Oct 2026). */
          <iframe
            title="The email as it went"
            srcDoc={linksInNewTab(email.html)}
            sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
            className="min-h-0 w-full flex-1 rounded-2xl border border-line/80 bg-white"
          />
        )}
      </div>
    </Modal>
  );
}
