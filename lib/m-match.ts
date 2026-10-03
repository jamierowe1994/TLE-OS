/** Great-circle distance in miles, for the phone's maps (app/agent/match). */
export function milesBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const r = 3958.8;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

/** "CF10 5AB" out of "Cardiff, CF10 5AB", or null. */
export function postcodeIn(text: string | null | undefined): string | null {
  const m = (text ?? "").toUpperCase().match(/\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/);
  return m ? `${m[1]} ${m[2]}` : null;
}
