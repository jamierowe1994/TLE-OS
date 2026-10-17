# The Letting Experts - Public Website Build Brief

**Status:** build brief, v1, 17 October 2026
**For:** the TLE OS build agent. This file is the single source of truth for the public
website. If something is not in here, ask before inventing it.
**Client:** Susan Liles (MD). Ops: Howard. Pre-tenancy: Kirstie. Sign-off: James, then Susan.
**Replaces:** thelettingexperts.co.uk, currently a Rex Websites template.

---

## 1. What We Are Building And Who For

A new public website for a national lettings brand that operates as a network of
self-employed partner agents. Not a corporate lettings site. Not a luxury property brand.

**Three audiences, in priority order:**

1. **Renters.** The majority of traffic. They want to find a home fast, in a place they can
   name, at a price they can afford, and then speak to an actual human about it.
2. **Landlords.** They want to know their property and their rent are safe, and that a real
   named person is looking after it.
3. **People thinking about becoming a letting agent.** They want to know what the deal is,
   what support they get, and what it costs them.

**The single idea the whole site has to carry:** with us you get a real, named, local expert,
not a call centre and not a portal. Everything visual and every word serves that.

**What we deliberately drop from the current site:** the cross-brand navigation (Sell,
Auctions, Mortgages, The Property Experts, The Auction Experts, The Mortgage Experts). It
pushes visitors off the site and makes a focused brand look like a holding company. Keep one
quiet line in the footer acknowledging The Experts Group, and nothing more.

---

## 2. Brand Facts (Use These, Do Not Eyedrop A Mock-Up)

Source of truth: `TLE Branding 3.pdf` ("Branding Update").

### 2.1 Palette

**Primary**

| Token | Name | Hex | Use |
|---|---|---|---|
| `--expert-red` | Expert Red | `#E31F36` | Sparingly. Live/urgent states, the logo pin, one accent per screen at most. |
| `--expert-grey` | Expert Grey | `#3B3B3C` | Deep text, dark surfaces, footer. |
| `--anti-flash` | Anti Flash White | `#F1F1F1` | Quiet surface. |

**Secondary**

| Token | Name | Hex | Use |
|---|---|---|---|
| `--clay` | Warm Clay | `#DE968F` | The web accent. James's pick for banners. |
| `--clay-deep` | Clay Deep | `#A85A51` | Small text and links on a tint, where raw clay fails contrast. |
| `--mist` | Mist | `#FFE4DF` | Washes, hover fills, tag backgrounds. |
| `--pink-wash` | Pink Wash | `#FDEFEC` | The faintest tint, for a panel that must not become a band. |
| `--sage` | Sage | `#B3BEA5` | Balance. The pink and clay alone read "very girly", sage fixes it. |
| `--brown` | Brown | `#56423E` | Buttons and calls to action. The contrast colour. |

**Surface and ink (carried straight from the portals, so the website reads as the same family)**

```css
--page:  #FFFFFF;   /* the ONE background. See the no-blockers rule. */
--ink:   #101014;
--muted: #6B6B70;
--line:  #C9C9C9;   /* neutral, not beige - a warm line reads as a pink tint on a box */
--card:  #FFFFFF;
--panel: #FBFBFA;   /* the faintest grey, a 50, never more */
--radius-card: 16px;
```

**Sanctioned colourways:** Expert Red x White, Expert Grey x Expert Red, Warm Clay x Anti
Flash White, Mist x Expert Red.

**Colour rules**
- The page background is **white and stays white, top to bottom, every page**. Sections are
  separated by type, space, scale and motion, never by a band of colour. See section 4.
- Expert Red is an event, not a theme. One per viewport, maximum.
- Buttons are Brown. Accents and washes are Clay and Mist. Sage is the balancing third.
- No per-page brand colours, no coloured pills, no gradients on text.
- Light theme only. There is no dark mode on the public site.

### 2.2 Typography

The brand guidelines name **Unitext** (Bold for titles and subheadings, regular for body) and
**Lora Italic** for supporting text. Unitext is not a Google font. The portals therefore run
the stack below, and the website uses the same stack so the two feel like one product.

| Role | Face | Notes |
|---|---|---|
| Display and headings | **Bricolage Grotesque** (`--font-heading`) | The house title face. Extrabold, tight tracking at display sizes. |
| Body and UI | **Inter** (`--font-body`) | Paragraphs, labels, forms. Paragraph text is Unitext where licensed, falling back here. |
| Figures | **Manrope** (`--font-figures`) | Rents, counts, stats. Tabular numerals on. |
| Supporting / editorial pull quotes | **Lora Italic** | Sparingly, and only for a human voice: a tenant quote, an agent's line about their patch. |
| Script | **Sacramento** | One word, once, on the whole site, if at all. It belongs to the presentation deck, not here. |

**Type scale** (fluid, clamp, 16px base, 1.25 ratio at the bottom and a bigger jump at the top)

```css
--t-display: clamp(2.75rem, 7vw, 6.5rem);   /* hero only. Line-height 0.95, tracking -0.03em */
--t-h1:      clamp(2.25rem, 4.5vw, 4rem);   /* section openers. LH 1.0, tracking -0.02em */
--t-h2:      clamp(1.75rem, 2.6vw, 2.5rem); /* LH 1.1, tracking -0.01em */
--t-h3:      clamp(1.25rem, 1.6vw, 1.5rem); /* LH 1.2 */
--t-body-lg: clamp(1.0625rem, 1.2vw, 1.25rem); /* lead paragraphs. LH 1.6 */
--t-body:    1rem;                           /* LH 1.65, max 68ch measure */
--t-small:   0.875rem;
--t-label:   0.75rem;                        /* uppercase, tracking 0.08em, muted */
```

**Typography rules**
- Bold typography that does not weigh the page down: huge sizes, **tight line-height, low
  ink**. One heavy heading per section, surrounded by air, with light body beneath it.
- Headings in the OS style are **not bold-and-coloured**: Title Case, letter-spacing 0 for
  anything that reads as a title in the UI, and never a coloured heading.
- Line breaks in display headings are deliberate. Author them with `<br>` or `text-wrap:
  balance`, do not let the browser decide.
- Body measure 68 characters maximum. Never full-width paragraphs.
- UK English. No em dashes anywhere a customer can read. Use " - ".
- Icons, never emojis.

### 2.3 Voice

Susan likes how the OS sounds. That is the target: plain, warm, short, and specific. Normal
people talking about houses.

**Do**
- Short sentences. Say the thing, then stop.
- Name the person and the place. "Kirstie looks after NN5" beats "our dedicated team".
- Answer the question the visitor actually has: how much, where, when can I see it, who do I
  call.
- Admit limits. "We have nothing in that postcode this week" is better than a fake result.

**Never**
- "Bespoke", "seamless", "unparalleled", "premium", "luxury", "state-of-the-art",
  "solutions", "journey", "unlock", "elevate", "nestled", "boasts", "in today's market".
- Exclamation marks in body copy.
- Sentences that could belong to any agency in the country.

**Strapline:** "The **Future** of Lettings" (Future bold).
**Supporting slogans:** "Experts in..." / "Experts not **just**...".
**Current site's landlord line, available for the landlord page:** "Giving Landlords Peace of
Mind".

**Reference lines, for calibration only, do not copy:** "Find What Moves You" and "Don't Rent
Your Career. Own It." (findrealestate.com), "Everything is closer than you think." and
"Sounds like a fit?" (21oaks.org). Short, human, confident, zero jargon. That register.

---

## 3. Motion System

Motion is how this site earns its keep. It is also how sections separate without bands of
colour. Treat it as a first-class system with tokens, not as per-component decoration.

### 3.1 Principles

1. **Motion explains, it does not perform.** Every animation answers "where did this come
   from" or "what changed".
2. **Transform and opacity only.** No animating width, height, top, left, box-shadow or
   filter in a scroll handler. `will-change` only while a thing is actually moving.
3. **Fast in, slower out.** Entrances 180-320ms. Scroll reveals 400-600ms. Nothing over 900ms.
4. **Interruptible.** A user who scrolls back up mid-animation must not be fought. No
   scrolljacking, no "take over the page for four screens".
5. **Everything has a still.** `prefers-reduced-motion: reduce` collapses every reveal to its
   final state with opacity 1, no transform, no stagger. Build this in the base styles, not
   as an afterthought.

### 3.2 Tokens

```css
--dur-fast:   160ms;
--dur-base:   240ms;
--dur-slow:   420ms;
--dur-reveal: 560ms;
--ease-out:   cubic-bezier(0.22, 1, 0.36, 1);   /* default */
--ease-in-out:cubic-bezier(0.65, 0, 0.35, 1);
--spring-soft: { stiffness: 220, damping: 28 }  /* motion/react */
--spring-snap: { stiffness: 420, damping: 32 }
--stagger:    60ms;
```

Library: **`motion` (motion.dev / Framer Motion) for React 19**, plus plain CSS
`@keyframes` and `IntersectionObserver` for anything that does not need state. Add GSAP
ScrollTrigger **only** if a scene genuinely needs a scrubbed timeline, and keep it to that one
component.

### 3.3 The Named Patterns (use these, consistently, across the site)

| Pattern | What it does | Where |
|---|---|---|
| **Line reveal** | Display headings animate in per line, mask from below, 60ms stagger, `--dur-reveal`. Not per letter: per-letter is the AI-slop tell. | Every section opener |
| **Image clip reveal** | Photos reveal with an `inset()` clip wipe plus a 1.06 to 1.0 scale settle. | Hero, listing cards on first paint |
| **Drift rail** | A horizontal rail of listing or agent cards that drifts slowly on scroll and is draggable with momentum. | "Homes we think you'll like", agent strip |
| **Sticky scene** | A sticky column of text whose panel on the other side swaps as you pass each point. Three steps maximum, exits cleanly. | How It Works, landlord services |
| **Count up** | Figures animate from 0 to value once, when 40% visible, 900ms, easing out. Tabular numerals so nothing reflows. | Stats, "homes let this month" |
| **Block pop** | The house raised-surface style: a slab of flat colour offset down and right, hard edge, no blur. At rest flat; on hover the element steps up-left 4px and an 8px slab appears right and bottom. The shadow an illustrator draws, not the one a renderer computes. | Cards, buttons, agent tiles |
| **Magnetic CTA** | Primary buttons pull 2-3px toward the cursor and return on a soft spring. Desktop pointer only. | Hero and closing CTAs |
| **Sketch accent** | A Scribbles mark (arrow, underline, sparkle) draws itself on with `stroke-dasharray` when its heading lands. Note: the Scribbles set contains **no underline**, all 150 checked - draw one as a path if needed. | One per section, maximum |
| **Soft section seam** | Instead of a hard divider: 120-180px of white, then the next heading entering with Line reveal. If a seam needs more, a **very** faint Pink Wash radial that fades to white at both edges. Never a straight edge. | Between every section |
| **Page transition** | Route change fades out at 120ms, new route's hero reveals on arrival. No full-screen wipes, no logo loaders. | All navigation |
| **Loading** | Every figure, listing grid and agent grid shows a skeleton or a transparent-background loop GIF while it loads. Never a blank space, never a zero that fills in later. | Everywhere data loads |

### 3.4 Motion Do Not

- No parallax on body text. Ever.
- No cursor trails, no confetti, no spinning houses, no number tickers that never stop.
- No autoplaying carousels. If it moves on its own it is a Drift rail, slow, and it stops on
  hover and on focus.
- No scroll-driven video scrubbing on mobile.
- No animation that delays content being readable. First paint is readable text.

---

## 4. Layout And The No-Hard-Blockers Rule

This is the structural request, written as rules the build can be checked against.

1. **One background colour for the whole site.** White. A section is never "a grey block" or
   "a coloured band". If you find yourself reaching for a full-bleed background to separate
   two sections, use space and scale instead.
2. **No harsh lines.** Hairlines only where they do real work (table rows, a nav underline on
   scroll), at `--line` and usually at 8% opacity. No 1px full-width rules between sections.
3. **No chunky sections.** Sections are defined by a heading, a generous measure of air, and
   content that is allowed to break the grid a little. Asymmetry is good. A 12-column grid
   where everything is a neat 4-4-4 is not.
4. **Everything flows.** Content should overlap the boundary between sections: an image that
   starts in one section and ends in the next, a heading that sits beside the previous
   section's last card. Overlap is the main tool for making the page feel continuous.
5. **Nothing may collide.** Clear space between every hero element and any text, at every
   width. This has been the single most-reported class of bug. Test 320, 375, 414, 768, 1024,
   1280, 1440 and 1920.
6. **Grid:** 12 columns, 24px gutters, max content width 1280px, with deliberate full-bleed
   escapes for imagery. Side gutter 20px on mobile, never less than 16px.
7. **Radii:** 16px cards, 999px pills, 0 on full-bleed imagery.
8. **Vertical rhythm:** section padding `clamp(72px, 10vw, 160px)` top and bottom. Generosity
   here is what buys the "clean and minimalist" read.

---

## 5. Imagery

### 5.1 Doctrine

The business is lettings. The stock is normal: terraces, semis, flats above shops, student
houses. **We are not pretending to be a luxury brand and we do not want the feeling of
luxury.** We want fun, honest and trustworthy.

- **Real photographs of real stock, pulled live from the book.** A slightly ordinary kitchen
  photographed honestly is on-brand. A marble island is not.
- **Real photographs of real people.** The agents' own headshots, already on a public CDN.
  Where an agent has no photo, do not substitute a stock person: use an illustrated placeholder
  tile (initials over a Mist wash with a doodle house) and the line "Photo coming soon".
- **Illustration carries the fun**, not photography. The licensed Notioly line-art scenes and
  the doodle/Icons sets do the playful work. Line art over white, ink colour, one accent.
- **Animated transparent GIFs** (the square figurative set, 480x480, 2-3s loops, real
  transparency) for in-page illustration slots: empty states, "we are on it" confirmations,
  the Join page. Re-encode anything over ~300KB. Pair every GIF with its still and
  `motion-reduce:hidden` on the GIF, `hidden motion-reduce:block` on the still.
- **Treatment:** no heavy filters, no duotones, no drop shadows on photos. A consistent subtle
  warmth is fine. Corner radius 16px on cards, square on full-bleed.

**Banned outright:** AI-generated interiors or exteriors, stock handshakes, suited people
pointing at laptops, keys-on-a-doormat clichés, drone shots of houses nobody lets, anything
with a lens flare, and any image a competitor could be using the same week.

### 5.2 Where Images Come From

**Owned and live (always prefer these):**

| Source | What | How |
|---|---|---|
| REX listing images | Every property photo on the site | `Listings/search` with `extra_options: { extra_fields: ["related.listing_images"] }`. Pre-made thumbs at 400x300 and 800x600. **URLs are protocol-relative** (`//uk-crm.cdns.rexsoftware.com/...`) so prefix `https:` before use anywhere outside a browser. Primary image present on only ~55% of the book - design the no-photo card properly. |
| REX agent headshots | Every agent portrait | `AccountUsers/search`, `settings.profile_image`. `thumbs["700x875"]` is the portrait crop, `thumbs["200x250"]` the small one. Same protocol-relative prefix. The CDN is public, verified 200 with no auth header. Set on ~70% of users. |
| Notioly Collection | 635 descriptively-named Notion-style line SVGs | Cherry-pick into `public/illustrations/`. Never copy a whole pack in. |
| Icons pack (250 numbered SVGs) | The preferred icon set | Cherry-pick into `public/icons/pack/` with semantic filenames. Render via the `DoodleIcon` CSS-mask component so they take `currentColor`. |
| Doodle icons (900+) | Fallback for anything Icons does not cover | `public/icons/doodle/` |
| Scribbles (150) | Arrows, sparkles, numbers, marks | For the Sketch accent pattern. Contains no underline. |
| Transparent GIF set (25) | Animated line-art loops | `public/illustrations/`, semantic names. |
| Cloudflare R2 (EU) | Hosting for any uploaded media, video and large stills | House default for media. |
| Own photography / Jack (TMKE videographer) | Agent intro clips, office and street footage | The most on-brand option for anything photography has to carry. Commission rather than stock where budget allows. |

**Free stock, for place and texture only (streets, skies, markets, bikes, front doors - never a
staged property interior):**

| Source | Licence | Good for |
|---|---|---|
| Unsplash | Unsplash licence, free commercial | UK streets, terraces, weather, texture |
| Pexels | Pexels licence, free commercial | Same, plus short video loops |
| Openverse (CC-search over Flickr, Wikimedia etc.) | Per-item CC, **check each** | Specific UK towns and landmarks by name |
| Nappy | Free commercial | Genuinely diverse people who do not look like stock |
| Gratisography | Free commercial | Odd, funny, human shots for the Join page |
| Life of Pix / Kaboompics | Free commercial | Interiors that look lived in rather than staged |
| Geograph (British Isles) | CC BY-SA, attribution required | Real photographs of actual UK postcodes and streets |
| OpenStreetMap via Leaflet (already in the OS) | ODbL, attribution required | Maps on listing and area pages |

**Attribution:** keep a `docs/IMAGE-CREDITS.md` with source, licence and URL for every
non-owned asset. CC BY-SA and Geograph items must carry visible credit.

**Do not** use Google Places or Street View imagery server-side with the current key: the live
Google key is the browser key and is referrer-restricted, so server calls 403 silently. If
Street View is wanted, provision a separate server key first.

---

## 6. Site Map

Five things in the primary navigation. Nothing else.

```
/                         Home
/search                   Find a home (the main event)
/search/[slug]            Listing detail
/agents                   Find an expert
/agents/[slug]            Agent microsite
/landlords                For landlords
/join                     Become a Letting Expert
/about                    About us
/news  /news/[slug]       News
/contact                  Contact
  Regulatory, footer only:
/complaints-handling      Complaints procedure          (required)
/client-money-protection  CMP certificate               (required)
/tenant-fees              Fees and redress scheme       (required, see 11.3)
/privacy /cookies /terms
```

Primary nav: **Find a Home · Find an Expert · Landlords · Join Us · About**. Search and phone
sit top-right. News lives in the footer and on the About page.

---

## 7. Page Specifications

### 7.1 Home

Section order, with the motion each one uses.

1. **Hero.** Display heading, three or four lines, authored breaks. One line of body. A real
   search control, not a button that goes to a search page: location input with
   type-ahead, price ceiling, bedrooms, and a Brown primary CTA. Behind and around it, two or
   three real property photographs from the live book, revealed with Image clip reveal, placed
   asymmetrically with real space between them and the type. *Motion: Line reveal, Image clip
   reveal, Magnetic CTA.*
2. **Homes We Think You'll Like.** 8-12 live listings in a Drift rail, each card: photo, rent
   with the correct period, area, bedrooms if known, agent avatar, and a Let Agreed badge where
   true. "See all homes" link. *Motion: Drift rail, Block pop on hover.*
3. **Meet The Experts.** A strip of real agent headshots, name and patch, drifting the other
   way to the listings rail. Click goes to the microsite. *Motion: Drift rail.*
4. **How Renting With Us Works.** Three steps, no more: find it, see it, move in. Plain
   language, one illustration each. *Motion: Sticky scene.*
5. **Why People Stay.** Three or four real numbers from the OS (homes let this month, average
   days to let where we have four or more completed lets with dates, properties managed,
   agents nationwide) plus two tenant or landlord quotes in Lora Italic. Every figure live and
   scoped to the current month, or the tile renders an error state. *Motion: Count up.*
6. **For Landlords.** One quiet block, two sentences, link to `/landlords`. Not a second
   homepage.
7. **Thinking Of Becoming A Letting Expert?** The recruitment pitch, warm not corporate, link
   to `/join`. *Motion: Sketch accent.*
8. **Latest From Us.** Three news cards.
9. **Closing CTA.** One big line, one input, one button.
10. **Footer.**

### 7.2 Find A Home (`/search`)

The most important page on the site. Optimised for a renter who knows roughly where and
roughly how much.

- **Filters, built only from fields the data actually carries:** location (postcode, town,
  area), monthly rent band, bedrooms *(see the data gap in 9.2)*, property type (House/Flat
  only - the feed carries nothing finer), availability date, Let Agreed shown or hidden,
  service type where useful.
- **Sorting:** newest first by default (matches what renters expect), then rent ascending and
  descending, then days advertised.
- **Rent display:** show the real period. 23 listings in the book are weekly, up to £2,400/wk.
  Printing a weekly rent as "pcm" is wrong by about 4.3x. Carry `price_rent_period` for
  display, and a separate monthly equivalent (x52/12) for **sorting and banding only**.
- **Layout:** cards on the left, optional map on the right (Leaflet, already in the OS, OSM
  tiles with attribution). Map is a toggle on mobile, never a tiny strip.
- **Behaviour:** URL carries every filter so a search is shareable and indexable. Results
  update without a full page reload, with a skeleton while loading. Infinite scroll with a
  "load more" fallback, and a working back button.
- **Empty state:** honest and useful. "Nothing in NN5 under £900 right now." Then: the nearest
  matches, a widen-the-search button, and an alert signup. Never pad with irrelevant stock.
- **Motion:** cards reveal on a 60ms stagger, Block pop on hover, filter pills animate their
  own state. Do not animate the whole grid on every filter change - cross-fade it.

### 7.3 Listing Detail (`/search/[slug]`)

- Gallery first, square carousel in the house style, keyboard and swipe, real photo count.
  Where no photos exist, an illustrated placeholder and an honest line.
- Rent with correct period, deposit, available from, bedrooms, EPC rating where present
  (46% of the book), council tax band if we hold it, furnishing.
- **The agent, prominently.** Headshot, name, position (drop the line if empty, never default
  it to "Agent"), mobile, and a direct enquiry form. The renter should never wonder who they
  are dealing with.
- Map and a short, honest "about the area" built from the live listings feed, never from a
  statistics endpoint.
- Live advert links where they exist, from `ListingPortalUploads.link_on_portal`. **Never
  construct a portal URL.** Filter to `feed_status === "feeding"` and to a non-empty link.
- Similar homes rail.
- Sticky enquiry bar on mobile. Phone, WhatsApp where the agent has it, and the form.

### 7.4 Find An Expert (`/agents`)

- Filter by location and by name. A real map of coverage is better than a list of counties.
- Card: headshot, name, patch, position, number of live homes, and a one-line "ask me about".
- **Agents are scoped to TLE by email domain, and TLE partners sit on BOTH domains.** Get this
  wrong and the directory either shows five sister businesses' staff or hides half of ours.
- Walk the API with `offset`: `limit: 200` silently returns zero rows. 100 is the ceiling.

### 7.5 Agent Microsite (`/agents/[slug]`)

The thing that makes this site different from every other agency site. Each agent gets a small
site of their own, inside the brand.

- Hero: large portrait, name at display size, patch, one sentence in their own words.
- **Biography.** `profile_bio` is **null for every single user in REX**. The bio must come
  from the OS's own store (`os_user_prefs`, key `presentation_profile`). If an agent has not
  written one, show their patch and their homes, and no empty heading.
- Their live homes, as a grid, pulled by agent.
- "What I can help with", from a short structured list the agent sets in the OS.
- Their news posts, if any.
- Contact: direct form, mobile, and a booking link if their diary is exposed.
- Shareable and indexable with its own OG image generated from the headshot plus name. These
  pages are the SEO win: "letting agent in <town>" is the winnable query shape. "TLE" is not.

### 7.6 Landlords (`/landlords`)

Keep the material that already works on the current site, rewritten in the new voice.

- "Giving Landlords Peace of Mind" as the opener.
- The three service levels, as a comparison that a human can read in ten seconds. Honest about
  what each one does and does not include.
- The flagship Experts Management Service, with rent guarantee and legal protection.
- Renters' Rights Act content, kept and maintained. It is a genuine traffic and trust asset.
- Advice and support hub.
- A real appraisal CTA that books into the OS, not a generic contact form.

### 7.7 Become A Letting Expert (`/join`)

Separate in tone: this is a recruitment page, and it is allowed to be the boldest page on the
site. Monochrome plus clay, biggest type, most motion.

- What the deal actually is, in plain numbers where James approves publishing them.
- What they get: the OS, the brand, the compliance cover, the leads, the training.
- Who it suits and who it does not. Saying who it is not for is the most persuasive thing on
  the page.
- Two or three real partner stories, with photos and names.
- A short application form. Not twelve fields.
- Note: the current site sends this to `join.thelettingexperts.co.uk`. Decide whether that
  subdomain folds into the new site or stays separate, and redirect accordingly.

### 7.8 About (`/about`)

- Who we are, in human terms. Founded, what we do, how the partner model works.
- A line on The Experts Group, no more. No brand carousel.
- The team, linking into agent microsites.
- Numbers, live.
- The regulatory facts: company name and number (The Letting Experts (Nationwide) Ltd,
  registered in England and Wales, company no. 14702207), CMP, redress scheme.

### 7.9 News (`/news`)

- Editorial list, generous type, no sidebar. Categories for Renters, Landlords, Area Guides.
- Migrate the existing posts. The current sitemap holds 687 URLs - every one that has value
  needs a 301 to its new home.

### 7.10 Contact

- hello@thelettingexperts.co.uk, 0333 344 9915.
- The honest answer to "who do I speak to": a nudge toward the agent directory first.
- A form that routes to a real inbox and creates a lead, with a visible confirmation.

---

## 8. Search, Forms And Enquiries

- **Site-wide search** in the header covers homes, agents, areas and news, in that priority.
  Keyboard shortcut, instant results, no results page unless the user asks for one.
- **Enquiry forms** create a lead in the real system. Leads flow live today
  (87k historical, `leads.created` webhook exists), so wire to that rather than inventing a
  store.
- **Every form:** visible labels, inline validation on blur not on keypress, a real error
  summary, a confirmation state that says what happens next and who will call.
- **Consent:** no pre-ticked boxes, separate marketing consent, PECR-compliant wording.
- **Nothing automated goes out to a landlord or a tenant without James's explicit say-so.**
  Build the routes, leave the sending unscheduled. This is a standing rule, not a phase-one
  simplification.
- **Cookie banner:** decline non-essential is the default path and must be one click.

---

## 9. Data Contract

Everything on this site is pulled live. No seed data, no snapshot fallback, no hardcoded month
literals. If a source is unreachable, render an honest error state. Never show a stale number.

### 9.1 Sources

| Source | Serves | Status |
|---|---|---|
| **REX** `Listings/search` | The whole property book, photos, EPC, service type | Read-only. Standing write lock on REX. |
| **REX** `AccountUsers/search` | Agents, headshots, position, mobile | Read-only |
| **REX** `ListingPortalUploads` | Live advert links | Read-only |
| **REX** leads + `leads.created` | Enquiries in | Live |
| **Propoly** | Source of truth for the deal pipeline | Read-only, no email data |
| **OS** `os_user_prefs.presentation_profile` | Agent biographies | The OS owns these |
| **OS** market picture (`lib/market-picture.ts`) | Area context, computed from the listings feed | Live |
| **OS** `/api/listings` | Cached book, stale-while-revalidate | Reuse this, do not call REX from the website directly |

### 9.2 Traps That Will Otherwise Ship As Bugs

- **56% of the current rental book is `draft`** (165 of 293 measured). The website must show
  `published` stock only, or it advertises homes with no portal presence and possibly no
  agreement to market. Confirm the rule with Susan before launch.
- **Rentals must be asked for explicitly.** Without `listing_category_id =
  residential_rental`, the first 80 rows come back 100% sales stock. The book has contained a
  £4m sale miscategorised as a rental.
- **Bedrooms are not reachable from `Listings/search`.** Probed and confirmed. If bedroom
  filtering is required (it is, for renters), it needs the property record or a portal feed
  wired first. **Flag this as a dependency, not a detail.**
- **`let_agreed` is `null | "0" | "1"`.** The string `"0"` is truthy in JavaScript, so a naive
  check mislabels a quarter of the book as let agreed.
- **Rents are not all monthly.** See 7.2.
- **Protocol-relative image URLs** need an `https:` prefix outside a browser.
- **`limit: 200` on a REX search returns zero rows, silently.** Cap at 100, walk with `offset`.
- **Field coverage, measured:** price 64%, available-from 55%, EPC rating 46%, primary image
  55%, `tenancy_id` 0%. Every card and every detail field needs a designed empty state.
- **Days on market** is computable only for published listings (`system_publication_time` is
  populated there and null on drafts).
- **Never render an "us: 0" row** in any market or share panel. Where TLE does not appear as an
  agent in an area, the panel degrades to "who you are competing with".
- **Our own let speed is only quoted with four or more completed lets** that have both
  timestamps. Otherwise it is not quoted at all.
- **Never put market days-advertised beside our own days-to-let** without checking which is
  which: in measured areas ours is slower, and the two measure different things.
- **A cold cache returns null and computes behind.** Any composed value must handle the
  not-yet-there case, or it ships zeros silently. Bump the cache version whenever a cached
  object gains a field.

---

## 10. Accessibility

WCAG 2.2 AA, and treat it as a design constraint rather than a test at the end.

- Contrast 4.5:1 for body, 3:1 for large text. **Warm Clay on white fails for small text** -
  that is why Clay Deep exists. Check every pairing.
- Visible focus on everything interactive, in Brown, 2px with a 2px offset. Never `outline:
  none` without a replacement.
- Full keyboard path through search, filters, gallery, map and forms.
- Every image a real `alt`. Property photos get something useful ("Front of a mid-terrace on
  Milton Street"), decorative illustration gets `alt=""`.
- Reduced motion honoured by every pattern in section 3.
- Target size 44px minimum on touch.
- Semantic landmarks, one `h1` per page, headings in order.

---

## 11. Technical, SEO And Compliance

### 11.1 Stack

Next 15 App Router, React 19, TypeScript, Tailwind v4, npm. `output: "standalone"`. Deployed
on **Railway**, port 3000. Vercel is not part of the stack. Repo under `jamierowe1994/*`.
Media on Cloudflare R2 (EU).

- Static where possible, ISR for listing and agent pages with a short revalidate, dynamic only
  for search.
- Image handling through `next/image` with the REX CDN allowlisted in `next.config.ts`.
- Fonts self-hosted with `next/font`, `display: swap`, subset to Latin.
- **Performance budget:** LCP under 2.0s on a 4G phone, CLS under 0.05, INP under 200ms, under
  180KB of JavaScript on the first load of the homepage. Motion does not get to break this.
- There is no ESLint config in the sibling repo and `next build`'s lint step therefore checks
  nothing. Hand-check rules of hooks. `tsc` and `npm run build` are not verification.

### 11.2 SEO

- The site is already indexed and technically clean. Do not regress it.
- **Carry the analytics across:** GA4 `G-X6VY16VEQX` and GTM `GTM-54WJFMHG`.
- Canonical to `thelettingexperts.co.uk` (singular). The plural domain 301s to it.
- **301 every URL in the existing 687-URL sitemap**, especially `/listings/*`, `/staff/*` and
  `/blog/*`. Map them before launch and ship the redirect table with the first deploy.
- New sitemap with listings, agents, news and area pages. `robots.txt` allows all.
- Structured data: `RealEstateListing` on listing pages, `RealEstateAgent` on agent
  microsites, `Organization` sitewide, `BreadcrumbList`, `FAQPage` where there are real FAQs.
- The winnable query shape is **location plus "letting agent"**, which is exactly what agent
  microsites and area pages are for. Not "TLE".
- Per-page OG images, generated.
- Drop the "Powered by Rex Websites" credit.

### 11.3 Compliance (non-negotiable, this is a regulated sector)

- **Tenant fees and charges** displayed clearly, per the Tenant Fees Act.
- **Redress scheme** and **Client Money Protection** membership shown with certificate.
- **Complaints procedure** kept and linked in the footer.
- Company name, number and registered address in the footer.
- EPC rating displayed where we hold it. Do not infer one.
- Property particulars disclaimer.
- Cookie consent, privacy policy, terms.
- **REX, PayProp and Propoly are read-only.** The website reads. It never writes to them.

---

## 12. Build Order

1. Tokens, type scale, motion tokens, layout primitives, `DoodleIcon`,
   `block-pop`. Prove the no-blockers rule on a single scroll-through of placeholder sections.
2. The data layer: listings and agents through the OS's cached routes, with every trap in 9.2
   handled and a test that proves it.
3. `/search` and the listing detail page. This is the product.
4. `/agents` and the agent microsite.
5. Home.
6. `/landlords`, `/join`, `/about`, `/news`, `/contact`.
7. Redirect table, sitemap, structured data, analytics.
8. Motion polish pass, then the accessibility and reduced-motion pass.

**Before anything is shown to Susan:** drive the actual pages in a browser. Screenshot desktop
and mobile, read the console, confirm every figure is non-null and month-correct, and check
nothing collides at 320px. A green build proves nothing. These bugs get found on a phone or on
a call with the client otherwise.

**Working rule:** anything a client can see gets built, previewed and **not pushed**. Backend,
data and integration work runs to completion and gets reported.

---

## 13. Open Questions For James

1. **Draft stock.** Show published only, or show the whole current book? 56% of it is draft.
2. **Bedrooms.** Renters will expect to filter by bedrooms and the listings search cannot
   supply them. Do we wire the property record, use a portal feed, or launch without the
   filter?
3. **Join subdomain.** Does `join.thelettingexperts.co.uk` fold into `/join` or stay separate?
4. **Agent biographies.** 100 agents, zero bios in REX and only 8 of 43 written in the Hub.
   Who collects them, and what does a microsite show in the meantime?
5. **Unitext licence.** Do we have a web licence for Unitext? If yes it replaces Inter for body
   and Bricolage for headings becomes a decision rather than a fallback.
6. **Publishing partner economics** on the Join page: which numbers may be public.
7. **Photography budget** for agent portraits and town footage. The 30% of agents with no
   headshot is the weakest point in the whole concept.
