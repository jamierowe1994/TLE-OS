/**
 * TMKE email renderer — turns a saved template (a list of "blocks" + branding)
 * into self-contained, email-client-safe HTML, with mail-merge tokens resolved
 * per-recipient.
 *
 * Ported and trimmed from the Backed.CRM mass-emailer (lib/renderEmail.js +
 * lib/mailMerge.js). The recruitment-only blocks (candidate / job, which needed
 * a database round-trip) were dropped so this module is 100% pure — no imports,
 * no async, no Node APIs. That means the SAME file powers:
 *   • the live preview in the admin builder (runs in the browser), and
 *   • the actual send (re-used server-side in a later phase).
 *
 * Design rules for email HTML: inline styles only (most clients strip <style>),
 * table-based layout, no external CSS. Keep it boring and it renders everywhere.
 */

const ACCENT_DEFAULT = '#371e28'; // TMKE english-violet / plum

/* ───────────────────────── mail merge ───────────────────────── */

const TOKEN_RE = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

/**
 * render('Hi {{firstName}}', { firstName: 'Alex' }) → 'Hi Alex'
 * Tokens with a null value resolve to ''. Unknown tokens fall through unchanged
 * so they're easy to spot in a preview.
 */
export function renderTokens(input, ctx) {
  if (input == null) return '';
  const str = String(input);
  if (!ctx || typeof ctx !== 'object') return str;
  return str.replace(TOKEN_RE, (match, key) => {
    const val = lookup(ctx, key);
    if (val === undefined) return match;
    if (val === null) return '';
    return String(val);
  });
}

function lookup(obj, path) {
  const parts = path.split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

/**
 * Build the flat merge context for one recipient. Shape is intentionally flat so
 * tokens read naturally: {{firstName}}, {{email}}, {{company}}, {{senderName}}.
 */
export function mergeContextFor(recipient = {}, brand = {}) {
  const fullName = recipient.name || '';
  const [firstName, ...rest] = fullName.trim().split(/\s+/);
  const email = recipient.email || '';
  // Unsubscribe: a real URL if the caller supplies one, else a mailto opt-out
  // (works with no backend). {{unsubscribe}} is a ready-made link; {{unsubscribe_url}}
  // is the raw URL for a button/href.
  const unsubUrl = recipient.unsubscribeUrl || recipient.unsubscribe_url
    || `mailto:hello@tmke.co.uk?subject=${encodeURIComponent('Unsubscribe')}${email ? '&body=' + encodeURIComponent('Please unsubscribe: ' + email) : ''}`;
  return {
    firstName: recipient.firstName || firstName || '',
    lastName: recipient.lastName || rest.join(' ') || '',
    fullName,
    email: recipient.email || '',
    company: recipient.company || '',
    location: recipient.location || recipient.town || '',
    phone: recipient.phone || '',
    // Purchase context — populated from the contact's last order at send time
    // (the automations engine passes it in), so "Thank you for buying {{packName}}" works.
    packName: recipient.packName || recipient.pack || '',
    orderTotal: recipient.orderTotal || '',
    senderName: brand.signatureName || '',
    senderCompany: brand.companyName || '',
    // Videography new-starter funnel context (populated by the funnel send).
    bookingLink: recipient.bookingLink || '',
    code: recipient.code || '',
    shootMonth: recipient.shootMonth || '',
    trainerName: recipient.trainerName || '',
    // Unsubscribe: {{unsubscribe}} = a ready-made link; {{unsubscribe_url}} = the URL.
    unsubscribe: `<a href="${unsubUrl}" style="color:inherit;text-decoration:underline;">Unsubscribe</a>`,
    unsubscribeUrl: unsubUrl,
    unsubscribe_url: unsubUrl,
  };
}

/** Tokens offered in the builder's merge-field menu (label shown to staff). */
export const MERGE_FIELDS = [
  { token: 'firstName', label: 'First name' },
  { token: 'lastName', label: 'Last name' },
  { token: 'fullName', label: 'Full name' },
  { token: 'email', label: 'Email address' },
  { token: 'company', label: 'Brand / business' },
  { token: 'location', label: 'Location' },
  { token: 'phone', label: 'Mobile / phone' },
  { token: 'packName', label: 'Purchased pack' },
  { token: 'orderTotal', label: 'Order total' },
  { token: 'senderName', label: 'Sender name' },
  { token: 'senderCompany', label: 'Sender company' },
  // Videography new-starter funnel
  { token: 'bookingLink', label: 'Booking link' },
  { token: 'code', label: 'Unique code' },
  { token: 'shootMonth', label: 'Shoot month' },
  { token: 'trainerName', label: 'Trainer name' },
  { token: 'unsubscribe', label: 'Unsubscribe link' },
];

/** A dummy recipient so the live preview shows realistic merged values. */
export const SAMPLE_RECIPIENT = { name: 'Alex Morgan', email: 'alex@example.com', company: 'Acme Estates', location: 'Kettering', phone: '07700 900123', packName: 'The Spring Collection', orderTotal: '£149', bookingLink: 'https://tmke.co.uk/videography/new-starter?code=PRO-AM-AUG26', code: 'PRO-AM-AUG26', shootMonth: 'August 2026', trainerName: 'Kelly Bailey' };

/* ───────────────────────── branding ───────────────────────── */

/** TMKE house brand — the defaults a fresh template starts from. */
export function defaultBrand() {
  return {
    companyName: 'TMKE',
    logo: '',
    accentColor: ACCENT_DEFAULT,
    signatureName: 'The TMKE Team',
    showHeader: true,    // the auto logo header at the top of the card
    showSignoff: true,   // the auto "— The TMKE Team" sign-off at the bottom
    // Typography for the whole email. A block that sets its own value ALWAYS
    // wins — these only fill the gap where a block says nothing. So changing a
    // size here restyles everything that was left alone, and touches nothing
    // anyone deliberately set. An empty font means "the default stack".
    headingFont: '', headingSize: 28, headingColor: '#1c1d22',
    bodyFont: '', bodySize: 15, bodyColor: '#1F2937',
    buttonFont: '', buttonSize: 14, buttonRadius: 8,
    contentPad: 24,      // inset around the email content (0 = blocks go edge-to-edge)
    outerPad: 24,        // grey margin around the white card
    bgColor: '#f4f2f1',
    cardColor: '#ffffff',
    website: 'https://tmke.co.uk',
    reviewUrl: '',
    linkedin: '',
    instagram: '',
    facebook: '',
    twitter: '',
    youtube: '',
  };
}

/* ───────────────────────── block model ───────────────────────── */

/** Block palette shown in the builder. Order = order in the rail grid. */
export const BLOCK_TYPES = [
  { type: 'heading', label: 'Heading', hint: 'A big title' },
  { type: 'text', label: 'Text', hint: 'A paragraph of copy' },
  { type: 'image', label: 'Image', hint: 'A picture, optionally a link' },
  { type: 'button', label: 'Button', hint: 'A call-to-action' },
  { type: 'columns', label: 'Columns', hint: 'A multi-column row layout' },
  { type: 'divider', label: 'Divider', hint: 'A horizontal line' },
  { type: 'spacer', label: 'Spacer', hint: 'Vertical whitespace' },
  { type: 'logo', label: 'Logo', hint: 'Your brand logo' },
  { type: 'social', label: 'Social', hint: 'Social icon links' },
  { type: 'video', label: 'Video', hint: 'A clickable video thumbnail' },
  { type: 'footer', label: 'Footer', hint: 'Sign-off, address & unsubscribe' },
  { type: 'faq', label: 'FAQ', hint: 'Question & answer list' },
  { type: 'countdown', label: 'Countdown', hint: 'An offer / deadline date' },
  { type: 'reviewlink', label: 'Review link', hint: 'Ask for a review' },
  { type: 'products', label: 'Products', hint: 'A grid of packs' },
  { type: 'services', label: 'Services', hint: 'What you offer' },
  { type: 'slider', label: 'Image gallery', hint: 'A row of images' },
  { type: 'form', label: 'Form', hint: 'A prompt + button to a form' },
  { type: 'code', label: 'Custom HTML', hint: 'Paste your own HTML' },
];

/** The column splits offered in the builder. `cols` = how many cells; `w` =
 *  per-cell width %. Used by both the builder (cell count) and the renderer. */
export const COLUMN_LAYOUTS = [
  { key: 'full',     label: 'Full width',            cols: 1, w: [100] },
  { key: '50-50',    label: 'Two columns (50 / 50)', cols: 2, w: [50, 50] },
  { key: 'thirds',   label: 'Three columns (⅓ each)', cols: 3, w: [33.33, 33.33, 33.34] },
  { key: '33-67',    label: '⅓ + ⅔',                 cols: 2, w: [33.33, 66.67] },
  { key: '67-33',    label: '⅔ + ⅓',                 cols: 2, w: [66.67, 33.33] },
  { key: '25-75',    label: '¼ + ¾',                 cols: 2, w: [25, 75] },
  { key: '75-25',    label: '¾ + ¼',                 cols: 2, w: [75, 25] },
  { key: 'quarters', label: 'Four columns',          cols: 4, w: [25, 25, 25, 25] },
];

/** Email-safe font stacks — only fonts pre-installed across Outlook (Windows +
 *  Mac), Gmail, Apple Mail etc., so no web font is ever needed (they get
 *  stripped). `key` is stored on the block; `stack` is emitted as font-family. */
export const FONT_STACKS = [
  { key: 'arial',     label: 'Arial',           stack: "Arial, Helvetica, sans-serif" },
  { key: 'helvetica', label: 'Helvetica',       stack: "Helvetica, Arial, sans-serif" },
  { key: 'verdana',   label: 'Verdana',         stack: "Verdana, Geneva, sans-serif" },
  { key: 'tahoma',    label: 'Tahoma',          stack: "Tahoma, Segoe, sans-serif" },
  { key: 'trebuchet', label: 'Trebuchet MS',    stack: "'Trebuchet MS', Helvetica, sans-serif" },
  { key: 'georgia',   label: 'Georgia',         stack: "Georgia, 'Times New Roman', serif" },
  { key: 'times',     label: 'Times New Roman', stack: "'Times New Roman', Georgia, serif" },
  { key: 'courier',   label: 'Courier New',     stack: "'Courier New', Courier, monospace" },
];
function fontStack(key) { const f = FONT_STACKS.find((x) => x.key === key); return f ? f.stack : FONT_STACKS[0].stack; }
function pxNum(v, fallback) { const n = Number(v); return isFinite(n) ? Math.round(n) : fallback; }
/** pxNum, but treats null/undefined/'' as "not set" rather than as zero.
 *  Number('') is 0 and passes isFinite, so a blank field would otherwise mean
 *  0px instead of falling back — which matters now that sizes cascade. */
function sizeOr(v, fallback) { return (v == null || v === '') ? fallback : pxNum(v, fallback); }
function padStyle(pad) {
  if (!pad) return '';
  const t = pxNum(pad.t, 0), r = pxNum(pad.r, 0), b = pxNum(pad.b, 0), l = pxNum(pad.l, 0);
  if (!(t || r || b || l)) return '';
  return `padding:${t}px ${r}px ${b}px ${l}px;`;
}

/** Spacing model: `pad` = INSIDE padding (border→content); `margin` = OUTSIDE
 *  spacing (element→neighbours, rendered as padding on an outer wrapper so it's
 *  reliable in Outlook). Per-type defaults are surfaced in the inspector so a
 *  marketer sees the current values before adjusting. */
const SPACING_DEFAULTS = {
  button: { pad: { t: 11, r: 24, b: 11, l: 24 }, margin: { t: 0, r: 0, b: 16, l: 0 } },
  _default: { pad: { t: 0, r: 0, b: 0, l: 0 }, margin: { t: 0, r: 0, b: 16, l: 0 } },
};
export function spacingDefaults(type) { return SPACING_DEFAULTS[type] || SPACING_DEFAULTS._default; }
function _pick(v, d) { return (v != null && v !== '') ? pxNum(v, d) : d; }

/** Does this override object actually carry a value? Distinguishes "the user
 *  set 0" from "the user set nothing", which a truthiness check like
 *  `if (t || r || b || l)` cannot — that is why setting mobile padding to zero
 *  used to produce no rule at all and leave the desktop padding in place. */
function hasAnyValue(o) { return !!o && Object.keys(o).some((k) => o[k] != null && o[k] !== ''); }

/** Merge an override over a base, ignoring keys that carry no value.
 *  A plain spread lets an `undefined` from a cleared field overwrite the
 *  desktop value, which then falls through to the TYPE DEFAULT rather than
 *  inheriting — so "blank = inherit desktop" quietly meant the opposite. */
function mergeDefined(base, over) {
  const out = { ...(base || {}) };
  Object.keys(over || {}).forEach((k) => { if (over[k] != null && over[k] !== '') out[k] = over[k]; });
  return out;
}
export function resolvePad(block) { const d = spacingDefaults(block.type).pad, p = block.pad || {}; return { t: _pick(p.t, d.t), r: _pick(p.r, d.r), b: _pick(p.b, d.b), l: _pick(p.l, d.l) }; }
export function resolveMargin(block) { const d = spacingDefaults(block.type).margin, m = block.margin || {}; return { t: _pick(m.t, d.t), r: _pick(m.r, d.r), b: _pick(m.b, d.b), l: _pick(m.l, d.l) }; }
function padStyleResolved(block) { const p = resolvePad(block); return (p.t || p.r || p.b || p.l) ? `padding:${p.t}px ${p.r}px ${p.b}px ${p.l}px;` : ''; }

/** Inline style for a heading block — shared by the renderer AND the editor's
 *  canvas so what you see is what sends. */
export function headingInlineStyle(block = {}, brand = {}) {
  const align = ['left', 'center', 'right', 'justify'].includes(block.align) ? block.align : 'left';
  const size = sizeOr(block.size, sizeOr(brand.headingSize, 28));
  const lh = Number(block.lineHeight) || 1.15;
  const weight = block.bold === false ? 400 : 800;
  const parts = [
    'margin:0', `font-family:${fontStack(block.font || brand.headingFont)}`, `font-size:${size}px`,
    `line-height:${lh}`, `font-weight:${weight}`,
    `color:${escapeHtml(block.color || brand.headingColor || '#1c1d22')}`,
    `text-align:${align}`,
  ];
  if (block.letterSpacing != null && block.letterSpacing !== '') parts.push(`letter-spacing:${Number(block.letterSpacing)}px`);
  else parts.push('letter-spacing:-0.01em');
  if (block.italic) parts.push('font-style:italic');
  if (block.underline) parts.push('text-decoration:underline');
  return parts.join(';') + ';' + padStyleResolved(block);
}

/** Inline style for a text block's wrapper (font/size/spacing/colour/align/
 *  padding + optional background tint). Shared by renderer + canvas. */
export function textInlineStyle(block = {}, brand = {}) {
  const align = ['left', 'center', 'right', 'justify'].includes(block.align) ? block.align : 'left';
  const size = sizeOr(block.size, sizeOr(brand.bodySize, 15));
  const lh = Number(block.lineHeight) || 1.6;
  const parts = [
    `font-family:${fontStack(block.font || brand.bodyFont)}`, `font-size:${size}px`, `line-height:${lh}`,
    `color:${escapeHtml(block.color || brand.bodyColor || '#1F2937')}`, `text-align:${align}`,
  ];
  if (block.letterSpacing != null && block.letterSpacing !== '') parts.push(`letter-spacing:${Number(block.letterSpacing)}px`);
  if (block.bold) parts.push('font-weight:700');
  if (block.italic) parts.push('font-style:italic');
  if (block.underline) parts.push('text-decoration:underline');
  let style = parts.join(';') + ';';
  const pad = padStyleResolved(block);
  if (block.bg || block.bgImage) {
    style += (block.bg ? `background-color:${escapeHtml(block.bg)};` : '')
      + (block.bgImage ? `background-image:url('${escapeHtml(block.bgImage)}');background-size:cover;background-position:center center;background-repeat:no-repeat;` : '')
      + 'border-radius:8px;' + (pad || 'padding:14px 18px;');
  } else style += pad;
  return style;
}

/** Inline style for a button's <a> — shared by renderer + canvas. Background =
 *  block.color (falls back to brand accent); text = block.textColor. */
export function buttonInlineStyle(block = {}, brand = {}) {
  const bg = block.color || brand.accentColor || ACCENT_DEFAULT;
  const txt = block.textColor || '#ffffff';
  const size = sizeOr(block.size, sizeOr(brand.buttonSize, 14));
  const br = sizeOr(block.borderRadius, sizeOr(brand.buttonRadius, 8));
  const bw = pxNum(block.borderWidth, 0);
  const bc = block.borderColor || bg;
  const p = resolvePad(block);
  const pad = `${p.t}px ${p.r}px ${p.b}px ${p.l}px`;
  const parts = [
    block.fullWidth ? 'display:block' : 'display:inline-block',
    'vertical-align:top',
    `padding:${pad}`, `background:${escapeHtml(bg)}`, `color:${escapeHtml(txt)}`,
    block.underline ? 'text-decoration:underline' : 'text-decoration:none',
    `border-radius:${br}px`, `font-weight:${block.bold ? 700 : 400}`,
    `font-size:${size}px`, `font-family:${fontStack(block.font || brand.buttonFont)}`,
  ];
  if (block.italic) parts.push('font-style:italic');
  if (block.letterSpacing != null && block.letterSpacing !== '') parts.push(`letter-spacing:${Number(block.letterSpacing)}px`);
  if (block.fullWidth) parts.push('width:100%', 'box-sizing:border-box', 'text-align:center');
  if (bw > 0) parts.push(`border:${bw}px solid ${escapeHtml(bc)}`);
  return parts.join(';') + ';';
}

/** The per-device responsive properties (block.mobile.* overrides the base,
 *  which is the desktop value). font family / colour / weight stay global. */
function responsiveDecls(block) {
  const m = (block && block.mobile) || {};
  const d = [];
  if (m.size != null && m.size !== '') d.push(`font-size:${pxNum(m.size, 15)}px !important`);
  if (m.lineHeight != null && m.lineHeight !== '') d.push(`line-height:${Number(m.lineHeight)} !important`);
  if (m.letterSpacing != null && m.letterSpacing !== '') d.push(`letter-spacing:${Number(m.letterSpacing)}px !important`);
  if (['left', 'center', 'right'].includes(m.align)) d.push(`text-align:${m.align} !important`);
  // Built from the MERGED padding, so a partial override keeps the desktop
  // values for the sides it doesn't mention. Emitted whenever any mobile side
  // carries a value, including 0 — "set mobile padding to nothing" is a real
  // instruction and used to be silently discarded.
  if (hasAnyValue(m.pad)) {
    const p = resolvePad(effectiveBlock(block, 'mobile'));
    d.push(`padding:${p.t}px ${p.r}px ${p.b}px ${p.l}px !important`);
  }
  return d;
}
function hasMobileOverrides(block) { return responsiveDecls(block).length > 0; }

/** A view of a block with its mobile overrides folded in — used by the editor
 *  canvas so the Mobile preview shows the mobile size/spacing/align/padding. */
export function effectiveBlock(block, device) {
  if (device !== 'mobile' || !block || !block.mobile) return block;
  const m = block.mobile;
  const out = { ...block };
  ['size', 'lineHeight', 'letterSpacing', 'align', 'width', 'height', 'thickness', 'iconSize', 'iconGap'].forEach((k) => { if (m[k] != null && m[k] !== '') out[k] = m[k]; });
  // Padding and margin are per-device: a mobile override merges OVER the
  // desktop values, so setting just the top on mobile leaves the other three
  // inherited rather than zeroed. mergeDefined (not a spread) is what makes
  // "blank = inherit desktop" actually true.
  if (hasAnyValue(m.pad)) out.pad = mergeDefined(block.pad, m.pad);
  if (hasAnyValue(m.margin)) out.margin = mergeDefined(block.margin, m.margin);
  return out;
}

// Padding decl for a block's mobile override (returns '' or 'padding:… !important').
// Takes the whole block, not just the pad object, because the value has to be
// merged over the desktop padding — otherwise setting one side wipes the rest.
function mobPad(block) {
  const m = (block && block.mobile) || {};
  if (!hasAnyValue(m.pad)) return '';
  const p = resolvePad(effectiveBlock(block, 'mobile'));
  return `padding:${p.t}px ${p.r}px ${p.b}px ${p.l}px !important`;
}

// Per-type mobile CSS. Buttons/images/dividers split across a wrapper class
// (.eb-bw-<id>, for align/padding) and an inner class (.eb-b-<id>, for the
// element's own size/width). Heading/text use just the inner class.
function buttonResponsiveCss(block) {
  const m = block.mobile || {}, rules = [], inner = [];
  if (m.size != null && m.size !== '') inner.push(`font-size:${pxNum(m.size, 14)}px !important`);
  if (m.letterSpacing != null && m.letterSpacing !== '') inner.push(`letter-spacing:${Number(m.letterSpacing)}px !important`);
  const ip = mobPad(block); if (ip) inner.push(ip);
  if (inner.length) rules.push(`.eb-b-${block.id}{${inner.join(';')};}`);
  if (['left', 'center', 'right'].includes(m.align)) rules.push(`.eb-bw-${block.id}{text-align:${m.align} !important;}`);
  return rules.join('\n    ');
}
function imageResponsiveCss(block) {
  const m = block.mobile || {}, rules = [], inner = [], wrap = [];
  if (m.width != null && m.width !== '') inner.push(`width:${pxNum(m.width, 0)}px !important`, 'max-width:100% !important');
  if (m.height != null && m.height !== '') inner.push(`height:${pxNum(m.height, 0)}px !important`);
  if (inner.length) rules.push(`.eb-b-${block.id}{${inner.join(';')};}`);
  if (['left', 'center', 'right'].includes(m.align)) wrap.push(`text-align:${m.align} !important`);
  const wp = mobPad(block); if (wp) wrap.push(wp);
  if (wrap.length) rules.push(`.eb-bw-${block.id}{${wrap.join(';')};}`);
  return rules.join('\n    ');
}
function dividerResponsiveCss(block) {
  const m = block.mobile || {}, rules = [], wrap = [];
  if (['left', 'center', 'right'].includes(m.align)) wrap.push(`text-align:${m.align} !important`);
  const wp = mobPad(block); if (wp) wrap.push(wp);
  if (wrap.length) rules.push(`.eb-bw-${block.id}{${wrap.join(';')};}`);
  if (m.width != null && m.width !== '') rules.push(`.eb-b-${block.id}{width:${Math.max(1, Math.min(100, Number(m.width)))}% !important;}`);
  return rules.join('\n    ');
}
// Social: icon size AND the space between icons can differ per device. Resize
// the chip (circle style) and the glyph, and adjust the per-icon margin, via
// the block's container class.
function socialResponsiveCss(block) {
  const m = block.mobile || {};
  const bare = block.iconStyle === 'bare';
  const sel = `.eb-social-${block.id}`;
  const aDecls = [], svgDecls = [];
  if (m.iconSize != null && m.iconSize !== '') {
    let size = Number(m.iconSize);
    if (Number.isFinite(size) && size > 0) {
      size = Math.max(14, Math.min(72, size));
      const glyph = bare ? Math.round(size) : Math.max(10, Math.round(size * 0.46));
      if (!bare) aDecls.push(`width:${size}px !important`, `height:${size}px !important`, `line-height:${size}px !important`, `border-radius:${Math.round(size / 2)}px !important`);
      svgDecls.push(`width:${glyph}px !important`, `height:${glyph}px !important`);
    }
  }
  if (m.iconGap != null && m.iconGap !== '') {
    let gap = Number(m.iconGap);
    if (Number.isFinite(gap) && gap >= 0) aDecls.push(`margin:0 ${Math.min(60, gap) / 2}px !important`);
  }
  const rules = [];
  // Desktop padding sits on this same container (see renderSocial), so the
  // mobile override belongs here too. It was the only block type whose padding
  // control did nothing on mobile.
  const sp = mobPad(block);
  if (sp) rules.push(`${sel}{${sp};}`);
  if (aDecls.length) rules.push(`${sel} a{${aDecls.join(';')};}`);
  if (svgDecls.length) rules.push(`${sel} svg{${svgDecls.join(';')};}`);
  return rules.join('\n    ');
}
function blockResponsiveCss(block) {
  if (!block) return '';
  const parts = [];
  // Columns: gather each child's mobile rules (children carry their own
  // classes), then carry on — this used to RETURN here, so a columns block's
  // own mobile margin was silently discarded even though wrapOuter had already
  // stamped the .eb-mw-<id> class on it for exactly that purpose.
  if (block.type === 'columns') {
    const cols = Array.isArray(block.cols) ? block.cols : [];
    cols.forEach((col) => (col || []).forEach((cb) => { const c = blockResponsiveCss(cb); if (c) parts.push(c); }));
  }
  if (!block.mobile) return parts.join('\n    ');
  // Margin sits on the outer wrapper and is type-agnostic, so handle it here
  // rather than in the per-type switch below (which drops unknown types).
  // Built from the MERGED margin so a partial override (e.g. only top) keeps
  // the desktop values for the other sides instead of zeroing them.
  if (hasAnyValue(block.mobile.margin)) {
    const mm = resolveMargin(effectiveBlock(block, 'mobile'));
    parts.push(`.eb-mw-${block.id}{padding:${mm.t}px ${mm.r}px ${mm.b}px ${mm.l}px !important;}`);
  }
  let typeCss = '';
  switch (block.type) {
    case 'heading': case 'text': { const d = responsiveDecls(block); typeCss = d.length ? `.eb-b-${block.id}{${d.join(';')};}` : ''; break; }
    case 'button': typeCss = buttonResponsiveCss(block); break;
    case 'image': typeCss = imageResponsiveCss(block); break;
    case 'divider': typeCss = dividerResponsiveCss(block); break;
    case 'social': typeCss = socialResponsiveCss(block); break;
    default: typeCss = ''; break;
  }
  if (typeCss) parts.push(typeCss);
  return parts.join('\n    ');
}
function blockHasMobile(block) { return blockResponsiveCss(block) !== ''; }

let _uidCounter = 0;
function uid() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return 'b_' + crypto.randomUUID().slice(0, 8);
  } catch (_) { /* fall through */ }
  _uidCounter += 1;
  return 'b_' + _uidCounter.toString(36) + '_' + (typeof performance !== 'undefined' ? Math.floor(performance.now()) : _uidCounter);
}

/** Make a new block of the given type, pre-filled with friendly defaults. */
export function makeBlock(type) {
  const id = uid();
  switch (type) {
    case 'heading':
      return { type, id, text: 'A bold headline', align: 'left', color: '' };
    case 'text':
      return { type, id, text: 'Hi {{firstName}},\n\nWrite your message here.', bg: '' };
    case 'image':
      return { type, id, url: '', alt: '', linkUrl: '', align: 'center' };
    case 'button':
      return { type, id, text: 'View more', url: 'https://tmke.co.uk', color: '', align: 'center' };
    case 'columns':
      // Each column holds a list of child blocks you drag in (any type).
      return { type, id, layout: '50-50', cols: [[], []] };
    case 'divider':
      return { type, id, color: '#E2E8F0' };
    case 'spacer':
      return { type, id, height: 24 };
    case 'logo':
      return { type, id, size: 'md', align: 'center', linkUrl: 'https://tmke.co.uk' };
    case 'social':
      return { type, id, align: 'center', show: { linkedin: true, instagram: true, facebook: true, website: true, twitter: true, youtube: true } };
    case 'video':
      return { type, id, url: '', thumbnail: '', align: 'center' };
    case 'footer':
      return { type, id, address: '', showSocial: true, unsubscribe: true, note: 'You\'re receiving this because you\'re part of the TMKE community.' };
    case 'faq':
      return { type, id, title: 'Frequently asked', items: [{ q: 'A question people often ask?', a: 'A clear, friendly answer.' }] };
    case 'countdown':
      return { type, id, label: 'Offer ends', deadline: '', align: 'center' };
    case 'reviewlink':
      return { type, id, text: 'Leave us a review', url: '', align: 'center', prompt: 'Enjoyed working with us?' };
    case 'products':
      return { type, id, columns: 2, items: [
        { title: 'A pack', price: '£49', image: '', url: 'https://tmke.co.uk/account', cta: 'View pack' },
      ] };
    case 'services':
      return { type, id, columns: 3, items: [
        { title: 'The Studio', text: 'On-brand templates, yours in minutes.', btnText: 'Explore', btnUrl: 'https://tmke.co.uk/editor' },
        { title: 'Videography', text: 'Property & agent video, done for you.', btnText: 'See more', btnUrl: 'https://tmke.co.uk/videography' },
        { title: 'Managed socials', text: 'We run the channel end to end.', btnText: 'Learn more', btnUrl: 'https://tmke.co.uk/account/services' },
      ] };
    case 'slider':
      return { type, id, columns: 3, images: [] };
    case 'form':
      return { type, id, heading: 'Tell us what you need', intro: 'A couple of quick questions and we\'ll be in touch.', fields: ['Name', 'Email', 'What are you after?'], btnText: 'Open the form', url: 'https://tmke.co.uk/contact' };
    case 'code':
      return { type, id, html: '<!-- Paste your own email-safe HTML here -->' };
    default:
      return { type: 'text', id, text: '', bg: '' };
  }
}

/* ───────────────────────── HTML helpers ───────────────────────── */

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Turn the plain text a marketer types into simple paragraph HTML. A blank line
// starts a new paragraph; a single newline is a line break. Inline HTML the user
// writes (e.g. <strong>, <a>) is passed through — this is an admin-only tool used
// by trusted staff, so we don't escape their copy (matches the source CRM).
function plainToHtml(text, gap = 12) {
  const paras = String(text || '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  if (!paras.length) return '';
  const g = Math.max(0, Math.round(Number(gap) || 0));
  const mb = g > 0 ? `0 0 ${g}px` : '0';
  return paras.map((p) => `<p style="margin:${mb};">${p.replace(/\n/g, '<br />')}</p>`).join('');
}

/* ───────────────────────── per-block renderers ───────────────────────── */

function renderHeading(block, ctx, brand) {
  const text = renderTokens(block.text || '', ctx);
  if (!text) return '';
  const cls = hasMobileOverrides(block) ? ` class="eb-b-${escapeHtml(block.id)}"` : '';
  return `<h1${cls} style="${headingInlineStyle(block, brand)}">${escapeHtml(text)}</h1>`;
}

function renderText(block, ctx, brand) {
  // block.html holds rich content (bold/italic/underline/bullets from the inline
  // toolbar); plain text falls back to auto-paragraphing.
  const gap = resolveParaGap(block);
  const src = block.html != null && block.html !== '' ? normalizeRichHtml(block.html, gap) : plainToHtml(block.text || '', gap);
  let inner = renderTokens(src, ctx);
  if (!inner) return '';
  // Drop the trailing paragraph gap so the block ends exactly at the last line —
  // no hidden margin below (spacing is the block's own Margin control).
  inner = inner.replace(/margin:0 0 \d+px(?![\s\S]*margin:0 0 \d+px)/, 'margin:0');
  const cls = hasMobileOverrides(block) ? ` class="eb-b-${escapeHtml(block.id)}"` : '';
  return `<div${cls} style="${textInlineStyle(block, brand)}">${inner}</div>`;
}

/**
 * A contenteditable bakes browser-default vertical margins (≈1em top+bottom)
 * AND its own line-height into every <p>/<div> it emits. Passed through raw,
 * that makes paragraph gaps look huge in email clients and stops the text
 * block's own line-height taking effect. Strip inline margin + line-height off
 * those wrappers (forcing margin:0) so the block's style controls spacing and
 * line height. Blank lines the user typed still show as empty <p>/<div> gaps.
 * Shared by the renderer and the editor canvas so preview matches the send.
 */
export function normalizeRichHtml(html, gap = 0) {
  if (html == null) return '';
  const g = Math.max(0, Math.round(Number(gap) || 0));
  const mb = g > 0 ? `0 0 ${g}px` : '0';
  return String(html)
    // Drop empty blank-line paragraphs — spacing comes from the gap, so a
    // double-Enter doesn't stack an extra empty line on top of it.
    .replace(/<(p|div)\b[^>]*>(?:\s|&nbsp;|<br\s*\/?>)*<\/\1>/gi, '')
    .replace(/<(p|div)((?:\s[^>]*)?)>/gi, (m, tag, attrs) => {
      let a = attrs || '';
      if (/style\s*=\s*"/i.test(a)) {
        a = a.replace(/style\s*=\s*"([^"]*)"/i, (sm, css) => {
          const cleaned = css
            .replace(/(?:^|;)\s*margin(?:-top|-bottom|-left|-right)?\s*:[^;]*/gi, '')
            .replace(/(?:^|;)\s*line-height\s*:[^;]*/gi, '')
            .replace(/;+/g, ';').replace(/^;|;$/g, '').trim();
          return `style="margin:${mb};${cleaned ? cleaned + ';' : ''}"`;
        });
      } else {
        a = `${a} style="margin:${mb};"`;
      }
      return `<${tag}${a}>`;
    });
}
/** Space between paragraphs (px) for a text block. Default 12. */
export function resolveParaGap(block) {
  return (block && block.paraSpacing != null && block.paraSpacing !== '') ? Math.max(0, Number(block.paraSpacing)) : 12;
}

/** Inline style for an image element — shared by renderer + canvas. */
export function imageInlineStyle(block = {}) {
  const parts = [];
  if (block.width != null && block.width !== '') parts.push(`width:${pxNum(block.width, 0)}px`);
  parts.push('max-width:100%');
  parts.push(block.height != null && block.height !== '' ? `height:${pxNum(block.height, 0)}px` : 'height:auto');
  const bw = pxNum(block.borderWidth, 0);
  if (bw > 0) parts.push(`border:${bw}px solid ${escapeHtml(block.borderColor || '#1c1d22')}`);
  else parts.push('border:0');
  parts.push(`border-radius:${pxNum(block.borderRadius, 8)}px`);
  // vertical-align:top takes the image off the text baseline, killing the ~4px
  // "descender gap" inline images otherwise leave underneath them.
  parts.push('display:inline-block', 'vertical-align:top', 'outline:none', 'text-decoration:none');
  return parts.join(';') + ';';
}

function renderImage(block) {
  const url = block.url;
  if (!url) return '';
  const alt = escapeHtml(block.alt || '');
  const align = ['left', 'center', 'right'].includes(block.align) ? block.align : 'center';
  const cls = blockHasMobile(block) ? ` class="eb-b-${escapeHtml(block.id)}"` : '';
  const wCls = blockHasMobile(block) ? ` class="eb-bw-${escapeHtml(block.id)}"` : '';
  const img = `<img${cls} src="${escapeHtml(url)}" alt="${alt}" style="${imageInlineStyle(block)}" />`;
  const wrapped = block.linkUrl
    ? `<a href="${escapeHtml(block.linkUrl)}" style="text-decoration:none;">${img}</a>`
    : img;
  // line-height:0 collapses the wrapper's line box so there's no stray gap under
  // the image (belt-and-braces with the image's vertical-align:top).
  return `<div${wCls} style="text-align:${align};line-height:0;${padStyleResolved(block)}">${wrapped}</div>`;
}

function renderButton(block, brand, ctx) {
  const text = renderTokens(block.text || 'Click here', ctx);
  const url = renderTokens(block.url || '#', ctx);
  const align = ['left', 'center', 'right'].includes(block.align) ? block.align : 'center';
  const hasM = blockHasMobile(block);
  const wCls = hasM ? ` class="eb-bw-${escapeHtml(block.id)}"` : '';
  const bCls = hasM ? ` class="eb-b-${escapeHtml(block.id)}"` : '';
  // No baked margin (spacing is the block's own Spacing controls) and line-height:0
  // so the inline-block button leaves no descender gap underneath.
  return `
    <div${wCls} style="text-align:${align};line-height:0;">
      <a${bCls} href="${escapeHtml(url)}" style="${buttonInlineStyle(block, brand)}">${escapeHtml(text)}</a>
    </div>`;
}

/** Email-safe divider: nested tables so width/alignment hold in Outlook too. */
function renderDivider(block) {
  const color = block.color || '#E2E8F0';
  const thick = pxNum(block.thickness, 1);
  const width = (block.width != null && block.width !== '') ? Math.max(1, Math.min(100, Number(block.width))) : 100;
  const align = ['left', 'center', 'right'].includes(block.align) ? block.align : 'center';
  const wCls = blockHasMobile(block) ? ` class="eb-bw-${escapeHtml(block.id)}"` : '';
  const lCls = blockHasMobile(block) ? ` class="eb-b-${escapeHtml(block.id)}"` : '';
  return `<div${wCls} style="text-align:${align};line-height:0;${padStyleResolved(block)}">`
    + `<table${lCls} role="presentation" width="${width}%" cellpadding="0" cellspacing="0" border="0" style="width:${width}%;display:inline-table;vertical-align:top;">`
    + `<tr><td style="border-top:${thick}px solid ${escapeHtml(color)};font-size:0;line-height:0;">&nbsp;</td></tr></table></div>`;
}

function renderSpacer(block) {
  const h = Math.max(4, Math.min(160, Number(block.height) || 24));
  return `<div style="height:${h}px;line-height:${h}px;">&nbsp;</div>`;
}

const LOGO_SIZE = { sm: 28, md: 42, lg: 64 };
function renderLogo(block, brand) {
  const url = brand.logo;
  if (!url) return '';
  const size = LOGO_SIZE[block.size] || LOGO_SIZE.md;
  const align = ['left', 'center', 'right'].includes(block.align) ? block.align : 'center';
  const img = `<img src="${escapeHtml(url)}" alt="${escapeHtml(brand.companyName || 'Logo')}" style="height:${size}px;width:auto;display:inline-block;border:0;outline:none;" />`;
  const wrapped = block.linkUrl
    ? `<a href="${escapeHtml(block.linkUrl)}" style="text-decoration:none;">${img}</a>`
    : img;
  return `<div style="text-align:${align};">${wrapped}</div>`;
}

// Inline SVG icons so the social block works even in clients that strip remote
// images. currentColor is set on the link, so the glyphs inherit white.
const SOCIAL_ICON_SVG = {
  linkedin: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4v-7a6 6 0 0 1 6-6z"/><rect width="4" height="12" x="2" y="9"/><circle cx="4" cy="4" r="2"/></svg>',
  twitter: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z"/></svg>',
  instagram: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/></svg>',
  facebook: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>',
  youtube: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17"/><path d="m10 15 5-3-5-3z"/></svg>',
  website: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>',
};
const SOCIAL_ORDER = ['linkedin', 'instagram', 'facebook', 'twitter', 'youtube', 'website'];

// Resize a social icon's inline SVG (base markup is 14×14, stroke-width 2) and
// set its line thickness.
function sizedSocialIcon(k, px, stroke) {
  return (SOCIAL_ICON_SVG[k] || '')
    .replace('width="14" height="14"', `width="${px}" height="${px}"`)
    .replace('stroke-width="2"', `stroke-width="${stroke}"`);
}

function renderSocial(block, brand) {
  const show = block.show || {};
  const align = ['left', 'center', 'right'].includes(block.align) ? block.align : 'center';
  const accent = brand.accentColor || ACCENT_DEFAULT;
  // "bare" = standalone icons (no chip); "circle" (default) = icon on a chip.
  const bare = block.iconStyle === 'bare';
  const iconColor = block.iconColor || (bare ? accent : '#ffffff');
  const chipBg = block.iconBg || accent;
  let size = Number(block.iconSize);
  if (!Number.isFinite(size) || size <= 0) size = bare ? 24 : 34;
  size = Math.max(14, Math.min(72, size));
  const glyph = bare ? Math.round(size) : Math.max(10, Math.round(size * 0.46));
  // Line thickness (default 1.5 — thinner than the old fixed 2).
  let stroke = Number(block.iconStroke);
  if (!Number.isFinite(stroke) || stroke <= 0) stroke = 1.5;
  stroke = Math.max(0.5, Math.min(3, stroke));
  // Gap between adjacent icons (applied as half on each side).
  let gap = Number(block.iconGap);
  if (!Number.isFinite(gap) || gap < 0) gap = 12;
  gap = Math.min(60, gap);
  const side = gap / 2;
  const items = SOCIAL_ORDER
    .filter((k) => show[k] !== false && brand[k])
    .map((k) => {
      const svg = sizedSocialIcon(k, glyph, stroke);
      const box = bare
        ? `margin:0 ${side}px;line-height:1;vertical-align:middle;`
        : `width:${size}px;height:${size}px;line-height:${size}px;text-align:center;border-radius:${Math.round(size / 2)}px;background:${escapeHtml(chipBg)};margin:0 ${side}px;`;
      return `<a href="${escapeHtml(brand[k])}" style="display:inline-block;text-decoration:none;color:${escapeHtml(iconColor)};${box}">${svg}</a>`;
    })
    .join('');
  if (!items) return '';
  // Optional caption line ABOVE the icons, inside the same block — so a bit of
  // text (e.g. "Follow us") sits tight over the icons without a second block.
  let caption = '';
  if (block.caption) {
    const capSize = block.captionSize != null && block.captionSize !== '' ? Math.max(8, Number(block.captionSize)) : 14;
    const capColor = block.captionColor || '#1c1d22';
    const capGap = block.captionGap != null && block.captionGap !== '' ? Math.max(0, Number(block.captionGap)) : 8;
    caption = `<div style="font-family:Helvetica,Arial,sans-serif;font-size:${capSize}px;line-height:1.4;color:${escapeHtml(capColor)};margin:0 0 ${capGap}px;">${escapeHtml(block.caption)}</div>`;
  }
  // Optional block fill (background colour). Padding around the icons is the
  // block's own "Padding · inside" controls — no hard-coded inset — so with a
  // fill you set exactly the breathing room you want (default 0).
  const radius = block.radius != null && block.radius !== '' ? Math.max(0, Number(block.radius)) : 8;
  const pad = padStyleResolved(block);
  const fill = block.bg ? `background:${escapeHtml(block.bg)};border-radius:${radius}px;` : '';
  // No baked-in margin OR padding — spacing is governed entirely by the block's
  // Margin (outside) + Padding (inside) controls, so "everything zero" is zero.
  // The class lets the mobile media query resize the icons per-device.
  const cls = block.id ? ` class="eb-social-${block.id}"` : '';
  return `<div${cls} style="text-align:${align};${pad}${fill}">${caption}${items}</div>`;
}

function renderVideo(block) {
  const thumb = block.thumbnail;
  const url = block.url || '#';
  if (!thumb) return '';
  const align = ['left', 'center', 'right'].includes(block.align) ? block.align : 'center';
  // Email-safe video pattern: a clickable thumbnail with a play overlay.
  return `
    <div style="text-align:${align};margin:8px 0;">
      <a href="${escapeHtml(url)}" style="position:relative;display:inline-block;text-decoration:none;border-radius:12px;overflow:hidden;max-width:100%;">
        <img src="${escapeHtml(thumb)}" alt="Watch video" style="display:block;max-width:100%;border-radius:12px;border:0;outline:none;" />
        <span style="position:absolute;top:50%;left:50%;margin-left:-32px;margin-top:-32px;width:64px;height:64px;border-radius:32px;background:rgba(220,38,38,0.95);display:inline-block;text-align:center;line-height:64px;color:#fff;font-size:24px;">&#9658;</span>
      </a>
    </div>`;
}

function renderFooter(block, brand) {
  const accent = brand.accentColor || ACCENT_DEFAULT;
  const year = new Date().getFullYear();
  const social = block.showSocial !== false ? renderSocial({ show: {} }, brand) : '';
  const note = block.note ? `<p style="margin:0 0 8px;">${escapeHtml(block.note)}</p>` : '';
  const address = block.address ? `<p style="margin:0 0 8px;">${escapeHtml(block.address)}</p>` : '';
  const web = brand.website ? `<a href="${escapeHtml(brand.website)}" style="color:${escapeHtml(accent)};text-decoration:none;">${escapeHtml(String(brand.website).replace(/^https?:\/\//, ''))}</a>` : '';
  const unsub = block.unsubscribe !== false
    ? `<p style="margin:8px 0 0;"><a href="{{unsubscribe_url}}" style="color:#94a3b8;text-decoration:underline;">Unsubscribe</a></p>`
    : '';
  return `
    <div style="border-top:1px solid #E2E8F0;margin-top:8px;padding-top:18px;text-align:center;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:#94a3b8;">
      ${social}
      ${note}
      ${address}
      <p style="margin:0 0 4px;">&copy; ${year} ${escapeHtml(brand.companyName || 'TMKE')}${web ? ' · ' + web : ''}</p>
      ${unsub}
    </div>`;
}

function renderFaq(block, ctx) {
  const items = Array.isArray(block.items) ? block.items : [];
  const rows = items.filter((it) => it && (it.q || it.a)).map((it) => `
    <div style="margin:0 0 14px;">
      <p style="margin:0 0 4px;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:700;color:#1c1d22;">${renderTokens(escapeHtml(it.q || ''), ctx)}</p>
      <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:#475569;">${renderTokens(escapeHtml(it.a || ''), ctx)}</p>
    </div>`).join('');
  if (!rows) return '';
  const title = block.title ? `<h2 style="margin:0 0 14px;font-family:Helvetica,Arial,sans-serif;font-size:20px;font-weight:800;color:#1c1d22;">${escapeHtml(block.title)}</h2>` : '';
  return `<div>${title}${rows}</div>`;
}

function renderCountdown(block) {
  const dl = block.deadline ? new Date(block.deadline) : null;
  if (!dl || isNaN(dl.getTime())) return '';
  const days = Math.max(0, Math.ceil((dl.getTime() - Date.now()) / 86400000));
  const dateStr = dl.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const align = ['left', 'center', 'right'].includes(block.align) ? block.align : 'center';
  return `
    <div style="text-align:${align};margin:8px 0;">
      <div style="display:inline-block;padding:14px 26px;border:1px solid #E2E8F0;border-radius:12px;background:#faf9f8;font-family:Helvetica,Arial,sans-serif;">
        <div style="font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#94a3b8;">${escapeHtml(block.label || 'Offer ends')}</div>
        <div style="font-size:28px;font-weight:800;color:#1c1d22;margin:4px 0 2px;">${days} day${days === 1 ? '' : 's'} left</div>
        <div style="font-size:13px;color:#475569;">${escapeHtml(dateStr)}</div>
      </div>
    </div>`;
}

function renderReviewLink(block, brand, ctx) {
  const accent = brand.accentColor || ACCENT_DEFAULT;
  const url = renderTokens(block.url || brand.reviewUrl || (brand.website ? brand.website.replace(/\/+$/, '') + '/review' : '#'), ctx);
  const align = ['left', 'center', 'right'].includes(block.align) ? block.align : 'center';
  const stars = '<div style="font-size:22px;letter-spacing:2px;color:#f5b301;margin:0 0 6px;">&#9733;&#9733;&#9733;&#9733;&#9733;</div>';
  const prompt = block.prompt ? `<p style="margin:0 0 10px;font-family:Helvetica,Arial,sans-serif;font-size:15px;color:#1c1d22;">${escapeHtml(block.prompt)}</p>` : '';
  return `
    <div style="text-align:${align};margin:8px 0;">
      ${stars}${prompt}
      <a href="${escapeHtml(url)}" style="display:inline-block;padding:11px 24px;background:${escapeHtml(accent)};color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;font-family:Helvetica,Arial,sans-serif;">${escapeHtml(renderTokens(block.text || 'Leave a review', ctx))}</a>
    </div>`;
}

function renderCode(block, ctx) {
  return renderTokens(String(block.html || ''), ctx);
}

// One column cell — a small stacked unit (image → title → text → button), which
// covers feature grids, product/service rows, etc. without a nested editor.
function renderCell(c, brand, ctx) {
  if (!c) return '';
  let h = '';
  if (c.image) h += `<img src="${escapeHtml(c.image)}" alt="${escapeHtml(c.alt || '')}" style="max-width:100%;border-radius:8px;display:block;border:0;outline:none;margin:0 0 8px;" />`;
  if (c.title) h += `<p style="margin:0 0 4px;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:700;color:#1c1d22;">${renderTokens(escapeHtml(c.title), ctx)}</p>`;
  if (c.text) h += `<p style="margin:0 0 8px;font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.55;color:#475569;">${renderTokens(escapeHtml(c.text), ctx).replace(/\n/g, '<br />')}</p>`;
  if (c.btnText) h += `<a href="${escapeHtml(renderTokens(c.btnUrl || '#', ctx))}" style="display:inline-block;padding:8px 16px;background:${escapeHtml(brand.accentColor || ACCENT_DEFAULT)};color:#fff;text-decoration:none;border-radius:6px;font-size:13px;font-weight:600;font-family:Helvetica,Arial,sans-serif;">${escapeHtml(renderTokens(c.btnText, ctx))}</a>`;
  return h || '<div style="min-height:36px;"></div>';
}

// Email-safe responsive-ish grid: rows of `cols`, each cell rendered by cellFn.
function cardGrid(items, cols, cellFn) {
  const n = Math.min(Math.max(Number(cols) || 2, 1), 4);
  const w = (100 / n).toFixed(3);
  let rows = '';
  for (let i = 0; i < items.length; i += n) {
    const slice = items.slice(i, i + n);
    const tds = slice.map((it, j) => {
      const pad = n === 1 ? '0 0 16px' : `0 ${j < slice.length - 1 ? 8 : 0}px 16px ${j > 0 ? 8 : 0}px`;
      return `<td valign="top" width="${w}%" style="width:${w}%;padding:${pad};vertical-align:top;font-family:Helvetica,Arial,sans-serif;">${cellFn(it)}</td>`;
    }).join('');
    const padCells = Array.from({ length: n - slice.length }, () => `<td width="${w}%" style="width:${w}%;"></td>`).join('');
    rows += `<tr>${tds}${padCells}</tr>`;
  }
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">${rows}</table>`;
}

function renderProducts(block, brand, ctx) {
  const items = (Array.isArray(block.items) ? block.items : []).filter((it) => it && (it.title || it.image));
  if (!items.length) return '';
  const accent = brand.accentColor || ACCENT_DEFAULT;
  return cardGrid(items, block.columns || 2, (it) => {
    let h = '';
    if (it.image) h += `<img src="${escapeHtml(it.image)}" alt="${escapeHtml(it.title || '')}" style="max-width:100%;border-radius:8px;display:block;border:0;margin:0 0 8px;" />`;
    if (it.title) h += `<p style="margin:0 0 2px;font-size:15px;font-weight:700;color:#1c1d22;">${renderTokens(escapeHtml(it.title), ctx)}</p>`;
    if (it.price) h += `<p style="margin:0 0 8px;font-size:14px;color:${escapeHtml(accent)};font-weight:600;">${escapeHtml(it.price)}</p>`;
    h += `<a href="${escapeHtml(it.url || '#')}" style="display:inline-block;padding:7px 14px;background:${escapeHtml(accent)};color:#fff;text-decoration:none;border-radius:6px;font-size:12px;font-weight:600;">${escapeHtml(it.cta || 'View')}</a>`;
    return h;
  });
}

function renderServices(block, brand, ctx) {
  const items = (Array.isArray(block.items) ? block.items : []).filter((it) => it && (it.title || it.text));
  if (!items.length) return '';
  return cardGrid(items, block.columns || 3, (it) => renderCell({ title: it.title, text: it.text, btnText: it.btnText, btnUrl: it.btnUrl }, brand, ctx));
}

function renderSlider(block) {
  const images = (Array.isArray(block.images) ? block.images : []).filter(Boolean);
  if (!images.length) return '';
  return cardGrid(images.map((url) => ({ url })), block.columns || 3, (it) =>
    `<img src="${escapeHtml(it.url)}" alt="" style="max-width:100%;border-radius:8px;display:block;border:0;" />`);
}

function renderForm(block, brand, ctx) {
  const accent = brand.accentColor || ACCENT_DEFAULT;
  const fields = (Array.isArray(block.fields) ? block.fields : []).filter(Boolean);
  // Email clients strip real <form> posts, so this is a styled prompt that links
  // out to a hosted form. The fields preview what the form will ask.
  const fieldRows = fields.map((f) => `<div style="border:1px solid #E2E8F0;border-radius:6px;padding:9px 12px;margin:0 0 8px;color:#94a3b8;font-size:13px;">${escapeHtml(f)}</div>`).join('');
  return `
    <div style="border:1px solid #E2E8F0;border-radius:12px;padding:20px;font-family:Helvetica,Arial,sans-serif;">
      ${block.heading ? `<p style="margin:0 0 4px;font-size:18px;font-weight:800;color:#1c1d22;">${renderTokens(escapeHtml(block.heading), ctx)}</p>` : ''}
      ${block.intro ? `<p style="margin:0 0 14px;font-size:14px;line-height:1.55;color:#475569;">${renderTokens(escapeHtml(block.intro), ctx)}</p>` : ''}
      ${fieldRows}
      <a href="${escapeHtml(block.url || '#')}" style="display:inline-block;margin-top:6px;padding:11px 24px;background:${escapeHtml(accent)};color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">${escapeHtml(block.btnText || 'Open the form')}</a>
    </div>`;
}

function renderColumns(block, brand, ctx) {
  const layout = (COLUMN_LAYOUTS.find((l) => l.key === block.layout)) || COLUMN_LAYOUTS[1];
  const widths = layout.w;
  const cols = Array.isArray(block.cols) ? block.cols : [];
  const colBg = Array.isArray(block.colBg) ? block.colBg : [];
  const colBgImage = Array.isArray(block.colBgImage) ? block.colBgImage : [];
  const colVAlign = Array.isArray(block.colVAlign) ? block.colVAlign : [];
  const radius = block.colRadius != null && block.colRadius !== '' ? Math.max(0, Number(block.colRadius)) : 6;
  // Mobile behaviour: stack (default) → cells carry the .eb-col class the media
  // query collapses to full width; "keep side by side" → no class, so they stay
  // as table cells even on a phone.
  const stack = block.stackMobile !== false;
  const tds = widths.map((w, i) => {
    // Vertical alignment of the column's content within the (image-sized) row.
    const va = ['middle', 'bottom'].includes(colVAlign[i]) ? colVAlign[i] : 'top';
    // Equal-width columns must lose an EQUAL amount of horizontal padding, or
    // the cell's content (e.g. a full-width image) renders narrower. Outer
    // columns stay flush to the edges with a single full gutter (8px); middle
    // columns split the gutter (4px each side) so every cell loses 8px total.
    const pad = widths.length === 1 ? '0' : i === 0 ? '0 8px 0 0' : i === widths.length - 1 ? '0 0 0 8px' : '0 4px';
    const children = Array.isArray(cols[i]) ? cols[i] : [];
    // Each child block is rendered with its own outer margin so column content
    // stacks with consistent spacing.
    const content = children.map((cb) => {
      const h = renderBlock(cb, brand, ctx);
      return h ? wrapOuter(h, cb) : '';
    }).filter(Boolean).join('\n') || '&nbsp;';
    // Optional per-column background (colour and/or image) — wrap the cell's
    // content in a padded panel with the chosen corner radius.
    const hasBg = colBg[i] || colBgImage[i];
    const bgCss = hasBg
      ? (colBg[i] ? `background-color:${escapeHtml(colBg[i])};` : '')
        + (colBgImage[i] ? `background-image:url('${escapeHtml(colBgImage[i])}');background-size:cover;background-position:center center;background-repeat:no-repeat;` : '')
        + `border-radius:${radius}px;padding:14px;`
      : '';
    const inner = hasBg ? `<div style="${bgCss}">${content}</div>` : content;
    return `<td${stack ? ' class="eb-col"' : ''} valign="${va}" width="${w}%" style="width:${w}%;padding:${pad};vertical-align:${va};font-family:Helvetica,Arial,sans-serif;">${inner}</td>`;
  }).join('');
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>${tds}</tr></table>`;
}

export function renderBlock(block, brand, ctx) {
  switch (block.type) {
    case 'heading': return renderHeading(block, ctx, brand);
    case 'text': return renderText(block, ctx, brand);
    case 'image': return renderImage(block);
    case 'button': return renderButton(block, brand, ctx);
    case 'divider': return renderDivider(block);
    case 'spacer': return renderSpacer(block);
    case 'logo': return renderLogo(block, brand);
    case 'social': return renderSocial(block, brand);
    case 'video': return renderVideo(block);
    case 'columns': return renderColumns(block, brand, ctx);
    case 'footer': return renderFooter(block, brand);
    case 'faq': return renderFaq(block, ctx);
    case 'countdown': return renderCountdown(block);
    case 'reviewlink': return renderReviewLink(block, brand, ctx);
    case 'products': return renderProducts(block, brand, ctx);
    case 'services': return renderServices(block, brand, ctx);
    case 'slider': return renderSlider(block);
    case 'form': return renderForm(block, brand, ctx);
    case 'code': return renderCode(block, ctx);
    default: return '';
  }
}

/* ───────────────────────── document shell ───────────────────────── */

// Coerce an editable padding value (may arrive as a string from a number
// input, or be missing) to a number, falling back to the default.
function padPx(v, dflt) {
  if (v === '' || v == null) return dflt;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : dflt;
}
function contentPadOf(brand) { return padPx(brand && brand.contentPad, 24); }
function outerPadOf(brand) { return padPx(brand && brand.outerPad, 24); }

function brandHeader(brand) {
  if (brand.showHeader === false) return '';
  const accent = brand.accentColor || ACCENT_DEFAULT;
  const cp = contentPadOf(brand);
  const headerLogo = brand.logo
    ? `<img src="${escapeHtml(brand.logo)}" alt="${escapeHtml(brand.companyName || '')}" style="max-height:42px;max-width:100%;width:auto;display:block;border:0;outline:none;" />`
    : brand.companyName
      // Editorial serif wordmark — the closest email-safe nod to The Seasons
      // (custom webfonts get stripped by most email clients, so we use a Didone
      // serif stack rather than ship a font that won't load).
      ? `<span style="font-family:'Didot','Bodoni MT',Georgia,'Times New Roman',serif;font-weight:500;letter-spacing:0.16em;text-transform:uppercase;color:${escapeHtml(accent)};font-size:22px;">${escapeHtml(brand.companyName)}</span>`
      : '';
  // With content padding 0, the header (e.g. a banner logo) goes edge-to-edge.
  return headerLogo ? `<div style="padding:${cp}px ${cp}px 0;">${headerLogo}</div>` : '';
}

function brandFooter(brand) {
  if (brand.showSignoff === false) return '';
  const sigName = brand.signatureName;
  const cp = contentPadOf(brand);
  return sigName
    ? `<div style="padding:8px ${cp}px ${cp}px;font-family:Helvetica,Arial,sans-serif;color:#475569;font-size:14px;">— ${escapeHtml(sigName)}</div>`
    : '';
}

// Per-block device visibility. Wraps a block's HTML so it can be hidden on
// mobile, on desktop, or (edge case) skipped entirely.
//   • hide on mobile  → `.eb-hide-mobile`, visible by default; the head media
//     query hides it under 600px. Outlook desktop ignores media queries, so it
//     stays visible there — correct for a desktop-only block.
//   • hide on desktop → `.eb-mobile-only`, hidden by default via inline
//     display:none + `mso-hide:all` (which the Outlook/Word engine DOES obey);
//     the media query reveals it on mobile. So Outlook desktop keeps it hidden.
// Outer wrapper for every block: carries the OUTSIDE margin (as padding, so it's
// Outlook-reliable) AND the device-visibility classes. A block hidden on both
// devices is skipped entirely (its margin goes with it, so no orphan gap).
function wrapOuter(html, block) {
  const hide = block && block.hide ? block.hide : {};
  const hideMobile = hide.mobile === true;
  const hideDesktop = hide.desktop === true;
  if (hideMobile && hideDesktop) return '';
  const m = resolveMargin(block);
  let style = `padding:${m.t}px ${m.r}px ${m.b}px ${m.l}px;`;
  const classes = [];
  // Margin is expressed as padding on this wrapper, so a per-block class gives
  // the mobile margin override something to target (see blockResponsiveCss).
  if (block && block.id && block.mobile && block.mobile.margin) classes.push(`eb-mw-${block.id}`);
  if (hideMobile) classes.push('eb-hide-mobile');
  if (hideDesktop) { classes.push('eb-mobile-only'); style += 'display:none;max-height:0;overflow:hidden;mso-hide:all;'; }
  const clsAttr = classes.length ? ` class="${classes.join(' ')}"` : '';
  return `<div${clsAttr} style="${style}">${html}</div>`;
}

function shell(brand, bodyHtml, preheader, responsiveCss) {
  const pageBg = brand.bgColor || '#f4f2f1';
  const cardBg = brand.cardColor || '#ffffff';
  const outerPad = outerPadOf(brand);    // grey margin around the card
  const contentPad = contentPadOf(brand); // inset around the content (0 = full-width blocks)
  const pre = preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>`
    : '';
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" />
<style>
  @media only screen and (max-width:600px) {
    .eb-hide-mobile { display:none !important; max-height:0 !important; overflow:hidden !important; mso-hide:all; }
    .eb-mobile-only { display:block !important; max-height:none !important; overflow:visible !important; }
    .eb-col { display:block !important; width:100% !important; padding:0 0 8px 0 !important; }
    ${responsiveCss || ''}
  }
</style></head>
<body style="margin:0;padding:0;background:${escapeHtml(pageBg)};">
  ${pre}
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:${escapeHtml(pageBg)};">
    <tr><td align="center" style="padding:${outerPad}px;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width:600px;width:100%;background:${escapeHtml(cardBg)};border:1px solid #E2E8F0;border-radius:12px;overflow:hidden;">
        <tr><td>
          ${brandHeader(brand)}
          <div style="padding:${contentPad}px;">
            ${bodyHtml}
          </div>
          ${brandFooter(brand)}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

/* ───────────────────────── public entry point ───────────────────────── */

/**
 * Render a whole template for one recipient.
 *
 * @param {object} template - { subject, preheader, mode: 'blocks'|'html', blocks, customHtml }
 * @param {object} [opts]
 * @param {object} [opts.brand]    - branding (falls back to defaultBrand()).
 * @param {object} [opts.mergeCtx] - merge context (see mergeContextFor); defaults to the sample recipient.
 * @returns {{ subject: string, html: string }}
 */
export function renderTemplate(template = {}, opts = {}) {
  const brand = { ...defaultBrand(), ...(opts.brand || template.branding || {}) };
  const ctx = opts.mergeCtx || mergeContextFor(SAMPLE_RECIPIENT, brand);
  const subject = renderTokens(template.subject || '', ctx);

  // HTML mode — staff wrote raw HTML. A full document (<!doctype/<html) is sent
  // verbatim after token merge; a fragment gets wrapped in the branded shell so
  // they don't have to repeat boilerplate.
  if (template.mode === 'html') {
    const merged = renderTokens(String(template.customHtml || ''), ctx);
    const isFullDoc = /^\s*(<!doctype|<html)/i.test(merged);
    return { subject, html: isFullDoc ? merged : shell(brand, merged, template.preheader) };
  }

  const blocks = Array.isArray(template.blocks) ? template.blocks : [];
  // Assemble the body. The 16px gap between blocks rides INSIDE the following
  // block's wrapper, so when a block is hidden on a device its spacer hides with
  // it (no orphaned gaps).
  const parts = [];
  const responsive = [];
  blocks.forEach((b) => {
    const inner = renderBlock(b, brand, ctx);
    if (!inner) return;
    // Collect the mobile media-query rule for any block with device overrides.
    const rcss = blockResponsiveCss(b);
    if (rcss) responsive.push(rcss);
    // The 16px gap between blocks is each block's default bottom margin (see
    // SPACING_DEFAULTS), applied by wrapOuter — so it hides with a hidden block.
    const wrapped = wrapOuter(inner, b);
    if (wrapped) parts.push(wrapped);
  });
  const bodyHtml = parts.join('\n');

  return { subject, html: shell(brand, bodyHtml, template.preheader, responsive.join('\n    ')) };
}
