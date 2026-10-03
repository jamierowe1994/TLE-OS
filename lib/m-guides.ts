/**
 * GUIDES for the agents' app (James, 3 Oct 2026): "guides on the most recent
 * legislation ... less gobbledygook and more plain English", laid out big and
 * bold like his Fieldfolk reference - a headline, the numbers that matter, the
 * things to do, the dates, and what it means for us.
 *
 * Each guide is OUR plain-English write-up of a published piece, credited and
 * linked at the foot - never the article itself. Facts only as the source
 * gives them; no figure here that the source does not. Not tax or legal
 * advice, and every guide says so.
 *
 * A new guide is one more object in GUIDES, newest first.
 */

export interface Guide {
  slug: string;
  /** Small coral label: "Tax", "Safety", "Renters' Rights". */
  topic: string;
  /** Two lines: the first in coral, the second in ink. */
  title: [string, string];
  /** One line for the list. */
  summary: string;
  /** The opening paragraph. */
  intro: string;
  /** ISO day the source was published. */
  published: string;
  minutes: number;
  /** A picture from public/illustrations/app. */
  image: string;
  numbers: Array<{ big: string; plus?: boolean; label: string }>;
  steps: Array<{ title: string; body: string; tell?: string }>;
  dates: Array<{ when: string; what: string }>;
  forUs: string[];
  source: { name: string; url: string; by: string };
}

export const GUIDES: Guide[] = [
  {
    slug: "making-tax-digital",
    topic: "Tax",
    title: ["Making Tax Digital", "What Landlords Must Do"],
    summary: "Who is in, the next deadline, and why nothing is lost yet.",
    intro:
      "Landlords earning over £50,000 from property now have to send HMRC their figures every three months, through software, instead of once a year. Lots of them missed the first one. Here is what it all means, minus the jargon.",
    published: "2026-09-26",
    minutes: 3,
    image: "/illustrations/app/home-terrace.webp",
    numbers: [
      { big: "£50K", plus: true, label: "Property income that puts a landlord in now (based on 2024-25)" },
      { big: "294K", label: "Landlords who missed the first update in August" },
      { big: "4", label: "Updates a year to HMRC, one every quarter" },
      { big: "£0", label: "Penalty for a missed update this tax year" },
    ],
    steps: [
      {
        title: "Get signed up",
        body: "If their property income was over £50,000 in 2024-25, they should already be in. HMRC has started signing up the ones who haven't, so it is better to do it themselves than wait.",
        tell: "Over £50K a year in rent? You should already be signed up for Making Tax Digital.",
      },
      {
        title: "Don't panic about a missed update",
        body: "There are no penalties for missed quarterly updates in this tax year (2026-27). Nobody needs to go back and fix a missed one either - each update covers everything so far, so it simply rolls into the next.",
        tell: "Missed August? No fine this year. Just make sure the November one goes in.",
      },
      {
        title: "Get the right software",
        body: "HMRC doesn't supply any. 'Bridging' software can send figures from a spreadsheet they already keep. It is worth trying a couple before choosing. If an accountant does it for them, the accountant has to be given permission in the software.",
        tell: "HMRC doesn't give you the software - your accountant can point you to one.",
      },
      {
        title: "Look at the figures every quarter",
        body: "The system is built around keeping on top of things through the year, not a mad rush in January. This penalty-free year is the easiest time to get into the habit.",
      },
      {
        title: "Get ready for it to tighten",
        body: "From April 2027 penalties start, on a points system, and the line drops to £30,000 of income. By 2028 it drops again to £20,000. Far more of our landlords will be in by then.",
        tell: "Earning over £30K from rent? This is coming for you in April 2027.",
      },
    ],
    dates: [
      { when: "6 Apr 2026", what: "Over £50K of property income: Making Tax Digital starts" },
      { when: "7 Aug 2026", what: "First quarterly update was due" },
      { when: "7 Nov 2026", what: "Next update due - everything from 6 April to 5 October" },
      { when: "Apr 2027", what: "Penalties begin; the line drops to £30K" },
      { when: "2028", what: "The line drops again, to £20K" },
    ],
    forUs: [
      "Expect questions - especially from landlords near £30K, who come in next April.",
      "Their rent statements from us are the figures they need each quarter. Point them there.",
      "We don't give tax advice. Send anyone unsure to their accountant.",
    ],
    source: {
      name: "Landlord Today",
      url: "https://www.landlordtoday.co.uk/features/2026/09/making-tax-digital-five-things-landlords-need-to-do/",
      by: "Vicks Rodwell, IPSE",
    },
  },
];

export const guideBySlug = (slug: string) => GUIDES.find((g) => g.slug === slug) ?? null;
