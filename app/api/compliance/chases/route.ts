import { NextRequest, NextResponse } from "next/server";
import { publicError } from "@/lib/public-error";
import { requireCapability } from "@/lib/admin";
import { hasDb } from "@/lib/db";
import { jsonObject } from "@/lib/json-body";
import { switchOn } from "@/lib/switches";
import { aboutSheet, noteExport, xlsxResponse } from "@/lib/exports";
import { chasedAgents, chaseSettings, chaseTrail, saveChaseSettings, type TrailFilter } from "@/lib/cert-chase";

/**
 * Agent Chases: every time an agent was chased about a certificate, by hand
 * or automatically (Josel, ticket 11c8acc9, 11 Nov 2026: "a clear audit trail
 * and ... a record of all follow-ups sent to agents").
 *
 * GET                 → the list, newest first, with the filters applied:
 *                       ?agent= &home= &from= &to= (YYYY-MM-DD) &how=hand|auto &cert=
 *                       plus the automatic reminder settings and whether the
 *                       Certificate chases switch is on.
 * GET ?format=xlsx    → the same list as a spreadsheet, on the house export
 *                       rules (lib/exports): logged against the person, and no
 *                       email addresses in it.
 * PUT { before, onExpiry } → which stages the automatic reminder sends at.
 *
 * The compliance office only, as Property Compliance is.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function filterOf(req: NextRequest): TrailFilter {
  const sp = req.nextUrl.searchParams;
  const how = sp.get("how");
  return {
    agent: (sp.get("agent") ?? "").trim().slice(0, 120) || undefined,
    home: (sp.get("home") ?? "").trim().slice(0, 120) || undefined,
    from: (sp.get("from") ?? "").trim() || undefined,
    to: (sp.get("to") ?? "").trim() || undefined,
    how: how === "hand" || how === "auto" ? how : "",
    cert: (sp.get("cert") ?? "").trim().slice(0, 20) || undefined,
  };
}

const ukDate = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Europe/London" });
const ukTime = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });

export async function GET(req: NextRequest) {
  const me = await requireCapability(req, "see:agent-compliance");
  if (!me) return NextResponse.json({ ok: false, error: "The chase record is the compliance office's." }, { status: 403 });
  if (!hasDb()) return NextResponse.json({ ok: true, stored: false, reason: "No database on this environment.", chases: [], agents: [] });
  const f = filterOf(req);
  try {
    if (req.nextUrl.searchParams.get("format") === "xlsx") {
      const rows = await chaseTrail(f, 20_000);
      const filters = Object.entries(f).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(", ");
      await noteExport(req, me, "Agent chases", rows.length, filters);
      return xlsxResponse("Agent chases", [
        {
          name: "Agent chases",
          columns: [
            { header: "Date", kind: "date", width: 12 },
            { header: "Time", width: 7 },
            { header: "Home", width: 40 },
            { header: "Certificate", width: 26 },
            { header: "Expiry", kind: "date", width: 12 },
            { header: "State then", width: 11 },
            { header: "Agent", width: 22 },
            { header: "How", width: 11 },
            { header: "Stage", width: 14 },
            { header: "By", width: 20 },
            { header: "Sent", width: 10 },
            { header: "From", width: 14 },
            { header: "Subject", width: 44 },
            { header: "Message", width: 80 },
            { header: "Note", width: 30 },
          ],
          rows: rows.map((r) => [
            ukDate(r.at),
            ukTime(r.at),
            r.property,
            r.certLabel,
            r.expiry,
            r.certState === "due" ? "Due" : r.certState === "expired" ? "Expired" : r.certState === "missing" ? "No record" : r.certState,
            r.agentName,
            r.how === "auto" ? "Automatic" : "By hand",
            r.how === "auto" ? (r.stage === 0 ? "On expiry" : r.stage != null ? `${r.stage} days before` : "") : "",
            r.byName,
            r.sent ? "Sent" : "Did not go",
            r.via === "mailbox" ? "Their Outlook" : r.via === "ours" ? "TLE OS" : "",
            r.subject,
            r.message,
            r.note,
          ]),
        },
        aboutSheet([
          ["What", "Every time an agent was chased about a certificate, by hand from Property Compliance or by the automatic reminder, newest first."],
          ["Filters", filters || "None: every chase on record."],
        ]),
      ]);
    }
    const [chases, agents, settings, armed] = await Promise.all([
      chaseTrail(f),
      chasedAgents(),
      chaseSettings(),
      switchOn("compliance_chases"),
    ]);
    return NextResponse.json({ ok: true, stored: true, chases, agents, settings, automatic: armed });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "The chase record couldn't be read just now. Try again in a minute.") }, { status: 502 });
  }
}

export async function PUT(req: NextRequest) {
  const me = await requireCapability(req, "see:agent-compliance");
  if (!me) return NextResponse.json({ ok: false, error: "The reminder settings are the compliance office's." }, { status: 403 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment, so nothing can be saved." }, { status: 503 });
  const body = await jsonObject(req);
  try {
    const settings = await saveChaseSettings({ before: body.before, onExpiry: body.onExpiry }, me.name || me.email);
    return NextResponse.json({ ok: true, settings });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "That didn't save. Try again in a minute.") }, { status: 502 });
  }
}
