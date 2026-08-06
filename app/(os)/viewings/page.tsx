import { Card, FlowTag, Ghost, PageHead, Pill, Table } from "@/components/Wire";

export default function Viewings() {
  return (
    <>
      <PageHead
        title="Viewings"
        blurb="Book from a lead in two taps. The diary lives here; every booking and outcome is written back to REX against the lead and the property. (Which REX service holds appointments is still to be confirmed against the census — flagged rather than assumed.)"
      >
        <FlowTag to="REX (service TBC)" />
      </PageHead>

      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <Ghost
          label="Week diary"
          detail="The team's viewings on a calendar — drag to rebook, colour by negotiator."
          className="lg:col-span-2"
        />
        <Ghost
          label="Feedback capture"
          detail="One-tap outcome after each viewing: applying, thinking, not for them — pushed to REX and shown to the landlord."
          tag={<FlowTag to="REX" />}
        />
      </div>

      <Card title="Next up" tag={<Pill>Today &amp; tomorrow</Pill>}>
        <Table
          cols={["When", "Property", "Applicant", "With", "Outcome"]}
          rows={[
            [
              <span key="w" className="figures font-semibold">Today 15:30</span>,
              "41 Harewood Road",
              "Marcus Bell",
              "Kirstie",
              <Pill key="o">Booked</Pill>,
            ],
            [
              <span key="w" className="figures font-semibold">Today 17:00</span>,
              "Flat 2, Mercer Street",
              "Sophie Turner",
              "Kirstie",
              <Pill key="o">Booked</Pill>,
            ],
            [
              <span key="w" className="figures font-semibold">Tomorrow 10:15</span>,
              "12 Elm Gardens",
              "Priya Shah",
              "Michael",
              <Pill key="o" tone="accent">Confirm</Pill>,
            ],
          ]}
        />
        <p className="mt-3 text-[11px] text-muted">Demo rows.</p>
      </Card>
    </>
  );
}
