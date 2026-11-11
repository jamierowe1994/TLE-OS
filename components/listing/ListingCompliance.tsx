"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import PropertyFile, { type LooseDoc } from "@/components/PropertyFile";
import FileDocuments, { UploadForm, type Doc } from "@/components/FileDocuments";
import SendTermsPopout from "@/components/SendTermsPopout";
import TermsPanel from "@/components/terms/TermsPanel";
import SignedTermsTabs from "@/components/terms/SignedTermsTabs";
import HomeFacts from "@/components/HomeFacts";
import { filesOnIssueDate } from "@/lib/cert-life";
import { CERT_KINDS, CERT_KIND_LABEL, certFilesAs, certNotReadyBecause, kindFilesOnIssueDate, noExpiryNote } from "@/lib/cert-kinds";
import { ACCEPT_EVIDENCE } from "@/lib/upload-rules";
import QueryThread from "@/components/QueryThread";
import { useSaveReporter } from "@/components/SaveChip";
import { Badge, Ico, Menu, type Tone } from "@/components/new-look/Parts";
import { openDocument } from "@/lib/doc-sheet";
import { CHECKING_LABEL, type CertChecking } from "@/lib/cert-hold";
import { CHOICES, eicExpiry, type EicReason } from "@/lib/home-facts-shared";
import { DOC_ACCEPT, OTHER, docTypeLabel } from "@/lib/doc-types";
import type { LetType } from "@/lib/let-type";
import type { TermsRequest, TermsState } from "@/lib/use-listing-terms";
import { regDay, regNumbers, regState, type RegState } from "@/lib/reg-numbers";
import { everyLandlord, useJointLandlords, type HomeLandlord } from "@/lib/use-home-landlords";
import type { AppraisalPaper } from "@/components/listing/ListingAppraisal";

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
  otherLandlords = [],
  appraisalPapers = [],
  landlordRegistration,
  landlordRegistrationExpiry = null,
  landlordRegistrationOwner = null,
  letOnly,
  introOnly,
  onHomeChanged,
  look,
  agentLarn = null,
  service = null,
  homeProblem = null,
}: {
  listingId: string;
  propertyId: string | null;
  /** The home's line: "Room 1, 32 Elm Close". */
  name: string;
  /** With the town, for the documents store. */
  address: string;
  home: ListingHome | null;
  terms: TermsState;
  landlord: { contactId: string | number | null; name?: string; email?: string; phone?: string };
  /**
   * Every landlord after the first, as the one reader names them
   * (lib/landlords-for-home, 10 Nov 2026): the listing's second owner was
   * never here, so the terms went to one signer and one ID was asked for.
   */
  otherLandlords?: HomeLandlord[];
  /**
   * The papers on the market appraisal this home came from and its lead
   * (components/listing/ListingAppraisal, 10 Nov 2026): a landlord's ID or
   * signed terms sent at the appraisal said "Not on file" on the listing.
   */
  appraisalPapers?: AppraisalPaper[];
  landlordRegistration: string | null;
  /** When each registration number runs out (lib/reg-numbers), from the listing's Landlord section. */
  landlordRegistrationExpiry?: Record<string, string> | null;
  /** Whose each number is, by landlord name (lib/reg-numbers). */
  landlordRegistrationOwner?: Record<string, string> | null;
  /** Let only on the listing: the certificates are the landlord's to keep in date. */
  letOnly?: boolean;
  /** Intro only (lib/intro-only): nothing here is ours to chase. */
  introOnly?: boolean;
  /** The home's facts changed what it has to hold (useListingHome's reload). */
  onHomeChanged?: () => void;
  /** The new look (lib/new-look): shows what is on file, simply. Absent, the screen is unchanged. */
  look?: "new";
  /** For the terms sent from here (components/terms): the agent's LARN and the service on record. */
  agentLarn?: string | null;
  service?: string | null;
  /** useListingHome's problem: the home's record won't come, so stop waiting for it before offering to send. */
  homeProblem?: string | null;
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

  /* Every landlord on the home (Lianna, 1 Nov 2026): the record's, then the
     joint landlords kept on the home (lib/property-people) under the same key
     the listing's Landlord section uses. A test listing keeps its own. */
  const joint = useJointLandlords(Number(listingId) < 0 ? null : propertyId ?? `listing:${listingId}`);
  const landlords = everyLandlord([{ name: landlord.name, email: landlord.email, phone: landlord.phone }], otherLandlords, joint ?? []);

  /* ── Where each landlord paper already is ── */
  const doc = (type: string): Held => {
    const d = (docs ?? []).find((x) => x.type === type);
    return d ? { how: `Uploaded ${when(d.at)}`, name: d.name, url: d.url } : null;
  };
  /* One landlord's paper among several: uploaded with their name on it
     ("Landlord AML Check - John Hood", the documents route's `who`). The first
     landlord also has anything uploaded before there were names on them. */
  const docFor = (type: string, who: string, first: boolean): Held => {
    const named = (x: Doc) => x.type === type && x.name.toLowerCase().endsWith(` - ${who.toLowerCase()}`);
    const d = (docs ?? []).find(named) ?? (first ? (docs ?? []).find((x) => x.type === type && x.name === docTypeLabel(type)) : undefined);
    return d ? { how: `Uploaded ${when(d.at)}`, name: d.name, url: d.url } : null;
  };
  /* From the appraisal, the newest of a type; one only the office may open still says it is held. */
  const fromAppraisal = (type: string): Held => {
    const p = appraisalPapers.find((x) => x.type === type);
    if (!p) return null;
    return p.url ? { how: `${p.how}, on the appraisal${p.at ? ` ${when(p.at)}` : ""}`, name: p.name, url: p.url } : { how: "Held by the office, from the appraisal" };
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
    fromAppraisal("terms_of_business") ??
    (home?.terms.held ? { how: home.terms.held.how, name: home.terms.held.name } : null) ??
    (home?.terms.rex ? { how: "Filed on the home's compliance record" } : null);
  const waiting = terms.status === "ready" ? terms.outstanding[0] ?? null : null;

  /* The registration's dates, set on the listing's Landlord section (Lianna,
     30 Oct 2026): the worst of them sets the row - a lapsed one is to renew. */
  const regNums = regNumbers(landlordRegistration);
  const regRuns = regNums.map((n) => ({ n, day: landlordRegistrationExpiry?.[n] ?? null }));
  const regWorst: RegState | null = regNums.length
    ? (["expired", "due-soon", "no-date", "valid"] as RegState[]).find((st) => regRuns.some((r) => regState(r.day) === st)) ?? null
    : null;
  const regLine = regRuns
    .map((r) => `${regNums.length > 1 ? `${landlordRegistrationOwner?.[r.n] ?? r.n} ` : ""}${r.day ? `${regState(r.day) === "expired" ? "ran out" : "runs to"} ${regDay(r.day)}` : "no expiry date yet"}`)
    .join(" · ");
  const regPaper = paper("doc_landlord_registration");
  const regHeld: Held = regPaper
    ? { ...regPaper, how: regNums.length ? `${regPaper.how} · ${regLine}` : regPaper.how }
    : regNums.length
      ? { how: regNums.length > 1 ? regLine : `Number ${regNums[0]} · ${regLine}` }
      : null;

  const rows: { key: string; label: string; held: Held; need: string; action: React.ReactNode; reg?: RegState | null }[] = [
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
    { key: "id", label: "Landlord ID", held: doc("landlord_id") ?? paper("doc_landlord_id_ownership") ?? paper("landlord_photo_id") ?? fromAppraisal("landlord_id"), need: "Not on file", action: <UploadButton onClick={() => upload("landlord_id")} /> },
    { key: "own", label: "Proof of ownership", held: doc("landlord_proof_of_ownership") ?? paper("doc_landlord_id_ownership") ?? fromAppraisal("landlord_proof_of_ownership"), need: "Not on file", action: <UploadButton onClick={() => upload("landlord_proof_of_ownership")} /> },
    { key: "aml", label: "AML check", held: doc("landlord_aml") ?? paper("landlord_aml") ?? fromAppraisal("landlord_aml"), need: "Not on file", action: <UploadButton onClick={() => upload("landlord_aml")} /> },
    ...(home?.scotland
      ? [{ key: "reg", label: "Landlord registration", held: regHeld, reg: regWorst, need: "Not on file", action: <UploadButton onClick={() => upload("other")} /> }]
      : []),
  ];

  /* With more than one landlord, an ID and an AML check for each, each on file on its own (ticket
     910dbc38: "if multiple LL, will only allow you to add 1"). The property record's copy is the
     record landlord's. One landlord: the rows as they were. */
  const named = landlords.filter((l) => l.name?.trim());
  const perLandlord = (r: (typeof rows)[number]) => {
    if (named.length < 2 || (r.key !== "id" && r.key !== "aml")) return [{ key: r.key, label: r.label, held: r.held, reg: r.reg ?? null }];
    return named.map((l, i) => {
      const who = (l.name ?? "").trim();
      const held =
        r.key === "id"
          ? docFor("landlord_id", who, i === 0) ?? (i === 0 ? paper("doc_landlord_id_ownership") ?? paper("landlord_photo_id") ?? fromAppraisal("landlord_id") : null)
          : docFor("landlord_aml", who, i === 0) ?? (i === 0 ? paper("landlord_aml") ?? fromAppraisal("landlord_aml") : null);
      return { key: `${r.key}:${i}`, label: `${who}: ${r.key === "id" ? "ID" : "AML check"}`, held, reg: null, who };
    });
  };

  const loose: LooseDoc[] = [
    ...(docs ?? []).filter((d) => DOC_TO_CERT[d.type]).map((d) => ({ type: DOC_TO_CERT[d.type], name: d.fileName || d.name, url: d.url, at: d.at })),
    /* A certificate the landlord sent at the appraisal, until one is filed on the home. */
    ...appraisalPapers.filter((p) => DOC_TO_CERT[p.type] && p.url && p.at).map((p) => ({ type: DOC_TO_CERT[p.type], name: p.name, url: p.url as string, at: p.at as string })),
  ];
  const reading = docs === null || papers === null || (terms.status === "loading" && !home);
  /* Terms can be filed on the home's own record, so nothing offers to send them until that has answered. */
  const termsReading = reading || (!home && !homeProblem) || joint === null;
  const card = "rounded-[22px] border border-line/50 bg-white p-5";

  if (look === "new") {
    return (
      <NewLookCompliance
        listingId={listingId}
        propertyId={propertyId}
        name={name}
        address={address}
        home={home}
        terms={terms}
        landlord={landlord}
        letOnly={letOnly}
        introOnly={introOnly}
        onHomeChanged={onHomeChanged}
        docs={docs}
        setDocs={setDocs}
        papers={papers}
        loose={loose}
        reading={reading}
        termsReading={termsReading}
        termsHeld={termsHeld}
        waiting={waiting}
        landlords={landlords}
        paperRows={rows.filter((r) => r.key !== "terms").flatMap(perLandlord)}
        agentLarn={agentLarn}
        service={service}
      />
    );
  }

  return (
    <div className="space-y-5">
      {!termsReading && !termsHeld && !waiting && (
        <TermsPanel
          listingId={listingId}
          propertyId={propertyId}
          propertyAddress={address}
          landlords={landlords}
          agentLarn={agentLarn}
          serviceOnRecord={service}
          scottish={home ? home.scotland : null}
          onChanged={terms.reload}
        />
      )}
      {!termsReading && termsHeld && <SignedTermsTabs listingId={listingId} propertyId={propertyId} />}
      {/* Let only (Sean, 15 Oct 2026): "Certificates to add" read as our job on
          a home where it is the landlord's (Michael's rule). Said once, here. */}
      {introOnly && (
        <p className="flex items-start gap-2.5 rounded-[18px] bg-accent-soft/60 px-4 py-3 text-[12.5px] leading-snug text-ink">
          <DoodleIcon name="shield" size={15} className="mt-0.5 shrink-0 text-accent-dark" />
          <span>
            Marketing only, so the certificates are the landlord&apos;s and nothing here is chased. The advert still needs the EPC
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
            {rows.map((r) => {
              /* Held but run out, about to, or with no date to watch. */
              const lapse = r.held && r.reg && r.reg !== "valid" ? (r.reg === "expired" ? "Expired" : r.reg === "due-soon" ? "Due soon" : "No expiry date") : null;
              return (
              <li key={r.key} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5">
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${lapse ? "bg-accent-soft text-accent-dark" : r.held ? "bg-[#e8f5ec] text-[#1e7a3c]" : "bg-page text-muted"}`}>
                  {lapse ? (
                    <span className="text-[12px] font-bold leading-none">!</span>
                  ) : r.held ? (
                    <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden><path d="M3.5 8.4 L6.6 11.4 L12.5 4.8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  ) : (
                    <span className="block h-1.5 w-1.5 rounded-full bg-current" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline gap-x-2 text-[13px] font-semibold">
                    {r.label}
                    {lapse && <span className="text-[11px] font-semibold text-accent-dark">{lapse}</span>}
                  </span>
                  <span className={`block text-[11.5px] ${r.key === "reg" ? "" : "truncate"} ${(!r.held && r.key === "terms" && !waiting) || lapse ? "text-accent-dark" : "text-muted"}`}>
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
              );
            })}
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

/* ═══════════════════════════════════════════════════════════════════════════
   THE NEW LOOK (23 Oct 2026).

   James: "Compliance is showing really heavily wrong. We've got to do the
   checks and stuff, but this isn't the place to do that. We're just showing
   what's on there." So: the Terms of Business as one banner, everything the
   home has to hold as one list with its own Upload or Replace, and one drop
   space under it. The questions about the home, the full certificate record
   (earlier copies, Remove, queries) and every other document are a quiet
   link away, not on the page. Every figure, name and date is read live.
═══════════════════════════════════════════════════════════════════════════ */

type CertFile = { key: string; certKey: string; label: string; name: string; size: number; uploadedAt: string | null; open: string };
type CertRow = {
  type: string;
  label: string;
  state: "valid" | "expiring" | "expired" | "missing" | "not-required" | "held-here";
  expiry: string | null;
  issued: string | null;
  inRex: boolean;
  fileInRex: boolean;
  files: CertFile[];
  fromHouse?: string;
  renewal?: { appliedOn: string; ref: string; holdEnds: string; by: string };
  checking?: CertChecking;
};
type CertAnswer = { ok: boolean; propertyId: string | null; checked: boolean; rows: CertRow[]; error?: string };
type CertRead = { type: string; issue: string | null; expiry: string | null; expiryDerived: boolean; address: string; notes: string };
type Filing = {
  row: string;
  file: File;
  read: CertRead | null;
  type: string;
  expiry: string;
  issue: string;
  how: string;
  busy: boolean;
  note: string | null;
  eicReason: EicReason | "";
  replaces: { key: string; name: string } | null;
};

/* The certificate types and the filing form, the same as PropertyFile's. */
const CERT_TYPE: Record<string, string> = {
  gas_safety: "Gas safety (CP12)",
  eicr: "EICR",
  epc: "EPC",
  mandatory_hmo_license: "HMO licence",
  additional_hmo_license: "HMO licence (additional)",
  selective_hmo_license: "Selective licence",
  legionella_risk_assessment: "Legionella risk assessment",
  portable_appliance_testing: "PAT",
  smoke_alarms: "Smoke alarms",
  co_alarms: "CO alarms",
  emergency_lighting_fire_exit: "Fire safety",
};
const EIC = "eic";
/* What can be picked: the shared list (lib/cert-kinds), which offers a fire
   risk assessment and an emergency lighting certificate by name. */
const CERT_CHOICES: [string, string][] = CERT_KINDS.flatMap((k): [string, string][] => (k.id === "eicr" ? [[k.id, k.label], [EIC, "EIC (new build or full rewire)"]] : [[k.id, k.label]]));
/**
 * Why File It is greyed, as a line under it, or null when it is ready. One
 * rule for every door (lib/cert-kinds): a PAT report or a fire safety
 * certificate has no expiry, so the day it was done is enough. This form
 * wanted an expiry whatever the type until 10 Nov 2026, and did not say so.
 */
const filingNotReady = (f: Filing): string | null =>
  certNotReadyBecause({ type: f.type, expiry: f.expiry, issue: f.issue, eic: f.type === EIC ? { reason: f.eicReason } : null });
const READER_TYPE: Record<string, string> = { hmo_licence: "mandatory_hmo_license" };
const readsAsEic = (r: CertRead | null) => Boolean(r && r.type === "eicr" && /installation certificate|new (electrical )?installation|\bEIC\b/i.test(r.notes) && !/condition report/i.test(r.notes));
const capEic = (issue: string, expiry: string) => {
  const cap = eicExpiry(issue);
  return cap && (!expiry || expiry > cap) ? cap : expiry;
};
const HOW: { id: string; label: string }[] = [
  { id: "we uploaded it", label: "We uploaded it" },
  { id: "emailed by the landlord", label: "The landlord emailed it over" },
  { id: "emailed by the contractor", label: "The contractor emailed it over" },
  { id: "from the tenant", label: "The tenant sent it" },
  { id: "downloaded from Propoly", label: "Out of Propoly" },
];

/* What the list calls each one. */
const CERT_NAME: Record<string, string> = {
  gas_safety: "Gas safety certificate",
  eicr: "Electrical safety (EICR)",
  epc: "Energy performance (EPC)",
  mandatory_hmo_license: "HMO licence",
  additional_hmo_license: "HMO licence (additional)",
  selective_hmo_license: "Selective licence",
  legionella_risk_assessment: "Legionella risk assessment",
  portable_appliance_testing: "Portable appliance testing (PAT)",
  smoke_alarms: "Smoke alarms",
  co_alarms: "CO alarms",
  emergency_lighting_fire_exit: "Fire safety",
};
const certName = (r: CertRow) => (r.type === "eicr" && /\(EIC\)/.test(r.label) ? "Electrical safety (EIC)" : CERT_NAME[r.type] ?? r.label);
const CADENCE: Record<string, string> = { gas_safety: "Renewed every 12 months", eicr: "Every 5 years", epc: "Every 10 years" };

const LICENCE_TYPES = new Set(["mandatory_hmo_license", "additional_hmo_license", "selective_hmo_license"]);
const answersType = (row: CertRow, type: string) => row.type === type || (type === "mandatory_hmo_license" && LICENCE_TYPES.has(row.type)) || (type === "smoke_alarms" && row.type === "co_alarms");

/** A landlord paper's row: the document type its Upload files as. */
const PAPER_TYPE: Record<string, { type: string; name: string }> = {
  id: { type: "landlord_id", name: "" },
  own: { type: "landlord_proof_of_ownership", name: "" },
  aml: { type: "landlord_aml", name: "" },
  reg: { type: OTHER, name: "Landlord registration" },
};

/** YYYY-MM-DD as "14 Sep 2027". */
const ymd = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : iso;
};
/** A moment as "6 Oct", with the year when it is not this one. */
const onDay = (iso: string) => {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const thisYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", ...(thisYear ? {} : { year: "numeric" }) });
};
const signerOf = (r: TermsRequest) => r.signers.find((s) => s.role.toLowerCase() !== "agent") ?? r.signers[0] ?? null;

function DocGlyph({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M7 3.5h7l4 4V19a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 19V5a1.5 1.5 0 0 1 1-1.5z" />
      <path d="M13.5 3.5V8H18M9 12.5h6M9 16h6" />
    </svg>
  );
}
function AlertGlyph({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
      <path d="M12 7v6M12 17h.01" />
    </svg>
  );
}

type ListRow = {
  key: string;
  name: string;
  /** What is on file, or what is needed. */
  sub: React.ReactNode;
  subTitle?: string;
  status: { label: string; tone: Tone; title?: string };
  icon: "ok" | "warn" | "missing";
  /** Counts toward "on file"; `upload` and `renew` toward the rest. */
  count: "on" | "upload" | "renew";
  action: React.ReactNode;
  /** The certificate type this row files, for the filing form under it. */
  certType?: string;
  /** Drawn under the row: compliance's query and the answer box. */
  below?: React.ReactNode;
};

function NewLookCompliance({
  listingId,
  propertyId,
  name,
  address,
  home,
  terms,
  landlord,
  letOnly,
  introOnly,
  onHomeChanged,
  docs,
  setDocs,
  papers,
  loose,
  reading,
  termsReading,
  termsHeld,
  waiting,
  paperRows,
  landlords,
  agentLarn,
  service,
}: {
  listingId: string;
  propertyId: string | null;
  name: string;
  address: string;
  home: ListingHome | null;
  terms: TermsState;
  landlord: { contactId: string | number | null; name?: string; email?: string; phone?: string };
  letOnly?: boolean;
  introOnly?: boolean;
  onHomeChanged?: () => void;
  docs: Doc[] | null;
  setDocs: (d: Doc[]) => void;
  papers: { files: Paper[]; held: string[] } | null;
  loose: LooseDoc[];
  reading: boolean;
  termsReading: boolean;
  termsHeld: Held;
  waiting: TermsRequest | null;
  paperRows: { key: string; label: string; held: Held; reg?: RegState | null; who?: string }[];
  /** Every landlord on the home, for the terms' signers. */
  landlords: HomeLandlord[];
  agentLarn: string | null;
  service: string | null;
}) {
  const reporter = useSaveReporter();
  const [sending, setSending] = useState(false);
  /* Reissue on New Terms (James, 24 Oct 2026): signed terms can still be replaced by a new set. */
  const [reissue, setReissue] = useState(0);

  /* ── The certificates, read from the same place the property file reads them ── */
  const [cert, setCert] = useState<CertAnswer | null>(null);
  const [certError, setCertError] = useState<string | null>(null);
  const certQuery = propertyId ? `property=${encodeURIComponent(propertyId)}` : name ? `address=${encodeURIComponent(name)}` : null;
  const loadCerts = useCallback(() => {
    if (!certQuery) {
      setCert({ ok: true, propertyId: null, checked: false, rows: [] });
      return;
    }
    fetch(`/api/property-file?${certQuery}`, { cache: "no-store" })
      .then(async (r) => (await r.json()) as CertAnswer)
      .then((j) => {
        if (!j.ok) throw new Error(j.error ?? "The certificates could not be read just now.");
        setCert(j);
        setCertError(null);
      })
      .catch((e) => setCertError(e instanceof Error ? e.message : "The certificates could not be read just now."));
  }, [certQuery]);
  useEffect(() => {
    setCert(null);
    setCertError(null);
    loadCerts();
  }, [loadCerts]);

  /* ── The two questions that decide the list (gas, electrics): answered or not ── */
  const homeKey = home?.homeKey ?? propertyId ?? null;
  const [facts, setFacts] = useState<{ gas: boolean; electrical: boolean } | null>(null);
  const loadFacts = useCallback(() => {
    if (!homeKey) return setFacts(null);
    fetch(`/api/home-facts?home=${encodeURIComponent(homeKey)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; facts?: { gasSupply?: string | null; electrical?: string | null } }) =>
        setFacts(j?.ok ? { gas: Boolean(j.facts?.gasSupply), electrical: Boolean(j.facts?.electrical) } : null)
      )
      .catch(() => setFacts(null));
  }, [homeKey]);
  useEffect(() => loadFacts(), [loadFacts]);

  const [open, setOpen] = useState<"facts" | "docs" | "record" | null>(null);
  const [docsKey, setDocsKey] = useState(0);
  const toggle = (which: "facts" | "docs" | "record") => {
    /* The full record may have changed what is on file: read the list again on the way out. */
    if (open === "record") loadCerts();
    setOpen(open === which ? null : which);
  };

  /* ── Filing a certificate: read it, check the dates, file it (PropertyFile's road) ── */
  const [filing, setFiling] = useState<Filing | null>(null);
  const [went, setWent] = useState<string | null>(null);
  const certInput = useRef<HTMLInputElement>(null);
  const certFor = useRef<{ type: string; replaces: { key: string; name: string } | null }>({ type: "", replaces: null });
  const pickCert = (type: string, replaces: { key: string; name: string } | null) => {
    certFor.current = { type, replaces };
    certInput.current?.click();
  };

  async function startCert(file: File, forType: string, replaces: { key: string; name: string } | null) {
    setWent(null);
    setFiling({ row: forType, file, read: null, type: forType, expiry: "", issue: "", how: HOW[0].id, busy: true, note: null, eicReason: "", replaces });
    const body = new FormData();
    body.set("file", file);
    if (forType) body.set("expect", forType);
    const j = (await fetch("/api/compliance/certificates/read", { method: "POST", body })
      .then((r) => r.json())
      .catch(() => ({ ok: false }))) as { ok?: boolean; read?: CertRead; error?: string };
    const read = j.ok && j.read ? j.read : null;
    /* The row's own type, unless the reader names a kind that files as it (a
       fire risk assessment on the fire row): then the reader's, which says more. */
    const readType = read ? READER_TYPE[read.type] ?? read.type : "";
    const read0 = forType && certFilesAs(readType) !== forType ? forType : readType || forType;
    const type = read0 === "eicr" && readsAsEic(read) ? EIC : read0;
    const issue = read?.issue ?? "";
    const expiry = type === EIC && issue ? capEic(issue, read?.expiry ?? "") : read?.expiry ?? "";
    setFiling((p) =>
      p && p.file === file
        ? { ...p, read, type: CERT_KIND_LABEL[type] || type === EIC ? type : p.type, expiry, issue, busy: false, note: j.ok ? null : j.error ?? "The reader could not open it; fill the dates in by hand." }
        : p
    );
  }

  async function fileCert() {
    if (!filing || filingNotReady(filing)) return;
    const eic = filing.type === EIC;
    setFiling((p) => (p ? { ...p, busy: true, note: null } : p));
    const target = propertyId ?? cert?.propertyId ?? null;
    const body = new FormData();
    body.set("file", filing.file);
    if (target) body.set("propertyId", target);
    else body.set("address", name);
    body.set("type", eic ? "eicr" : filing.type);
    body.set("expiry", eic ? capEic(filing.issue, filing.expiry) : filing.expiry);
    if (filing.issue) body.set("issue", filing.issue);
    if (!propertyId) body.set("propertyName", name);
    const why = eic ? CHOICES.eicReason.find((c) => c.value === filing.eicReason)?.label.toLowerCase() : null;
    body.set("source", `${eic ? `EIC (${why}), ` : ""}${filing.how}, on the listing`);
    if (filing.replaces) body.set("replaces", filing.replaces.key);
    const settle = reporter.begin("Certificate");
    type Filed = { ok?: boolean; error?: string; duplicate?: boolean; share?: { line?: string }; replaced?: string | null };
    const j: Filed = await fetch("/api/compliance/certificates", { method: "POST", body })
      .then(async (r) => {
        const b = (await r.json().catch(() => null)) as Filed | null;
        return r.ok && b?.ok ? b : { ok: false, error: b?.error };
      })
      .catch(() => ({ ok: false, error: "The upload did not land." }));
    if (!j.ok) {
      const problem = j.error ?? "The upload did not land.";
      settle({ ok: false, problem, retry: () => void fileCert() });
      setFiling((p) => (p ? { ...p, busy: false, note: problem } : p));
      return;
    }
    settle({ ok: true });
    if (eic && target && /^(\d+|pm-[0-9a-f-]+|mt-[a-z0-9]+)$/i.test(target)) {
      await fetch("/api/home-facts", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ home: target, electrical: "eic", eicReason: filing.eicReason }) }).catch(() => null);
    }
    setFiling(null);
    setWent(j.duplicate ? "That certificate is already on this home; nothing was sent again." : [j.replaced, j.share?.line].filter(Boolean).join(" ") || null);
    loadCerts();
  }

  /* A document uploaded as a certificate but never read in as one. */
  async function readIn(d: LooseDoc, type: string, replaces: { key: string; name: string } | null) {
    try {
      const blob = await fetch(`${d.url}${d.url.includes("?") ? "&" : "?"}bytes=1`).then((r) => (r.ok ? r.blob() : Promise.reject()));
      await startCert(new File([blob], d.name, { type: blob.type || "application/pdf" }), type, replaces);
    } catch {
      setWent(`${d.name} could not be opened to read. Download it and use Upload instead.`);
    }
  }

  /* ── Landlord papers and anything else: the documents store (FileDocuments' road) ── */
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null);
  const [paperBusy, setPaperBusy] = useState<string | null>(null);
  const paperInput = useRef<HTMLInputElement>(null);
  const paperFor = useRef<{ row: string; type: string; name: string; who?: string }>({ row: "", type: "", name: "" });
  const pickPaper = (row: string, type: string, nm: string, who?: string) => {
    paperFor.current = { row, type, name: nm, who };
    paperInput.current?.click();
  };

  /** `who`: whose paper it is, when the home has more than one landlord. */
  async function putDoc(file: File, type: string, nm: string, who?: string): Promise<string | null> {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("type", type);
    fd.append("name", nm);
    if (who) fd.append("who", who);
    fd.append("address", address);
    fd.append("property", propertyId != null && String(propertyId).trim() ? String(propertyId) : "");
    fd.append("from", "listing");
    fd.append("fromId", String(listingId));
    try {
      const r = await fetch("/api/documents", { method: "POST", body: fd });
      const j = (await r.json().catch(() => null)) as { ok?: boolean; docs?: Doc[]; error?: string } | null;
      if (!r.ok || !j?.ok) return j?.error ?? "That did not upload. Try again.";
      setDocs(j.docs ?? []);
      setDocsKey((k) => k + 1);
      setSaid({ ok: true, text: `${type === OTHER ? nm : docTypeLabel(type)}${who ? ` for ${who}` : ""} is on the file. Nobody has been sent it.` });
      return null;
    } catch {
      return "That did not upload. Check the connection and try again.";
    }
  }

  async function paperChosen(file: File) {
    const p = paperFor.current;
    setSaid(null);
    setPaperBusy(p.row);
    const err = await putDoc(file, p.type, p.name, p.who);
    setPaperBusy(null);
    if (err) setSaid({ ok: false, text: err });
  }

  /* ── The drop space: several at once, each said what it is, then filed in its row ── */
  const [queue, setQueue] = useState<File[]>([]);
  const [over, setOver] = useState(false);
  const take = (files: FileList | null) => {
    const list = files ? [...files] : [];
    if (!list.length) return;
    setSaid(null);
    setQueue((q) => [...q, ...list]);
  };

  /* ── The terms: a reminder is an email from the agent (app/api/esign/remind) ── */
  const [chase, setChase] = useState<{ stage: "idle" | "confirm" | "going" | "sent"; note: string | null }>({ stage: "idle", note: null });
  const chaseTo = waiting ? signerOf(waiting) : null;
  async function remind() {
    if (!waiting || !chaseTo?.email) return;
    setChase({ stage: "going", note: null });
    try {
      const r = await fetch("/api/esign/remind", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ to: chaseTo.email, landlordName: chaseTo.name, address: name, sentAt: waiting.sentAt }),
      });
      const j = (await r.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!r.ok || !j?.ok) return setChase({ stage: "idle", note: j?.error ?? "That didn't send." });
      setChase({ stage: "sent", note: null });
    } catch {
      setChase({ stage: "idle", note: "That didn't send." });
    }
  }

  /* ── The list ── */
  const required = home?.required;
  const certRows: CertRow[] = (() => {
    if (!cert) return [];
    const needed = (r: CertRow) => !required || r.files.length > 0 || r.state === "valid" || r.state === "held-here" || required.some((t) => answersType(r, t));
    const shown = cert.rows.filter((r) => r.state !== "not-required" || r.files.length > 0).filter(needed);
    const gaps: CertRow[] = (required ?? [])
      .filter((t) => !cert.rows.some((r) => answersType(r, t)))
      .map((t) => ({ type: t, label: CERT_TYPE[t] ?? t, state: "missing" as const, expiry: null, issued: null, inRex: false, fileInRex: false, files: [] }));
    return [...shown, ...gaps];
  })();

  const certList: ListRow[] = certRows.map((r) => {
    const f = r.files[0] ?? null;
    const queried = Boolean(r.checking?.queried);
    const withCompliance = Boolean(r.checking && !queried);
    const spare = !r.checking ? loose.find((d) => (answersType(r, d.type) || d.type === r.type) && (r.state !== "valid" || Boolean(f?.uploadedAt && d.at > (f.uploadedAt as string)))) ?? null : null;
    /* A PAT or fire safety check carries only the day it was done; the date
       after it is that day plus a year (lib/cert-life), so it says due again,
       not expires (Rhiannon Dodge, 9 Nov 2026). */
    const dated = r.issued && filesOnIssueDate(r.type) ? `Issued ${ymd(r.issued)}${r.expiry ? `, ${r.state === "expired" ? "was due" : "due again"} ${ymd(r.expiry)}` : ""}` : r.expiry ? `${r.state === "expired" ? "Expired" : "Valid to"} ${ymd(r.expiry)}` : r.issued ? `Issued ${ymd(r.issued)}` : "";
    const status: ListRow["status"] = r.renewal
      ? { label: "With the council", tone: "neutral", title: `Renewal applied for ${ymd(r.renewal.appliedOn)}` }
      : queried
        ? { label: "Queried", tone: "accent", title: r.checking?.queried ?? undefined }
        : withCompliance
          ? { label: "Being checked", tone: "info", title: CHECKING_LABEL }
          : r.state === "valid" || r.state === "held-here"
            ? { label: "On file", tone: "good" }
            : r.state === "expiring"
              ? { label: "Due soon", tone: "warning" }
              : r.state === "expired"
                ? { label: "Expired", tone: "accent" }
                : r.state === "not-required"
                  ? { label: "Not required", tone: "neutral" }
                  : { label: "Missing", tone: "warning" };
    const icon: ListRow["icon"] =
      r.state === "missing" && !r.checking ? "missing" : r.state === "expired" || r.state === "expiring" || queried ? (r.renewal || withCompliance ? "ok" : "warn") : "ok";
    const count: ListRow["count"] = r.state === "missing" && !r.checking ? "upload" : r.state === "expired" && !r.renewal && !withCompliance ? "renew" : "on";
    const bits: React.ReactNode[] = [];
    if (f) {
      bits.push(
        <button key="f" type="button" className="nl-cmp-file" onClick={() => openDocument({ key: f.key, name: f.name, label: r.label, property: name, url: f.open })}>
          {f.name}
        </button>
      );
    } else if (r.state !== "missing") {
      bits.push(r.fileInRex ? "Copy held on the home's record" : r.inRex ? "On the record, no copy here" : "");
    }
    if (dated) bits.push(dated);
    if (r.fromHouse) bits.push(`Held on ${r.fromHouse}`);
    if (withCompliance && r.checking) bits.push(`New one filed ${ymd(r.checking.at)}, runs to ${ymd(r.checking.expiry)}`);
    if (r.state === "missing" && !r.checking) bits.push(letOnly || introOnly ? "Not on file · the landlord's to keep in date" : `Not on file${CADENCE[r.type] ? ` · ${CADENCE[r.type]}` : ""}`);
    if (spare) bits.push(`Uploaded as a document: ${spare.name}`);
    const parts = bits.filter(Boolean);
    const busy = filing?.row === r.type && filing.busy;
    const action = spare ? (
      <button type="button" className="nl-btn nl-btn--secondary nl-btn--sm" disabled={busy} onClick={() => void readIn(spare, r.type, f ? { key: f.key, name: f.name } : null)}>
        {f ? "Use this instead" : "Read it in"}
      </button>
    ) : f ? (
      <button type="button" className="nl-btn nl-btn--quiet nl-btn--sm" disabled={busy} onClick={() => pickCert(r.type, { key: f.key, name: f.name })}>
        Replace
      </button>
    ) : (
      <button type="button" className={`nl-btn nl-btn--sm ${r.state === "missing" || r.state === "expired" ? "nl-btn--secondary" : "nl-btn--quiet"}`} disabled={busy} onClick={() => pickCert(r.type, null)}>
        {r.state === "missing" || r.state === "expired" ? <Ico name="upload" size={14} /> : null}
        Upload
      </button>
    );
    return {
      key: `cert-${r.type}`,
      name: certName(r),
      sub: parts.map((p, i) => (
        <span key={i}>
          {i > 0 ? " · " : ""}
          {p}
        </span>
      )),
      subTitle: parts.filter((p) => typeof p === "string").join(" · "),
      status,
      icon,
      count,
      action,
      certType: r.type,
      /* Answered here, where the agent is (Dan, ticket cf6364de, 1 Nov 2026):
         it was a Queried pill with the question in its tooltip, and the
         answer box only on the Compliance page's property file. */
      below:
        queried && r.checking ? (
          <div className="nl-cmp-query">
            <p className="nl-cmp-query-note">
              <span className="nl-strong">Queried by the compliance team.</span> {r.checking.queried}
            </p>
            <QueryThread kind="certificate" id={r.checking.id} />
          </div>
        ) : null,
    };
  });

  const paperList: ListRow[] = paperRows.map((p) => {
    const t = PAPER_TYPE[p.key.split(":")[0]];
    const held = p.held;
    const busy = paperBusy === p.key;
    const sub = held ? (
      <>
        {held.name ? (
          held.url ? (
            <a href={held.url} target="_blank" rel="noopener noreferrer" className="nl-cmp-file">
              {held.name}
            </a>
          ) : (
            held.name
          )
        ) : null}
        {held.name ? " · " : ""}
        {held.how}
      </>
    ) : (
      "Not on file"
    );
    return {
      key: `paper-${p.key}`,
      name: p.label,
      sub,
      subTitle: held ? [held.name, held.how].filter(Boolean).join(" · ") : "Not on file",
      /* A registration on file can still have run out, or be about to. */
      status: !held
        ? { label: "Missing", tone: "warning" }
        : p.reg === "expired"
          ? { label: "Expired", tone: "accent" }
          : p.reg === "due-soon"
            ? { label: "Due soon", tone: "warning" }
            : p.reg === "no-date"
              ? { label: "No expiry date", tone: "warning", title: "Add when it runs out under Landlord on the listing" }
              : { label: "On file", tone: "good" },
      icon: !held ? "missing" : p.reg === "expired" || p.reg === "due-soon" || p.reg === "no-date" ? "warn" : "ok",
      count: !held ? "upload" : p.reg === "expired" ? "renew" : "on",
      action: !t ? null : held ? (
        <button type="button" className="nl-btn nl-btn--quiet nl-btn--sm" disabled={busy} onClick={() => pickPaper(p.key, t.type, t.name, p.who)}>
          {busy ? "Uploading…" : "Add another"}
        </button>
      ) : (
        <button type="button" className="nl-btn nl-btn--secondary nl-btn--sm" disabled={busy} onClick={() => pickPaper(p.key, t.type, t.name, p.who)}>
          {busy ? <span className="nl-cmp-spin" aria-hidden /> : <Ico name="upload" size={14} />}
          {busy ? "Uploading…" : "Upload"}
        </button>
      ),
    };
  });

  const certsReady = cert !== null || certError !== null;
  const listReady = certsReady && !reading;
  const list = [...(certError ? [] : certList), ...paperList];
  const onFile = list.filter((r) => r.count === "on").length;
  const toUpload = list.filter((r) => r.count === "upload").length;
  const toRenew = list.filter((r) => r.count === "renew").length;
  const summary = `${onFile} of ${list.length} on file${toUpload ? ` · ${toUpload} to upload` : ""}${toRenew ? ` · ${toRenew} to renew` : ""}${!toUpload && !toRenew && list.length ? " · all done" : ""}`;
  const filerRow = filing ? certList.find((r) => r.certType && certRows.some((c) => c.type === r.certType && (c.type === filing.row || answersType(c, filing.row)))) ?? null : null;

  /* ── The banner ── */
  const done = terms.status === "ready" ? terms.requests.find((r) => r.status === "completed") ?? null : null;
  const doneBy = done ? signerOf(done) : null;
  const who = landlord.name || "The landlord";
  /* A signed copy only on the property record, and none in REX (James, 24 Oct 2026, 16 Mary Rae
     Road): the go-live check does not count it, so the banner must not say Signed. */
  const recordOnly = Boolean(termsHeld?.how.includes("property record")) && !(terms.status === "ready" && terms.docs[0]) && home?.terms.rex === false;
  const tobState: "loading" | "signed" | "record" | "sent" | "unsigned" = termsReading ? "loading" : termsHeld ? (recordOnly ? "record" : "signed") : waiting ? "sent" : "unsigned";
  const signedLine = termsHeld
    ? done && doneBy?.name
      ? `Signed by ${doneBy.name}${done.completedAt ? ` on ${onDay(done.completedAt)}` : ""}.`
      : home?.terms.held && termsHeld.how === home.terms.held.how && home.terms.held.at
        ? `${termsHeld.how} on ${onDay(home.terms.held.at)}.`
        : `${termsHeld.how}.`
    : "";
  const waitingTo = chaseTo?.name || landlord.name || "the landlord";
  const unfacts = facts ? Number(!facts.gas) + Number(!facts.electrical) : 0;

  const filer = filing ? (
    <div className="nl-cmp-filer">
      <p className="nl-strong">
        {filing.file.name}
        {filing.replaces ? <span className="nl-meta"> · replaces {filing.replaces.name} once this one is kept</span> : null}
      </p>
      {filing.busy && !filing.read && !filing.note ? (
        <p className="nl-meta nl-cmp-wait">
          <span className="nl-cmp-spin" aria-hidden />
          Reading the document…
        </p>
      ) : (
        <>
          {filing.read && (
            <p className="nl-meta">
              Reads as {readsAsEic(filing.read) ? "an EIC" : CERT_KIND_LABEL[READER_TYPE[filing.read.type] ?? filing.read.type] ?? filing.read.type}
              {filing.read.expiry ? `, expires ${ymd(filing.read.expiry)}${filing.read.expiryDerived ? " (worked out from the issue date)" : ""}` : ", no expiry printed"}
              {filing.read.address ? `. Address on it: ${filing.read.address}` : ""}.
            </p>
          )}
          <div className="nl-cmp-filer-grid">
            <label className="nl-field">
              <span>Type</span>
              <select className="nl-cmp-select" value={filing.type} onChange={(e) => setFiling((p) => (p ? { ...p, type: e.target.value, expiry: e.target.value === EIC && p.issue ? capEic(p.issue, p.expiry) : p.expiry } : p))}>
                <option value="">Choose…</option>
                {CERT_CHOICES.map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className="nl-field">
              <span>{kindFilesOnIssueDate(filing.type) ? "Expires (optional)" : "Expires"}</span>
              <input type="date" value={filing.expiry} onChange={(e) => setFiling((p) => (p ? { ...p, expiry: e.target.value } : p))} />
            </label>
            <label className="nl-field">
              <span>Issued</span>
              <input type="date" value={filing.issue} onChange={(e) => setFiling((p) => (p ? { ...p, issue: e.target.value, expiry: p.type === EIC && e.target.value ? capEic(e.target.value, p.expiry) : p.expiry } : p))} />
            </label>
            {noExpiryNote(filing.type, filing.issue, filing.expiry, ymd) && <p className="nl-meta nl-cmp-span">{noExpiryNote(filing.type, filing.issue, filing.expiry, ymd)}</p>}
            {filing.type === EIC && (
              <label className="nl-field nl-cmp-span">
                <span>Why an EIC</span>
                <select className="nl-cmp-select" value={filing.eicReason} onChange={(e) => setFiling((p) => (p ? { ...p, eicReason: e.target.value as EicReason } : p))}>
                  <option value="">Choose…</option>
                  {CHOICES.eicReason.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
                <small>
                  An EIC counts in place of an EICR for 5 years from the day it was issued{filing.issue && eicExpiry(filing.issue) ? `, so it runs to ${ymd(eicExpiry(filing.issue))}` : ""}.
                </small>
              </label>
            )}
            <label className="nl-field nl-cmp-span">
              <span>How it got here</span>
              <select className="nl-cmp-select" value={filing.how} onChange={(e) => setFiling((p) => (p ? { ...p, how: e.target.value } : p))}>
                {HOW.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {filing.note && <p className="nl-meta nl-cmp-err">{filing.note}</p>}
          <div className="nl-cmp-filer-acts">
            <button type="button" className="nl-btn nl-btn--primary nl-btn--sm" disabled={filing.busy || Boolean(filingNotReady(filing))} onClick={() => void fileCert()}>
              {filing.busy ? "Filing…" : "File it"}
            </button>
            <button type="button" className="nl-btn nl-btn--quiet nl-btn--sm" disabled={filing.busy} onClick={() => setFiling(null)}>
              Cancel
            </button>
          </div>
          {!filing.busy && filingNotReady(filing) && <p className="nl-meta">{filingNotReady(filing)}</p>}
        </>
      )}
    </div>
  ) : null;

  return (
    <div className="nl-cmp">
      <input ref={certInput} type="file" accept={ACCEPT_EVIDENCE} hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void startCert(f, certFor.current.type, certFor.current.replaces); }} />
      <input ref={paperInput} type="file" accept={DOC_ACCEPT} hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void paperChosen(f); }} />

      {(introOnly || letOnly) && (
        <p className="nl-cmp-note">
          <Ico name="lock" size={15} />
          <span>
            {introOnly
              ? "Marketing only, so the certificates are the landlord's and nothing here is chased. The advert still needs the EPC rating, and the Terms of Business still need signing before it goes live."
              : "Let only, so keeping the certificates in date is the landlord's job, not ours, and none of them stops the let moving on. Ask the landlord for copies: the PLC check needs them before the tenancy starts."}
          </span>
        </p>
      )}

      {/* ── The Terms of Business, one banner ── */}
      {tobState === "unsigned" ? (
        <TermsPanel
          listingId={listingId}
          propertyId={propertyId}
          propertyAddress={address}
          landlords={landlords}
          agentLarn={agentLarn}
          serviceOnRecord={service}
          scottish={home ? home.scotland : null}
          onChanged={terms.reload}
          more={<Menu label="More about the terms" items={[{ label: "Upload a signed copy", sub: "Signed on paper or by email", onClick: () => pickPaper("terms", "terms_of_business", "") }]} />}
        />
      ) : (
      <section className={`nl-cmp-tob${tobState === "signed" ? " is-signed" : tobState === "loading" ? " is-loading" : ""}`} aria-busy={tobState === "loading"}>
        <span className="nl-cmp-tob-ic">{tobState === "signed" ? <Ico name="check" size={18} /> : <DocGlyph size={18} />}</span>
        <div className="nl-cmp-tob-main">
          <h3 className="nl-block-title">Terms of Business</h3>
          <p className="nl-meta">
            {tobState === "loading" ? (
              <span className="nl-cmp-wait">
                <span className="nl-cmp-spin" aria-hidden />
                Looking at what is already on the system…
              </span>
            ) : tobState === "record" ? (
              <>
                A signed copy is on the property record, but it isn&apos;t filed in the listings system, so the home can&apos;t go live on it. Reissue new terms for {who === "The landlord" ? "the landlord" : who} to sign, or ask the office to file this copy.{" "}
                {termsHeld?.url ? (
                  <a href={termsHeld.url} target="_blank" rel="noopener noreferrer" className="nl-cmp-file">
                    See the copy
                  </a>
                ) : null}
              </>
            ) : tobState === "signed" ? (
              <>
                {signedLine}{" "}
                {termsHeld?.url ? (
                  <>
                    <a href={termsHeld.url} target="_blank" rel="noopener noreferrer" className="nl-cmp-file">
                      Copy on file
                    </a>
                    .
                  </>
                ) : termsHeld?.name ? (
                  "Copy on file."
                ) : null}
              </>
            ) : tobState === "sent" && waiting ? (
              <>
                Sent to {waitingTo}
                {waiting.sentAt ? ` on ${onDay(waiting.sentAt)}` : ""}
                {waiting.sentBy ? ` by ${waiting.sentBy}` : ""}. Waiting for their signature.
                {chase.stage === "sent" ? ` Reminder emailed to ${chaseTo?.email}.` : ""}
              </>
            ) : (
              <>{who} hasn&apos;t signed yet. We can&apos;t put the home live until they do.</>
            )}
          </p>
          {chase.note && <p className="nl-meta nl-cmp-err">{chase.note}</p>}
        </div>
        <div className="nl-cmp-tob-act">
          {tobState === "record" ? (
            <>
              <Badge tone="warning">Not filed</Badge>
              <button type="button" className="nl-btn nl-btn--primary nl-btn--sm" onClick={() => setReissue((n) => n + 1)}>
                Reissue on New Terms
              </button>
            </>
          ) : tobState === "signed" ? (
            <>
              <span className="nl-cmp-signed">
                <Ico name="check" size={14} />
                Signed
              </span>
              <button type="button" className="nl-btn nl-btn--secondary nl-btn--sm" onClick={() => setReissue((n) => n + 1)}>
                Reissue on New Terms
              </button>
            </>
          ) : tobState === "sent" ? (
            <>
              <Badge tone="info">Waiting to sign</Badge>
              {chase.stage === "confirm" ? (
                <>
                  <button type="button" className="nl-btn nl-btn--secondary nl-btn--sm" onClick={() => void remind()}>
                    Email {chaseTo?.email}
                  </button>
                  <button type="button" className="nl-btn nl-btn--quiet nl-btn--sm" onClick={() => setChase({ stage: "idle", note: null })}>
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="nl-btn nl-btn--quiet nl-btn--sm"
                  disabled={!chaseTo?.email || chase.stage === "going" || chase.stage === "sent"}
                  title={!chaseTo?.email ? "No email address for the signer on the request" : undefined}
                  onClick={() => setChase({ stage: "confirm", note: null })}
                >
                  {chase.stage === "going" ? "Sending…" : chase.stage === "sent" ? "Reminder sent" : "Send a reminder"}
                </button>
              )}
              <Menu
                label="More about the terms"
                items={[
                  { label: "Reissue on New Terms", onClick: () => setReissue((n) => n + 1) },
                  { label: "Upload a signed copy", sub: "Signed on paper or by email", onClick: () => pickPaper("terms", "terms_of_business", "") },
                ]}
              />
            </>
          ) : null}
        </div>
      </section>
      )}
      {/* Signed through the OS: the contract and what the landlord gave with it, a tab each
          (James, 11 Nov 2026). Draws nothing for terms held only as a filed copy. */}
      {(tobState === "signed" || tobState === "record") && <SignedTermsTabs listingId={listingId} propertyId={propertyId} />}
      {/* A new set going out over signed (or waiting) terms: the same send screen, and its
          progress under the banner until it is signed. Draws nothing until then. */}
      {tobState !== "unsigned" && tobState !== "loading" && (
        <TermsPanel
          quiet
          openNew={reissue}
          listingId={listingId}
          propertyId={propertyId}
          propertyAddress={address}
          landlords={landlords}
          agentLarn={agentLarn}
          serviceOnRecord={service}
          scottish={home ? home.scotland : null}
          onChanged={terms.reload}
        />
      )}

      {/* ── Everything the home has to hold, one list ── */}
      <section className="nl-cmp-docs">
        <div className="nl-cmp-bar">
          <div>
            <h3 className="nl-block-title">Compliance Documents</h3>
            <span className="nl-meta">{listReady ? (certError ? `${onFile} of ${list.length} landlord papers on file` : summary) : "Reading what is on file…"}</span>
          </div>
          {listReady && !certError && list.length > 0 && <span className="nl-cmp-ring" style={{ "--p": onFile / list.length } as React.CSSProperties} aria-label={`${onFile} of ${list.length} on file`} role="img" />}
        </div>

        {!listReady ? (
          <p className="nl-meta nl-cmp-wait nl-cmp-loading">
            <span className="nl-cmp-spin" aria-hidden />
            Looking at what is already on the system…
          </p>
        ) : (
          <ul className="nl-cmp-list">
            {certError && (
              <li>
                <div className="nl-cmp-row">
                  <span className="nl-cmp-ic is-warn">
                    <AlertGlyph />
                  </span>
                  <div className="nl-cmp-main">
                    <span className="nl-strong">Certificates</span>
                    <span className="nl-meta nl-cmp-err">{certError}</span>
                  </div>
                  <span />
                  <div className="nl-cmp-act">
                    <button type="button" className="nl-btn nl-btn--quiet nl-btn--sm" onClick={() => { setCertError(null); setCert(null); loadCerts(); }}>
                      Try again
                    </button>
                  </div>
                </div>
              </li>
            )}
            {/* Two groups, the landlord's papers and the home's certificates
                (James, 8 Nov 2026: "split the documents ... so it's less all
                over the place"). */}
            {([
              ["The Landlord", paperList],
              ["The Property", certError ? [] : certList],
            ] as const).flatMap(([head, rowsIn]) => rowsIn.length ? [
              <li key={`head-${head}`} className="nl-cmp-group">
                <span>{head}</span>
                <small>{rowsIn.filter((r) => r.count === "on").length} of {rowsIn.length} on file</small>
              </li>,
              ...rowsIn.map((r) => (
              <li key={r.key}>
                <div className="nl-cmp-row">
                  <span className={`nl-cmp-ic${r.icon === "ok" ? " is-ok" : r.icon === "warn" ? " is-warn" : ""}`}>
                    {r.icon === "ok" ? <Ico name="check" size={14} /> : r.icon === "warn" ? <AlertGlyph /> : <DocGlyph />}
                  </span>
                  <div className="nl-cmp-main">
                    <span className="nl-strong">{r.name}</span>
                    <span className="nl-meta" title={r.subTitle}>
                      {r.sub}
                    </span>
                  </div>
                  <Badge tone={r.status.tone} bare title={r.status.title}>
                    {r.status.label}
                  </Badge>
                  <div className="nl-cmp-act">{r.action}</div>
                </div>
                {r.below}
                {filerRow?.key === r.key && filer}
              </li>
            ))] : [])}
          </ul>
        )}
        {filing && !filerRow && filer}

        {went && (
          <p className="nl-cmp-said">
            <span>{went}</span>
            <button type="button" className="nl-link" onClick={() => setWent(null)}>
              Hide
            </button>
          </p>
        )}
        {said && (
          <p className={`nl-cmp-said${said.ok ? "" : " nl-cmp-err"}`} aria-live="polite">
            <span>{said.text}</span>
            <button type="button" className="nl-link" onClick={() => setSaid(null)}>
              Hide
            </button>
          </p>
        )}

        {/* ── One drop space: several at once ── */}
        <label
          className={`nl-cmp-drop${over ? " is-over" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            take(e.dataTransfer.files);
          }}
        >
          <input type="file" multiple accept={DOC_ACCEPT} aria-label="Upload several documents" onChange={(e) => { take(e.target.files); e.target.value = ""; }} />
          <span className="nl-cmp-drop-ic">
            <Ico name="upload" size={18} />
          </span>
          <span>
            <b>{over ? "Let go to add them" : "Drop documents here"}</b> or choose them. Say what each one is and it goes in the right row.
          </span>
        </label>
        {queue[0] && (
          <div className="nl-cmp-queue">
            <UploadForm
              key={`${queue[0].name}-${queue.length}`}
              sides={["landlord", "home"]}
              initialFile={queue[0]}
              waiting={Math.max(0, queue.length - 1)}
              onUpload={async (file, type, nm) => {
                const asCert = DOC_TO_CERT[type];
                const err = asCert ? null : await putDoc(file, type, nm);
                if (err) return err;
                setQueue((q) => q.slice(1));
                /* A certificate goes through the reader and its dates, into its row. */
                if (asCert) void startCert(file, asCert, null);
                return null;
              }}
              onCancel={() => setQueue([])}
            />
          </div>
        )}

        {/* ── A quiet line: the questions, every document, the full record ── */}
        <div className="nl-cmp-more">
          {homeKey && (
            <button type="button" className="nl-link" aria-expanded={open === "facts"} onClick={() => toggle("facts")}>
              {facts && unfacts > 0 ? `Answer ${unfacts === 2 ? "two questions" : "a question"} about this home` : "About this home: gas and electrics"}
            </button>
          )}
          <button type="button" className="nl-link" aria-expanded={open === "docs"} onClick={() => toggle("docs")}>
            Every document on file{docs && papers ? ` (${docs.length + papers.files.length})` : ""}
          </button>
          <button type="button" className="nl-link" aria-expanded={open === "record"} onClick={() => toggle("record")}>
            Full certificate record
          </button>
        </div>

        {open === "facts" && homeKey && (
          <div className="nl-cmp-sub">
            <HomeFacts
              homeKey={homeKey}
              show={["gasSupply", "hotWater", "electrical"]}
              heating={home?.heating ?? null}
              onChanged={() => {
                onHomeChanged?.();
                loadCerts();
                loadFacts();
              }}
            />
          </div>
        )}

        {/* Stays mounted, folded away: it tells the list which landlord papers are held. */}
        <div id="listing-docs" className="nl-cmp-fold" hidden={open !== "docs"}>
          <FileDocuments
            key={docsKey}
            address={address}
            propertyId={propertyId}
            from={{ kind: "listing", id: listingId }}
            sides={["landlord", "home"]}
            showMissing={false}
            onDocs={setDocs}
            intro="Anything else for this home. Pick Other for a document that isn't on the list and name it. Uploading sends nothing to anybody."
          />
          {papers && papers.files.length > 0 && (
            <div className="nl-cmp-record">
              <p className="nl-meta">From the property record</p>
              <ul className="nl-cmp-list">
                {papers.files.map((p) => (
                  <li key={p.url}>
                    <div className="nl-cmp-row">
                      <span className="nl-cmp-ic">
                        <DocGlyph />
                      </span>
                      <div className="nl-cmp-main">
                        <span className="nl-strong">{p.label}</span>
                        <span className="nl-meta">{p.name}</span>
                      </div>
                      <span />
                      <div className="nl-cmp-act">
                        <a href={p.url} target="_blank" rel="noopener noreferrer" className="nl-btn nl-btn--quiet nl-btn--sm">
                          Open
                        </a>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {open === "record" && (
          <div className="nl-cmp-sub">
            <PropertyFile title="Certificates" propertyId={propertyId} address={propertyId ? null : name} screen="the listing" propertyName={name} required={home?.required} loose={loose} />
          </div>
        )}
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
