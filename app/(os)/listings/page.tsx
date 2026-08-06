import { Card, FlowTag, Ghost, PageHead, Pill, Table } from "@/components/Wire";

/**
 * The proof-of-concept page for the whole overlay: create a listing HERE,
 * push it INTO REX, and REX carries it on to Rightmove. The OS is the front
 * door; REX becomes storage and syndication.
 */
export default function Listings() {
  return (
    <>
      <PageHead
        title="Listings"
        blurb="List a property here, once. The OS pushes it into REX; REX syndicates to Rightmove and Zoopla; the enquiries flow back through the same pipe into Leads."
      >
        <span className="rounded-2xl bg-ink px-4 py-2.5 text-[13px] font-semibold text-white">
          + New listing
        </span>
      </PageHead>

      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <Ghost
          label="Create a listing"
          detail="Photos, rent, description, compliance docs — one form, written into REX as the record."
          tag={<FlowTag to="REX → Rightmove" />}
          className="lg:col-span-2"
        />
        <Ghost
          label="Syndication status"
          detail="Live / pending / rejected, per portal, read back from REX after the push."
          tag={<FlowTag from="REX" />}
        />
      </div>

      <Card title="On the market" tag={<FlowTag from="REX" />}>
        <Table
          cols={["Property", "Rent", "Listed", "Enquiries", "Status"]}
          rows={[
            [
              <span key="p" className="font-semibold">41 Harewood Road</span>,
              <span key="r" className="figures">£1,450 pcm</span>,
              "6 days ago",
              <span key="e" className="figures">23</span>,
              <Pill key="s" tone="good">Live</Pill>,
            ],
            [
              <span key="p" className="font-semibold">Flat 2, Mercer Street</span>,
              <span key="r" className="figures">£995 pcm</span>,
              "12 days ago",
              <span key="e" className="figures">41</span>,
              <Pill key="s" tone="good">Live</Pill>,
            ],
            [
              <span key="p" className="font-semibold">12 Elm Gardens</span>,
              <span key="r" className="figures">£1,750 pcm</span>,
              "2 days ago",
              <span key="e" className="figures">8</span>,
              <Pill key="s" tone="accent">Under offer</Pill>,
            ],
          ]}
        />
        <p className="mt-3 text-[11px] text-muted">
          Demo rows — the live board mirrors REX&apos;s listing records.
        </p>
      </Card>
    </>
  );
}
