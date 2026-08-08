"use client";

import BentoDash from "@/components/BentoDash";
import PageHeader from "@/components/PageHeader";
import {
  FINANCE_DEFAULT_LAYOUT, FINANCE_TRAY_GROUPS, FINANCE_WIDGETS,
} from "@/components/widgets-finance";

/**
 * The money page, as a board the agent owns — same bento machine as the
 * dashboard, pointed at fees, licences, arrears and flow. The engine behind
 * the numbers already exists: the TLE portal reconciles PayProp to the penny
 * against the accounts (transfer-date basis, net of VAT); this page is where
 * that engine will surface in the OS.
 */
export default function Finances() {
  return (
    <>
      <PageHeader
        title="Finances"
        blurb="Fee income on the accounts' own basis: a fee belongs to the month its batch transferred, net of VAT. Customise it like the dashboard — the money each person watches is different."
        illustration="/illustrations/notioly/piggy-bank.svg"
        lineBreak="dip"
      />

      <BentoDash
        registry={FINANCE_WIDGETS}
        defaultLayout={FINANCE_DEFAULT_LAYOUT}
        trayGroups={FINANCE_TRAY_GROUPS}
        storeKey="tle-finance-layout-v1"
      />
    </>
  );
}
