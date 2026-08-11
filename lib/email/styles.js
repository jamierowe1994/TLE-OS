/** House style for the 28 automated emails.
 *
 *  Those emails are hand-built HTML in the Worker rather than Email Studio
 *  templates, so their look used to be changeable only by editing code — every
 *  "the headings look wrong" became a deploy. This module is the single source
 *  of truth for that look, shared by the Worker (which sends) and the admin
 *  style editor (which previews), so the two cannot drift apart.
 *
 *  Two mechanisms, because the emails are written two different ways:
 *
 *  1. `emailStyleStrings()` builds the four shared style strings the Worker
 *     interpolates (heading / paragraph / quote / button).
 *  2. `styleEmailContent()` rewrites the ~124 style declarations written inline
 *     across the individual emails. Those sit inside multi-line template
 *     literals and cannot reliably be turned into variables one at a time, so
 *     the HTML is authored against the DEFAULTS below and rewritten once built.
 *
 *  The consequence worth knowing: the defaults are not just fallbacks, they are
 *  the values the HTML is written against. Changing a default without changing
 *  the HTML would stop that rewrite matching.
 */

export const EMAIL_STYLE_DEFAULTS = {
  font: 'Verdana,Geneva,sans-serif',
  dark: '#371e28',
  light: '#f4f2f1',
  headingSize: 24, headingWeight: 400, headingTracking: 0, headingLine: 1.6, headingGap: 14,
  bodySize: 12, bodyLine: 1.6, bodyGap: 14,
  smallSize: 10, smallColor: '#8a8796', smallGap: 18,
  buttonSize: 12, buttonWeight: 700, buttonRadius: 8, buttonPadY: 13, buttonPadX: 26,
  buttonBg: '#371e28', buttonColor: '#f4f2f1',
  quoteEnabled: true, quoteBg: '#f4f2f1', quoteBorderColor: '#371e28',
  quoteBorderWidth: 3, quoteRadius: 10, quotePadY: 14, quotePadX: 16, quoteLine: 1.6,
  // Negative pulls the quote box wider than the column it sits in, up to
  // full-bleed against the branded base's own inset.
  quoteMarginX: 0,
  // The email's content column. padX is inside the branded base's padding, so
  // it insets further rather than replacing it.
  contentWidth: 560, contentPadX: 0,
  ruleWidth: 1, ruleGap: 20,
};

/** The font choices offered in the editor. Email-safe stacks only — a webfont
 *  can't be relied on in Outlook, so this stays a short list of system faces. */
export const EMAIL_FONT_STACKS = [
  // No spaces after the commas: these must match the stacks written into the
  // email HTML byte for byte, or the rewrite silently matches nothing.
  { key: 'Verdana,Geneva,sans-serif', label: 'Verdana' },
  { key: 'Arial,Helvetica,sans-serif', label: 'Arial' },
  { key: 'Tahoma,Segoe,sans-serif', label: 'Tahoma' },
  { key: 'Trebuchet MS,Helvetica,sans-serif', label: 'Trebuchet MS' },
  { key: 'Georgia,Times New Roman,serif', label: 'Georgia' },
  { key: 'Times New Roman,Times,serif', label: 'Times New Roman' },
];

export function mergeEmailStyles(s) { return { ...EMAIL_STYLE_DEFAULTS, ...(s || {}) }; }

/** The four style strings the Worker interpolates into its email HTML. */
export function emailStyleStrings(input) {
  const s = mergeEmailStyles(input);
  const h1 = `font-family:${s.font};font-size:${s.headingSize}px;line-height:${s.headingLine};letter-spacing:${s.headingTracking}px;font-weight:${s.headingWeight};color:${s.dark};margin:0 0 ${s.headingGap}px;`;
  const p = `font-family:${s.font};font-size:${s.bodySize}px;line-height:${s.bodyLine};color:${s.dark};margin:0 0 ${s.bodyGap}px;`;
  // Quote box off = a plain paragraph, so switching it off doesn't leave an
  // empty bordered container behind.
  const quote = s.quoteEnabled === false
    ? `font-family:${s.font};font-size:${s.bodySize}px;line-height:${s.quoteLine};color:${s.dark};margin:0 ${s.quoteMarginX}px ${s.bodyGap}px ${s.quoteMarginX}px;`
    : `background:${s.quoteBg};border-left:${s.quoteBorderWidth}px solid ${s.quoteBorderColor};border-radius:${s.quoteRadius}px;padding:${s.quotePadY}px ${s.quotePadX}px;font-family:${s.font};font-size:${s.bodySize}px;line-height:${s.quoteLine};color:${s.dark};margin:0 ${s.quoteMarginX}px ${s.bodyGap}px ${s.quoteMarginX}px;`;
  const btn = `display:inline-block;background:${s.buttonBg};color:${s.buttonColor};text-decoration:none;font-family:${s.font};font-size:${s.buttonSize}px;line-height:${s.bodyLine};font-weight:${s.buttonWeight};padding:${s.buttonPadY}px ${s.buttonPadX}px;border-radius:${s.buttonRadius}px;`;
  // A full-width divider. font-size/line-height 0 stop Outlook adding a text
  // line's worth of height inside an otherwise empty element.
  const rule = `border:0;border-top:${s.ruleWidth}px solid ${s.dark};margin:${s.ruleGap}px 0;font-size:0;line-height:0;height:0;`;
  // Outlook-safe buttons put the background on a <td> and leave the <a>
  // transparent. Same button in every other respect, so size, weight, padding
  // and radius still follow the settings.
  const btnBare = btn.replace(`background:${s.buttonBg};`, '');
  // Same panel, but preserving the line breaks someone typed. Only for quoting
  // a person's own message back to them — on a details panel it would render
  // the source indentation between rows as blank lines, which reads as wildly
  // loose leading that no line-height setting can fix.
  const quoteText = quote + 'white-space:pre-wrap;';
  // Carries the body size and leading too, so any text dropped straight into an
  // email without a <p> around it still matches. Without it such text inherits
  // the mail client's default - usually 16px - and reads as a different email.
  const wrap = `font-family:${s.font};font-size:${s.bodySize}px;line-height:${s.bodyLine};max-width:${s.contentWidth}px;margin:0 auto;padding:0 ${s.contentPadX}px;color:${s.dark};`;
  const small = `font-family:${s.font};font-size:${s.smallSize}px;line-height:${s.bodyLine};color:${s.smallColor};margin:${s.smallGap}px 0 0;`;
  return { h1, p, quote, quoteText, btn, btnBare, small, wrap, rule, font: s.font, dark: s.dark, light: s.light };
}

/** Rewrite already-built email HTML from the canonical defaults to the chosen
 *  styles. Heading size is swapped before body size on purpose: if body were
 *  set to the default heading size, doing body first would create matches the
 *  heading pass then swept up again. */
export function styleEmailContent(html, input) {
  if (!html) return html;
  const s = mergeEmailStyles(input);
  const d = EMAIL_STYLE_DEFAULTS;
  const ds = emailStyleStrings(d), ss = emailStyleStrings(s);
  const swaps = [
    // The four shared strings go first and whole: they carry properties (weight,
    // tracking, padding, the quote box's borders) that no per-property swap
    // below would catch. Doing it this way means the Worker can build every
    // email against the defaults and never hold mutable style state — so an
    // admin previewing unsaved changes cannot bleed into a live send.
    [ds.h1, ss.h1], [ds.p, ss.p], [ds.quote, ss.quote], [ds.btn, ss.btn], [ds.small, ss.small], [ds.wrap, ss.wrap], [ds.quoteText, ss.quoteText], [ds.btnBare, ss.btnBare], [ds.rule, ss.rule],
    [`font-family:${d.font}`, `font-family:${s.font}`],
    [`font-size:${d.headingSize}px`, `font-size:${s.headingSize}px`],
    [`font-size:${d.bodySize}px`, `font-size:${s.bodySize}px`],
    [`font-size:${d.smallSize}px`, `font-size:${s.smallSize}px`],
    [d.dark, s.dark],
    [d.light, s.light],
  ];
  let out = String(html);
  for (const [from, to] of swaps) if (from !== to) out = out.split(from).join(to);
  return out;
}
