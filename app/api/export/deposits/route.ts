import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { seesDeposits } from "@/lib/deposit-access";
import { hasDb } from "@/lib/db";
import { publicError } from "@/lib/public-error";
import { aboutSheet, idsFrom, noteExport, xlsxResponse } from "@/lib/exports";
import {
  ACTIONS, GAP_LABEL, POSITION_LABEL, depositRegister,
  type DepositRow, type Position,
} from "@/lib/deposit-audit";
import type { Sheet, Value } from "@/lib/xlsx";

/**
 * POST /api/export/deposits { homes: [...], filters } → .xlsx
 *
 * The deposit register as Admin > Deposits has it on show, for Susan's
 * Propertymark audit: the register itself, the to-do list in priority order,
 * the totals by scheme and by agent, and the live Flatfair deposits no home
 * on the book claims. Read fresh, the same way the screen read it; the ids
 * only narrow it. No email addresses or phone numbers (lib/exports).
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SERVICE: Record<DepositRow["service"], string> = {
  managed: "Fully managed", let_only: "Let only", rent_collect: "Rent collect", unknown: "Not recorded",
};

const yes = (b: boolean) => (b ? "Yes" : "No");

export async function POST(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor || !(await seesDeposits(actor))) return NextResponse.json({ ok: false, error: "The deposit register isn't on your account. Ask James if you need it." }, { status: 403 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  const asked = await idsFrom(req, "homes");
  if (!asked) return NextResponse.json({ ok: false, error: "Nothing to download." }, { status: 400 });

  try {
    const reg = await depositRegister();
    const rows = reg.rows.filter((r) => asked.ids.has(r.id));

    const register: Sheet = {
      name: "Deposit register",
      columns: [
        { header: "Property", width: 38 }, { header: "Postcode", width: 10 }, { header: "Country", width: 10 },
        { header: "Service", width: 13 }, { header: "PayProp no", width: 11 }, { header: "Agent", width: 20 },
        { header: "Agent left", width: 10 }, { header: "Landlord", width: 26 }, { header: "Tenants", width: 30 },
        { header: "Tenancy start", kind: "date", width: 13 }, { header: "Where it is", width: 30 },
        { header: "Status as recorded", width: 36 }, { header: "Scheme reference", width: 16 },
        { header: "Amount (£)", kind: "money", width: 11 }, { header: "Date protected", kind: "date", width: 13 },
        { header: "Protect by", kind: "date", width: 12 }, { header: "Prescribed info served", kind: "date", width: 13 },
        { header: "Prescribed info evidence", width: 22 }, { header: "Certificate on file", width: 12 }, { header: "New let (from Flatfair)", width: 11 },
        { header: "Flatfair status", width: 16 }, { header: "Flatfair branch", width: 20 },
        { header: "What's missing", width: 44 }, { header: "To do", width: 34 }, { header: "Notes", width: 40 },
        { header: "Also on the OS as", width: 30 },
        { header: "Last checked", kind: "date", width: 12 }, { header: "Checked by", width: 18 },
      ],
      rows: rows.map((r): Value[] => [
        r.address, r.postcode, r.country, SERVICE[r.service], r.paypropNo, r.agent,
        r.agentLeft == null ? null : yes(r.agentLeft), r.landlord, r.tenants, r.tenancyStart,
        POSITION_LABEL[r.position], r.status, r.ref, r.amount, r.protectedOn,
        r.protectBy,
        r.piServedOn,
        r.piEvidence === "date" ? "Date recorded" : r.piEvidence === "flatfair" ? "Signed via Flatfair" : r.piEvidence === "file" ? "In the certificate file" : null,
        yes(r.certOnFile), yes(r.newLet),
        r.flatfair ? `${r.flatfair.status}${r.flatfair.product === "flatbond" ? " (no-deposit plan)" : ""}` : null,
        r.flatfair?.branch ?? null,
        r.gaps.map((g) => GAP_LABEL[g]).join("; ") || null,
        r.action ? ACTIONS.find((a) => a.key === r.action)!.title : null,
        r.notes, r.alsoRecords.map((a) => a.id).join("; ") || null, r.lastChecked?.at ?? null, r.lastChecked?.by ?? null,
      ]),
    };

    const todo: Sheet = {
      name: "To do",
      columns: [
        { header: "Group", width: 44 }, { header: "Property", width: 38 }, { header: "Postcode", width: 10 },
        { header: "Agent", width: 20 }, { header: "Landlord", width: 26 }, { header: "Where it is", width: 30 },
        { header: "Reference", width: 16 }, { header: "What's missing", width: 44 }, { header: "What to do", width: 60 },
      ],
      rows: ACTIONS.flatMap((a) =>
        rows.filter((r) => r.action === a.key).map((r): Value[] => [
          a.title, r.address, r.postcode, r.agent, r.landlord, POSITION_LABEL[r.position], r.ref,
          r.gaps.map((g) => GAP_LABEL[g]).join("; ") || null, a.says,
        ])
      ),
    };

    const positions = Object.keys(POSITION_LABEL) as Position[];
    const countries: DepositRow["country"][] = ["England", "Scotland", "Wales"];
    const schemeRows: Value[][] = [];
    for (const p of positions) {
      for (const c of countries) {
        const set = rows.filter((r) => r.position === p && r.country === c);
        if (!set.length) continue;
        schemeRows.push([
          POSITION_LABEL[p], c, set.length,
          ["tle_tds", "tle_mds", "landlord_scheme", "transfer"].includes(p) ? set.reduce((s, r) => s + (r.amount ?? 0), 0) : null,
          set.filter((r) => r.ref).length, set.filter((r) => r.protectedOn).length,
          set.filter((r) => r.certOnFile).length, set.filter((r) => r.gaps.includes("late")).length,
        ]);
      }
    }
    const byScheme: Sheet = {
      name: "By scheme",
      columns: [
        { header: "Where it is", width: 32 }, { header: "Country", width: 10 }, { header: "Homes", kind: "number", width: 8 },
        { header: "Total (£)", kind: "money", width: 13 }, { header: "With reference", kind: "number", width: 10 },
        { header: "With date protected", kind: "number", width: 10 }, { header: "With certificate", kind: "number", width: 10 },
        { header: "Protected late", kind: "number", width: 10 },
      ],
      rows: schemeRows,
    };

    const agents = new Map<string, DepositRow[]>();
    for (const r of rows) {
      const k = r.agent?.trim() || "No agent on record";
      agents.set(k, [...(agents.get(k) ?? []), r]);
    }
    const byAgent: Sheet = {
      name: "By agent",
      columns: [
        { header: "Agent", width: 26 }, { header: "Left", width: 7 }, { header: "Homes", kind: "number", width: 8 },
        { header: "Held by TLE", kind: "number", width: 10 }, { header: "Held by TLE (£)", kind: "money", width: 13 },
        { header: "Landlord's scheme", kind: "number", width: 10 }, { header: "No-deposit plan", kind: "number", width: 10 },
        { header: "Transfer pending", kind: "number", width: 10 }, { header: "Not found", kind: "number", width: 10 },
        { header: "To do", kind: "number", width: 8 }, { header: "Complete (%)", kind: "number", width: 10 },
      ],
      rows: [...agents.entries()].sort((a, b) => b[1].length - a[1].length).map(([name, set]): Value[] => [
        name, set.some((r) => r.agentLeft) ? "Yes" : null, set.length,
        set.filter((r) => r.heldByTle).length, set.filter((r) => r.heldByTle).reduce((s, r) => s + (r.amount ?? 0), 0),
        set.filter((r) => r.position === "landlord_scheme").length, set.filter((r) => r.position === "flatfair_plan").length,
        set.filter((r) => r.position === "transfer").length, set.filter((r) => r.position === "not_found").length,
        set.filter((r) => r.action).length, Math.round((set.filter((r) => !r.action).length / set.length) * 100),
      ]),
    };

    const notOnBook: Sheet = {
      name: "Flatfair, not on our book",
      columns: [
        { header: "Flatfair address", width: 40 }, { header: "Postcode", width: 10 }, { header: "Kind", width: 18 },
        { header: "TDS reference", width: 14 }, { header: "Amount (£)", kind: "money", width: 11 },
        { header: "Tenancy start", kind: "date", width: 13 }, { header: "Flatfair branch", width: 22 }, { header: "Branch agent left", width: 10 },
      ],
      rows: reg.unmatched.map((u): Value[] => [
        u.address, u.postcode, u.product === "flatbond" ? "No-deposit plan" : "Deposit (TDS)", u.ref, u.amount, u.start, u.branch,
        u.branchLeft == null ? null : yes(u.branchLeft),
      ]),
    };

    const stamp = (s: string | null) => (s ? new Date(s).toLocaleString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "never");
    await noteExport(req, actor, "Deposit register", rows.length, asked.filters);
    return xlsxResponse("TLE Deposit Register", [
      register, todo, byScheme, byAgent, notOnBook,
      aboutSheet([
        ["What it is", "Every let home's deposit for the Propertymark audit: where it is protected, the reference, amount, date protected and whether the certificate and prescribed information are on file."],
        ["Filters", asked.filters || "None - every home"],
        ["Flatfair", `Read live: TDS deposits registered through Flatfair and no-deposit plans, England only. Last synced ${stamp(reg.flatfairAt)}. A TDS deposit registered straight with TDS is only here if the team recorded it.`],
        ["Leavers", reg.leaversKnown ? `As REX has them: ${reg.leavers.join(", ") || "nobody"}.` : "Not known when this was downloaded."],
        ["mydeposits Scotland and landlord schemes", `No live feed. These are as the team last recorded them in the OS (last change ${stamp(reg.recordAt)}).`],
        ["Protected late", "More than 30 days (England and Wales) or 30 working days (Scotland) between the tenancy start and the date protected."],
      ]),
    ]);
  } catch (e) {
    console.error("[deposits] export", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: publicError(e, "The deposit register couldn't be read just now.") }, { status: 500 });
  }
}
