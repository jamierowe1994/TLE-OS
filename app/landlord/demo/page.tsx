import LandlordDashboard from "@/components/landlord/Dashboard";
import LandlordDocuments from "@/components/LandlordDocuments";
import PropertyPhoto from "@/components/PropertyPhoto";
import rexSample from "@/lib/rex-sample.json";
import type { LandlordView } from "@/lib/landlord-view";

/**
 * THE SAMPLE. Raj Chauhan, two invented properties, every figure typed in.
 *
 * Kept for walking people through what the portal will do once every
 * section is live, and drawn with the same dashboard the live home uses, so
 * what Susan decides on is what a landlord gets. The live portal at
 * /landlord shows a real landlord only what is real today.
 *
 * Raj is between the visit and the terms here - the moment James asked to
 * design for: figure in, presentation sent, terms to sign, documents to
 * send. The photograph is deliberately absent, as it is before take-on, so
 * the Street View stand-in is what shows on the live site.
 */

type Listing = { id: string; name: string; locality: string; rent: number | null; image: string | null };
const LISTINGS = rexSample.listings as Listing[];
const img = (name: string) => LISTINGS.find((l) => l.name.includes(name))?.image ?? null;

const RAJ: LandlordView = {
  greeting: "Hello, Raj",
  intro: "Your property, where it is on the way to being let, and everything we hold on it.",
  next: { label: "Read and sign your terms", hint: "Rent collection at 8%, £300 set-up. Two minutes.", href: "#", external: true },
  property: {
    address: "8 Recreation Terrace, Nottingham",
    postcode: "NG2 3AB",
    image: null,
    lat: 52.9548,
    lng: -1.1581,
    subtitle: "Valued 12 May 2026 by Sam Whitaker",
    state: "Being valued",
  },
  beats: ["Visit", "Valuation", "Presentation", "Terms", "Ready", "Market", "Let"],
  at: 3,
  status: "Your figure and your presentation are here. The terms of business are next.",
  actions: [
    { label: "View presentation", hint: "Post-appraisal", href: "#", icon: "doc", tone: "dark", external: true },
    { label: "Sign terms", hint: "Ready to sign", href: "#", icon: "file-contract", tone: "dark", external: true },
    { label: "What we need", hint: "3 things", href: "#ready", icon: "shield", tone: "light" },
  ],
  needs: [
    { title: "Photo ID", sub: "Verified", done: true },
    { title: "Proof you own the property", sub: "A title register or mortgage statement does it", done: false },
    { title: "Gas safety certificate (CP12)", sub: "Annual, if there is any gas appliance", done: false },
    { title: "Electrical safety report (EICR)", sub: "Every five years", done: false },
    { title: "Energy performance certificate (EPC)", sub: "We have one on record from 2023", done: true },
  ],
  valuation: {
    figure: "£850",
    unit: "a month",
    caption: "Agreed at the visit",
    lines: [
      ["Service", "Rent collection"],
      ["Fee", "8% of rent"],
      ["Set-up", "£300"],
    ],
  },
  deck: { title: "Post-appraisal", sub: "Sam Whitaker · 12 May", href: "#", image: img("Recreation") },
  agent: {
    name: "Sam Whitaker",
    title: "Property Expert, Nottingham",
    phone: "07000 000000",
    email: "sam@thelettingexperts.co.uk",
    photo: null,
    bio: "Sam has let homes across Nottingham for nine years and looks after every property personally, from the first visit to the day the tenant moves in. If something needs doing, Sam is the person who does it.",
  },
};

export default function LandlordDemo() {
  return (
    <div className="py-3">
      <div className="fade-up mb-4 px-1">
        <h1 className="text-[28px] leading-tight">{RAJ.greeting}</h1>
        <p className="mt-1 text-[13.5px] text-muted">{RAJ.intro}</p>
      </div>

      <LandlordDashboard
        view={RAJ}
        documents={
          <LandlordDocuments
            accountId="raj-chauhan"
            wanted={["Proof you own the property", "Gas safety certificate (CP12)", "Electrical safety report (EICR)"]}
          />
        }
      />

      {/* The one we already look after, underneath. */}
      <section className="mt-3" data-search>
        <h2 className="px-1 text-[20px]">Already looked after</h2>
        <div className="mt-3 flex flex-wrap items-center gap-4 rounded-[20px] bg-white p-4 [&>div]:min-w-[55%]">
          <PropertyPhoto src={img("Walesby")} className="h-16 w-24 shrink-0 rounded-xl object-cover" />
          <div className="min-w-0 flex-1">
            <h3 className="text-[17px]">183 Walesby Lane, New Ollerton</h3>
            <p className="text-[12px] text-muted">Tenanted · £750 a month · Fully managed · Dean Halliwell, in since March 2024</p>
          </div>
          <span className="rounded-full bg-[#f3f3f1] px-3 py-1 text-[11px] font-semibold text-muted">All in order</span>
        </div>
      </section>
    </div>
  );
}
