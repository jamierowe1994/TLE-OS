import { createAppraisal } from "@/lib/appraisal-store";
import type { MarketAppraisal } from "@/lib/market-appraisal";

/**
 * A market appraisal that exists so a test can be run through to the end.
 *
 * James, 3 Sep: "link it up to a fake account or fake some seed data. That
 * will allow me to click the record button... and run through the flow with
 * me up until the point of attaching it into an actual file."
 *
 * So the test copy of the video nudge does not link to a made-up id. It
 * links here: one appraisal, always five days out, in the name of whoever
 * pressed the button so the nudge addresses them. It sits in Market
 * Appraisals like any other, labelled as the demo so nobody rings Raj, and
 * every "send it to myself" re-dates it rather than making another.
 *
 * The deck, the recorder and the webhook all run against it for real: the
 * pre-appraisal deck is minted from this page, the welcome video records
 * into that deck, and Flow's recording.ready lands on it the same way it
 * would for a landlord.
 */

export const DEMO_APPRAISAL_LEAD = "demo-video";

export async function ensureDemoAppraisal(me: { name: string; email: string }): Promise<MarketAppraisal> {
  const visit = new Date();
  visit.setDate(visit.getDate() + 5);
  visit.setHours(14, 0, 0, 0);
  return createAppraisal({
    leadId: DEMO_APPRAISAL_LEAD,
    landlord: "Raj Patel (demo)",
    address: "12 Dover Close, Northampton NN5 4WJ",
    postcode: "NN5 4WJ",
    agent: me.name || me.email,
    appointmentAt: visit.toISOString(),
  });
}
