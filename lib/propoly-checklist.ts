/**
 * What to do in Propoly once a let has gone over (James, 8 Nov 2026: "a
 * checklist of things that they need to click ... tenant referencing,
 * confirm furnished or not furnished ... as a little downloadable PDF").
 *
 * Shown on the "It's in Propoly" screen with Open in Propoly beside it, and
 * printed as a one-page PDF. Edit this list as Propoly changes - it is the
 * only copy.
 */
export const PROPOLY_CHECKLIST: { id: string; label: string; detail: string }[] = [
  { id: "tenants", label: "Check every tenant", detail: "Names, emails and mobiles match the application. Propoly emails them from here." },
  { id: "furnished", label: "Confirm furnished or unfurnished", detail: "It goes into the tenancy agreement, so pick the right one." },
  { id: "figures", label: "Check the rent, move-in date and term", detail: "Propoly builds the agreement from these." },
  { id: "holding", label: "Check the holding fee", detail: "One week's rent. In Scotland, or on a tenant swap, set it to not required." },
  { id: "deposit", label: "Check the deposit", detail: "The amount and the scheme, or Flatfair if the tenant chose zero deposit." },
  { id: "referencing", label: "Start tenant referencing", detail: "For every tenant, and any guarantor." },
  { id: "push", label: "Push the deal on in Propoly", detail: "Once the above is right, move the deal on so the pre-tenancy team can pick it up." },
];
