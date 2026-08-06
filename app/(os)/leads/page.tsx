import { Card, FlowTag, Ghost, PageHead, Pill, Table } from "@/components/Wire";

/**
 * Leads land in REX from the portals; the OS pulls them into one inbox and
 * pushes every action (contacted, booked, dead) straight back, so REX stays
 * the record while nobody has to work inside it.
 */
export default function Leads() {
  return (
    <>
      <PageHead
        title="Leads"
        blurb="Every enquiry from every channel in one inbox. Rightmove and Zoopla land in REX; social campaigns land in GoHighLevel — the OS reads both the moment they arrive and writes every action back."
      >
        <FlowTag from="portals → REX · social → GHL" to="REX" />
      </PageHead>

      <Card title="Inbox" tag={<Pill tone="accent">3 uncontacted</Pill>}>
        <Table
          cols={["Lead", "Property", "Source", "Arrived", "Status"]}
          rows={[
            [
              <span key="n" className="font-semibold">Sophie Turner</span>,
              "41 Harewood Road",
              "Rightmove",
              "18 min ago",
              <Pill key="s" tone="accent">Uncontacted</Pill>,
            ],
            [
              <span key="n" className="font-semibold">Daniel Okafor</span>,
              "Flat 2, Mercer Street",
              "Zoopla",
              "1 hr ago",
              <Pill key="s" tone="accent">Uncontacted</Pill>,
            ],
            [
              <span key="n" className="font-semibold">Priya Shah</span>,
              "12 Elm Gardens",
              "Rightmove",
              "3 hrs ago",
              <Pill key="s">Contacted</Pill>,
            ],
            [
              <span key="n" className="font-semibold">Marcus Bell</span>,
              "7 Station Approach",
              "OnTheMarket",
              "Yesterday",
              <Pill key="s" tone="good">Viewing booked</Pill>,
            ],
            [
              <span key="n" className="font-semibold">Chloe Adams</span>,
              "Landlord enquiry — 3-bed, Coventry",
              "Facebook ad",
              "2 hrs ago",
              <Pill key="s" tone="accent">Uncontacted</Pill>,
            ],
            [
              <span key="n" className="font-semibold">Ryan Whitfield</span>,
              "Valuation request",
              "Instagram ad",
              "Yesterday",
              <Pill key="s">Contacted</Pill>,
            ],
          ]}
        />
        <p className="mt-3 text-[11px] text-muted">
          Demo rows — the live inbox reads REX&apos;s lead feed and updates as they land.
        </p>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Ghost
          label="Speed-to-lead"
          detail="Average time from enquiry to first contact, per property and per person."
          tag={<FlowTag from="REX" />}
        />
        <Ghost
          label="One-tap actions"
          detail="Contact, book a viewing, or mark dead — each writes the status back to REX instantly."
          tag={<FlowTag to="REX" />}
        />
        <Ghost
          label="Source breakdown"
          detail="Which portal actually produces the tenants, not just the clicks."
        />
      </div>
    </>
  );
}
