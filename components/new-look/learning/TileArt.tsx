import type { ReactNode } from "react";
import { drawItem, type Item } from "./TilePrims";

/**
 * A picture of its own for every file in the Learning centre (10 Nov 2026).
 *
 * James: "it would be cool to be able to have custom tiles for each one. The
 * appraisal pack, the appraisal deck, and all of these different ones, I feel
 * like, should have different tiles rather than them all being the same,
 * because otherwise they just blend in together". Every tile used to wear one
 * of three line drawings, picked by what kind of file it was.
 *
 * Now each file has a small poster: one bold shape that says what it is, a
 * second that says what happens to it, on one of six fields from the final
 * palette. The picture is looked up by the file's own id (with the journey in
 * front where two journeys share an id), so a new file with no picture still
 * gets its kind's.
 */

/** The big shape. */
const H = (p: string, s = 1.7, x = 47, y = 55, r = 0, c = "a", d = "k"): Item => [p, x, y, s, r, c, d];
/** A second shape, in the quieter ink unless told otherwise. */
const S = (p: string, x: number, y: number, s: number, r = 0, c = "b", d = "k"): Item => [p, x, y, s, r, c, d];
/** A round badge in the pop colour, carrying a small shape. */
const B = (p: string, r = 0, x = 77, y = 27): Item[] => [
  ["disc", x, y, 0.74, 0, "c"],
  [p, x, y, p.startsWith("txt:") ? 0.6 : 0.4, r, "i", "c"],
];

const TO_LET: Item = ["txt:TO LET", 58.5, 49, 0.27, 0, "k"];
const OFFER: Item[] = [H("tag", 1.9, 50, 55, -12), ["pound", 57, 53, 0.72, -12, "k"]];
const TO_LANDLORD: Item[] = [["tag", 34, 54, 1.35, -10, "a", "k"], ["arrow", 61, 54, 0.45, 0, "c"], S("person", 81, 55, 0.85)];

const MOTIF: Record<string, Item[]> = {
  /* What each kind wears when a file has no picture of its own. */
  "kind:page": [H("phone", 1.8, 50, 54), ["lines", 50, 50, 0.7, 0, "a"]],
  "kind:email": [H("env", 1.9, 50, 56)],
  "kind:process": [H("cog", 1.8, 50, 54)],

  /* Landlord: the screens they see. */
  "pre-pack": [S("doc", 36, 56, 1.55, -12), H("doc", 1.65, 56, 54, 6), ...B("star")],
  "appraisal-deck": [H("slides", 1.85, 48, 54), ...B("pound")],
  "file-valuation": [S("house", 70, 68, 1.05), H("board", 1.9, 42, 54, 0, "a", "c"), ["txt:TO LET", 53.5, 48, 0.27, 0, "i"]],
  "terms-sign": [H("doc", 1.75, 43, 54, -6), ["pen", 71, 62, 1.35, 0, "c", "k"]],
  "file-compliance": [H("shield", 1.9, 50, 54), ["tick", 50, 54, 1, 0, "c"]],
  "file-viewings": [H("eye", 2, 48, 58), ...B("cal")],
  "file-managed": [H("house", 1.75, 45, 54), ["key", 67, 76, 1.1, -20, "c", "a"]],
  passport: [H("passport", 1.8, 46, 54, -6), ...B("tick")],

  /* Landlord: emails. */
  "appraisal-confirm": [H("cal", 1.85, 47, 56), ...B("tick")],
  "appraisal-pre": [S("doc", 50, 38, 1.35, 0, "c", "k"), H("env", 1.9, 50, 63)],
  "appraisal-post": [H("gauge", 2, 48, 58), ...B("pound")],
  "landlord-contract-pack": [S("doc", 30, 57, 1.4, -16), S("doc", 50, 52, 1.5, 0, "c", "k"), H("doc", 1.5, 70, 57, 14)],
  "landlord-terms-request": [H("doc", 1.8, 46, 55), ...B("pen")],
  "landlord-contract-nudge": [H("bell", 1.85, 46, 53, -10), ...B("pen")],
  "landlord-terms-signed": [H("doc", 1.75, 44, 54, -5), ["stamp", 68, 68, 0.95, 0, "c"], ["tick", 68, 68, 0.42, 0, "i"]],
  "landlord-questions-chase": [H("bubble", 2, 50, 54), ["question", 50, 48, 1.15, 0, "c"]],
  "landlord-docs-nudge": [H("tray", 2, 48, 60), ...B("bell")],
  "landlord-message-reply": [S("bubble", 40, 42, 1.4), ["bubbleR", 60, 64, 1.4, 0, "a"], ["lines", 60, 60, 0.75, 0, "k"]],
  "landlord-viewing-booked": [H("house", 1.7, 45, 56), ...B("eye")],
  "landlord-offer": [H("house", 1.6, 42, 54), ["tag", 68, 74, 1.05, -14, "c", "i"]],
  "application-accepted-landlord": [H("rosette", 2, 50, 52, 0, "a", "c"), ["tick", 50, 40, 0.45, 0, "i"]],
  "update-landlord": [S("house", 50, 38, 1.15, 0, "a"), ["track", 50, 74, 1.9, 0, "b", "c"]],
  "works-landlord-report": [H("spanner", 1.9, 46, 56), ...B("drop")],
  "works-landlord-approval": [...OFFER, ...B("tick")],
  "inspection-landlord-report": [H("clip", 1.75, 44, 54), ["mag", 70, 66, 1.15, 0, "c"]],
  "certificate-shared-landlord": [H("paper", 1.8, 46, 54), ["rosette", 46, 56, 0.85, 0, "c", "a"], ...B("shield")],

  /* Landlord: what you do. */
  "book-appraisal": [H("cal", 1.85, 47, 56), ...B("house")],
  "pre-presentation": [S("doc", 72, 62, 1.2, 10), H("slides", 1.75, 43, 50)],
  "build-deck": [S("box", 36, 42, 1.3), S("box", 47, 52, 1.3, 0, "c"), H("box", 1.3, 58, 62), ["lines", 58, 62, 0.85, 0, "k"]],
  "record-and-send": [H("pound", 2.1, 40, 56), ["plane", 72, 34, 1.05, 0, "c", "i"]],
  "send-terms": [H("doc", 1.65, 38, 54), ["arrow", 73, 60, 0.95, 0, "c"]],
  "nudge-to-sign": [H("pen", 1.9, 44, 54), ...B("bell")],
  "take-on": [H("camera", 1.85, 47, 58), ...B("house")],
  "offer-to-landlord": TO_LANDLORD,
  "offers-landlord": TO_LANDLORD,

  /* Tenant: emails. */
  "tenant-enquiry-reply": [H("bubble", 2, 50, 54), ["house", 50, 48, 0.75, 0, "c", "a"]],
  "tenant-matches": [S("house", 23, 60, 0.9), ["house", 50, 53, 1.15, 0, "a", "k"], S("house", 78, 60, 0.9, 0, "c")],
  "tenant-matches-again": [["house", 36, 60, 1.25, 0, "a", "k"], S("house", 67, 64, 1), ...B("plus")],
  "tenant-home-alert": [H("bell", 1.9, 46, 53, 8), ...B("house")],
  "tenant-passport-request": [S("passport", 50, 36, 1.25, 0, "c", "i"), H("env", 1.9, 50, 64)],
  "tenant-passport-nudge-1": [H("passport", 1.8, 46, 54, -6), ...B("txt:1")],
  "tenant-passport-nudge-2": [H("hourglass", 1.8, 46, 54), ...B("txt:2")],
  "tenant-passport-reminder": [S("passport", 37, 54, 1.55, -10), ["clock", 65, 62, 1.2, 0, "a", "k"]],
  "tenant-passport-thanks": [H("stamp", 1.95, 50, 54), ["tick", 50, 54, 0.75, 0, "k"]],
  "tenant-viewing-booked": [H("door", 1.8, 44, 54), ...B("cal")],
  "viewing-moved": [H("cal", 1.75, 42, 56), ["arrow", 74, 62, 0.9, 0, "c"]],
  "viewing-reminder": [H("clock", 1.95, 47, 56), ...B("eye")],
  "viewing-rebook": [H("cal", 1.85, 47, 56), ...B("redo")],
  "viewing-feedback": [H("bubble", 2, 50, 54), ["star", 34, 48, 0.42, 0, "c"], ["star", 50, 48, 0.42, 0, "c"], ["star", 66, 48, 0.42, 0, "c"]],
  "viewing-not-for-them": [S("house", 32, 60, 1.1), ["cross", 32, 63, 0.55, 0, "c"], ["house", 68, 54, 1.25, 0, "a", "k"], ["tick", 68, 48, 0.5, 0, "c"]],
  "tenant-offer-copy": [S("paper", 38, 50, 1.55, -8), H("paper", 1.55, 58, 59, 6), ["pound", 58, 62, 0.8, 6, "c"]],
  "application-its-yours": [H("key", 2.1, 52, 56, -35), ["sparkle", 77, 26, 0.6, 0, "c"], ["sparkle", 22, 32, 0.34, 0, "b"]],
  "listing-let-notice": [H("board", 1.9, 44, 54, 0, "a", "c"), ["txt:LET", 55.5, 48, 0.4, 0, "i"]],

  /* Tenant: what you do. */
  "send-passport": [H("passport", 1.8, 42, 56, -6), ["plane", 73, 32, 1.05, 0, "c", "i"]],
  "automate-passport": [H("passport", 1.8, 42, 54, -6), ["cog", 70, 68, 0.95, 0, "c", "a"]],
  "send-homes": [S("house", 35, 36, 0.85), S("house", 63, 33, 0.95, 0, "c"), H("env", 1.9, 50, 64)],
  "book-viewing": [H("cal", 1.85, 47, 56), ...B("eye")],
  "after-viewing": [H("clip", 1.75, 42, 54), ["arrow", 74, 40, 0.7, -90, "c"], ["arrow", 74, 70, 0.7, 90, "b"]],
  "put-offer": [...OFFER, ...B("arrow", -90)],
  "notify-enquiries": [H("mega", 1.9, 44, 56, -8), ...B("env")],

  /* Agent. */
  "work-lead": [H("phone", 1.85, 44, 54, -6), ...B("person")],
  "add-lead": [H("person", 1.9, 46, 56), ...B("plus")],
  "record-figure": [H("gauge", 2, 48, 54), ["pound", 48, 80, 0.6, 0, "c"]],
  "prepare-send": [S("clip", 36, 56, 1.45, -8), ["plane", 64, 46, 1.5, 0, "a", "k"]],
  "new-listing": [H("board", 1.9, 44, 54), TO_LET, ...B("plus", 0, 80, 80)],
  "edit-advert": [H("box", 1.85, 44, 54), ["house", 44, 44, 0.7, 0, "c", "a"], ["lines", 44, 70, 0.6, 0, "k"], ["pen", 76, 64, 1.15, 0, "b", "k"]],
  "listing-compliance": [S("clip", 37, 54, 1.55, -8), ["shield", 65, 60, 1.2, 0, "a"], ["tick", 65, 60, 0.6, 0, "c"]],
  "go-live": [H("switch", 2.05, 50, 60, 0, "a", "c"), ["sparkle", 76, 26, 0.55, 0, "c"], ["sparkle", 28, 30, 0.32, 0, "b"]],
  "mail-database": [S("env", 42, 38, 1.5, -8), S("env", 50, 52, 1.5, 0, "c", "i"), H("env", 1.5, 58, 66, 8)],
  "move-viewing": [H("cal", 1.75, 42, 56), ["arrow", 75, 40, 0.6, 0, "c"], ["arrow", 75, 58, 0.6, 180, "b"]],
  "agent:viewing-feedback": [H("clip", 1.75, 43, 54), ["pen", 72, 62, 1.25, 0, "c", "k"]],
  "enquiries-passports": [S("passport", 50, 32, 0.95, 0, "c", "i"), H("tray", 2, 50, 68)],
  "customer-updates": [H("phone", 1.85, 40, 54), ["bubble", 70, 40, 1.05, 0, "c"], ["lines", 70, 37, 0.5, 0, "i"]],
  "let-page": [H("box", 1.9, 46, 55), ["lines", 46, 60, 1.25, 0, "k"], ...B("house")],
  "plc-check": [H("doc", 1.75, 42, 54), ["mag", 67, 64, 1.25, 0, "c"]],
  "push-propoly": [S("box", 27, 56, 1), ["arrow", 52, 56, 0.75, 0, "c"], ["box", 78, 56, 1.05, 0, "a"], ["tick", 78, 56, 0.5, 0, "k"]],
  "report-repair": [S("hammer", 44, 55, 1.75), ["spanner", 56, 55, 1.75, 0, "a"]],
  "plan-certificate": [H("paper", 1.65, 40, 52, -6), ["rosette", 40, 53, 0.75, -6, "c", "a"], S("cal", 73, 68, 0.9)],
  "property-visit": [H("clip", 1.75, 44, 54), ["eye", 70, 70, 0.95, 0, "c", "i"]],
  certificates: [H("gauge", 2, 48, 60), ["rosette", 77, 28, 0.75, 0, "c", "i"]],
  "tenant-logins": [H("lock", 1.8, 44, 54), ["key", 70, 74, 1, -25, "c", "a"]],
  "rent-review-notice": [H("paper", 1.75, 44, 55), ["pound", 44, 59, 0.8, 0, "c"], ...B("arrow", -90)],
};

/** The six fields, in the order a folder walks through them. */
export const SCHEMES = 6;
export const schemeOf = (folder: number, file: number) => (((folder + file) % SCHEMES) + SCHEMES) % SCHEMES;

function itemsFor(side: string | undefined, id: string, kind: string): Item[] {
  return MOTIF[`${side}:${id}`] ?? MOTIF[id] ?? MOTIF[`kind:${kind}`] ?? MOTIF["kind:process"];
}

/** Just the shapes, for use inside another drawing (0 0 100 100). */
export function Motif({ side, id, kind }: { side?: string; id: string; kind: string }): ReactNode {
  return <>{itemsFor(side, id, kind).map(drawItem)}</>;
}

/** The picture on its own: the tile, the pop-out's header, the summary card. */
export function TilePicture({ side, id, kind }: { side?: string; id: string; kind: string }) {
  return (
    <svg className="nl-ta-svg" viewBox="0 0 100 100" aria-hidden focusable="false">
      <Motif side={side} id={id} kind={kind} />
    </svg>
  );
}

/** A folder's cover: its first three files as small posters, fanned. */
export function FolderFan({
  side,
  files,
  base,
}: {
  side: string;
  files: { id: string; kind: string }[];
  /** The folder's place among its journey's folders: the posters wear the schemes their tiles do. */
  base: number;
}) {
  const three = files.slice(0, 3);
  /* One file stands alone in the middle; two lean together; three fan out. */
  const spots =
    three.length === 1
      ? [{ x: 100, y: 66, r: -4 }]
      : three.length === 2
        ? [
            { x: 78, y: 70, r: -7 },
            { x: 122, y: 68, r: 6 },
          ]
        : [
            { x: 58, y: 72, r: -9 },
            { x: 100, y: 64, r: 0 },
            { x: 142, y: 72, r: 9 },
          ];
  /* Middle last, so it sits on top. */
  const order = three.length === 3 ? [0, 2, 1] : three.map((_, i) => i);
  return (
    <svg className="nl-ta-fan" viewBox="0 0 200 132" aria-hidden focusable="false">
      {order.map((i) => {
        const f = three[i];
        const s = spots[i];
        return (
          <g key={f.id} transform={`translate(${s.x} ${s.y}) rotate(${s.r})`}>
            <g className={`nl-ta-card is-${i} nl-ta is-s${schemeOf(base, i)}`}>
              <rect x={-27} y={-33} width={60} height={76} className="sh" />
              <rect x={-30} y={-38} width={60} height={76} className="bg" />
              <g transform="translate(-27 -30) scale(0.54)">
                <Motif side={side} id={f.id} kind={f.kind} />
              </g>
              <rect x={-22} y={29} width={20} height={2.4} className="a" opacity={0.55} />
            </g>
          </g>
        );
      })}
    </svg>
  );
}

/** A guide has no id we know in advance: its picture comes from the words in its title. */
const WORDS: [RegExp, string][] = [
  [/deposit|fee|rent|price|cost|money|pay/i, "put-offer"],
  [/gas|safety|electric|eicr|alarm|fire|certificate|complian/i, "file-compliance"],
  [/check ?list|inventory|inspection|visit/i, "inspection-landlord-report"],
  [/viewing/i, "file-viewings"],
  [/key|move|moving/i, "application-its-yours"],
  [/passport|referenc|right to rent|\bid\b/i, "passport"],
  [/repair|maintenance|damp|mould|leak/i, "report-repair"],
  [/contract|terms|agreement|tenancy|sign/i, "terms-sign"],
  [/notice|section|law|legal|renters/i, "plc-check"],
  [/market|advert|listing|photo/i, "new-listing"],
  [/apprais|valuation/i, "appraisal-deck"],
];
const BY_AUDIENCE: Record<string, string> = { you: "let-page", landlords: "file-managed", tenants: "application-its-yours" };

export function guideMotif(title: string, audience: string): string {
  for (const [re, id] of WORDS) if (re.test(title)) return id;
  return BY_AUDIENCE[audience] ?? "let-page";
}

export function seedScheme(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h % SCHEMES;
}
