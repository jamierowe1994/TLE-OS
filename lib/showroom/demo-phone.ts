/**
 * THE PHONE, ON A SAMPLE DAY - the agent phone view (app/m) for the launch
 * tour's "On a Viewing" (James, 11 Oct 2026: every guide a live run on the
 * real screens, ringing what to press).
 *
 * Sam Whitaker's day, invented, dated from today so it never goes stale: a
 * call back, the 10:00 viewing at 8 Recreation Terrace with Sophie Green, an
 * appraisal with Raj Chauhan, a tenanted viewing on Moor Street and a take-on
 * visit. components/showroom/demo/PhoneDemo answers the phone's /api calls
 * from here; nothing is read from REX, nothing is saved, nothing is sent.
 */

import type { Appt } from "@/lib/diary";
import type { PhoneProperty } from "@/lib/m-properties";

type Person = { key: string; name: string; role: string; context: string; phone: string; email: string };

const NOTTM = { lat: 52.9417, lng: -1.1355 };
const shift = (d: number) => ({ lat: NOTTM.lat + d * 0.004, lng: NOTTM.lng - d * 0.006 });

export const PHONE_APPTS: Appt[] = [
  { id: "demo-call", day: 0, start: "09:00", mins: 15, kind: "other", what: "Call back Priya Shah", notes: "Asked about the two-bed on Musters Road. Wants to view this week.", where: "", who: "Priya Shah", agent: "Sam Whitaker", contact: { email: "priya.shah@example.com", phone: "07700 900184" }, comms: [] },
  { id: "demo-viewing", day: 0, start: "10:00", mins: 30, kind: "viewing", what: "Viewing - 8 Recreation Terrace", where: "8 Recreation Terrace, Nottingham NG2", who: "Sophie Green", agent: "Sam Whitaker", ...shift(0), contact: { email: "sophie.green@example.com", phone: "07700 900461" }, tenant: null, comms: [{ label: "Confirmation to Sophie", done: true }, { label: "Reminder text an hour before", done: true }] },
  { id: "demo-appraisal", day: 0, start: "11:30", mins: 60, kind: "appraisal", what: "Market appraisal - 14 Hawthorn Avenue", where: "14 Hawthorn Avenue, Nottingham NG7", who: "Raj Chauhan", agent: "Sam Whitaker", ...shift(1), contact: { email: "raj.chauhan@example.com", phone: "07700 900218" }, comms: [{ label: "Confirmation to Raj", done: true }, { label: "Pre-presentation", done: true }] },
  { id: "demo-moor", day: 0, start: "14:00", mins: 30, kind: "viewing", what: "Viewing - Flat 1, 22 Moor Street", where: "Flat 1, 22 Moor Street, Nottingham NG1", who: "Tom Okafor", agent: "Sam Whitaker", ...shift(2), contact: { email: "tom.okafor@example.com", phone: "07700 900352" }, tenant: "Grace Fraser", comms: [{ label: "Confirmation to Tom", done: true }, { label: "Heads-up to the tenant", done: true }] },
  { id: "demo-takeon", day: 0, start: "16:15", mins: 45, kind: "takeon", what: "Take-on visit - 9 Cedar Way", where: "9 Cedar Way, Beeston NG9", who: "Helen Marsh", agent: "Sam Whitaker", ...shift(3), contact: { email: "helen.marsh@example.com", phone: "07700 900577" }, comms: [] },
  { id: "demo-tomorrow", day: 1, start: "09:30", mins: 30, kind: "viewing", what: "Viewing - 31 Garland Road", where: "31 Garland Road, Nottingham NG3", who: "Ben Ellis", agent: "Sam Whitaker", ...shift(4), contact: { email: "ben.ellis@example.com", phone: "07700 900690" }, comms: [] },
];

const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

export const PHONE_HOMES: PhoneProperty[] = [
  { key: "demo-rec", name: "8 Recreation Terrace", locality: "Nottingham", rent: "£1,150 pcm", status: "On the market", availableFrom: day(14), propertyType: "Terraced house", image: "/brand/photo/property.jpg", tenants: [], landlord: { name: "Raj Chauhan", phone: "07700 900218", email: "raj.chauhan@example.com" }, ...shift(0), postcode: "NG2 3JL", group: "market", daysOnMarket: 6, service: "Managed" },
  { key: "demo-moor", name: "Flat 1, 22 Moor Street", locality: "Nottingham", rent: "£875 pcm", status: "On the market", availableFrom: day(30), propertyType: "Flat", image: "/brand/living-room.jpg", tenants: [{ name: "Grace Fraser", phone: "07700 900733" }], landlord: { name: "Oliver Price", phone: "07700 900812", email: "oliver.price@example.com" }, ...shift(2), postcode: "NG1 6AB", group: "market", daysOnMarket: 11, service: "Managed" },
  { key: "demo-garland", name: "31 Garland Road", locality: "Nottingham", rent: "£1,300 pcm", status: "On the market", availableFrom: day(21), propertyType: "Semi-detached house", image: "/brand/photo/welcome.jpg", tenants: [], landlord: { name: "Maya Bennett", phone: "07700 900944", email: "maya.bennett@example.com" }, ...shift(4), postcode: "NG3 2QW", group: "market", daysOnMarket: 3, service: "Let Only" },
  { key: "demo-cedar", name: "9 Cedar Way", locality: "Beeston", rent: "£795 pcm", status: "Managed", availableFrom: null, propertyType: "Terraced house", image: "/brand/photo/marketing.jpg", tenants: [{ name: "Daniel Reid", phone: "07700 900128" }], landlord: { name: "Helen Marsh", phone: "07700 900577", email: "helen.marsh@example.com" }, ...shift(3), postcode: "NG9 1AA", group: "managed", daysOnMarket: null, service: "Managed" },
];

export const PHONE_PEOPLE: Person[] = [
  { key: "t-sophie", name: "Sophie Green", role: "Applicant", context: "8 Recreation Terrace", phone: "07700 900461", email: "sophie.green@example.com" },
  { key: "t-tom", name: "Tom Okafor", role: "Applicant", context: "Flat 1, 22 Moor Street", phone: "07700 900352", email: "tom.okafor@example.com" },
  { key: "t-priya", name: "Priya Shah", role: "Tenant Lead", context: "Two-bed, West Bridgford", phone: "07700 900184", email: "priya.shah@example.com" },
  { key: "t-ben", name: "Ben Ellis", role: "Applicant", context: "31 Garland Road", phone: "07700 900690", email: "ben.ellis@example.com" },
  { key: "t-grace", name: "Grace Fraser", role: "Tenant", context: "Flat 1, 22 Moor Street", phone: "07700 900733", email: "grace.fraser@example.com" },
  { key: "t-daniel", name: "Daniel Reid", role: "Tenant", context: "9 Cedar Way", phone: "07700 900128", email: "daniel.reid@example.com" },
  { key: "l-raj", name: "Raj Chauhan", role: "Landlord", context: "8 Recreation Terrace", phone: "07700 900218", email: "raj.chauhan@example.com" },
  { key: "l-oliver", name: "Oliver Price", role: "Landlord", context: "Flat 1, 22 Moor Street", phone: "07700 900812", email: "oliver.price@example.com" },
  { key: "l-maya", name: "Maya Bennett", role: "Landlord", context: "31 Garland Road", phone: "07700 900944", email: "maya.bennett@example.com" },
  { key: "l-helen", name: "Helen Marsh", role: "Landlord Lead", context: "9 Cedar Way", phone: "07700 900577", email: "helen.marsh@example.com" },
];

const ACCESS: Record<string, { label: string; detail: string }> = {
  "demo-rec": { label: "Keys in the office", detail: "Tag 14 on the board. The side gate sticks: lift it and push. Alarm code is on the key fob." },
  "demo-moor": { label: "Tenant at home", detail: "Grace Fraser lives here and knows you are coming at 14:00. Knock, don't use the key." },
  "demo-garland": { label: "Keys in the office", detail: "Tag 31. Vacant, heating is on a timer." },
  "demo-cedar": { label: "Landlord meeting you", detail: "Helen Marsh will be there to show you round." },
};

const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
const hits = (hay: string, needle: string) => { const h = hay.toLowerCase(); return words(needle).every((w) => h.includes(w)); };
const homeAt = (where: string) => PHONE_HOMES.find((h) => where.toLowerCase().startsWith(h.name.toLowerCase()) || hits(where, h.name));

export interface PhoneReply { status: number; json: Record<string, unknown>; did?: string }
const ok = (json: Record<string, unknown>, did?: string): PhoneReply => ({ status: 200, json: { ok: true, ...json }, did });

/** The phone's /api calls, answered from the sample day. null = not a phone call; let it through. */
export function answerPhone(method: string, url: URL): PhoneReply | null {
  const p = url.pathname, sp = url.searchParams;
  if (p === "/api/diary") return ok({ live: true, everything: false, appts: PHONE_APPTS });
  if (p === "/api/m/event") {
    const home = homeAt(sp.get("where") ?? "");
    if (!home) return ok({ property: null, appraisal: null });
    return ok({ property: home, appraisal: home.landlord ? { landlord: home.landlord.name, phone: home.landlord.phone, email: home.landlord.email, access: ACCESS[home.key] ?? null } : null });
  }
  if (p === "/api/m/people") {
    if (sp.get("book") === "1") return ok({ people: PHONE_PEOPLE, tenants: PHONE_PEOPLE.filter((x) => !/landlord/i.test(x.role)), landlords: PHONE_PEOPLE.filter((x) => /landlord/i.test(x.role)) });
    const q = (sp.get("q") ?? "").trim();
    if (q.length < 2) return ok({ people: [] });
    return ok({ people: PHONE_PEOPLE.filter((x) => hits(`${x.name} ${x.context} ${x.phone.replace(/\s/g, "")}`, q)) }, "searched");
  }
  if (p === "/api/m/nearby") return ok({ people: PHONE_PEOPLE.slice(0, 5).map((x, i) => ({ ...x, miles: 0.2 + i * 0.3 })), miles: 1 });
  if (p === "/api/m/properties") {
    if (sp.get("all") === "1") return ok({ properties: PHONE_HOMES });
    const q = (sp.get("q") ?? "").trim();
    if (q.length < 2) return ok({ properties: [] });
    return ok({ properties: PHONE_HOMES.filter((h) => hits(`${h.name} ${h.locality} ${h.postcode ?? ""}`, q)) }, "searched");
  }
  if (p === "/api/m/id-check") {
    if (method === "POST") return ok({ id: "demo-check" }, "id_sent");
    return ok({ checks: [] });
  }
  if (p.startsWith("/api/m/")) return ok({});
  return null;
}
