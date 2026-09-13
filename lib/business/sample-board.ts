/**
 * A dozen invented deals for the pre-tenancy board, for LOOKING at the board
 * when Propoly is not connected: the local preview, and nowhere else. The
 * board only reads this with ?sample=1 outside production (see the load in
 * app/(os)/pre-tenancy/page.tsx). Nothing here is written anywhere, and
 * production never imports a deal from it.
 *
 * Typed loosely on purpose: a BoardDeal carries forty fields from three
 * systems, and a sample only needs the ones the cards and chips draw.
 */

const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const ago = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

const PHOTOS = ["/brand/photo/property.jpg", "/brand/living-room.jpg", "/brand/photo/welcome.jpg", "/brand/photo/marketing.jpg", null, "/brand/photo/welcome-door.webp"];

type Loose = Record<string, unknown>;

function deal(i: number, stage: string, o: Loose): Loose {
  const names = ["Bernadine Williams", "James Crumpton", "Lauren Engley", "Michael Healy", "Kirstie Wallington", "Richard Callow", "Priya Sharma", "Sophie Green", "Daniel Richards", "Shane Yu", "Alex Thompson", "Noah Patel"];
  const addresses = ["228a Chapter Road", "67 Gill Avenue", "Room 5, 166 Gloucester Road", "16 Lord Street", "142 Queen Elizabeths Drive", "Room 5, 32 Waylen Street", "7 Wizard Way", "20 Brislington Hill", "10 Richmond Avenue", "15 Roxby Gardens", "6 Lynedoch Place Lane", "27 Mill Lane"];
  const agents = ["Dan Richards", "Emily Watson", "Sam Whitaker"];
  return {
    app: {
      id: `sample-${i}`,
      propertyName: addresses[i % addresses.length],
      locality: "Nottingham",
      image: PHOTOS[i % PHOTOS.length],
      startDate: day(3 + i * 4),
      dateReceived: ago(2 + i),
      tenants: [{ name: names[i % names.length], email: null, phone: null, isPrimary: true }],
      offer: 850 + i * 25,
      notes: null,
      conditions: null,
    },
    statusKey: stage,
    effectiveStatusKey: stage,
    agentName: agents[i % agents.length],
    agentEmail: null,
    portal: { notesCount: i % 3, lastNote: null, override: null, checklistDone: 0, checklistTotal: 8 },
    ...o,
  };
}

export const SAMPLE_BOARD = {
  configured: true,
  deals: [
    deal(0, "deal_started", { app: undefined }),
    deal(1, "holding_fee", { holdingInvoice: { amount: 196, fromDate: day(-1) }, money: { holding: { status: "received", amount: 196, on: day(-1), matchedBy: "name", tenantName: "James Crumpton", note: "" }, deposit: null } }),
    deal(2, "holding_fee", {}),
    deal(3, "referencing", {}),
    deal(4, "referencing", { portal: { notesCount: 2, lastNote: { text: "Any news on the references?", authorName: "Dan Richards", authorRole: "agent", at: ago(1) }, override: null, checklistDone: 2, checklistTotal: 8 } }),
    deal(5, "plc", { plc: { id: "p1", state: "reviewing", label: "PLC in progress", who: "Kirstie", decidedBy: null, decidedAt: null } }),
    deal(6, "plc", { plc: { id: "p2", state: "approved", label: "Ready for check", who: "Kirstie", decidedBy: null, decidedAt: null } }),
    deal(7, "deposit", { money: { holding: null, deposit: { status: "received", amount: 980, on: day(-2), matchedBy: "name", tenantName: "Sophie Green", depositId: "D1", note: "" } } }),
    deal(8, "tenancy_agreement", { tobStatus: { status: "sent", sentAt: ago(2), completedAt: null } }),
    deal(9, "rent_payment", { app: undefined, rentReceived: null }),
    deal(10, "move_day", { app: undefined }),
    deal(11, "move_day", {}),
  ].map((d, i) => {
    /* Fill the few `app: undefined` slots back in with a dated app, so a
       couple of deals read as slipped or moving in today. */
    if (d.app === undefined) {
      const base = deal(i, String(d.statusKey), {}) as Loose;
      const app = base.app as Loose;
      if (i === 0) app.startDate = day(-3);
      if (i === 9) app.startDate = day(1);
      if (i === 10) app.startDate = day(0);
      return { ...d, app };
    }
    return d;
  }),
  summary: {
    moneyCoverage: { loaded: true, months: [], withRent: 1, withSchedule: 1, total: 12 },
    pipelineTotal: 12,
    byStage: [],
    overdue: 1,
    undated: 0,
    completedMtd: 3,
    forecastByMonth: null,
  },
};
