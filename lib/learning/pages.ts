/**
 * The new-style screens the Systems tour can open (Tools > Learning > Systems,
 * 26 Oct 2026). Only screens drawn in the new style: James, "this is showing
 * the old website... Everything needs to be new." Each is a safe demo on the
 * invented 8 Recreation Terrace story (Raj Chauhan the landlord, Sophie Turner
 * the tenant, Sam Whitaker the agent): nothing it does is saved or sent.
 *
 *  - passport, terms-sign: our own demo pages under /learning-demo, the real
 *    components with every call answered on the page (app/learning-demo).
 *  - pre-pack, appraisal-deck: the sample routes, which skip the open log
 *    and every write when they have no token (app/present/sample/*).
 *  - landlord-file-*: the landlord file's demo at each stage
 *    (app/landlord/demo/file, sample: uploads, messages and Sign say so).
 */

export const LEARNING_PAGES = {
  passport: { label: "The Tenant Passport", src: "/learning-demo/passport", device: "phone" },
  "terms-sign": { label: "Signing the Terms", src: "/learning-demo/terms-sign", device: "desktop" },
  "pre-pack": { label: "The Pre-Appraisal Pack", src: "/present/sample/pack", device: "desktop" },
  "appraisal-deck": { label: "The Appraisal Deck", src: "/present/sample/deck", device: "desktop" },
  "landlord-file-valuation": { label: "Their File: After the Valuation", src: "/landlord/demo/file?stage=valuation", device: "desktop" },
  "landlord-file-instruction": { label: "Their File: Instructing Us", src: "/landlord/demo/file?stage=instruction", device: "desktop" },
  "landlord-file-compliance": { label: "Their File: Compliance", src: "/landlord/demo/file?stage=compliance", device: "desktop" },
  "landlord-file-marketing": { label: "Their File: On the Market", src: "/landlord/demo/file?stage=marketing", device: "desktop" },
  "landlord-file-viewings": { label: "Their File: Viewings", src: "/landlord/demo/file?stage=viewings", device: "desktop" },
  "landlord-file-let": { label: "Their File: Let Agreed", src: "/landlord/demo/file?stage=let", device: "desktop" },
  "landlord-file-managed": { label: "Their File: Managed", src: "/landlord/demo/file?stage=managed", device: "desktop" },
} as const satisfies Record<string, { label: string; src: string; device: "phone" | "desktop" }>;

export type LearningPage = keyof typeof LEARNING_PAGES;
