"use client";

import { useEffect, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import SendTermsPopout from "@/components/SendTermsPopout";
import type { TermsState } from "@/lib/use-listing-terms";

/**
 * The property's paperwork — filed, not displayed.
 *
 * This replaces a panel that sat open on every property at every step, asking
 * whether to send terms that had already been signed months earlier. James's
 * point: by the time something is in Listings the terms are done, so the
 * screen should say so in one word and put the copy somewhere you can go and
 * get it. The word is the pill in the header; this is the somewhere.
 *
 * Signed contracts open through the OS's own proxy, never the address
 * underneath — see app/api/esign/document for why that distinction matters.
 */

const days = (iso: string | null) =>
  iso == null ? null : Math.floor((Date.now() - new Date(iso).valueOf()) / 86_400_000);

function since(iso: string | null): string {
  const d = days(iso);
  if (d == null) return "";
  if (d <= 0) return "today";
  if (d === 1) return "yesterday";
  return `${d} days ago`;
}

interface VaultFile {
  key: string;
  certKey: string;
  label: string;
  name: string;
  size: number;
  uploadedAt: string | null;
  open: string;
}

export default function ListingDocuments({
  terms,
  listingId,
  propertyId,
  contactId,
  landlordName,
  landlordEmail,
  address,
}: {
  terms: TermsState;
  listingId: string | number;
  /** The REX property: the certificates the OS holds are filed under it. */
  propertyId?: string | null;
  contactId?: string | number | null;
  landlordName?: string;
  landlordEmail?: string;
  address?: string;
}) {
  const [sending, setSending] = useState(false);

  /* ── Certificates the OS holds for this property ──────────────────────
     James, 5 Sep: "we need to be able to see them in documents, not just in
     the compliance tab." The same vault the Compliance drawer reads, listed
     here as one shelf: gas, EICR, EPC, licence and the rest, newest first,
     each opening out of a signed link. */
  const [certs, setCerts] = useState<VaultFile[] | null>(null);
  useEffect(() => {
    if (!propertyId) {
      setCerts([]);
      return;
    }
    let gone = false;
    fetch(`/api/compliance/vault?property=${encodeURIComponent(propertyId)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { files?: VaultFile[] } | null) => !gone && setCerts(j?.files ?? []))
      .catch(() => !gone && setCerts([]));
    return () => {
      gone = true;
    };
  }, [propertyId]);

  return (
    <section className="rounded-2xl border border-line/80 bg-panel p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2.5 text-[14px]">
          <DoodleIcon name="folder" size={17} className="text-accent-dark" />
          Documents
        </h3>
        <button
          type="button"
          onClick={() => setSending(true)}
          className="rounded-full border border-line/80 px-4 py-2 text-[11.5px] font-semibold transition-colors hover:border-ink/40"
        >
          Send terms
        </button>
      </div>

      {/* ── Certificates, before the contracts: the thing most often looked for. ── */}
      <div className="mb-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">Certificates on file</p>
        {certs === null ? (
          <p className="mt-1.5 text-[12px] text-muted">Reading the vault…</p>
        ) : !certs.length ? (
          <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
            None held here yet. A certificate dropped in, or in an approved PLC pack, lands here and on
            Compliance both.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {certs.map((f) => (
              <li key={f.key} className="flex flex-wrap items-center gap-3 rounded-xl border border-line/70 bg-card p-3">
                <span className="rounded-full border border-line px-2.5 py-0.5 text-[10.5px] font-semibold text-muted">{f.label}</span>
                <span className="min-w-0 truncate text-[12.5px]">{f.name}</span>
                <span className="text-[11px] text-muted">
                  {f.size ? `${(f.size / 1_048_576).toFixed(1)} MB` : ""}
                  {f.uploadedAt ? ` · ${since(f.uploadedAt)}` : ""}
                </span>
                <a href={f.open} target="_blank" rel="noreferrer" className="ml-auto rounded-full border border-line/80 px-3.5 py-1.5 text-[11.5px] hover:border-ink/40">
                  Open
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">Contracts</p>
      {terms.status === "loading" && <p className="text-[12px] text-muted">Asking REX…</p>}

      {terms.status === "off" && (
        <p className="text-[12px] text-muted">
          REX isn&rsquo;t connected on this environment, so the file is empty.
        </p>
      )}

      {terms.status === "ready" && (
        <>
          {/* ── Signed. The document leads: the status is already implied by
              it being here at all. ── */}
          {terms.docs.length > 0 ? (
            <ul className="space-y-2">
              {terms.docs.map((d) => (
                <li
                  key={d.id}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-line/70 bg-card p-3"
                >
                  <span className="rounded-full border border-emerald-600/40 px-2.5 py-0.5 text-[10.5px] font-semibold text-emerald-700">
                    Signed
                  </span>
                  <span className="min-w-0 truncate text-[12.5px]">{d.name}</span>
                  <span className="text-[11px] text-muted">
                    {d.sizeMb ? `${d.sizeMb} MB` : ""}
                    {d.createdAt ? ` · ${since(d.createdAt)}` : ""}
                  </span>
                  <a
                    href={d.open}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-auto rounded-full border border-line/80 px-3.5 py-1.5 text-[11.5px] hover:border-ink/40"
                  >
                    Open
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[12px] leading-relaxed text-muted">
              No signed contract on this property. It should be here — signed terms are part of
              taking a property on, so this is worth a look rather than a shrug.
            </p>
          )}

          {/* ── Still out. Age first: that is the part worth acting on. ── */}
          {terms.outstanding.length > 0 && (
            <ul className="mt-3 space-y-2">
              {terms.outstanding.map((r) => {
                const age = days(r.sentAt);
                const stale = age != null && age >= 7;
                return (
                  <li key={r.id} className="rounded-xl border border-line/70 bg-card p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-line px-2.5 py-0.5 text-[10.5px] font-semibold text-muted">
                        {r.status === "partially_signed" ? "Part signed" : "Waiting"}
                      </span>
                      <span className="text-[12.5px]">{r.templateName}</span>
                      <span
                        className={`ml-auto text-[11.5px] ${stale ? "text-accent-dark" : "text-muted"}`}
                      >
                        sent {since(r.sentAt)}
                        {r.sentBy ? ` by ${r.sentBy}` : ""}
                      </span>
                    </div>
                    {r.signers.length > 0 && (
                      <p className="mt-1.5 text-[11.5px] text-muted">
                        {r.signers.map((s) => `${s.role}: ${s.name}`).join(" · ")}
                      </p>
                    )}
                    {r.error && <p className="mt-1.5 text-[11.5px] text-accent-dark">{r.error}</p>}
                    {stale && (
                      <p className="mt-1.5 text-[11.5px] text-accent-dark">
                        Out for {age} days with no signature — worth a call.
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {/* A signed contract with no request behind it is normal, not a
              gap: the request only joins to a listing when it was SENT
              against that listing, and plenty went from the property or the
              contact instead. Said once, quietly, so nobody goes looking. */}
          {terms.docs.length > 0 && terms.requests.length === 0 && (
            <p className="mt-3 border-t border-line/60 pt-3 text-[10.5px] leading-relaxed text-muted">
              Sent from another record, so there&rsquo;s no request to track — only the signed
              copy.
            </p>
          )}
        </>
      )}

      <SendTermsPopout
        open={sending}
        onClose={() => setSending(false)}
        onSent={terms.reload}
        templates={terms.templates}
        listingId={listingId}
        contactId={contactId}
        landlordName={landlordName}
        landlordEmail={landlordEmail}
        address={address}
        recordRef={String(listingId)}
      />
    </section>
  );
}
