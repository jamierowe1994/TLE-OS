/**
 * Sunrise and sunset for a date and place — the standard low-precision solar
 * position algorithm (Astronomical Almanac / NOAA), accurate to a minute or
 * two, which is far beyond what a drawing of a window needs.
 *
 * No dependency: this is about forty lines of trigonometry and it means the
 * illustration knows what the sky is doing in Manchester in February without
 * calling anything.
 */

const RAD = Math.PI / 180;
const DAY_MS = 86_400_000;
const J1970 = 2_440_588;
const J2000 = 2_451_545;
/** Earth's axial tilt. */
const OBLIQUITY = RAD * 23.4397;
/** Centre of the sun's disc at -0.833°: half its width, plus refraction. */
const HORIZON = RAD * -0.833;

const toJulian = (d: Date) => d.valueOf() / DAY_MS - 0.5 + J1970;
const fromJulian = (j: number) => new Date((j + 0.5 - J1970) * DAY_MS);
const toDays = (d: Date) => toJulian(d) - J2000;

const solarMeanAnomaly = (d: number) => RAD * (357.5291 + 0.98560028 * d);

function eclipticLongitude(M: number) {
  // Equation of centre — the orbit is an ellipse, not a circle.
  const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const perihelion = RAD * 102.9372;
  return M + C + perihelion + Math.PI;
}

const declination = (L: number) => Math.asin(Math.sin(OBLIQUITY) * Math.sin(L));

const julianCycle = (d: number, lw: number) => Math.round(d - 0.0009 - lw / (2 * Math.PI));
const approxTransit = (Ht: number, lw: number, n: number) =>
  0.0009 + (Ht + lw) / (2 * Math.PI) + n;
const solarTransitJ = (ds: number, M: number, L: number) =>
  J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
const hourAngle = (h: number, phi: number, dec: number) =>
  Math.acos((Math.sin(h) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec)));

export type SunTimes = { sunrise: Date; sunset: Date; noon: Date };

/**
 * Sunrise/sunset for the given instant's date. Returns null inside the polar
 * circles when the sun neither rises nor sets — never true for the UK, but the
 * caller shouldn't have to trust that.
 */
export function sunTimes(date: Date, lat: number, lng: number): SunTimes | null {
  const lw = RAD * -lng;
  const phi = RAD * lat;
  const d = toDays(date);

  const n = julianCycle(d, lw);
  const ds = approxTransit(0, lw, n);
  const M = solarMeanAnomaly(ds);
  const L = eclipticLongitude(M);
  const dec = declination(L);

  const Jnoon = solarTransitJ(ds, M, L);
  const w = hourAngle(HORIZON, phi, dec);
  if (Number.isNaN(w)) return null; // midnight sun or polar night

  const Jset = solarTransitJ(approxTransit(w, lw, n), M, L);
  const Jrise = Jnoon - (Jset - Jnoon);

  return { sunrise: fromJulian(Jrise), sunset: fromJulian(Jset), noon: fromJulian(Jnoon) };
}

/** Manchester — the book's centre of gravity, and close enough for the UK. */
export const UK = { lat: 53.4808, lng: -2.2426 };

export type Phase = "night" | "dawn" | "sunrise" | "day" | "sunset" | "dusk";

export type SkyState = {
  phase: Phase;
  /** True when the sun is up; false means the moon has the sky. */
  daylight: boolean;
  /** 0→1 across the current arc: sunrise→sunset by day, sunset→sunrise by night. */
  progress: number;
  /**
   * The warm edge (sunrise/sunset, dusk/dawn) as a FRACTION of the current arc
   * — 40 minutes is a tenth of a June night and a fifth of a December day, and
   * anything colouring the sky needs that in the same units as `progress`.
   * Clamped to 0.4 so the two edges of a very short arc can never cross.
   */
  edge: number;
  label: string;
};

const MIN = 60_000;
/** How long the sky spends looking like sunrise or sunset. */
const EDGE = 40 * MIN;

/**
 * Where the sky is in its day, as six named states. The edges matter more than
 * the middle — nobody looks out of a window at 1pm and thinks "how midday" —
 * so dawn, sunrise, sunset and dusk each get their own moment.
 */
export function skyState(now = new Date(), lat = UK.lat, lng = UK.lng): SkyState {
  const t = sunTimes(now, lat, lng);
  if (!t) {
    // No sunrise/sunset today: fall back to the clock so the scene still moves.
    const h = now.getHours();
    const day = h >= 7 && h < 19;
    return {
      phase: day ? "day" : "night",
      daylight: day,
      progress: 0.5,
      edge: 0.15,
      label: day ? "Daytime" : "Night",
    };
  }

  const ms = now.valueOf();
  const rise = t.sunrise.valueOf();
  const set = t.sunset.valueOf();
  const edgeOf = (span: number) => Math.min(0.4, EDGE / span);

  if (ms >= rise && ms <= set) {
    const progress = (ms - rise) / (set - rise);
    const edge = edgeOf(set - rise);
    if (ms < rise + EDGE) return { phase: "sunrise", daylight: true, progress, edge, label: "Sunrise" };
    if (ms > set - EDGE) return { phase: "sunset", daylight: true, progress, edge, label: "Sunset" };
    return { phase: "day", daylight: true, progress, edge, label: "Daytime" };
  }

  // Night: the moon's arc runs from this evening's sunset to tomorrow's rise.
  const before = ms < rise;
  const prevSet = before
    ? (sunTimes(new Date(ms - DAY_MS), lat, lng)?.sunset.valueOf() ?? set - DAY_MS)
    : set;
  const nextRise = before
    ? rise
    : (sunTimes(new Date(ms + DAY_MS), lat, lng)?.sunrise.valueOf() ?? rise + DAY_MS);

  const progress = Math.min(1, Math.max(0, (ms - prevSet) / (nextRise - prevSet)));
  const edge = edgeOf(nextRise - prevSet);
  if (ms < prevSet + EDGE) return { phase: "dusk", daylight: false, progress, edge, label: "Dusk" };
  if (ms > nextRise - EDGE) return { phase: "dawn", daylight: false, progress, edge, label: "Dawn" };
  return { phase: "night", daylight: false, progress, edge, label: "Night" };
}
