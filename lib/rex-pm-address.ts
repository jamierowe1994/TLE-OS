/**
 * REX PM's addresses, into a shape REX's fields can take (19 Sep 2026: 25 of
 * the 107 homes to create would have gone in as "street: / 11 Station Road").
 * Scottish flat positions (1/2, 3f2), "Flat 0/1/7 Mary Street", "1 / 11
 * Station Road", "South Bridge 44 (3f1)", a street written twice. The result
 * reads "Flat X, N Street, Town, POSTCODE" for splitAddress (lib/rex-instruct).
 * Tested on all 107 before any home was created.
 */
/* eslint-disable */
export function tidyAddress(raw: string): string {const out=tidy(raw).split(",").map((x: string)=>x.trim()).filter(Boolean);return out.filter((x: string,i: number)=>out.findIndex((y: string)=>y.toLowerCase()===x.toLowerCase())===i).join(", ")}
function tidy(raw: string): string {
  let parts: string[]=raw.replace(/\bRooom\b/gi,"Room").split(",").map((s: string)=>s.replace(/^\s*\/\s*/,"").replace(/\s+/g," ").trim()).filter(Boolean);
  parts=parts.filter((p: string,i: number)=>parts.indexOf(p)===i);
  let first=parts[0]??"";let m: RegExpMatchArray | null;
  const up=(x: string)=>x.toUpperCase();
  const street=(s: string)=>s.trim();
  // "Flat 0/1" then "7 Mary Street" as the next part
  if((m=first.match(/^(flat|room|apartment|apt|unit|studio)\s+([\w\/]+)$/i))&&parts[1]&&/^\d/.test(parts[1])){parts=[`${cap(m[1])} ${m[2]}`,...parts.slice(1)];return parts.join(", ")}
  // "Flat 1/1/7 Mill Street", "Room 5/102 Tarnock Avenue", "Flat 2/32 Connaught Road"
  if((m=first.match(/^(flat|room|apartment|apt|unit|studio)\s*([\w]+(?:\/[\w]+)*)\/(\d+[a-z]?)\s+(.+)$/i)))return [`${cap(m[1])} ${m[2]}`,`${m[3]} ${street(m[4])}`,...parts.slice(1)].join(", ");
  // "9 Wilson Court/15 Wilson Street": flat 9 in Wilson Court, at 15 Wilson Street
  if((m=first.match(/^(\d+[a-z]?)\s+([a-z][a-z .'-]*?\b(?:court|house|mansions|lodge|building|buildings|place))\s*\/\s*(\d+[a-z]?)\s+(.+)$/i)))return [`Flat ${m[1]}`,m[2],`${m[3]} ${street(m[4])}`,...parts.slice(1)].join(", ");
  // "Upper Grove Place 17/7": Edinburgh, street then number/flat, no floor code
  if((m=first.match(/^([a-z][a-z .'-]+?)\s+(\d+[a-z]?)\/(\w+)$/i)))return [`Flat ${m[3]}`,`${m[2]} ${street(m[1])}`,...parts.slice(1)].join(", ");
  // "Ruskin Place 6": the number after the street
  if((m=first.match(/^([a-z][a-z .'-]+?)\s+(\d+[a-z]?)$/i)))return [`${m[2]} ${street(m[1])}`,...parts.slice(1)].join(", ");
  // "1 / 11 Station Road"
  if((m=first.match(/^(\w+)\s+\/\s+(\d+[a-z]?)\s+(.+)$/i)))return [`Flat ${m[1]}`,`${m[2]} ${street(m[3])}`,...parts.slice(1)].join(", ");
  // "1/2 12 Low Waters Road" (Scottish position then number)
  if((m=first.match(/^(\d+\/\d+)\s+(\d+[a-z]?)\s+(.+)$/i)))return [`Flat ${m[1]}`,`${m[2]} ${street(m[3])}`,...parts.slice(1)].join(", ");
  // "97/2 Inverleith Row" (Edinburgh: number 97, flat 2)
  if((m=first.match(/^(\d+[a-z]?)\/(\w+)\s+(.+)$/i)))return [`Flat ${m[2]}`,`${m[1]} ${street(m[3])}`,...parts.slice(1)].join(", ");
  // "1 (3f2) Wheatfield Terrace"
  if((m=first.match(/^(\d+[a-z]?)\s*\((\w+)\)\s+(.+)$/i)))return [`Flat ${up(m[2])}`,`${m[1]} ${street(m[3])}`,...parts.slice(1)].join(", ");
  // "South Bridge 44 (3f1)", "Grindlay Street 10 (1f)", "Argyle Place 42/6 (3f2)"
  if((m=first.match(/^([a-z][a-z .'-]+?)\s+(\d+[a-z]?)(?:\/(\w+))?\s*\((\w+)\)$/i)))return [`Flat ${m[3]?`${m[3]} `:""}${up(m[4])}`.replace(/\s+$/,""),`${m[2]} ${street(m[1])}`,...parts.slice(1)].join(", ");
  // "G/R, 140 Main Street"
  if(/^[a-z]\/[a-z]$/i.test(first)&&parts[1]&&/^\d/.test(parts[1]))return [`Flat ${up(first)}`,...parts.slice(1)].join(", ");
  // "Craigleith Hill, 18, Edinburgh"
  if(parts[1]&&/^\d+[a-z]?$/i.test(parts[1])&&!/\d/.test(first))return [`${parts[1]} ${first}`,...parts.slice(2)].join(", ");
  return parts.join(", ");
}
function cap(w: string): string {w=w.toLowerCase();return w[0].toUpperCase()+w.slice(1)}
