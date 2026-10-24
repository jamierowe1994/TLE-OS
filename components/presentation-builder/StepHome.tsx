"use client";

import { useRef, useState } from "react";
import StreetView from "@/components/appraisal/StreetView";
import AddressPicker from "@/components/appraisal/AddressPicker";
import { PROPERTY_TYPES, type PropertyFacts } from "@/lib/agent-property-facts";
import type { MaResearch, MarketListing } from "@/lib/ma-research";
import type { MarketPictureScope } from "@/lib/market-picture";
import { VERBOSE_GROUPS, type MaterialInfo } from "@/lib/matinfo";
import type { PropertyHistoryRow } from "@/app/api/property-history/route";
import { isHmoType } from "@/lib/property-flags";
import { Ic, Loading, money, townOf, type FactKey } from "./shared";

/**
 * 1. THE HOME. What we know, as a plain list with where each fact came from;
 * tap one to change it and it says edited. The type, beds and baths are the
 * appraisal's own record (appraisal-facts, shared with the rest of the OS),
 * the others the draft's. Compliance is what to ask the landlord for, never a
 * list of failures. Beside it the street, and three lines of history.
 */

export const FACT_ROWS: { key: FactKey; label: string; from: string | null; source: string }[] = [
  { key: "type", label: "Property type", from: "Property type", source: "property records" },
  { key: "beds", label: "Bedrooms", from: "Bedrooms", source: "property records" },
  { key: "baths", label: "Bathrooms", from: "Bathrooms", source: "" },
  { key: "size", label: "Floor area", from: "Floor area", source: "the EPC register" },
  { key: "tenure", label: "Tenure", from: "Tenure", source: "Land Registry" },
  { key: "tax", label: "Council tax", from: "Council tax band", source: "the VOA" },
  { key: "furn", label: "Furnished", from: null, source: "" },
  { key: "parking", label: "Parking", from: null, source: "" },
  { key: "outside", label: "Outside space", from: null, source: "" },
];
const SHARED: FactKey[] = ["type", "beds", "baths"];
const FURNISHING = ["Unfurnished", "Part furnished", "Furnished"];

const fieldOf = (m: MaterialInfo | null, label: string) => m?.groups.flatMap((g) => g.fields).find((f) => f.label === label)?.value ?? null;

/** Each fact as it stands: the agent's word over the lookup's. */
export function factValues(m: MaterialInfo | null, pf: PropertyFacts, own: Partial<Record<FactKey, string>>): Record<FactKey, string | null> {
  const out = {} as Record<FactKey, string | null>;
  for (const f of FACT_ROWS) {
    /* withAgentFacts has already laid type, beds and baths over the lookup. */
    out[f.key] = SHARED.includes(f.key) ? (f.from ? fieldOf(m, f.from) : null) : (own[f.key] ?? (f.from ? fieldOf(m, f.from) : null));
  }
  if (pf.baths != null) out.baths = String(pf.baths);
  /* The register gives the band's letter; the list and the deck say "Band B". */
  if (out.tax && /^[a-h]$/i.test(out.tax.trim())) out.tax = `Band ${out.tax.trim().toUpperCase()}`;
  return out;
}

/** The agent's own photo, cut down to something a deck can carry. */
async function shrink(file: File): Promise<string | null> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    for (const [w, q] of [[1600, 0.82], [1280, 0.72], [1024, 0.65]] as const) {
      const scale = Math.min(1, w / img.naturalWidth);
      const c = document.createElement("canvas");
      c.width = Math.round(img.naturalWidth * scale);
      c.height = Math.round(img.naturalHeight * scale);
      c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height);
      const out = c.toDataURL("image/jpeg", q);
      if (out.length < 450_000) return out;
    }
    return null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** One map tile, for when there's no street view (the old builder's tileUrl). */
function tileUrl(lat: number, lon: number, z = 16): string {
  const n = 2 ** z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const r = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n);
  return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/${z}/${y}/${x}`;
}

const STATE: Record<string, string> = {
  leased: "Let by us before",
  current: "On our book now",
  withdrawn: "We listed it, then it was withdrawn",
  archived: "We listed it before",
};
const monthYear = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.valueOf()) ? "" : d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
};

export default function StepHome({
  address,
  postcode,
  d,
  failed,
  onRetry,
  material,
  pf,
  facts,
  ownFacts,
  setFact,
  ignoreLookup,
  match,
  setMatch,
  busy,
  scottish,
  photo,
  ownPhoto,
  setPhoto,
  history,
  live,
  area,
  sc,
}: {
  address: string;
  postcode: string;
  d: MaResearch | null;
  failed: string | null;
  onRetry: () => void;
  material: MaterialInfo | null;
  pf: PropertyFacts;
  facts: Record<FactKey, string | null>;
  ownFacts: Partial<Record<FactKey, string>>;
  setFact: (k: FactKey, v: string) => void;
  ignoreLookup: boolean;
  match: { hsId: number; label: string };
  setMatch: (m: { hsId: number; label: string }) => void;
  busy: boolean;
  scottish: boolean;
  photo: string | null;
  ownPhoto: boolean;
  setPhoto: (p: string | null) => void;
  history: PropertyHistoryRow[] | null | undefined;
  live: MarketListing | null;
  area: string;
  sc: MarketPictureScope | null;
}) {
  const [editing, setEditing] = useState<FactKey | null>(null);
  const [picking, setPicking] = useState(false);
  const [photoProblem, setPhotoProblem] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const known = FACT_ROWS.filter((f) => facts[f.key]).length;
  const edited = (k: FactKey) => (SHARED.includes(k) ? pf[k as "type" | "beds" | "baths"] != null : ownFacts[k] != null);

  function editor(k: FactKey, v: string | null) {
    const done = (val: string) => {
      setEditing(null);
      if ((val || "") !== (v || "")) setFact(k, val);
    };
    const keys = (e: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>) => {
      if (e.key === "Enter") (e.target as HTMLElement).blur();
      if (e.key === "Escape") setEditing(null);
    };
    if (k === "type" || k === "furn") {
      const opts = k === "type" ? PROPERTY_TYPES : FURNISHING;
      return (
        <select autoFocus defaultValue={v ?? ""} onChange={(e) => done(e.target.value)} onBlur={(e) => done(e.target.value)} onKeyDown={keys} aria-label={k === "type" ? "Property type" : "Furnished"}>
          <option value="" />
          {v && !opts.includes(v) && <option>{v}</option>}
          {opts.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      );
    }
    return (
      <input
        autoFocus
        defaultValue={v ?? ""}
        inputMode={k === "beds" || k === "baths" ? "numeric" : undefined}
        onBlur={(e) => done(e.target.value)}
        onKeyDown={keys}
        aria-label={FACT_ROWS.find((f) => f.key === k)?.label}
      />
    );
  }

  /* The rest of what's recorded, for the agent: not the deck's headline facts, not the long prose groups. */
  const used = new Set(FACT_ROWS.map((f) => f.from).concat(["EPC rating", "EPC potential", "EPC assessed"]));
  const more = (ignoreLookup ? [] : material?.groups ?? [])
    .filter((g) => !VERBOSE_GROUPS.includes(g.id) && g.id !== "planning")
    .flatMap((g) => g.fields)
    .filter((f) => !used.has(f.label));
  const sold = material?.valuation?.lastSold
    ? `${money(material.valuation.lastSold)}${material.valuation.lastSoldDate ? ` in ${new Date(material.valuation.lastSoldDate).getFullYear()}` : ""}`
    : null;

  /* Compliance as what to ask for. The EPC is the one thing a register tells us. */
  const c = material?.compliance;
  const rating = (c?.epcRating ?? "").trim().toUpperCase();
  const assessed = c?.epcAssessedOn ? new Date(c.epcAssessedOn) : null;
  const expires = assessed && !Number.isNaN(assessed.valueOf()) ? new Date(assessed.getFullYear() + 10, assessed.getMonth(), assessed.getDate()) : null;
  const days = expires ? Math.round((expires.valueOf() - Date.now()) / 86_400_000) : null;
  const epcRow: [string, string, string] =
    !rating && !expires
      ? ["EPC", ignoreLookup || !material ? "Ask the landlord" : "Not on the register", "warn"]
      : rating === "F" || rating === "G"
        ? [`EPC, rated ${rating}`, "Needs work before it can be let", "warn"]
        : days != null && days < 0
          ? [`EPC${rating ? `, rated ${rating}` : ""}`, "Out of date, ask for a new one", "warn"]
          : days != null && days < 180
            ? [`EPC${rating ? `, rated ${rating}` : ""}`, `Renew by ${monthYear(expires!.toISOString())}`, "warn"]
            : [`EPC${rating ? `, rated ${rating}` : ""}`, expires ? `Valid to ${monthYear(expires.toISOString())}` : "On the register", "ok"];
  const cpl: [string, string, string][] = [
    epcRow,
    ["Gas safety (CP12)", "Ask the landlord", ""],
    ["Electrical (EICR)", "Ask the landlord", ""],
    ["Smoke and CO alarms", "Check at the visit", ""],
    ["Licensing", isHmoType(facts.type) ? "Ask for the HMO licence" : "Check the council's register", ""],
    [scottish ? "Deposit and tenancy paperwork" : "Deposit, Right to Rent, How to Rent", "We handle at move-in", "ok"],
  ];

  /* Three lines of history: advertised now, through our hands, and the place. */
  const ours = history ?? [];
  const last = ours[0];
  const town = townOf(address, postcode);
  const typed = sc ? sc.houses + sc.flats : 0;
  const story: React.ReactNode[] = [];
  if (live)
    story.push(
      <>
        <b>Advertised right now</b> at {live.rent != null ? `${money(live.rent)} pcm` : "a rent not given"}
        {live.agent ? ` with ${live.agent}` : ""}
        {live.daysListed != null ? `, up ${live.daysListed} days` : ""}.
      </>
    );
  if (history === undefined) story.push(<Loading say="Checking our own book" />);
  else if (history === null) story.push(<><b>Our own history couldn&apos;t be checked.</b> Our records didn&apos;t answer.</>);
  else if (last)
    story.push(
      <>
        <b>{STATE[last.state ?? ""] ?? "On our book before"}.</b> {last.rentMonthly != null ? `At ${money(last.rentMonthly)} pcm` : "No rent recorded"}
        {last.publishedAt ? `, listed ${monthYear(last.publishedAt)}` : ""}.
      </>
    );
  else
    story.push(
      <>
        <b>New to us.</b> Not on our books before{live ? "" : ", and nobody is advertising it today"}.
      </>
    );
  story.push(
    <>
      <b>
        {area}
        {town ? `, ${town}` : ""}.
      </b>{" "}
      {sc && typed
        ? `${sc.advertised} homes advertised here now, ${sc.flats >= sc.houses * 2 ? "most of them flats" : sc.houses >= sc.flats * 2 ? "most of them houses" : "a mix of flats and houses"}.`
        : sc
          ? `${sc.advertised} homes advertised here now.`
          : ""}
    </>
  );

  return (
    <div className="pane">
      {failed && !d && (
        <p className="note bad">
          {failed} <button type="button" className="btn link" onClick={onRetry}>Try again</button>
        </p>
      )}
      {d?.addressWarning && !d.subject?.picked && (
        <p className="note">
          {d.addressWarning.replace(/ — (\w)/g, (_, c: string) => `. ${c.toUpperCase()}`)}{" "}
          <button type="button" className="btn link" onClick={() => setPicking((p) => !p)}>
            {picking ? "Close" : "Find it by hand"}
          </button>
        </p>
      )}
      {d?.subject?.picked && !picking && (
        <p className="note">
          Matched by hand to {match.label || d.subject.label}.{" "}
          <button type="button" className="btn link" onClick={() => setPicking(true)}>
            Change it
          </button>
        </p>
      )}
      {picking && (
        <div className="pick-box">
          <AddressPicker
            postcode={postcode}
            asked={address}
            busy={busy}
            onPick={(a) => {
              setPicking(false);
              setMatch(a);
            }}
            onCancel={() => setPicking(false)}
          />
        </div>
      )}

      <div className="home">
        <div>
          <div className="sec-h">
            <h2 className="t">What we know</h2>
            <span>{d || failed ? `${known} of ${FACT_ROWS.length} found · tap to change` : ""}</span>
          </div>
          {!d && !failed ? (
            <p className="lede">
              <Loading say="Reading what's recorded about the home" />
            </p>
          ) : (
            <dl className="flist">
              {FACT_ROWS.map((f) => {
                const v = facts[f.key];
                const miss = !v;
                const ed = edited(f.key);
                return (
                  <div
                    key={f.key}
                    className={`fr${miss ? " miss" : ""}`}
                    onClick={() => editing !== f.key && setEditing(f.key)}
                    title={ed ? "Changed by you" : v && f.source ? `From ${f.source}` : ""}
                  >
                    <dt>{f.label}</dt>
                    <dd>
                      {editing === f.key ? (
                        editor(f.key, v)
                      ) : miss ? (
                        <button type="button" className="addl">Add</button>
                      ) : (
                        <button type="button" className="val">
                          {v}
                          {ed && <span className="by">edited</span>}
                        </button>
                      )}
                    </dd>
                  </div>
                );
              })}
            </dl>
          )}
          {(more.length > 0 || sold) && (
            <details className="more">
              <summary>More about it</summary>
              <dl className="flist">
                {more.map((f) => (
                  <div className="fr static" key={f.label}>
                    <dt>{f.label}</dt>
                    <dd>{f.value}</dd>
                  </div>
                ))}
                {sold && (
                  <div className="fr static">
                    <dt>Last sold</dt>
                    <dd>{sold}</dd>
                  </div>
                )}
              </dl>
            </details>
          )}

          <div className="sec-h" style={{ marginTop: 36 }}>
            <h2 className="t">Compliance</h2>
            <span>What to ask the landlord for</span>
          </div>
          <dl className="flist">
            {cpl.map((r) => (
              <div className="fr static" key={r[0]}>
                <dt>{r[0]}</dt>
                <dd className={`cst ${r[2]}`}>{r[1]}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div>
          <div className="ph">
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photo} alt={`${address.split(",")[0]}`} />
            ) : d?.subjectPoint ? (
              <div className="sv-wrap">
                <StreetView
                  point={d.subjectPoint}
                  fallback={
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={tileUrl(d.subjectPoint.lat, d.subjectPoint.lon)} alt="" onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")} />
                  }
                />
              </div>
            ) : (
              <div className="ph-none">
                <Ic k="home" />
                {d ? "No street view for this address" : ""}
              </div>
            )}
            <span className="pill tag">{ownPhoto ? "Your photo" : photo ? "From its listing" : "From the street"}</span>
            <span className="swap">
              {ownPhoto && (
                <button type="button" className="btn sm" onClick={() => setPhoto(null)}>
                  Remove
                </button>
              )}
              <button type="button" className="btn sm" onClick={() => file.current?.click()}>
                <Ic k="upload" />
                {ownPhoto ? "Change photo" : "Use your own photo"}
              </button>
            </span>
            <input
              ref={file}
              type="file"
              accept="image/*"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                setPhotoProblem(null);
                const out = await shrink(f);
                if (out) setPhoto(out);
                else setPhotoProblem("That photo couldn't be read. Try a JPEG or a PNG.");
              }}
            />
          </div>
          {photoProblem && <p className="note bad">{photoProblem}</p>}
          <ul className="story2">
            {story.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
