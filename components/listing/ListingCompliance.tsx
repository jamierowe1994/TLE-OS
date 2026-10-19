"use client";

import { useCallback, useEffect, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import PropertyFile, { type LooseDoc } from "@/components/PropertyFile";
import FileDocuments, { type Doc } from "@/components/FileDocuments";
import SendTermsPopout from "@/components/SendTermsPopout";
import HomeFacts from "@/components/HomeFacts";
import { useSaveReporter } from "@/components/SaveChip";
import type { LetType } from "@/lib/let-type";
import type { TermsState } from "@/lib/use-listing-terms";

/**
 * THE LISTING'S COMPLIANCE, IN ONE PLACE (James, 12 Oct 2026).
 *
 * "We've got compliance, property file, and upload documents ... two sections
 * that almost read the same, pretty much for no reason ... very overwhelming."
 * It was a certificate panel, a second certificate list inside Documents, an
 * upload list with every type it had never seen drawn as a dashed box, and
 * the property record's papers in a fourth box. Now:
 *
 *   1. The certificates the home's type of let needs (chosen in the line of
 *      facts on the page), each with its own Attach.
 *   2. The landlord's papers and the terms, each counted from wherever it
 *      already is (an upload, a signature, the property record) so nobody is
 *      asked for what is already on the system.
 *   3. Everything else on file, folded away, with one place to drop more.
 */

export type ListingHome = {
  /** Marked intro only in the OS (lib/intro-only): who and when. */
  introOnly?: { by: string; at: string } | null;
  letType: LetType;
  derived: boolean;
  why: string;
  required: string[];
  scotland: boolean;
  noGas: boolean;
  terms: { rex: boolean | null; held: { how: string; name: string; at: string | null } | null };
  /** The book's id for the home its facts are kept on (lib/home-facts), when there is one. */
  homeKey?: string | null;
  /** What the advert says heats the home. */
  heating?: string | null;
  /** The electrics are answered by an EIC (new build or full rewire). */
  eic?: boolean;
};

/** The home's type of let and what is on file for it, read once per listing. */
export function useListingHome(listingId: string | number) {
  const [home, setHome] = useState<ListingHome | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const reporter = useSaveReporter();
  const id = String(listingId);
  /* Read again, in place, when the home's facts change what it has to hold
     (19 Oct 2026). The panel stays up while it does. */
  const reload = useCallback(() => {
    fetch(`/api/listings/home?id=${encodeURIComponent(id)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok?: boolean } & ListingHome) => j?.ok && setHome(j))
      .catch(() => null);
  }, [id]);

  useEffect(() => {
    let live = true;
    setHome(null);
    setProblem(null);
    /* A test listing (negative id) is asked too, since 13 Oct 2026: the route
       answers it from the test file, so its test-signed terms count. */
    if (!Number.isInteger(Number(id)) || Number(id) === 0) return;
    fetch(`/api/listings/home?id=${encodeURIComponent(id)}`, { cache: "no-store" })
      .then(async (r) => ({ r, j: (await r.json().catch(() => null)) as ({ ok?: boolean; error?: string } & ListingHome) | null }))
      .then(({ j }) => {
        if (!live) return;
        if (j?.ok) setHome(j);
        else setProblem(j?.error ?? "The home's record did not load.");
      })
      .catch(() => live && setProblem("The home's record did not load."));
    return () => {
      live = false;
    };
  }, [id]);

  const setLetType = useCallback(
    async (letType: LetType) => {
      const was = home;
      if (home) setHome({ ...home, letType, derived: false });
      const settle = reporter.begin("Type of let");
      try {
        const r = await fetch("/api/listings/home", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, letType }) });
        const j = (await r.json().catch(() => null)) as ({ ok?: boolean; error?: string } & ListingHome) | null;
        if (!r.ok || !j?.ok) throw new Error(j?.error ?? "That did not save.");
        setHome(j);
        settle({ ok: true });
      } catch (e) {
        setHome(was);
        settle({ ok: false, problem: e instanceof Error ? e.message : "That did not save.", retry: () => void setLetType(letType) });
      }
    },
    [home, id, reporter]
  );

  /* Intro only on or off (16 Oct 2026). Kept in the OS alone. */
  const setIntroOnly = useCallback(
    async (on: boolean) => {
      const was = home;
      if (home) setHome({ ...home, introOnly: on ? { by: "you", at: new Date().toISOString() } : null });
      const settle = reporter.begin("Service");
      try {
        const r = await fetch("/api/listings/home", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, introOnly: on }) });
        const j = (await r.json().catch(() => null)) as ({ ok?: boolean; error?: string } & ListingHome) | null;
        if (!r.ok || !j?.ok) throw new Error(j?.error ?? "That did not save.");
        setHome(j);
        settle({ ok: true });
      } catch (e) {
        setHome(was);
        settle({ ok: false, problem: e instanceof Error ? e.message : "That did not save.", retry: () => void setIntroOnly(on) });
      }
    },
    [home, id, reporter]
  );

  return { home, problem, setLetType, setIntroOnly, reload };
}

/** A document uploaded as one of these is the certificate of that row. */
const DOC_TO_CERT: Record<string, string> = { gas_safety: "gas_safety", eicr: "eicr", epc: "epc", licensing: "mandatory_hmo_license" };

type Paper = { field: string; label: string; name: string; url: string };
type Held = { how: string; name?: string; url?: string } | null;

const when = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", year: "numeric" });

export default function ListingCompliance({
  listingId,
  propertyId,
  name,
  address,
  home,
  terms,
  landlord,
  landlordRegistration,
  letOnly,
  introOnly,
  onHomeChanged,
}: {
  listingId: string;
  propertyId: string | null;
  /** The home's line: "Room 1, 32 Elm Close". */
  name: string;
  /** With the town, for the documents store. */
  address: string;
  home: ListingHome | null;
  terms: TermsState;
  landlord: { contactId: string | number | null; name?: string; email?: string };
  landlordRegistration: string | null;
  /** Let only on the listing: the certificates are the landlord's to keep in date. */
  letOnly?: boolean;
  /** Intro only (lib/intro-only): nothing here is ours to chase. */
  introOnly?: boolean;
  /** The home's facts changed what it has to hold (useListingHome's reload). */
  onHomeChanged?: () => void;
}) {
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [papers, setPapers] = useState<{ files: Paper[]; held: string[] } | null>(null);
  const [ask, setAsk] = useState<{ type: string; n: number } | null>(null);
  const [sending, setSending] = useState(false);
  const [fileKey, setFileKey] = useState(0);

  useEffect(() => {
    let live = true;
    setPapers(null);
    if (!(Number(listingId) > 0)) return setPapers({ files: [], held: [] });
    fetch(`/api/listings/record-files?id=${encodeURIComponent(listingId)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; files?: Paper[]; held?: string[] }) => live && setPapers(j.ok ? { files: j.files ?? [], held: j.held ?? [] } : { files: [], held: [] }))
      .catch(() => live && setPapers({ files: [], held: [] }));
    return () => {
      live = false;
    };
  }, [listingId]);

  const [docsOpen, setDocsOpen] = useState(false);
  const upload = (type: string) => {
    setDocsOpen(true);
    setAsk((a) => ({ type, n: (a?.n ?? 0) + 1 }));
    requestAnimationFrame(() => document.getElementById("listing-docs")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  /* ── Where each landlord paper already is ── */
  const doc = (type: string): Held => {
    const d = (docs ?? []).find((x) => x.type === type);
    return d ? { how: `Uploaded ${when(d.at)}`, name: d.name, url: d.url } : null;
  };
  const paper = (field: string, how = "On the property record"): Held => {
    const p = papers?.files.find((f) => f.field === field);
    if (p) return { how, name: p.name, url: p.url };
    return papers?.held.includes(field) ? { how: "Held by the office on the property record" } : null;
  };
  const termsHeld: Held =
    (terms.status === "ready" && terms.docs[0] ? { how: "Signed online", name: terms.docs[0].name, url: terms.docs[0].open } : null) ??
    doc("terms_of_business") ??
    paper("doc_terms_of_business") ??
    (home?.terms.held ? { how: home.terms.held.how, name: home.terms.held.name } : null) ??
    (home?.terms.rex ? { how: "Filed on the home's compliance record" } : null);
  const waiting = terms.status === "ready" ? terms.outstanding[0] ?? null : null;

  const rows: { key: string; label: string; held: Held; need: string; action: React.ReactNode }[] = [
    {
      key: "terms",
      label: "Terms of business",
      held: termsHeld,
      need: waiting ? `Sent${waiting.sentBy ? ` by ${waiting.sentBy}` : ""}, waiting for the landlord to sign` : "Needed before the home can go live",
      action: (
        <>
          <button type="button" onClick={() => setSending(true)} className="rounded-full bg-accent-dark px-3 py-1 text-[11px] font-semibold text-page">Send terms</button>
          <button type="button" onClick={() => upload("terms_of_business")} className="rounded-full border border-line/80 px-3 py-1 text-[11px] hover:border-ink/40">Upload</button>
        </>
      ),
    },
    { key: "id", label: "Landlord ID", held: doc("landlord_id") ?? paper("doc_landlord_id_ownership"), need: "Not on file", action: <UploadButton onClick={() => upload("landlord_id")} /> },
    { key: "own", label: "Proof of ownership", held: doc("landlord_proof_of_ownership") ?? paper("doc_landlord_id_ownership"), need: "Not on file", action: <UploadButton onClick={() => upload("landlord_proof_of_ownership")} /> },
    { key: "aml", label: "AML check", held: doc("landlord_aml"), need: "Not on file", action: <UploadButton onClick={() => upload("landlord_aml")} /> },
    ...(home?.scotland
      ? [{ key: "reg", label: "Landlord registration", held: paper("doc_landlord_registration") ?? (landlordRegistration ? { how: `Number ${landlordRegistration} on the record` } : null), need: "Not on file", action: <UploadButton onClick={() => upload("other")} /> }]
      : []),
  ];

  const loose: LooseDoc[] = (docs ?? []).filter((d) => DOC_TO_CERT[d.type]).map((d) => ({ type: DOC_TO_CERT[d.type], name: d.fileName || d.name, url: d.url, at: d.at }));
  const reading = docs === null || papers === null || (terms.status === "loading" && !home);
  const card = "rounded-[22px] border border-line/50 bg-white p-5";

  return (
    <div className="space-y-5">
      {/* Let only (Sean, 15 Oct 2026): "Certificates to add" read as our job on
          a home where it is the landlord's (Michael's rule). Said once, here. */}
      {introOnly && (
        <p className="flex items-start gap-2.5 rounded-[18px] bg-accent-soft/60 px-4 py-3 text-[12.5px] leading-snug text-ink">
          <DoodleIcon name="shield" size={15} className="mt-0.5 shrink-0 text-accent-dark" />
          <span>
            Intro only, so the certificates are the landlord&apos;s and nothing here is chased. The advert still needs the EPC
            rating, and the terms of business still need signing before it goes live.
          </span>
        </p>
      )}
      {letOnly && !introOnly && (
        <p className="flex items-start gap-2.5 rounded-[18px] bg-accent-soft/60 px-4 py-3 text-[12.5px] leading-snug text-ink">
          <DoodleIcon name="shield" size={15} className="mt-0.5 shrink-0 text-accent-dark" />
          <span>
            Let only, so keeping the certificates in date is the landlord&apos;s job, not ours, and none of them stops the
            let moving on. Ask the landlord for copies: the PLC check needs them before the tenancy starts.
          </span>
        </p>
      )}
      {/* ── 1. The facts that decide them (19 Oct 2026): no gas supply, the
          hot water, an EIC in place of an EICR. The type of let is asked in
          the listing's own line of facts, so not again here. ── */}
      {(home?.homeKey ?? propertyId) && (
        <HomeFacts
          homeKey={home?.homeKey ?? propertyId}
          show={["gasSupply", "hotWater", "electrical"]}
          heating={home?.heating ?? null}
          onChanged={() => {
            onHomeChanged?.();
            setFileKey((k) => k + 1);
          }}
        />
      )}

      {/* ── 2. The certificates that type needs ── */}
      <div className="[&>section]:rounded-[22px] [&>section]:border-line/50">
        <PropertyFile
          key={fileKey}
          title="Certificates"
          propertyId={propertyId}
          address={propertyId ? null : name}
          screen="the listing"
          propertyName={name}
          required={home?.required}
          loose={loose}
        />
      </div>

      {/* ── 3. The landlord's papers and the terms ── */}
      <section className={card}>
        <h3 className="mb-3 flex items-center gap-2.5 text-[14px]">
          <DoodleIcon name="folder" size={17} className="text-accent-dark" />
          Landlord and terms
        </h3>
        {reading ? (
          <p className="flex items-center gap-2 text-[12px] text-muted">
            <span className="block h-3 w-3 animate-spin rounded-full border-[1.5px] border-line border-t-accent-dark" />
            Looking at what is already on the system…
          </p>
        ) : (
          <ul className="divide-y divide-line/40">
            {rows.map((r) => (
              <li key={r.key} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5">
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${r.held ? "bg-[#e8f5ec] text-[#1e7a3c]" : "bg-page text-muted"}`}>
                  {r.held ? (
                    <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden><path d="M3.5 8.4 L6.6 11.4 L12.5 4.8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  ) : (
                    <span className="block h-1.5 w-1.5 rounded-full bg-current" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold">{r.label}</span>
                  <span className={`block truncate text-[11.5px] ${!r.held && r.key === "terms" && !waiting ? "text-accent-dark" : "text-muted"}`}>
                    {r.held ? (
                      <>
                        {r.held.how}
                        {r.held.name ? (
                          <>
                            {" · "}
                            {r.held.url ? (
                              <a href={r.held.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-ink hover:underline">{r.held.name}</a>
                            ) : (
                              r.held.name
                            )}
                          </>
                        ) : null}
                      </>
                    ) : (
                      r.need
                    )}
                  </span>
                </span>
                {!r.held && <span className="flex shrink-0 items-center gap-1.5">{r.action}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── 4. Everything on file, and one place to add more ── */}
      {/* Folded away until asked for (James, 13 Oct 2026: "really long and
          full of old documents ... collapse it"). It stays mounted, so the
          checklist above still knows what is held; an Upload up there opens it. */}
      <section id="listing-docs" className={`${card} scroll-mt-4`}>
        <button type="button" onClick={() => setDocsOpen((o) => !o)} aria-expanded={docsOpen} className="flex w-full items-center gap-2.5 text-left text-[14px]">
          <DoodleIcon name="doc" size={17} className="text-accent-dark" />
          <span className="font-semibold">Documents</span>
          <span className="text-[12px] text-muted">
            {docs === null || papers === null ? "Reading…" : `${docs.length + papers.files.length} on file`}
          </span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={`ml-auto text-muted transition-transform duration-200 ${docsOpen ? "rotate-180" : ""}`}>
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        <div className={docsOpen ? "mt-4" : "hidden"}>
        <FileDocuments
          address={address}
          propertyId={propertyId}
          from={{ kind: "listing", id: listingId }}
          sides={["landlord", "home"]}
          showMissing={false}
          onDocs={(d) => {
            const certsBefore = (docs ?? []).filter((x) => DOC_TO_CERT[x.type]).length;
            setDocs(d);
            if (docs && d.filter((x) => DOC_TO_CERT[x.type]).length !== certsBefore) setFileKey((k) => k + 1);
          }}
          ask={ask}
          intro="Anything else for this home. Pick Other for a document that isn't on the list and name it. Uploading sends nothing to anybody."
        />
        {papers && papers.files.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted">From the property record</p>
            <ul className="divide-y divide-line/50 rounded-[18px] border border-line/60 bg-white">
              {papers.files.map((p) => (
                <li key={p.url}>
                  <a href={p.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-page">
                    <DoodleIcon name="doc" size={16} className="shrink-0 text-accent-dark" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold">{p.label}</span>
                      <span className="block truncate text-[11px] text-muted">{p.name}</span>
                    </span>
                    <span className="text-[11.5px] font-semibold text-accent-dark">Open</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
        </div>
      </section>

      <SendTermsPopout
        open={sending}
        onClose={() => setSending(false)}
        onSent={terms.reload}
        templates={terms.templates}
        listingId={listingId}
        contactId={landlord.contactId}
        landlordName={landlord.name}
        landlordEmail={landlord.email}
        address={name}
        recordRef={listingId}
      />
    </div>
  );
}

function UploadButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="rounded-full border border-line/80 px-3 py-1 text-[11px] hover:border-ink/40">
      Upload
    </button>
  );
}
