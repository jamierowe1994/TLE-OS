import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { geocode } from "@/lib/geocode";
import { driveTime, type Point, type TravelProblem } from "@/lib/travel";

/**
 * TOOLS > ROUTE PLANNER (James, 10 Nov 2026). One day's visits, the real drive
 * between each, and whether a different order of the same time slots would be
 * less driving.
 *
 * Reads only: addresses are looked up, journeys are asked of the routing
 * service, nothing is written to a diary. NO ESTIMATES: a leg the routing
 * service cannot answer comes back as a problem in words, never as a guess
 * from the straight-line distance. Straight lines are used for one thing only,
 * choosing which single other order is worth asking the real times for, so the
 * tool asks about 2N journeys rather than N squared.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_STOPS = 10;
/** A different order has to save at least this much real driving to be offered. */
const WORTH_MINUTES = 5;

type StopIn = { id?: string; where?: string; at?: string };
type Body = { start?: { address?: string; lat?: number; lng?: number }; stops?: StopIn[] };
type Placed = { id: string; at: Date; point: Point };
type Leg = { from: string; to: string; ok: true; minutes: number; miles: number } | { from: string; to: string; ok: false; problem: TravelProblem };

const miles = (a: Point, b: Point) => {
  const r = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lng - a.lng) * r) / 2) ** 2;
  return 7918 * Math.asin(Math.sqrt(h));
};

/** The shortest open path through every stop, by straight line (Held-Karp). */
function shortestOrder(start: Point | null, pts: Point[]): number[] {
  const n = pts.length;
  if (n < 2) return pts.map((_, i) => i);
  const full = 1 << n;
  const cost = new Float64Array(full * n).fill(Infinity);
  const prev = new Int8Array(full * n).fill(-1);
  for (let i = 0; i < n; i++) cost[(1 << i) * n + i] = start ? miles(start, pts[i]) : 0;
  for (let mask = 1; mask < full; mask++) {
    for (let last = 0; last < n; last++) {
      const c = cost[mask * n + last];
      if (!(mask & (1 << last)) || c === Infinity) continue;
      for (let next = 0; next < n; next++) {
        if (mask & (1 << next)) continue;
        const m = mask | (1 << next);
        const t = c + miles(pts[last], pts[next]);
        if (t < cost[m * n + next]) { cost[m * n + next] = t; prev[m * n + next] = last; }
      }
    }
  }
  let last = 0;
  for (let i = 1; i < n; i++) if (cost[(full - 1) * n + i] < cost[(full - 1) * n + last]) last = i;
  const order: number[] = [];
  for (let mask = full - 1; last >= 0; ) {
    order.unshift(last);
    const p = prev[mask * n + last];
    mask &= ~(1 << last);
    last = p;
  }
  return order;
}

/** The real journeys for one order: stop k is reached in time for slot k. */
async function legsFor(start: Point | null, order: Placed[], slots: Date[]): Promise<Leg[]> {
  const jobs: Promise<Leg>[] = [];
  order.forEach((stop, k) => {
    const from = k === 0 ? start : order[k - 1].point;
    if (!from) return;
    const fromId = k === 0 ? "start" : order[k - 1].id;
    jobs.push(
      driveTime(from, stop.point, slots[k]).then((a): Leg =>
        a.ok ? { from: fromId, to: stop.id, ok: true, minutes: a.leg.minutes, miles: a.leg.miles } : { from: fromId, to: stop.id, ok: false, problem: a.problem }
      )
    );
  });
  return Promise.all(jobs);
}

function total(legs: Leg[]) {
  if (!legs.length || legs.some((l) => !l.ok)) return null;
  return legs.reduce((t, l) => (l.ok ? { minutes: t.minutes + l.minutes, miles: Math.round((t.miles + l.miles) * 10) / 10 } : t), { minutes: 0, miles: 0 });
}

export async function POST(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });

  let b: Body;
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Expected a day's visits." }, { status: 400 }); }
  const asked = (Array.isArray(b.stops) ? b.stops : []).slice(0, MAX_STOPS)
    .map((s, i) => ({ id: String(s.id ?? i), where: String(s.where ?? "").trim(), at: new Date(String(s.at ?? "")) }))
    .filter((s) => !Number.isNaN(s.at.getTime()))
    .sort((x, y) => x.at.getTime() - y.at.getTime());
  if (!asked.length) return NextResponse.json({ ok: false, error: "No visits to plan." }, { status: 400 });

  /* Where the day starts: coordinates the profile already holds, or an address. */
  let start: Point | null = null;
  let startInfo: { ok: boolean; label: string | null; precise: boolean; problem?: TravelProblem } | null = null;
  const sLat = Number(b.start?.lat), sLng = Number(b.start?.lng);
  const sAddress = String(b.start?.address ?? "").trim();
  if (b.start?.lat != null && b.start?.lng != null && Number.isFinite(sLat) && Number.isFinite(sLng)) {
    start = { lat: sLat, lng: sLng };
    startInfo = { ok: true, label: sAddress || null, precise: true };
  } else if (sAddress) {
    const f = await geocode(sAddress);
    if (f.ok) { start = { lat: f.at.lat, lng: f.at.lng }; startInfo = { ok: true, label: f.at.tidied, precise: f.at.precise }; }
    else startInfo = { ok: false, label: sAddress, precise: false, problem: f.problem };
  }

  const found = await Promise.all(asked.map(async (s) => {
    if (!s.where) return { ...s, hit: null, problem: { code: "no_address", says: "This appointment has no address on it." } as TravelProblem };
    const f = await geocode(s.where);
    return f.ok ? { ...s, hit: f.at, problem: null } : { ...s, hit: null, problem: f.problem };
  }));
  const stops = found.map((s) => ({ id: s.id, ok: !!s.hit, tidied: s.hit?.tidied ?? null, precise: s.hit?.precise ?? false, matched: s.hit?.matched ?? null, problem: s.problem }));
  const placed: Placed[] = found.filter((s) => s.hit).map((s) => ({ id: s.id, at: s.at, point: { lat: s.hit!.lat, lng: s.hit!.lng } }));
  const slots = placed.map((p) => p.at);

  const legs = await legsFor(start, placed, slots);
  const booked = { legs, total: total(legs) };

  /* One other order, and only if the real journeys say it is worth it. */
  let best: { order: string[]; legs: Leg[]; total: { minutes: number; miles: number }; saves: number } | null = null;
  let compared = false;
  if (placed.length >= 3 && booked.total) {
    const idx = shortestOrder(start, placed.map((p) => p.point));
    if (idx.some((v, i) => v !== i)) {
      const order = idx.map((i) => placed[i]);
      const l2 = await legsFor(start, order, slots);
      const t2 = total(l2);
      compared = !!t2;
      if (t2 && booked.total.minutes - t2.minutes >= WORTH_MINUTES) best = { order: order.map((o) => o.id), legs: l2, total: t2, saves: booked.total.minutes - t2.minutes };
    } else compared = true;
  }

  return NextResponse.json({ ok: true, start: startInfo, stops, booked, best, compared });
}
