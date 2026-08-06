import { FlowTag, Ghost, PageHead, Pill } from "@/components/Wire";

/** The pipeline from "wants it" to "keys in hand", as a board. */
const STAGES: {
  name: string;
  deals: { who: string; where: string; note?: string; flag?: boolean }[];
}[] = [
  {
    name: "Offer made",
    deals: [
      { who: "Marcus Bell", where: "7 Station Approach" },
      { who: "Amy & Jordan Cole", where: "3 Riverside Court" },
    ],
  },
  {
    name: "Referencing",
    deals: [
      { who: "Sophie Turner", where: "Flat 2, Mercer Street", note: "6 days — chase", flag: true },
      { who: "Priya Shah", where: "12 Elm Gardens" },
    ],
  },
  {
    name: "Contracts",
    deals: [{ who: "Liam Doyle", where: "88 Kelvin Way" }],
  },
  {
    name: "Move-in",
    deals: [{ who: "Hannah Price", where: "5 Orchard Close", note: "Fri 14th" }],
  },
];

export default function Applications() {
  return (
    <>
      <PageHead
        title="Applications"
        blurb="Every application on one board, offer to move-in. Stage changes are written back to REX; referencing and contracts hook in as they come online."
      >
        <FlowTag from="REX" to="REX" />
      </PageHead>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {STAGES.map((stage) => (
          <div key={stage.name} className="fade-up">
            <div className="mb-3 flex items-center justify-between px-1">
              <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted">
                {stage.name}
              </h2>
              <span className="figures text-xs font-semibold text-muted">
                {stage.deals.length}
              </span>
            </div>
            <div className="space-y-3">
              {stage.deals.map((d) => (
                <div
                  key={d.who}
                  className="rounded-2xl border border-line/60 bg-card p-4 shadow-[0_1px_2px_rgba(16,16,20,0.04)]"
                >
                  <p className="text-[13.5px] font-semibold">{d.who}</p>
                  <p className="mt-0.5 text-xs text-muted">{d.where}</p>
                  {d.note && (
                    <div className="mt-2.5">
                      <Pill tone={d.flag ? "accent" : "neutral"}>{d.note}</Pill>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Ghost
          label="Referencing integration"
          detail="Status straight from the referencing provider, so 'where's it up to?' never needs a phone call."
        />
        <Ghost
          label="Document trail"
          detail="Right to rent, contracts, deposits — collected here, filed in REX against the tenancy."
          tag={<FlowTag to="REX" />}
        />
      </div>

      <p className="mt-4 text-[11px] text-muted">Demo board — names and properties are placeholders.</p>
    </>
  );
}
