import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { record } from "@/lib/audit";
import { clientIp } from "@/lib/client-ip";
import { writeReadLog } from "@/lib/read-log";
import type { OsUser } from "@/lib/users";
import { fileName, workbook, XLSX_TYPE, type Sheet } from "@/lib/xlsx";

/**
 * Download as Excel (Kirstie, 16 Oct 2026 training call; ticket 570d9953).
 *
 * "Is there an option excel spreadsheets": her portfolio with the rent for a
 * portfolio review, and the certificates by contractor so she can see what is
 * overdue and ring them. James said yes.
 *
 * Three rules, each from something already live:
 *
 *  - WHAT THE SCREEN SHOWS. The screen sends the ids of the rows it has on
 *    show after its filters, and the server keeps only the ones in the
 *    person's own scoped book, read fresh the same way the screen read it. A
 *    hand-made list of ids cannot widen what comes back.
 *  - NO EMAILS OR PHONE NUMBERS, for anybody (No bulk contact lists, 10 Oct
 *    2026, lib/contact-mask). A spreadsheet is the bulk list in its purest
 *    form. Names stay, as they are on the screen; contact details come one
 *    record at a time, from the record.
 *  - WRITTEN DOWN. Every download goes into the read log against the person
 *    (method EXPORT, with the row count and filters) and into the audit
 *    trail, so it shows on Admin > Activity and on their file.
 */

/** Ids off the request body, capped: a screen never shows more than this. */
export async function idsFrom(req: NextRequest, key: string, max = 5_000): Promise<{ ids: Set<string>; filters: string } | null> {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const raw = body?.[key];
    if (!Array.isArray(raw)) return null;
    const ids = new Set(raw.slice(0, max).filter((x) => typeof x === "string" || typeof x === "number").map((x) => String(x).slice(0, 64)));
    const filters = typeof body.filters === "string" ? body.filters.slice(0, 240) : "";
    return { ids, filters };
  } catch {
    return null;
  }
}

/** Into the read log and the audit trail. Never in the way of the download. */
export async function noteExport(req: NextRequest, who: OsUser | null, what: string, rows: number, filters: string): Promise<void> {
  if (!who) return;
  const query = new URLSearchParams({ rows: String(rows), ...(filters ? { filters } : {}) }).toString();
  await Promise.all([
    writeReadLog([
      { at: Date.now(), userId: who.id, method: "EXPORT", path: req.nextUrl.pathname.slice(0, 300), query: query.slice(0, 300), ip: clientIp(req).slice(0, 64) },
    ]).catch((e) => console.error("[export] read log", e instanceof Error ? e.message : e)),
    record({
      kind: "data_exported",
      actorId: who.id,
      actorEmail: who.email,
      detail: `${what}: ${rows} row${rows === 1 ? "" : "s"}${filters ? ` (${filters})` : ""}`,
      ip: clientIp(req),
    }),
  ]);
}

const stamp = () =>
  new Date().toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });

/** The last sheet of every export: when, by whom, from what, and what is left out. */
export function aboutSheet(lines: [string, string][]): Sheet {
  return {
    name: "About this file",
    filter: false,
    columns: [{ header: "About", width: 22 }, { header: "", width: 120 }],
    rows: [
      ["Downloaded", stamp()],
      ...lines,
      ["Contact details", "No email addresses or phone numbers are in this file. Open the home in the OS for the landlord's or tenant's details."],
      ["Logged", "This download is recorded against your name."],
    ],
  };
}

export function xlsxResponse(stem: string, sheets: Sheet[]): NextResponse {
  const body = workbook(sheets);
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "content-type": XLSX_TYPE,
      "content-disposition": `attachment; filename="${fileName(stem)}"`,
      "cache-control": "no-store",
    },
  });
}
