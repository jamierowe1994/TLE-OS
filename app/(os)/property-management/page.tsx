import { Card, FlowTag, Ghost, PageHead, Pill, Table } from "@/components/Wire";

export default function PropertyManagement() {
  return (
    <>
      <PageHead
        title="Property management"
        blurb="The managed book, day to day: compliance first, then maintenance and inspections. Certificates are read from REX's compliance records — including the actual documents."
      >
        <FlowTag from="REX" />
      </PageHead>

      <Card title="Compliance watchlist" tag={<Pill tone="accent">2 due within 30 days</Pill>}>
        <Table
          cols={["Property", "Certificate", "Expires", "Document", "Status"]}
          rows={[
            [
              <span key="p" className="font-semibold">41 Harewood Road</span>,
              "Gas safety",
              <span key="e" className="figures">12 days</span>,
              <Pill key="d" tone="good">Attached</Pill>,
              <Pill key="s" tone="accent">Book engineer</Pill>,
            ],
            [
              <span key="p" className="font-semibold">88 Kelvin Way</span>,
              "EICR",
              <span key="e" className="figures">27 days</span>,
              <Pill key="d" tone="good">Attached</Pill>,
              <Pill key="s" tone="accent">Book electrician</Pill>,
            ],
            [
              <span key="p" className="font-semibold">5 Orchard Close</span>,
              "EPC",
              <span key="e" className="figures">14 months</span>,
              <Pill key="d">No document</Pill>,
              <Pill key="s">OK</Pill>,
            ],
          ]}
        />
        <p className="mt-3 text-[11px] text-muted">
          Demo rows — the live list reads REX compliance entries and flags records
          with no certificate attached.
        </p>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Ghost
          label="Maintenance queue"
          detail="Reported issues, assigned contractor, cost, and age — with the landlord kept in the loop."
        />
        <Ghost
          label="Inspections"
          detail="Due dates and findings per property, on a rolling schedule."
        />
        <Ghost
          label="Renewals radar"
          detail="Tenancies ending in the next 90 days, so renewals are a conversation, not a scramble."
          tag={<FlowTag from="REX" />}
        />
      </div>
    </>
  );
}
