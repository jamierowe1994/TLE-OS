import { DOC_KINDS, landlordProperties, type DocKind, type LandlordAccount } from "@/lib/landlord-account";
import { loadLandlordHome, requiredDocsFor } from "@/lib/landlord-home-view";
import { DECK_KINDS } from "@/lib/present";

/**
 * The Documents page's view: everything we hold on a landlord's file, and
 * what we still need from them - built once here and read by the live page;
 * the sample in lib/landlord-sample types the same shape by hand.
 *
 *   needed      what the let still needs from them, each with a kind so the
 *               row can take the upload itself
 *   sent        what they have sent us, newest first
 *   fromUs      the terms of business and the presentations
 *   properties  the properties we look after, each with its certificates
 */

export interface DocRow {
  title: string;
  sub: string;
  state: "uploaded" | "missing" | "pending" | "watch";
  /** Where to open it. Null when there is nothing to open yet. */
  href: string | null;
  /** For a row that can take an upload: what the file is. */
  kind?: DocKind;
  /** "Sign", "Open" - the word on the row's button when it is not an upload. */
  cta?: string;
}

export interface DocsProperty {
  name: string;
  locality: string;
  image: string | null;
  headline: string;
  allInDate: boolean;
  certs: DocRow[];
}

export interface DocsView {
  appraisalId: string | null;
  needed: DocRow[];
  sent: DocRow[];
  fromUs: DocRow[];
  properties: DocsProperty[];
  /** Of the documents the let needs, how many are in. */
  progress: { have: number; total: number };
}

const day = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : null;

const kindLabel = (kind: DocKind) => DOC_KINDS.find((k) => k.id === kind)?.label ?? "Document";

/** `pick` is the property chosen on the portal (?p=), so Documents shows the
 *  same one as Home - it used to show the first open appraisal whatever was
 *  picked (19 Sep 2026). */
export async function loadLandlordDocuments(me: LandlordAccount, pick?: string | null): Promise<DocsView> {
  const [{ open, compliance, docs }, managed] = await Promise.all([loadLandlordHome(me, pick), landlordProperties(me)]);
  const j = open[0] ?? null;
  const mine = j ? docs.filter((d) => !d.appraisalId || d.appraisalId === j.appraisal.id) : docs;
  const latest = j?.decks[0] ?? null;
  const epcOnRegister = latest?.deck.property?.epc ?? null;

  /* What the let still needs. Only asked while there is a let being set up:
     a landlord whose properties are all managed has nothing to send. */
  const need = j ? await requiredDocsFor(j.appraisal.id) : [];
  const needed: DocRow[] = j
    ? need.filter((r) => !mine.some((d) => d.kind === r.kind) && !(r.kind === "epc" && epcOnRegister)).map((r) => ({
        title: r.title,
        sub: r.missing,
        state: "missing" as const,
        href: null,
        kind: r.kind,
      }))
    : [];
  const total = need.length;

  const sent: DocRow[] = [
    ...mine.map((d) => ({
      title: d.kind === "other" ? d.name : kindLabel(d.kind),
      sub: `${d.kind === "other" ? "Sent" : d.name}  •  ${day(d.uploadedAt) ?? ""}`,
      state: "uploaded" as const,
      href: `/api/landlord/documents/${d.id}`,
      kind: d.kind,
    })),
    ...(j && epcOnRegister && !mine.some((d) => d.kind === "epc")
      ? [{ title: "Energy Performance Certificate (EPC)", sub: `On the national register  •  rating ${epcOnRegister}`, state: "uploaded" as const, href: null }]
      : []),
  ];

  const fromUs: DocRow[] = [];
  if (j) {
    const signed = j.signed[0] ?? null;
    const post = j.decks.find((d) => d.kind === "post-appraisal") ?? null;
    /* Signed from their home page, where their own session is found. A link
       frozen into the deck was the agent's (17 Sep 2026). */
    void post;
    const signUrl = j.appraisal.termsSentAt ? "/landlord" : null;
    fromUs.push({
      title: "Terms of business",
      sub: signed ? `Signed  •  ${day(signed.signedAt) ?? ""}` : signUrl ? "Ready for you to sign" : "On its way from your agent",
      state: signed ? "uploaded" : "pending",
      href: signed ? `/api/landlord/signed/${signed.submitterId}` : signUrl,
      cta: signed ? "Open" : signUrl ? "Sign" : undefined,
    });
    for (const d of j.decks) {
      fromUs.push({
        title: `${DECK_KINDS.find((k) => k.id === d.kind)?.label ?? "Presentation"} presentation`,
        sub: `From ${d.authorName || j.appraisal.agent || "your agent"}  •  ${day(d.createdAt) ?? ""}`,
        state: "uploaded",
        href: `/present/${d.token}`,
        cta: "Open",
      });
    }
  }

  const properties: DocsProperty[] = managed.map((p) => {
    const comp = compliance.get(p.propertyId ?? "") ?? null;
    return {
      name: p.name,
      locality: p.locality ?? "",
      image: p.image,
      headline: comp ? comp.headline : "Being read from your file",
      allInDate: comp?.allInDate ?? true,
      certs: (comp?.certs ?? []).map((c) => ({
        /* No em dashes in front of a customer. */
        title: c.label.replace(/\s+—\s+/g, " - "),
        sub: c.line,
        state: c.status === "ok" ? "uploaded" : c.status === "watch" || c.status === "urgent" ? "watch" : c.quiet ? "pending" : "missing",
        href: c.href,
        cta: c.href ? "Open" : undefined,
        /* Gas, EICR and EPC can be renewed by the landlord's own engineer; the
           row takes the new certificate once the old one is due. */
        kind: c.status !== "ok" && (c.key === "gas" || c.key === "eicr" || c.key === "epc") ? c.key : undefined,
      })),
    };
  });

  return {
    appraisalId: j?.appraisal.id ?? null,
    needed,
    sent,
    fromUs,
    properties,
    progress: { have: Math.max(0, total - needed.length), total },
  };
}
