import { Card, FlowTag, Ghost, PageHead, Pill, Stat } from "@/components/Wire";

/**
 * The money page. The engine already exists — the TLE portal reconciles
 * PayProp to the penny against the accounts sheet (transfer-date basis, net
 * of VAT). This page is where that engine surfaces in the OS.
 */
export default function Finances() {
  return (
    <>
      <PageHead
        title="Finances"
        blurb="Fee income straight from PayProp, on the same basis as the accounts: a fee belongs to the month its batch transferred, and every figure is net of VAT. The reconciliation engine already runs in the TLE portal — this page reuses it."
      >
        <FlowTag from="PayProp" />
      </PageHead>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Fees this month" value="£48,210" hint="net of VAT, both agencies" />
        <Stat label="Management fees" value="£31,145" hint="E&W + Glasgow" />
        <Stat label="Set-up fees" value="£16,086" hint="England & Wales" />
        <Stat label="Licence income" value="£4,700" hint="partner licences + joining" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title="Month to date" tag={<FlowTag from="PayProp" />} className="lg:col-span-2">
          <div className="wire-dashed flex h-44 items-center justify-center">
            <p className="text-sm font-semibold text-muted">
              Fee income by day, against last month&apos;s pace
            </p>
          </div>
          <p className="mt-3 text-[11px] text-muted">
            Figures are demo values in the live layout — the real ones come from
            the portal&apos;s PayProp engine, already reconciled against the accounts.
          </p>
        </Card>

        <Ghost
          label="Money in, not paid out"
          detail="Reconciled rent that hasn't left for the landlord yet — batched daily, flagged when it ages."
          tag={<FlowTag from="PayProp" />}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Ghost
          label="Fees by category"
          detail="Management, set-up, other — the accounts-sheet view, live."
        />
        <Ghost
          label="Licence fees by partner"
          detail="Who's paid what, per month — needs per-agent tagging in PayProp first."
          tag={<Pill tone="accent">Blocked on PayProp</Pill>}
        />
        <Ghost
          label="Arrears"
          detail="Late rent by property and age, from PayProp's tenant balances."
        />
      </div>
    </>
  );
}
