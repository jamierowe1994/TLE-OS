/**
 * Susan's year plan, read from her own spreadsheet.
 *
 * WHAT THIS IS FOR. The P&L cannot be worked out from our systems alone:
 * income and agent commission can (PayProp), but PLC checks, the RLP premium,
 * advertising, Group admin, joining and licence fees all live in the accounts.
 * So those come from Susan's "H1 Actuals & H2 Forecast" sheet, uploaded, and
 * everything the OS CAN work out is worked out and set beside hers.
 *
 * Client-safe: the upload is parsed in the browser so the preview can show
 * exactly what was read before anything is saved.
 *
 * FORMAT. A CSV exported from Numbers or Excel (or the sheet pasted in). A
 * header row names the months ("Jan (Actual)", "Aug (Fcst)", ...); every other
 * row is a label followed by one figure per month. Rows are matched by label,
 * so a reordered or extended sheet still reads.
 */

export type PlanBasis = "actual" | "forecast";

export interface PlanLineDef {
  key: string;
  label: string;
  /** Lower-cased labels this line is recognised by. */
  match: RegExp;
  group: "income" | "cos" | "expenditure" | "total" | "kpi";
}

/* The lines the P&L uses, in the sheet's own order. */
export const PLAN_LINES: PlanLineDef[] = [
  { key: "transactionFees", label: "Transaction fees", match: /^transaction fees?$/i, group: "income" },
  { key: "letOnlyFees", label: "Let only fees", match: /^let only$/i, group: "income" },
  { key: "setUpFees", label: "Set up fees", match: /^set up fees?$/i, group: "income" },
  { key: "managementFees", label: "Management fees", match: /^man(agement)? fees?$/i, group: "income" },
  { key: "adminHoldingFees", label: "Admin / holding fees", match: /^admin fees/i, group: "income" },
  { key: "rlpPremiumIncome", label: "RLP premiums", match: /^rlp insurance premiums$/i, group: "income" },
  { key: "otherFees", label: "Other fees", match: /^other fees?$/i, group: "income" },
  { key: "commissionReceived", label: "Commission received outside PayProp", match: /^commission received$/i, group: "income" },
  { key: "totalIncome", label: "Total income", match: /^total income$/i, group: "total" },
  { key: "commissionLetOnly", label: "Agent commission - let only", match: /^agent commission.*let only/i, group: "cos" },
  { key: "commissionSetUp", label: "Agent commission - set up", match: /^agent commission.*set up/i, group: "cos" },
  { key: "commissionManagement", label: "Agent commission - management", match: /^agent commission.*management/i, group: "cos" },
  { key: "plcReferencing", label: "PLC checks & referencing", match: /^plc checks/i, group: "cos" },
  { key: "rlpPremium", label: "RLP insurance premium", match: /^rlp insurance \/ rpi premium|^rlp insurance premium$/i, group: "cos" },
  { key: "totalCostOfSales", label: "Total cost of sales", match: /^total cost of sales$/i, group: "total" },
  { key: "accountancy", label: "Accountancy", match: /^accountancy$/i, group: "expenditure" },
  { key: "groupAdmin", label: "Group admin & support", match: /^group admin/i, group: "expenditure" },
  { key: "advertising", label: "Advertising & promotion", match: /^advertising/i, group: "expenditure" },
  { key: "bankCharges", label: "Bank charges", match: /^bank service/i, group: "expenditure" },
  { key: "computer", label: "Computer expenses", match: /^computer/i, group: "expenditure" },
  { key: "insurance", label: "Insurance", match: /^insurance$/i, group: "expenditure" },
  { key: "joiningFeeIncome", label: "Joining fee income", match: /^joining fee income$/i, group: "expenditure" },
  { key: "licenceFeeIncome", label: "Licence fee income", match: /^licen[cs]e fee income$/i, group: "expenditure" },
  { key: "operatingSoftware", label: "Operating software", match: /^operating software/i, group: "expenditure" },
  { key: "propertySoftware", label: "Property software", match: /^property software/i, group: "expenditure" },
  { key: "recruitment", label: "Recruitment fees", match: /^recruitment fees?$/i, group: "expenditure" },
  { key: "training", label: "Staff training", match: /^staff training$/i, group: "expenditure" },
  { key: "subscriptions", label: "Subscriptions", match: /^subscriptions$/i, group: "expenditure" },
  { key: "telephone", label: "Telephone", match: /^telephone$/i, group: "expenditure" },
  { key: "travel", label: "Travel", match: /^travel/i, group: "expenditure" },
  { key: "otherExpenses", label: "Interest and other expenses", match: /^interest in late vat$|^total other expenses$/i, group: "expenditure" },
  { key: "totalExpenditure", label: "Total expenditure", match: /^total expenditure$/i, group: "total" },
  { key: "netProfit", label: "Net profit / (loss)", match: /^net profit/i, group: "total" },
  { key: "moveIns", label: "Total move-ins", match: /^total move ins$/i, group: "kpi" },
  { key: "managedProperties", label: "Total managed properties", match: /^total managed properties$/i, group: "kpi" },
  { key: "marketAppraisals", label: "Market appraisals", match: /^market appraisals$/i, group: "kpi" },
  { key: "coreAgents", label: "Core TLE agents", match: /^number core tle agents$/i, group: "kpi" },
];

export interface YearPlan {
  year: number;
  /** "2026-01" … "2026-12". */
  months: string[];
  /** Per month, whether the sheet calls the column an actual or a forecast. */
  basis: Record<string, PlanBasis>;
  /** line key → month → figure. Null where the sheet has no figure. */
  lines: Record<string, Record<string, number | null>>;
  fileName: string | null;
  importedAt: string;
  importedBy: string;
  /** Months whose figures are the accountant's P&L rather than Susan's sheet. */
  accountsMonths?: string[];
  accountsFileName?: string | null;
}

export interface ParsedPlan {
  plan: Omit<YearPlan, "importedAt" | "importedBy">;
  matched: string[];
  missing: string[];
  /** Labels in the sheet no line recognised - shown, never silently dropped. */
  unread: string[];
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Split one CSV line, honouring quotes. */
function cells(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

function toNumber(raw: string): number | null {
  const t = raw.replace(/[£,\s]/g, "");
  if (!t || t === "-" || t === "—") return null;
  const neg = /^\(.*\)$/.test(t);
  const pct = t.endsWith("%");
  const n = Number(t.replace(/[()%]/g, ""));
  if (!Number.isFinite(n)) return null;
  const v = neg ? -n : n;
  return pct ? v / 100 : v;
}

export function parsePlan(text: string, year: number, fileName: string | null = null): ParsedPlan | { error: string } {
  const rawLines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim());
  if (!rawLines.length) return { error: "The file is empty." };
  const sep = (rawLines[0].match(/\t/g)?.length ?? 0) > (rawLines[0].match(/,/g)?.length ?? 0) ? "\t" : ",";
  const grid = rawLines.map((l) => cells(l, sep));

  // The header: the first row naming at least six months.
  const headerAt = grid.findIndex((r) => r.filter((c) => MONTHS.includes(c.slice(0, 3).toLowerCase())).length >= 6);
  if (headerAt === -1) return { error: "No row names the months (Jan, Feb, Mar ...). Export the sheet with its header row." };
  const header = grid[headerAt];
  const colOf: Record<string, number> = {};
  const basis: Record<string, PlanBasis> = {};
  header.forEach((c, i) => {
    const mi = MONTHS.indexOf(c.slice(0, 3).toLowerCase());
    if (mi === -1) return;
    const m = `${year}-${String(mi + 1).padStart(2, "0")}`;
    if (colOf[m] != null) return;
    colOf[m] = i;
    basis[m] = /fcst|forecast|budget|plan/i.test(c) ? "forecast" : "actual";
  });
  const months = Object.keys(colOf).sort();
  if (months.length < 6) return { error: "Fewer than six month columns were found." };
  const firstMonthCol = Math.min(...Object.values(colOf));

  const lines: Record<string, Record<string, number | null>> = {};
  const unread: string[] = [];
  for (const row of grid.slice(headerAt + 1)) {
    const label = row.slice(0, firstMonthCol).filter(Boolean).pop() ?? "";
    if (!label || toNumber(label) != null) continue;
    const values = months.map((m) => toNumber(row[colOf[m]] ?? ""));
    if (values.every((v) => v == null)) continue;
    const def = PLAN_LINES.find((d) => d.match.test(label.replace(/\s+/g, " ").trim()));
    if (!def) {
      unread.push(label);
      continue;
    }
    if (lines[def.key]) continue; // first occurrence wins
    lines[def.key] = Object.fromEntries(months.map((m, i) => [m, values[i]]));
  }

  const matched = PLAN_LINES.filter((d) => lines[d.key]).map((d) => d.key);
  if (!lines.totalIncome || !lines.totalExpenditure) {
    return { error: "The sheet needs at least a Total Income and a Total Expenditure row." };
  }
  return {
    plan: { year, months, basis, lines, fileName },
    matched,
    missing: PLAN_LINES.filter((d) => !lines[d.key]).map((d) => d.label),
    unread,
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   THE ACCOUNTANT'S P&L (QuickBooks "Profit and Loss", by month)

   Different shape from Susan's sheet, same money. The accounts put licence,
   pro licence and joining fees in INCOME; Susan's sheet nets them off
   EXPENDITURE. The plan keeps the sheet's convention, so the conversion is:

     totalIncome       = Total Income - joining - licence - pro licence
     licenceFeeIncome  = -(licence + pro licence)
     joiningFeeIncome  = -joining
     totalExpenditure  = Total Expenses - joining - licence - pro licence
                         + Total Other Expenses (late VAT interest)

   Checked on Jan-Jul 2026: January comes to £29,328.42 income and £27,094.92
   expenditure, exactly Susan's sheet, and every month nets to the accounts'
   own NET INCOME.

   WHY THE TOTALS ARE TRUSTED OVER THE LINES. Read off a PDF, a row with gaps
   (Commission Received, Joining Fee Income, Travel) can land its figures in the
   wrong months while its row total still adds up - that happened with the
   Jan-Jul export. So every month's lines are checked against that month's
   totals, and a month that does not add up is refused, not stored.
   ══════════════════════════════════════════════════════════════════════════ */

export interface ParsedAccounts {
  months: string[];
  /** line key -> month -> figure, already in the sheet's convention. */
  lines: Record<string, Record<string, number | null>>;
  fileName: string | null;
  /** Months whose lines do not add up to their totals, with the gap. */
  problems: string[];
}

export function looksLikeAccounts(text: string): boolean {
  return /sales commission/i.test(text) && /total expenses/i.test(text) && /net (operating )?income/i.test(text);
}

const ACCOUNT_ROWS: Array<[RegExp, string]> = [
  [/^commission received$/i, "commissionReceived"],
  [/^joining fee income$/i, "_joining"],
  [/^licen[cs]e fee income$/i, "_licence"],
  [/^pro licen[cs]e fee income$/i, "_proLicence"],
  [/^management fees?$/i, "managementFees"],
  [/^other fees?$/i, "otherFees"],
  [/^(rpi|rlp) income$/i, "rlpPremiumIncome"],
  [/^set up fees?$/i, "setUpFees"],
  [/^transaction fees?$/i, "transactionFees"],
  [/^let only fees?$|^tenant find fees?$/i, "letOnlyFees"],
  [/^total income$/i, "_totalIncome"],
  [/^referencing/i, "plcReferencing"],
  [/^(rpi|rlp) premium$/i, "rlpPremium"],
  [/^sales commission$/i, "commissionManagement"],
  [/^total cost of sales$/i, "totalCostOfSales"],
  [/^accountancy$/i, "accountancy"],
  [/^advertising/i, "advertising"],
  [/^agent admin support$|^group admin/i, "groupAdmin"],
  [/^bank service/i, "bankCharges"],
  [/^computer/i, "computer"],
  [/^insurance$/i, "insurance"],
  [/^operating software/i, "operatingSoftware"],
  [/^property software/i, "propertySoftware"],
  [/^recruitment/i, "recruitment"],
  [/^staff training$/i, "training"],
  [/^subscriptions$/i, "subscriptions"],
  [/^telephone$/i, "telephone"],
  [/^travel/i, "travel"],
  [/^total expenses$/i, "_totalExpenses"],
  [/^total other expenses$/i, "otherExpenses"],
  [/^net income$/i, "netProfit"],
];

export function parseAccounts(text: string, year: number, fileName: string | null = null): ParsedAccounts | { error: string } {
  const rawLines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim());
  const sep = (rawLines[0]?.match(/\t/g)?.length ?? 0) > (rawLines[0]?.match(/,/g)?.length ?? 0) ? "\t" : ",";
  const grid = rawLines.map((l) => cells(l, sep));
  const headerAt = grid.findIndex((r) => r.filter((c) => MONTHS.includes(c.slice(0, 3).toLowerCase()) && new RegExp(String(year)).test(c)).length >= 3);
  if (headerAt === -1) return { error: `No month columns for ${year} were found (JAN ${year}, FEB ${year} ...).` };
  const colOf: Record<string, number> = {};
  grid[headerAt].forEach((c, i) => {
    if (!new RegExp(String(year)).test(c)) return;
    const mi = MONTHS.indexOf(c.slice(0, 3).toLowerCase());
    if (mi !== -1) colOf[`${year}-${String(mi + 1).padStart(2, "0")}`] = i;
  });
  const months = Object.keys(colOf).sort();
  const raw: Record<string, Record<string, number>> = {};
  for (const row of grid.slice(headerAt + 1)) {
    const label = (row[0] ?? "").replace(/\s+/g, " ").trim();
    const hit = ACCOUNT_ROWS.find(([re]) => re.test(label));
    if (!hit) continue;
    // "Interest in late VAT" and "Total Other Expenses" both mean otherExpenses; the total wins.
    raw[hit[1]] = Object.fromEntries(months.map((m) => [m, toNumber(row[colOf[m]] ?? "") ?? 0]));
  }
  for (const need of ["_totalIncome", "totalCostOfSales", "_totalExpenses", "netProfit", "commissionManagement"]) {
    if (!raw[need]) return { error: "This doesn't look like a full P&L: a total row is missing." };
  }

  const at = (k: string, m: string) => raw[k]?.[m] ?? 0;
  const problems: string[] = [];
  const lines: Record<string, Record<string, number | null>> = {};
  const put = (k: string, m: string, v: number | null) => {
    (lines[k] ??= {})[m] = v == null ? null : Math.round(v * 100) / 100;
  };
  const incomeKeys = ["commissionReceived", "_joining", "_licence", "_proLicence", "managementFees", "otherFees", "rlpPremiumIncome", "setUpFees", "transactionFees", "letOnlyFees"];
  const expenseKeys = ["accountancy", "advertising", "groupAdmin", "bankCharges", "computer", "insurance", "operatingSoftware", "propertySoftware", "recruitment", "training", "subscriptions", "telephone", "travel"];
  for (const m of months) {
    const incSum = incomeKeys.reduce((t, k) => t + at(k, m), 0);
    const cosSum = at("plcReferencing", m) + at("rlpPremium", m) + at("commissionManagement", m);
    const expSum = expenseKeys.reduce((t, k) => t + at(k, m), 0);
    const off = (a: number, b: number) => Math.abs(a - b) > 0.05;
    const monthName = new Date(`${m}-01T00:00:00Z`).toLocaleString("en-GB", { month: "long", timeZone: "UTC" });
    if (off(incSum, at("_totalIncome", m))) problems.push(`${monthName}: income lines come to ${incSum.toFixed(2)}, the total says ${at("_totalIncome", m).toFixed(2)}`);
    if (off(cosSum, at("totalCostOfSales", m))) problems.push(`${monthName}: cost of sales lines come to ${cosSum.toFixed(2)}, the total says ${at("totalCostOfSales", m).toFixed(2)}`);
    if (off(expSum, at("_totalExpenses", m))) problems.push(`${monthName}: expense lines come to ${expSum.toFixed(2)}, the total says ${at("_totalExpenses", m).toFixed(2)}`);
    const net = at("_totalIncome", m) - at("totalCostOfSales", m) - at("_totalExpenses", m) - at("otherExpenses", m);
    if (off(net, at("netProfit", m))) problems.push(`${monthName}: the totals come to a net of ${net.toFixed(2)}, the P&L says ${at("netProfit", m).toFixed(2)}`);

    const feeOffsets = at("_joining", m) + at("_licence", m) + at("_proLicence", m);
    for (const k of ["commissionReceived", "managementFees", "otherFees", "rlpPremiumIncome", "setUpFees", "transactionFees", "letOnlyFees", "plcReferencing", "rlpPremium", "commissionManagement", "totalCostOfSales", "otherExpenses", "netProfit", ...expenseKeys]) {
      put(k, m, raw[k] ? at(k, m) : null);
    }
    put("commissionSetUp", m, null);
    put("commissionLetOnly", m, null);
    put("adminHoldingFees", m, null);
    put("totalIncome", m, at("_totalIncome", m) - feeOffsets);
    put("licenceFeeIncome", m, -(at("_licence", m) + at("_proLicence", m)));
    put("joiningFeeIncome", m, -at("_joining", m));
    put("totalExpenditure", m, at("_totalExpenses", m) - feeOffsets + at("otherExpenses", m));
  }
  return { months, lines, fileName, problems };
}

/** The accounts replace the sheet, month for month and line for line. */
export function mergeAccounts(plan: YearPlan | null, acc: ParsedAccounts, year: number): Omit<YearPlan, "importedAt" | "importedBy"> {
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
  const lines: YearPlan["lines"] = {};
  for (const def of PLAN_LINES) {
    const row: Record<string, number | null> = {};
    for (const m of months) {
      row[m] = acc.months.includes(m) ? acc.lines[def.key]?.[m] ?? null : plan?.lines[def.key]?.[m] ?? null;
    }
    if (Object.values(row).some((v) => v != null)) lines[def.key] = row;
  }
  return {
    year,
    months,
    basis: Object.fromEntries(months.map((m) => [m, acc.months.includes(m) ? "actual" : plan?.basis[m] ?? "forecast"])) as YearPlan["basis"],
    lines,
    fileName: plan?.fileName ?? null,
    accountsMonths: [...new Set([...(plan?.accountsMonths ?? []), ...acc.months])].sort(),
    accountsFileName: acc.fileName,
  };
}
