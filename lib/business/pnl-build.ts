import type { YearPlan } from "@/lib/business/plan-import";
import { PLAN_LINES } from "@/lib/business/plan-import";

/**
 * The P&L, assembled. Pure, so it can be checked against real data offline.
 *
 * WHO ANSWERS WHICH LINE.
 *   · Commission income, for every month that has happened: PayProp, worked
 *     out by the OS, until the accountant's P&L for that month is uploaded -
 *     then the accounts (Susan Liles, 3 Nov 2026). Never Susan's own sheet.
 *   · Every cost (agent commission, PLC checks, the RLP premium, advertising,
 *     Group admin, joining and licence fees): Susan's uploaded sheet. Our
 *     systems cannot see them all - they are in the accounts.
 *   · Months still to come: the sheet's forecast, labelled as the plan.
 * Her own income figure for past months sits underneath ours as a comparison
 * row, so the two can be read against each other and never merged.
 */

export type CellSource = "payprop" | "sheet" | "accounts" | "computed";
export interface PnlCell {
  value: number | null;
  source: CellSource | null;
}
export interface PnlRow {
  key: string;
  label: string;
  group: "income" | "cos" | "gross" | "expenditure" | "net" | "compare";
  emphasis?: boolean;
  pct?: boolean;
  cells: Record<string, PnlCell>;
  total: number | null;
}
export interface PnlColumn {
  month: string;
  /** actual = a closed month; mtd = the month we are in; plan = still to come. */
  kind: "actual" | "mtd" | "plan";
  sheetBasis: "actual" | "forecast" | null;
}
export interface PnlYear {
  year: number;
  columns: PnlColumn[];
  rows: PnlRow[];
  tiles: {
    netYtd: number | null;
    netYtdSheet: number | null;
    incomeYtd: number | null;
    incomeYtdSheet: number | null;
    grossMarginYtd: number | null;
    fullYearOutlook: number | null;
    closedMonths: number;
    /** First and last closed month the year-to-date covers. */
    fromMonth: string | null;
    toMonth: string | null;
    missingMonths: string[];
    /** Closed months before PayProp's figures begin: not held, not "waiting" (P-068). */
    notHeld: string[];
    /** Closed months whose costs are still the forecast: no accounts for them
     *  yet, so they sit outside the year to date (Susan Liles, 3 Nov 2026). */
    awaitingAccounts: string[];
  };
  plan: { fileName: string | null; importedAt: string; importedBy: string; accountsMonths: string[]; accountsFileName: string | null } | null;
}

export interface MonthMoney {
  /** Commission exc VAT, both agencies. */
  combinedNet: number;
  /** The agency's own share, exc VAT. */
  agencyNet: number;
}

const round = (n: number | null) => (n == null ? null : Math.round(n * 100) / 100);

export function buildPnl(
  year: number,
  now: string,
  money: Record<string, MonthMoney | undefined>,
  plan: YearPlan | null,
  /** The first month PayProp's money is held for (gci-history MONEY_FLOOR). */
  floor: string | null = null
): PnlYear {
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
  const columns: PnlColumn[] = months.map((m) => ({
    month: m,
    kind: m < now ? "actual" : m === now ? "mtd" : "plan",
    sheetBasis: plan?.basis[m] ?? null,
  }));
  const sheet = (key: string, m: string): number | null => plan?.lines[key]?.[m] ?? null;
  /* Whose figure a plan cell is: the accountant's P&L once uploaded for that
     month, otherwise Susan's sheet. */
  const fromPlan = (m: string): CellSource => (plan?.accountsMonths?.includes(m) ? "accounts" : "sheet");
  const sheetSum = (keys: string[], m: string) => {
    const vals = keys.map((k) => sheet(k, m));
    return vals.every((v) => v == null) ? null : vals.reduce<number>((t, v) => t + (v ?? 0), 0);
  };

  const rows: PnlRow[] = [];
  /* The total column is YEAR TO DATE: closed months only (Rig run 4, P-069,
     10 Oct 2026). It summed every column - real months, this part-month and
     the plan - into one figure that was none of them. With nothing closed
     (January) it is null, not £0. */
  /* Year to date over the closed months that are HELD (P-068): before the
     money floor there is nothing to wait for. */
  const heldClosed = (c: PnlColumn) => c.kind === "actual" && (!floor || c.month >= floor);
  /* Susan Liles, 3 Nov 2026: "P&L tab shows net profit £164,370 - Sep P&L
     shows net profit £137,424". Both are losses. Hers is the accountant's
     January-September; ours ran to October, whose costs are still her
     forecast - a commission line sized for £58k of income set against what
     PayProp had for the month - and that month alone was £25,266 of the gap.
     A closed month counts towards the year to date once its costs are real:
     the accounts for it are uploaded, or her sheet calls the column an
     actual. Until then its income shows and its profit waits. */
  const costsReal = (m: string) => !!plan && (!!plan.accountsMonths?.includes(m) || plan.basis[m] === "actual");
  const awaitingAccounts = (c: PnlColumn) => !!plan && heldClosed(c) && !costsReal(c.month);
  /* With no plan there are no costs at all, and the income still adds up. */
  const inYtd = (c: PnlColumn) => heldClosed(c) && (!plan || costsReal(c.month));
  const row = (r: Omit<PnlRow, "total">, totalOver: (c: PnlColumn) => boolean = inYtd) => {
    const vals = columns.filter(totalOver).map((c) => r.cells[c.month]?.value);
    const total = r.pct || !vals.length || vals.some((v) => v == null) ? null : round(vals.reduce<number>((t, v) => t + (v as number), 0));
    const full = { ...r, total };
    rows.push(full);
    return full;
  };
  const byMonth = (fn: (c: PnlColumn) => PnlCell) => Object.fromEntries(columns.map((c) => [c.month, fn(c)]));

  /* ---------------------------- income ---------------------------- */
  /* Fees through PayProp are the OS's own reading. Money that never passes
     through PayProp - commission received (a few hundred pounds a month) and,
     from August 2026, referral income - comes from the accounts or the sheet
     and is shown on its own lines rather than folded in. */
  const OUTSIDE: Array<[string, string]> = [
    ["commissionReceived", "Commission received outside PayProp"],
    ["referralIncome", "Referral income"],
  ];
  const received = (m: string) => {
    const vals = OUTSIDE.map(([k]) => sheet(k, m));
    return vals.every((v) => v == null) ? null : vals.reduce<number>((t, v) => t + (v ?? 0), 0);
  };
  const fees = row({
    key: "fees",
    label: "Fees through PayProp",
    group: "income",
    cells: byMonth((c) => {
      if (c.kind === "plan") {
        const t = sheet("totalIncome", c.month);
        return t == null ? { value: null, source: null } : { value: round(t - (received(c.month) ?? 0)), source: fromPlan(c.month) };
      }
      /* Susan Liles, 3 Nov 2026: with October out, the year to date still sat
         £1,680 off the accountant's £137,424. The OS's PayProp reading runs
         £120-£410 a month under Paula's Summary of Fees, which the accounts
         are built from, because a few payments are filed under different
         categories. Once a month's accounts are uploaded they answer for it;
         PayProp answers until then, and is shown beneath as a comparison. */
      if (plan?.accountsMonths?.includes(c.month)) {
        const t = sheet("totalIncome", c.month);
        if (t != null) return { value: round(t - (received(c.month) ?? 0)), source: "accounts" };
      }
      const mm = money[c.month];
      return { value: mm ? round(mm.combinedNet) : null, source: mm ? "payprop" : null };
    }),
  });
  if (columns.some((c) => fees.cells[c.month].source === "accounts")) {
    row({
      key: "feesPayprop",
      label: "Fees read from PayProp",
      group: "compare",
      cells: byMonth((c) => {
        const mm = fees.cells[c.month].source === "accounts" ? money[c.month] : undefined;
        return { value: mm ? round(mm.combinedNet) : null, source: mm ? "payprop" : null };
      }),
    });
  }
  for (const [key, label] of OUTSIDE) {
    if (!columns.some((c) => sheet(key, c.month) != null)) continue;
    row({
      key,
      label,
      group: "income",
      cells: byMonth((c) => ({ value: sheet(key, c.month), source: sheet(key, c.month) == null ? null : fromPlan(c.month) })),
    });
  }
  const income = row({
    key: "income",
    label: "Total income",
    group: "income",
    emphasis: true,
    cells: byMonth((c) => {
      const f = fees.cells[c.month];
      if (f.value == null) return { value: null, source: null };
      return { value: round(f.value + (received(c.month) ?? 0)), source: "computed" };
    }),
  });
  row({
    key: "incomeSheet",
    label: "Income in the accounts / on the sheet",
    group: "compare",
    cells: byMonth((c) => ({ value: sheet("totalIncome", c.month), source: sheet("totalIncome", c.month) == null ? null : fromPlan(c.month) })),
  });

  /* ------------------------- cost of sales ------------------------- */
  /* Agent commission comes from the sheet, like the other costs. PayProp
     only sees the partners it pays: Glasgow's fees go to the agency whole and
     its partners are paid outside PayProp, so a PayProp commission figure runs
     £2-3.5k a month under the accounts (measured Jan-Jul 2026). What PayProp
     paid out is shown beneath as a comparison, never swapped in. */
  const commission = row({
    key: "commission",
    label: "Agent commission",
    group: "cos",
    cells: byMonth((c) => {
      const v = sheetSum(["commissionLetOnly", "commissionSetUp", "commissionManagement"], c.month);
      return { value: v, source: v == null ? null : fromPlan(c.month) };
    }),
  });
  row({
    key: "commissionPayprop",
    label: "Paid to partners through PayProp",
    group: "compare",
    cells: byMonth((c) => {
      const mm = c.kind === "plan" ? undefined : money[c.month];
      return { value: mm ? round(mm.combinedNet - mm.agencyNet) : null, source: mm ? "payprop" : null };
    }),
  });
  const plc = row({
    key: "plc",
    label: "PLC checks & referencing",
    group: "cos",
    cells: byMonth((c) => ({ value: sheet("plcReferencing", c.month), source: sheet("plcReferencing", c.month) == null ? null : fromPlan(c.month) })),
  });
  const rlp = row({
    key: "rlp",
    label: "RLP insurance premium",
    group: "cos",
    cells: byMonth((c) => ({ value: sheet("rlpPremium", c.month), source: sheet("rlpPremium", c.month) == null ? null : fromPlan(c.month) })),
  });
  const cosCell = (m: string): PnlCell => {
    const parts = [commission, plc, rlp].map((r) => r.cells[m].value);
    return parts.some((v) => v == null) ? { value: null, source: null } : { value: round(parts.reduce<number>((t, v) => t + (v as number), 0)), source: "computed" };
  };
  const cos = row({ key: "cos", label: "Total cost of sales", group: "cos", emphasis: true, cells: byMonth((c) => cosCell(c.month)) });

  const gross = row({
    key: "gross",
    label: "Gross profit",
    group: "gross",
    emphasis: true,
    cells: byMonth((c) => {
      if (c.kind === "mtd") return { value: null, source: null }; // part-month income, whole-month costs
      if (awaitingAccounts(c)) return { value: null, source: null }; // real income, forecast costs
      const i = income.cells[c.month].value;
      const k = cos.cells[c.month].value;
      return i == null || k == null ? { value: null, source: null } : { value: round(i - k), source: "computed" };
    }),
  });
  row({
    key: "grossPct",
    label: "Gross profit %",
    group: "gross",
    pct: true,
    cells: byMonth((c) => {
      const i = income.cells[c.month].value;
      const g = gross.cells[c.month].value;
      return i && g != null ? { value: round((g / i) * 100), source: "computed" } : { value: null, source: null };
    }),
  });

  /* -------------------------- expenditure -------------------------- */
  const expenditureLines = PLAN_LINES.filter((l) => l.group === "expenditure" && plan?.lines[l.key]);
  for (const l of expenditureLines) {
    row({
      key: l.key,
      label: l.label,
      group: "expenditure",
      cells: byMonth((c) => ({ value: sheet(l.key, c.month), source: sheet(l.key, c.month) == null ? null : fromPlan(c.month) })),
    });
  }
  /* The sheet's own note: for Jan-Jun the TOTALS are the accountant's actuals
     and the line items are the older forecast, so they do not add up. The total
     is the one that is right; the gap is shown rather than hidden. */
  const unitemised = byMonth((c) => {
    const total = sheet("totalExpenditure", c.month);
    const sum = sheetSum(expenditureLines.map((l) => l.key), c.month);
    if (total == null || sum == null || Math.abs(total - sum) < 1) return { value: null, source: null };
    return { value: round(total - sum), source: fromPlan(c.month) };
  });
  if (Object.values(unitemised).some((c) => c.value != null)) {
    const r = { key: "unitemised", label: "Not itemised on the sheet", group: "expenditure" as const, cells: unitemised };
    // Year to date like every other row, not the plan months as well.
    rows.push({ ...r, total: round(columns.filter(inYtd).reduce((t, c) => t + (unitemised[c.month].value ?? 0), 0)) });
  }
  const expenditure = row({
    key: "expenditure",
    label: "Total expenditure",
    group: "expenditure",
    emphasis: true,
    cells: byMonth((c) => ({ value: sheet("totalExpenditure", c.month), source: sheet("totalExpenditure", c.month) == null ? null : fromPlan(c.month) })),
  });

  /* ------------------------------ net ------------------------------ */
  const net = row(
    {
      key: "net",
      label: "Net profit / (loss)",
      group: "net",
      emphasis: true,
      cells: byMonth((c) => {
        // A part-month of income against a whole month of costs is not a result,
        // and nor is a month's real income against its forecast costs.
        if (c.kind === "mtd" || awaitingAccounts(c)) return { value: null, source: null };
        const g = gross.cells[c.month].value;
        const e = expenditure.cells[c.month].value;
        return g == null || e == null ? { value: null, source: null } : { value: round(g - e), source: "computed" };
      }),
    },
    inYtd
  );
  let running = 0;
  let broken = false;
  rows.push({
    key: "ytd",
    label: "Year to date",
    group: "net",
    cells: byMonth((c) => {
      const planned = c.kind === "mtd" || awaitingAccounts(c);
      const v = planned ? sheet("netProfit", c.month) : net.cells[c.month].value;
      if (v == null || broken) {
        broken = true;
        return { value: null, source: null };
      }
      running += v;
      return { value: round(running), source: planned ? fromPlan(c.month) : "computed" };
    }),
    total: null,
  });

  /* ------------------------------ tiles ------------------------------ */
  const closed = columns.filter(inYtd);
  const notHeld = columns.filter((c) => c.kind === "actual" && !heldClosed(c)).map((c) => c.month);
  const missingMonths = closed.filter((c) => !money[c.month]).map((c) => c.month);
  /* Nothing closed is no figure, not £0 (P-069): in January every year-to-date
     tile read "£0 profit" as though it were a result. */
  const sumOver = (r: PnlRow, cols: PnlColumn[]) => {
    const vals = cols.map((c) => r.cells[c.month].value);
    return !vals.length || vals.some((v) => v == null) ? null : round(vals.reduce<number>((t, v) => t + (v as number), 0));
  };
  const netYtd = sumOver(net, closed);
  const incomeYtd = sumOver(income, closed);
  const grossYtd = sumOver(gross, closed);
  const sheetNetYtd = closed.length && closed.every((c) => sheet("netProfit", c.month) != null)
    ? round(closed.reduce((t, c) => t + (sheet("netProfit", c.month) as number), 0))
    : null;
  const sheetIncomeYtd = closed.length && closed.every((c) => sheet("totalIncome", c.month) != null)
    ? round(closed.reduce((t, c) => t + (sheet("totalIncome", c.month) as number), 0))
    : null;
  // Everything after the year to date: a closed month still waiting for its
  // accounts goes into the outlook at its forecast, like the months to come.
  const rest = columns.filter((c) => c.kind !== "actual" || awaitingAccounts(c));
  const restPlan = rest.every((c) => sheet("netProfit", c.month) != null)
    ? rest.reduce((t, c) => t + (sheet("netProfit", c.month) as number), 0)
    : null;

  return {
    year,
    columns,
    rows,
    tiles: {
      netYtd,
      netYtdSheet: sheetNetYtd,
      incomeYtd,
      incomeYtdSheet: sheetIncomeYtd,
      grossMarginYtd: incomeYtd && grossYtd != null ? round((grossYtd / incomeYtd) * 100) : null,
      fullYearOutlook: netYtd != null && restPlan != null ? round(netYtd + restPlan) : null,
      closedMonths: closed.length,
      fromMonth: closed[0]?.month ?? null,
      toMonth: closed[closed.length - 1]?.month ?? null,
      missingMonths,
      notHeld,
      awaitingAccounts: columns.filter(awaitingAccounts).map((c) => c.month),
    },
    plan: plan
      ? { fileName: plan.fileName, importedAt: plan.importedAt, importedBy: plan.importedBy, accountsMonths: plan.accountsMonths ?? [], accountsFileName: plan.accountsFileName ?? null }
      : null,
  };
}
