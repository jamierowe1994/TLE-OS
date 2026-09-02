import LandlordDashboard from "@/components/landlord/Dashboard";
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
 */

type Listing = { id: string; name: string; locality: string; rent: number | null; image: string | null };
const LISTINGS = rexSample.listings as Listing[];
const img = (name: string) => LISTINGS.find((l) => l.name.includes(name))?.image ?? null;

const RAJ: LandlordView = {
  greeting: "Hello, Raj",
  intro: "Your property, where it is on the way to being let, and everything we hold on it.",
  property: {
    address: "8 Recreation Terrace, Nottingham",
    postcode: "NG2 3AB",
    image: img("Recreation"),
    lat: 52.9548,
    lng: -1.1581,
    subtitle: "Valued 12 May 2026 by Sam Whitaker",
    state: "Being let",
  },
  beats: ["Visit", "Valuation", "Presentation", "Terms", "Marketing", "Offers", "Let"],
  at: 5,
  status: "An offer is on the table. It's your decision, and everything you need to make it is here.",
  actions: [
    { label: "View presentation", hint: "Post-appraisal", href: "#", icon: "doc", tone: "dark", external: true },
    { label: "Sign contracts", hint: "Terms signed", href: "#", icon: "file-contract", tone: "light" },
    { label: "Compliance", hint: "1 to fix", href: "#ready", icon: "shield", tone: "dark" },
    { label: "Documents", hint: "3 filed", href: "#", icon: "folder", tone: "light" },
    { label: "Statements", hint: "August ready", href: "#", icon: "wallet", tone: "light" },
    { label: "My details", href: "/landlord/profile", icon: "user", tone: "light" },
  ],
  todos: [
    { title: "An offer is in: £850 a month", sub: "Applicant A · references 2 of 3 back · accept or ask us to negotiate", done: false, href: "#", icon: "key" },
    { title: "Proof of ownership", sub: "A title register or mortgage statement does it", done: false, href: "#ready", icon: "doc" },
    { title: "Electrical safety report (EICR)", sub: "Expired · electrician booked this week", done: false, href: "#ready", icon: "shield" },
    { title: "Terms of business", sub: "Signed 12 May 2026", done: true, icon: "file-contract" },
    { title: "Photo ID", sub: "Verified", done: true, icon: "user" },
  ],
  valuation: {
    figure: "£850",
    unit: "a month",
    caption: "Asking rent",
    lines: [
      ["Service", "Rent collection"],
      ["Fee", "8% of rent"],
      ["Set-up", "£300"],
    ],
  },
  readiness: { pct: 65, title: "Ready to let", note: "Ownership and the EICR are what's left" },
  deck: { title: "Your presentation", sub: "Post-appraisal · Sam Whitaker · 12 May", href: "#", image: img("Recreation") },
  agent: { name: "Sam Whitaker", title: "Property Expert", phone: "07000 000000", email: "sam@thelettingexperts.co.uk", photo: null },
};

export default function LandlordDemo() {
  return (
    <div className="py-3">
      <div className="fade-up mb-4 px-1">
        <h1 className="text-[28px] leading-tight">{RAJ.greeting}</h1>
        <p className="mt-1 text-[13.5px] text-muted">{RAJ.intro}</p>
      </div>

      <LandlordDashboard view={RAJ} />

      {/* The one we already look after, underneath. */}
      <section className="mt-3" id="ready" data-search>
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
