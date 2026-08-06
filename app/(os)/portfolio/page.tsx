import { FlowTag, Ghost, PageHead, Stat } from "@/components/Wire";

export default function Portfolio() {
  return (
    <>
      <PageHead
        title="Portfolio"
        blurb="The whole book in one view — every property, landlord, and tenancy the business touches, with REX as the record underneath."
      >
        <FlowTag from="REX + PayProp" />
      </PageHead>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Properties" value="568" hint="Scotland 84 · Rest of UK 484" />
        <Stat label="Occupied" value="93%" hint="tenancies in place" />
        <Stat label="Landlords" value="—" hint="from REX contact records" />
        <Stat label="Avg rent" value="—" hint="from PayProp" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Ghost
          label="Property directory"
          detail="Search and filter the whole book — every property opens into its own record: tenancy, compliance, money, history."
          tag={<FlowTag from="REX" />}
          className="min-h-48"
        />
        <Ghost
          label="Landlord directory"
          detail="Each landlord with their properties, statements and manager — the relationship view REX never gives you."
          tag={<FlowTag from="REX + PayProp" />}
          className="min-h-48"
        />
      </div>

      <div className="mt-4">
        <Ghost
          label="Map view"
          detail="The book on a map — density by area, colour by status. The view that shows Susan and Howard the shape of the business."
        />
      </div>
    </>
  );
}
