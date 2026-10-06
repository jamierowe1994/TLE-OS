import type { ListingDetails } from "@/lib/listing-details";

/**
 * The advert as somebody is editing it, shared by the Marketing tab and the
 * portal preview: change the main photo on the Rightmove preview and the
 * Marketing tab has already moved it, because there is only one draft.
 */
export interface Draft {
  rent: number | null;
  deposit: number | null;
  availableFrom: string | null;
  heading: string;
  body: string;
  highlights: string[];
  imageOrder: string[];
  beds: number | null;
  baths: number | null;
  receptions: number | null;
  councilTaxBand: string | null;
  parking: string | null;
  electricity: string | null;
  water: string | null;
  sewerage: string | null;
  broadband: string | null;
  heating: string | null;
  furnishing: string | null;
  pets: string | null;
  outsideSpace: string | null;
  floorAreaSqft: number | null;
  /** The EPC: the band every advert must carry, and REX's two SAP scores. */
  epcBand: string | null;
  epcCurrent: number | null;
  epcPotential: number | null;
  /** Scottish homes: the agent's Letting Agent Registration Number. */
  agentLarn: string | null;
  /** REX's listing subcategory id - the property type the portals insist on. */
  propertyTypeId: string | null;
  /** Scottish homes: the landlord's registration number. Kept by the OS. */
  landlordRegistration: string | null;
}

export type FactField = "councilTaxBand" | "parking" | "electricity" | "water" | "sewerage" | "broadband" | "heating" | "furnishing" | "pets" | "outsideSpace";

export const draftFrom = (d: ListingDetails): Draft => ({
  rent: d.rent,
  deposit: d.deposit,
  availableFrom: d.availableFrom,
  heading: d.heading,
  body: d.body,
  highlights: d.highlights,
  imageOrder: d.images.map((i) => i.id),
  beds: d.beds,
  baths: d.baths,
  receptions: d.receptions,
  councilTaxBand: d.facts.councilTaxBand,
  parking: d.facts.parking,
  electricity: d.facts.electricity,
  water: d.facts.water,
  sewerage: d.facts.sewerage,
  broadband: d.facts.broadband,
  heating: d.facts.heating,
  furnishing: d.facts.furnishing,
  pets: d.facts.pets,
  outsideSpace: d.facts.outsideSpace,
  floorAreaSqft: d.facts.floorAreaSqft,
  /* REX's EPC first; where REX has none, the OS's property record (the
     Scottish register, the clean sweep) so the box is never blank when the
     band is known somewhere. */
  epcBand: d.epc.band ?? d.record?.epc?.band ?? null,
  epcCurrent: d.epc.current ?? d.record?.epc?.score ?? null,
  epcPotential: d.epc.potential,
  landlordRegistration: d.record?.landlordRegistration ?? null,
  propertyTypeId: d.propertyTypeId ?? null,
  agentLarn: d.agentLarn ?? null,
});

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Only what differs from REX, which is exactly what the save sends. */
export function changesIn(d: ListingDetails, draft: Draft): Partial<Draft> {
  const base = draftFrom(d);
  const out: Partial<Draft> = {};
  for (const k of Object.keys(draft) as (keyof Draft)[]) {
    const mine = k === "highlights" ? draft.highlights.map((h) => h.trim()).filter(Boolean) : draft[k];
    if (!same(mine, base[k])) (out as Record<string, unknown>)[k] = mine;
  }
  return out;
}

export const CHANGE_WORDS: Record<keyof Draft, string> = {
  rent: "rent",
  deposit: "deposit",
  availableFrom: "available date",
  heading: "headline",
  body: "description",
  highlights: "key features",
  imageOrder: "photo order",
  beds: "bedrooms",
  baths: "bathrooms",
  receptions: "receptions",
  councilTaxBand: "council tax",
  parking: "parking",
  electricity: "electricity",
  water: "water",
  sewerage: "sewerage",
  broadband: "broadband",
  heating: "heating",
  furnishing: "furnishing",
  pets: "pets",
  outsideSpace: "outside space",
  floorAreaSqft: "floor area",
  epcBand: "EPC rating",
  epcCurrent: "EPC score",
  epcPotential: "EPC potential score",
  landlordRegistration: "landlord registration number",
  propertyTypeId: "property type",
  agentLarn: "letting agent registration number",
};

export const money = (n: number | null | undefined) => (n == null ? null : `£${n.toLocaleString("en-GB")}`);

/** A month's rent as a week, the way the portals print it beside the pcm. */
export const perWeek = (pcm: number | null) => (pcm == null ? null : Math.round((pcm * 12) / 52));

/** Five weeks' rent, the cap on a tenancy deposit under 50k a year (Tenant Fees Act). */
export const fiveWeeks = (pcm: number | null) => (pcm == null ? null : Math.floor(((pcm * 12) / 52) * 5));

export function longDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00`);
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : null;
}

export function orderedImages(d: ListingDetails, draft: Draft) {
  const byId = new Map(d.images.map((i) => [i.id, i]));
  const ordered = draft.imageOrder.map((id) => byId.get(id)).filter((i): i is ListingDetails["images"][number] => Boolean(i));
  /* Anything REX has that the draft has not heard of yet goes on the end. */
  for (const i of d.images) if (!draft.imageOrder.includes(i.id)) ordered.push(i);
  return ordered;
}
