// TMKE — branded starter email templates.
// A springboard set for the marketing team: minimal, polished, on-brand. Each
// uses the house palette, the serif wordmark header (auto, from the shell), one
// R2 stock image, merge fields, and a footer. Seeded from /admin/email.
// These are drafts — staff edit and adjust freely.

// Confirmed public R2 stock images.
const IMG = {
  templates: 'https://assets.tmke.co.uk/TMKE%20Home%20Page/Copy%20of%20TMKE%20Insta%20Templates%20-%20Colour%20Palette%201%20Mockup.png',
  smm: 'https://assets.tmke.co.uk/Smm%20hero.jpg',
  camera: 'https://assets.tmke.co.uk/camera%20view.jpg',
  leah: 'https://assets.tmke.co.uk/Jack%20Photos%20-%20Homepage/LeahMusana-7.jpg',
  slider: 'https://assets.tmke.co.uk/TMKE%20Home%20Page/Slider%201.png',
};
const SITE = 'https://tmke.co.uk';

// Shared house branding (the shell adds the TMKE serif wordmark + signature).
const BRAND = {
  companyName: 'TMKE',
  accentColor: '#371e28',
  bgColor: '#f4f2f1',
  cardColor: '#ffffff',
  signatureName: 'The TMKE Team',
  website: SITE,
};

// Tiny block builders (unique ids across the whole set).
let _n = 0;
const id = () => 'sb_' + (_n++).toString(36);
const H = (text) => ({ type: 'heading', id: id(), text, align: 'left', color: '' });
const T = (text) => ({ type: 'text', id: id(), text, bg: '' });
const IMGB = (url) => ({ type: 'image', id: id(), url, alt: '', linkUrl: '', align: 'center' });
const BTN = (text, url) => ({ type: 'button', id: id(), text, url, color: '', align: 'left' });
const SP = (height = 16) => ({ type: 'spacer', id: id(), height });
const DIV = () => ({ type: 'divider', id: id(), color: '#E2E8F0' });
const COLS = (layout, cells) => ({ type: 'columns', id: id(), layout, cells });
const FOOT = (note) => ({ type: 'footer', id: id(), note, address: 'Kettering, Northants', showSocial: true, unsubscribe: true });

// Centred variants for the "base" reference template.
const HC = (text) => ({ type: 'heading', id: id(), text, align: 'center', color: '' });
const TC = (text) => ({ type: 'text', id: id(), text, align: 'center', bg: '' });
const BTNC = (text, url) => ({ type: 'button', id: id(), text, url, color: '', align: 'center' });

export const STARTER_TEMPLATES = [
  // The house style for our AUTOMATED (transactional) emails — the recommended
  // base to brand every code-generated email against: the logo up top, a line,
  // the message centred on the brand background, and the standard footer. Open
  // it, tweak to taste, and it becomes the reference for the automated emails.
  {
    name: 'Branded base (for automated emails)',
    subject: 'A message from TMKE',
    preheader: 'The house style for our automated emails.',
    blocks: [
      DIV(),
      HC('A short, friendly headline'),
      TC("This is the house style for our automated emails: the logo and a line at the top, the message centred on the brand background, and the standard footer below. Swap this copy for the real message — everything else stays consistent."),
      SP(8),
      BTNC('A call to action', SITE),
      FOOT('This is the standard TMKE footer.'),
    ],
  },
  {
    name: 'Thank you for your purchase',
    subject: 'Thank you for your purchase, {{firstName}}',
    preheader: 'Your pack is ready in your library.',
    blocks: [
      H('Thank you, {{firstName}}.'),
      T("Thanks for picking up <strong>{{packName}}</strong> — it's now sitting in your library, ready to open in the studio and make your own."),
      IMGB(IMG.templates),
      SP(8),
      BTN('Open your library', `${SITE}/account`),
      DIV(),
      T('Need a hand getting started? Just reply to this email — a real person reads every one.'),
      FOOT('You\'re receiving this because you bought a pack from TMKE.'),
    ],
  },
  {
    name: 'Welcome to the platform',
    subject: 'Welcome to TMKE, {{firstName}}',
    preheader: 'Everything you need to look the part, in one place.',
    blocks: [
      H('Welcome aboard, {{firstName}}.'),
      T("You're in. TMKE gives you on-brand templates, a studio to make them yours in minutes, and a calendar to stay consistent — without the agency price tag."),
      IMGB(IMG.smm),
      SP(8),
      BTN('Explore the studio', `${SITE}/editor`),
      T('Tip: set up your <strong>brand kit</strong> first, and every template you open is already wearing your colours and fonts.'),
      FOOT('You\'re receiving this because you joined TMKE.'),
    ],
  },
  {
    name: 'Thank you for your booking',
    subject: 'Your shoot is booked, {{firstName}}',
    preheader: "Here's what happens next.",
    blocks: [
      H("You're booked in."),
      T("Thanks, {{firstName}} — your shoot is confirmed. Jack will be in touch beforehand with everything you need, and a calendar invite is on its way."),
      IMGB(IMG.camera),
      SP(8),
      BTN('Manage your booking', `${SITE}/account`),
      T('Anything change your end? Reply here and we\'ll sort it.'),
      FOOT('You\'re receiving this because you booked a shoot with TMKE.'),
    ],
  },
  {
    name: 'Thank you for registering interest',
    subject: 'Thanks for your interest, {{firstName}}',
    preheader: "We'll be in touch shortly.",
    blocks: [
      H('Thanks for getting in touch.'),
      T("We've noted your interest, {{firstName}}. One of the team will be in touch shortly to talk through what you need. In the meantime, here's a little more about what we do."),
      IMGB(IMG.leah),
      SP(8),
      BTN('See what we do', `${SITE}/videography`),
      FOOT('You\'re receiving this because you registered your interest with TMKE.'),
    ],
  },
  {
    name: "Here's our latest pack",
    subject: 'Fresh templates just landed',
    preheader: 'Our newest pack is ready to use.',
    blocks: [
      H('New in The Edit.'),
      T("We've just added a new pack of ready-to-edit templates — built to make your next post look effortless. Open one in the studio and it's yours in minutes."),
      IMGB(IMG.slider),
      SP(8),
      BTN('View the pack', `${SITE}/account`),
      FOOT('You\'re receiving this because you\'re part of the TMKE community.'),
    ],
  },
  {
    name: "Here's what TMKE can do for you",
    subject: "Here's what TMKE can do for you",
    preheader: 'Templates, studio, video and managed socials.',
    blocks: [
      H('Everything in one place.'),
      T('From ready-to-edit templates to done-for-you socials, TMKE helps property professionals show up consistently and look the part. Here are three ways we can help:'),
      COLS('thirds', [
        { title: 'The Studio', text: 'On-brand templates you make yours in minutes.', btnText: 'Open', btnUrl: `${SITE}/editor` },
        { title: 'Videography', text: 'Property & agent video, shot and edited.', btnText: 'Explore', btnUrl: `${SITE}/videography` },
        { title: 'Managed socials', text: 'We run the channel for you, end to end.', btnText: 'Learn more', btnUrl: `${SITE}/account/services` },
      ]),
      SP(8),
      BTN('Book a quick call', `${SITE}/videography`),
      FOOT('You\'re receiving this because you\'re part of the TMKE community.'),
    ],
  },
].map((t) => ({ ...t, mode: 'blocks', status: 'draft', branding: { ...BRAND }, trigger_key: null }));
