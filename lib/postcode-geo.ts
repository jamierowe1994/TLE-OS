import "server-only";

/**
 * POSTCODES TO POINTS, in bulk, from postcodes.io (free, no key - the same
 * service /api/radar/near uses for one).
 *
 * The phone's radius search places a home by its postcode rather than by the
 * pin REX holds, because REX's pins are sometimes simply wrong: on 18 Sep
 * 2026 a home in East Kilbride came back 2.4 miles from Hull. A postcode is
 * what the agent typed and the landlord would recognise.
 *
 * Remembered for the life of the process: postcodes do not move.
 */

const memory = new Map<string, { lat: number; lng: number } | null>();

const tidy = (pc: string) => pc.toUpperCase().replace(/\s+/g, " ").trim();

export async function pointsFor(postcodes: string[]): Promise<Map<string, { lat: number; lng: number } | null>> {
  const want = [...new Set(postcodes.map(tidy).filter((p) => /^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$/.test(p)))];
  const missing = want.filter((p) => !memory.has(p));
  for (let i = 0; i < missing.length; i += 100) {
    const batch = missing.slice(i, i + 100);
    try {
      const r = await fetch("https://api.postcodes.io/postcodes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ postcodes: batch }),
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      });
      const j = (await r.json()) as { result?: Array<{ query: string; result: { latitude: number | null; longitude: number | null } | null }> };
      for (const row of j.result ?? []) {
        const hit = row.result;
        memory.set(tidy(row.query), hit && hit.latitude != null && hit.longitude != null ? { lat: hit.latitude, lng: hit.longitude } : null);
      }
    } catch {
      /* Not remembered, so the next search asks again; this one falls back. */
    }
  }
  const out = new Map<string, { lat: number; lng: number } | null>();
  for (const p of postcodes) out.set(p, memory.get(tidy(p)) ?? null);
  return out;
}
