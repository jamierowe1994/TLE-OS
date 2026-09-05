import { NextRequest, NextResponse } from "next/server";
import { publicOrigin } from "@/lib/origin";

/**
 * A desktop shortcut that opens the feed in its own window.
 *
 * James, 4 Sep: "she can click download, go onto her desktop, and she opens
 * it." This is the least that does that with no installer and no warning: a
 * one-file web location, which a Mac opens as a .webloc and Windows as a
 * .url. Double-clicking it opens /feed in the default browser, signed in on
 * her existing session, as its own small window. For a proper Dock icon the
 * install button on the feed page is the better answer; this is the quick one.
 */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  /* ?to=dashboard: her first screen rather than the bare feed (5 Sep). */
  const dashboard = req.nextUrl.searchParams.get("to") === "dashboard";
  const url = `${publicOrigin(req)}${dashboard ? "/pre-tenancy/dashboard" : "/feed"}`;
  const title = dashboard ? "TLE OS - Pre-tenancy" : "TLE OS - What moved";
  const ua = req.headers.get("user-agent") ?? "";
  const windows = /Windows/i.test(ua);
  const body = windows
    ? `[InternetShortcut]\r\nURL=${url}\r\n`
    : `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>URL</key><string>${url}</string></dict></plist>\n`;
  const name = windows ? `${title}.url` : `${title}.webloc`;
  return new NextResponse(body, {
    headers: {
      "Content-Type": windows ? "application/internet-shortcut" : "application/xml",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
