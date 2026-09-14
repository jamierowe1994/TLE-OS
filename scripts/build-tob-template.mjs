#!/usr/bin/env node
/**
 * Build the DocuSeal template for the landlord Terms of Business.
 *
 * A SCRIPT, NOT A SESSION IN THE DOCUSEAL UI. Sixteen fields placed by hand on
 * a twelve-page PDF is an afternoon, and it is an afternoon again the next time
 * the document changes - which it already has once this week. This puts the
 * field map in the repo next to the code that fills it, so a new contract is
 * one command and a diff, and so "where did this box come from" has an answer.
 *
 *   node scripts/build-tob-template.mjs --pdf "~/Desktop/TLE_England_TOB_Sep 26-2.pdf.pdf"
 *   node scripts/build-tob-template.mjs --pdf <file> --name "TOB England Oct 26"
 *
 * Needs DOCUSEAL_API_KEY (and DOCUSEAL_URL, defaulting to the EU cloud). Run it
 * through `railway run --service TLE-OS` to borrow production's key rather than
 * keeping one on the laptop. It PRINTS the new template id; it does not write
 * it anywhere. Setting DOCUSEAL_TOB_TEMPLATE_ID is James's, on Railway, when he
 * has looked at the result.
 *
 * ── The coordinate system ─────────────────────────────────────────────────
 *
 * DocuSeal areas are fractions of the page, from the TOP LEFT, and `page` is
 * ONE-BASED - page 2 of the document is `page: 2`. Assumed zero-based on the
 * first build and every field landed one page early, with the whole Agreement
 * Details table printed over the cover photograph. It looks entirely correct
 * in the API's response, which is why it is written down here.
 * The constants
 * below are in PDF points measured off the real document (A4, 595.5 x 842.25)
 * and converted once, at the bottom, so the numbers here can be checked
 * against the document with any PDF tool rather than trusted.
 *
 * Measured with `pdftotext -bbox-layout` for the labels and pypdf for the drawn
 * rectangles. The two disagree about the origin - pdftotext counts from the
 * top, the PDF from the bottom - so every rectangle is converted on the way in
 * (see `fromBottom`). Getting that backwards puts the landlord's signature in
 * the agent's box, which looks fine in a list of coordinates and is obvious the
 * moment you look at the page.
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";

const PAGE_W = 595.5;
const PAGE_H = 842.25;
/** The PDF's mediabox runs 7.83 → 850.08, so a rect's top edge in page space. */
const fromBottom = (y, h) => 850.08 - (y + h);

const arg = (flag, fallback = null) => {
  const i = process.argv.indexOf(flag);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const expand = (p) => (p.startsWith("~") ? p.replace("~", homedir()) : p);

/* ── page 2: Agreement Details ────────────────────────────────────────────
   Ten rows. The y figures are each label's own top, read off the document;
   the value column runs from the table's divider to its right edge. Every one
   is filled by the OS before the landlord ever sees it, so they are readonly:
   a contract whose fee the signer can retype is not a contract. */
const DETAIL_X = 272;                 // left edge of the value column
const DETAIL_W = 595.5 - 272 - 51.4;  // to the table's right edge
const ROW_H = 17;
const DETAILS = [
  ["Partner Agent", 118.2],
  ["Landlord", 138.5],
  ["Landlord Address", 158.7],
  ["Contact Number", 179.0],
  ["Email Address", 199.3],
  ["Property Address", 219.5],
  ["Service Level", 239.8],
  ["Set-Up / Tenant Find Fee", 293.4],
  ["Management / Rent Collection Fee", 322.0],
  ["Additional Fees Agreed", 347.8],
];

/* ── page 12: the signatures ──────────────────────────────────────────────
   Three blocks down the page, and the order on the page is NOT the order they
   are signed in. James, 14 Sep 2026: "we would get the agent to sign before it
   goes off. When they're prepared to send it off, they'll then sign it, date
   and time it, and send it back to us." So the agent is submitter one even
   though their block is second.

   The fourth block - Schedule 1, the model cancellation form - is deliberately
   NOT here. It is a form the landlord downloads and returns if they ever want
   to cancel, so making it a field would ask every landlord to fill in a
   cancellation notice on the way in. */
const NAME_X = 83.9, NAME_W = 170;
const SIG = { x: 405.3, w: 140.8, h: 60.8 };

const LANDLORD_SIG_TOP = fromBottom(509.4, SIG.h); // 279.9
const AGENT_SIG_TOP = fromBottom(403.3, SIG.h);    // 386.0

const fields = [
  ...DETAILS.map(([name, y]) => ({
    name,
    role: "Agent",
    type: "text",
    readonly: true,
    required: true,
    areas: [{ page: 2, x: DETAIL_X, y: y - 3, w: DETAIL_W, h: ROW_H }],
  })),

  /* The agent's block. SECOND on the page and FIRST in the signing order -
     James, 14 Sep: "we would get the agent to sign before it goes off." */
  { name: "Agent Signature", role: "Agent", type: "signature", required: true,
    areas: [{ page: 12, x: SIG.x, y: AGENT_SIG_TOP, w: SIG.w, h: SIG.h }] },
  { name: "Agent Signed Name", role: "Agent", type: "text", required: true,
    areas: [{ page: 12, x: NAME_X, y: 394, w: NAME_W, h: 15 }] },
  { name: "Agent Signed Date", role: "Agent", type: "date", required: true,
    areas: [{ page: 12, x: NAME_X, y: 414, w: NAME_W, h: 15 }] },

  /* The landlord's block, first on the page and signed last. */
  { name: "Landlord Signature", role: "Landlord", type: "signature", required: true,
    areas: [{ page: 12, x: SIG.x, y: LANDLORD_SIG_TOP, w: SIG.w, h: SIG.h }] },
  { name: "Landlord Signed Name", role: "Landlord", type: "text", required: true,
    areas: [{ page: 12, x: NAME_X, y: 288, w: NAME_W, h: 15 }] },
  /* Dated, because the fourteen-day cancellation period in clause 29 is
     counted from it. */
  { name: "Landlord Signed Date", role: "Landlord", type: "date", required: true,
    areas: [{ page: 12, x: NAME_X, y: 308, w: NAME_W, h: 15 }] },

  /* ── The waiver, and it is the commercially load-bearing one ──────────
     "Express Request to Begin Services During Cooling-Off Period". Without it
     nothing may be marketed until the fourteen days in clause 29 have run.
     Its own signature, on purpose: it is a separate consent and the document
     treats it as one, so it must be possible to sign the contract and not this
     - which is why it is required: false and the OS asks about it out loud. */
  { name: "Cooling-Off Waiver Signature", role: "Landlord", type: "signature", required: false,
    areas: [{ page: 12, x: 175, y: 529, w: 345, h: 18 }] },
  { name: "Cooling-Off Waiver Date", role: "Landlord", type: "date", required: false,
    areas: [{ page: 12, x: 175, y: 541, w: 345, h: 15 }] },
];

/** Points → the fractions DocuSeal wants, once, at the end. */
const toFractions = (f) => ({
  ...f,
  areas: f.areas.map((a) => ({
    page: a.page,
    x: +(a.x / PAGE_W).toFixed(6),
    y: +(a.y / PAGE_H).toFixed(6),
    w: +(a.w / PAGE_W).toFixed(6),
    h: +(a.h / PAGE_H).toFixed(6),
  })),
});

const pdfPath = expand(arg("--pdf", "~/Desktop/TLE_England_TOB_Sep 26-2.pdf.pdf"));
const name = arg("--name", "TLE Terms of Business — England, Sep 26");
const key = process.env.DOCUSEAL_API_KEY;
const base = (process.env.DOCUSEAL_URL ?? "https://api.docuseal.eu").replace(/\/+$/, "");
if (!key) {
  console.error("DOCUSEAL_API_KEY is not set. Try: railway run --service TLE-OS -- node scripts/build-tob-template.mjs");
  process.exit(1);
}

const file = readFileSync(pdfPath);
console.log(`${pdfPath}\n  ${(file.length / 1e6).toFixed(1)}MB, ${fields.length} fields, roles: Agent then Landlord`);

const res = await fetch(`${base}/templates/pdf`, {
  method: "POST",
  headers: { "X-Auth-Token": key, "content-type": "application/json" },
  body: JSON.stringify({
    name,
    documents: [{ name: "Landlord Agency Agreement and Terms of Business", file: file.toString("base64"), fields: fields.map(toFractions) }],
  }),
});
const body = await res.json().catch(() => ({}));
if (!res.ok) {
  console.error("DocuSeal refused it:", res.status, JSON.stringify(body).slice(0, 600));
  process.exit(1);
}
console.log(`\ntemplate ${body.id}  ${body.name}`);
console.log(`  ${body.fields?.length ?? 0} fields, submitters: ${(body.submitters ?? []).map((s) => s.name).join(" then ")}`);
console.log(`\nLook at it: ${base.replace("api.", "")}/templates/${body.id}`);
console.log("Then set DOCUSEAL_TOB_TEMPLATE_ID on Railway. Nothing here does that for you.");
