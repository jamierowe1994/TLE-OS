/**
 * Where a link meant for the desktop OS lands inside the agents' app (3 Oct
 * 2026). James: "at no point on this app should we ever get through to the
 * actual homepage". A notice, an alert or a tile that names a desktop page is
 * sent to the app's own page for it, or to Home when there is none yet -
 * never to the desktop.
 */
export function appHref(href: string | null | undefined): string {
  if (!href) return "/agent";
  if (href.startsWith("/agent")) return href;
  if (href.startsWith("/leads")) {
    /* Straight into the one lead, as Scan ID's "Back to the Lead" does. */
    const id = new URLSearchParams(href.split("?")[1] ?? "").get("open");
    return id ? `/agent/leads?tab=all&lead=${encodeURIComponent(id)}` : "/agent/leads?tab=all";
  }
  if (href.startsWith("/applications")) return "/agent/applications";
  if (href.startsWith("/listings")) return "/agent/properties";
  if (href.startsWith("/portfolio") || href.startsWith("/property-management")) return "/agent/properties";
  if (href.startsWith("/viewings")) return "/agent/viewings";
  return "/agent";
}
