import { Card, FlowTag, Ghost, PageHead, Pill, Stat } from "@/components/Wire";

/**
 * The front page of the OS: today, at a glance, across every system —
 * the single place that proves "everything in one place" is real.
 */
export default function Dashboard() {
  return (
    <>
      <PageHead
        title="Dashboard"
        blurb="One glance across the whole operation. Every number on this page is pulled from the system that owns it — REX, PayProp, the portals — and lands here without anyone logging into three tools."
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="New leads today" value="14" hint="Rightmove + Zoopla, via REX" />
        <Stat label="Viewings booked" value="9" hint="next 7 days" />
        <Stat label="Applications live" value="6" hint="2 awaiting referencing" />
        <Stat label="Fees this month" value="£48,210" hint="PayProp, transfer-date basis" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card
          title="Needs attention"
          tag={<FlowTag from="REX + PayProp" />}
          className="lg:col-span-2"
        >
          <ul className="space-y-3 text-[13px]">
            <li className="flex items-center justify-between gap-3">
              <span>3 leads uncontacted for over 24 hours</span>
              <Pill tone="accent">Leads</Pill>
            </li>
            <li className="flex items-center justify-between gap-3">
              <span>Gas certificate expires in 12 days — 41 Harewood Road</span>
              <Pill tone="accent">Compliance</Pill>
            </li>
            <li className="flex items-center justify-between gap-3">
              <span>Application stalled at referencing for 6 days — Flat 2, Mercer St</span>
              <Pill>Applications</Pill>
            </li>
            <li className="flex items-center justify-between gap-3">
              <span>£1,240 reconciled in, not yet paid out</span>
              <Pill>Finances</Pill>
            </li>
          </ul>
        </Card>

        <Ghost
          label="Activity feed"
          detail="A live stream of everything the OS pushes and pulls — every lead in, listing out, status change."
          tag={<FlowTag from="all systems" />}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Ghost
          label="Pipeline this month"
          detail="Leads → viewings → applications → move-ins, as a funnel."
          tag={<FlowTag from="REX" />}
        />
        <Ghost
          label="Listings performance"
          detail="Days on market, price changes, portal clicks."
          tag={<FlowTag from="Rightmove → REX" />}
        />
        <Ghost
          label="Team snapshot"
          detail="Per-negotiator activity once agents come aboard."
        />
      </div>
    </>
  );
}
