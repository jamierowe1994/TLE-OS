import type { Block, LandlordDetails, TermsDoc, TermsValues } from "@/lib/terms/types";

/**
 * The contract as the HTML DocuSeal turns into the signed document.
 *
 * Same data as the page the landlord reads (components/terms/ContractView), so
 * the two cannot say different things. DocuSeal's own tags mark where each
 * person signs: <signature-field>, <date-field>, <text-field> and
 * <checkbox-field>, each with the role of the person it belongs to. The agent
 * is "Agent"; landlords are "Landlord 1", "Landlord 2"... in the order the
 * agent listed them.
 *
 * Each landlord's details are read-only text fields, filled from what they
 * typed on our page just before they sign (lib/terms/store detailValues), so
 * the signed copy carries them without a second box to type into.
 *
 * The dates beside the signatures are read-only text too, filled with the day
 * each person opens the signing form (23 Oct 2026 test on DocuSeal testing: a
 * <date-field> made every signer type the date, and printed it American,
 * 10/23/2026; nothing documented fills it with the signing date in HTML).
 */

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Words with {{placeholders}} filled. Only <strong> and <em> survive as markup. */
export function fillText(text: string, v: TermsValues): string {
  const safe = esc(text)
    .replace(/&lt;(\/?)(strong|em)&gt;/g, "<$1$2>")
    .replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => esc(String((v as unknown as Record<string, string>)[k] ?? "")));
  return safe;
}

export const roleOf = (i: number) => `Landlord ${i + 1}`;
/** The DocuSeal field name for one landlord's detail. Stable: values are keyed on it. */
export const detailField = (i: number, key: keyof LandlordDetails) => `L${i + 1} ${key}`;

const box = (name: string, role: string, w = 260) =>
  `<text-field name="${esc(name)}" role="${esc(role)}" readonly="true" required="false" style="width:${w}px;height:16px;display:inline-block"></text-field>`;

function block(b: Block, doc: TermsDoc, v: TermsValues, people: number): string {
  switch (b.kind) {
    case "p":
      return `<p>${fillText(b.text, v)}</p>`;
    case "h":
      return `<h3>${fillText(b.text, v)}</h3>`;
    case "list":
      return `<ul>${b.items.map((i) => `<li>${fillText(i, v)}</li>`).join("")}</ul>`;
    case "facts":
      return `<table class="facts">${b.rows.map((r) => `<tr><th>${esc(r.label)}</th><td>${fillText(r.value, v)}</td></tr>`).join("")}</table>`;
    case "landlords": {
      const label = (k: keyof LandlordDetails) => doc.details.find((d) => d.key === k)?.label ?? k;
      return Array.from({ length: people }, (_, i) =>
        `<table class="facts person">${people > 1 ? `<tr><th colspan="2" class="who">Landlord ${i + 1}</th></tr>` : ""}${b.fields
          .map((k) => `<tr><th>${esc(label(k))}</th><td>${box(detailField(i, k), roleOf(i))}</td></tr>`)
          .join("")}</table>`
      ).join("");
    }
    case "fees":
      return `<table class="facts"><tr><th>Service level</th><td>${esc(v.serviceLevel)}</td></tr><tr><th>Set-up / tenant find fee</th><td>${esc(v.setUpFee)}</td></tr><tr><th>Management / rent collection fee</th><td>${esc(v.managementFee)}</td></tr><tr><th>Additional fees agreed</th><td>${esc(v.additionalFees || "None")}</td></tr></table>`;
    case "table":
      return `<table class="grid"><tr>${b.head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr>${b.rows
        .map((r) => `<tr>${r.map((c, i) => (i === 0 ? `<td class="lead">${fillText(c, v)}</td>` : `<td>${c ? fillText(c, v) : ""}</td>`)).join("")}</tr>`)
        .join("")}</table>`;
    case "signatures":
      return `<div class="signs">${Array.from({ length: people }, (_, i) => {
        const role = roleOf(i);
        return `<div class="sign"><p class="who">${people > 1 ? `Landlord ${i + 1}` : "Landlord"}</p><p>Name: ${box(detailField(i, "name"), role, 240)}</p><p>Signature:</p><signature-field name="${esc(`${role} Signature`)}" role="${esc(role)}" style="width:240px;height:70px;display:inline-block"></signature-field><p>Date: ${box(`${role} Date`, role, 140)}</p></div>`;
      }).join("")}<div class="sign"><p class="who">For The Letting Experts</p><p>Name: ${esc(v.agentName)}</p><p>Signature:</p><signature-field name="Agent Signature" role="Agent" style="width:240px;height:70px;display:inline-block"></signature-field><p>Date: ${box("Agent Date", "Agent", 140)}</p></div></div>`;
    case "waiver":
      return `<div class="waiver"><p>${fillText(b.text, v)}</p>${Array.from({ length: people }, (_, i) => {
        const role = roleOf(i);
        return `<p><checkbox-field name="${esc(`${role} Start Now`)}" role="${esc(role)}" required="false" style="width:14px;height:14px;display:inline-block"></checkbox-field> ${people > 1 ? `Landlord ${i + 1}: ` : ""}Yes, start marketing now</p>`;
      }).join("")}</div>`;
  }
}

const CSS = `
  body { font-family: Helvetica, Arial, sans-serif; font-size: 10.5pt; line-height: 1.45; color: #141413; }
  .cover { padding: 120px 0 60px; }
  .cover p.brand { font-size: 9pt; letter-spacing: 2px; text-transform: uppercase; color: #63625b; }
  .cover h1 { font-size: 26pt; line-height: 1.15; margin: 14px 0 6px; }
  .cover h2 { font-size: 16pt; font-weight: normal; color: #aa4a2b; margin: 0; }
  .cover p.ed { color: #63625b; margin-top: 18px; }
  section { margin: 0 0 18px; }
  section h2 { font-size: 13pt; margin: 22px 0 8px; }
  h3 { font-size: 11pt; margin: 14px 0 6px; }
  p { margin: 0 0 8px; }
  ul { margin: 0 0 8px 18px; padding: 0; }
  li { margin: 0 0 4px; }
  table.facts { width: 100%; border-collapse: collapse; margin: 6px 0 12px; }
  table.facts th { text-align: left; font-weight: normal; color: #63625b; width: 38%; padding: 5px 8px 5px 0; vertical-align: top; border-bottom: 1px solid #e9e9e6; }
  table.facts td { padding: 5px 0; border-bottom: 1px solid #e9e9e6; }
  table.facts th.who { color: #141413; font-weight: bold; padding-top: 10px; }
  table.grid { width: 100%; border-collapse: collapse; margin: 6px 0 12px; font-size: 9pt; }
  table.grid th, table.grid td { border: 1px solid #e9e9e6; padding: 4px 6px; text-align: center; }
  table.grid td.lead { text-align: left; }
  .signs { display: block; }
  .sign { page-break-inside: avoid; margin: 14px 0; padding: 12px 14px; border: 1px solid #d6d6d2; border-radius: 6px; }
  .sign p.who { font-weight: bold; }
  .waiver { page-break-inside: avoid; margin: 12px 0; padding: 12px 14px; background: #f7f7f6; border-radius: 6px; }
`;

/** The whole contract, ready for POST /submissions/html. */
export function contractHtml(doc: TermsDoc, v: TermsValues, people: number): string {
  const sections = doc.sections
    .map((s) => `<section><h2>${s.n ? `${esc(s.n)}. ` : ""}${esc(s.title)}</h2>${s.blocks.map((b) => block(b, doc, v, people)).join("")}</section>`)
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body><div class="cover"><p class="brand">The Letting Experts</p><h1>${esc(doc.title)}</h1><h2>${esc(doc.subtitle)}</h2><p class="ed">${esc(v.propertyAddress)}<br>${esc(doc.edition)} edition</p></div>${sections}</body></html>`;
}

export const contractFooter = (doc: TermsDoc) =>
  `<div style="font-family:Helvetica,Arial,sans-serif;font-size:8pt;color:#87867f;width:100%;padding:0 40px;display:flex;justify-content:space-between"><span>${esc(doc.title)} - ${esc(doc.subtitle)}</span><span><span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`;
