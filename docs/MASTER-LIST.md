# TLE OS - the master list

## PILOT: MONDAY 21 SEPTEMBER. 10 DAYS.
## FULL LAUNCH: 14 OCTOBER.

---

> ## READ THIS FIRST - WHAT WILL NOT BE READY FOR 21 SEPTEMBER
>
> **CAN'T BE DONE BY US AT ALL - WAITING ON SOMEBODY ELSE**
> - **Everything waiting on Propoly** (C1-C7): the Flatfair clause, service level, reading deal documents, deal notes, creating a deal, webhooks. Ray has the email.
> - **Everything waiting on Flatfair** (C8): there is no API.
> - **Everything waiting on PayProp** (C9): the income report, unreconciled funds.
> - **Everything Michael owns** (J1, C10-C12): **he has no account**, so he cannot test inspections or his own view until you invite him (A1).
>
> **WON'T BE READY FOR 21 SEPTEMBER - TOO BIG TO BUILD AND TEST IN TIME. CAN MAKE 14 OCTOBER.**
> - **J12 - RECEIVING EMAIL.** The OS can send but cannot read a reply. It needs a Microsoft mailbox subscription, admin consent in Azure, and matching each reply to a landlord or tenant. **Agents will be sending from the OS during the pilot but replies will only land in Outlook.**
> - **J6 - TENANTS RAISING REPAIRS AND SENDING DOCUMENTS.** Neither exists. Two builds.
> - **F1.1 Kelly's training hub** and **F1.2 the API centre.** Not started.
>
> **NOT NEEDED FOR THE PILOT - DEFER TO 14 OCTOBER UNLESS YOU SAY OTHERWISE**
> - **J5** portals to Francesca and Susan, **J8** Bond, **B1/B2** the second email domain and testing every flow, **H1-H4** ideas.
>
> **FOUND IN THE ROUND 1 SWEEP, 11 SEP - THREE BUTTONS SAY "SENT" AND SEND NOTHING**
> - **On a viewing: "Cancel & tell them", "Send the offer" (to the landlord), and the booker's "Send" confirmation to the applicant.** All three go through one piece of the screen (SendFlow) that has no send in it. The screen logs "messages sent", but no email or WhatsApp leaves. The landlord on the cancel and offer messages is a placeholder (landlord@record.tle, 07000 000000), and the offer's link goes to a /review page that does not exist.
> - **Risk for the pilot:** an agent cancels a viewing, and the applicant turns up anyway. (The appraisal confirmation to a landlord is a separate path and does send.)
> - **DONE 11 Sep (D16): HIDDEN FOR THE PILOT**, with two more of the same kind found on the way (the no-show email and Reschedule). The screen now says to do it in REX and Outlook. One switch brings them back once they really send: `lib/viewing-sends.ts`.

> **FOUND 11 SEP - "BOOK A VIEWING" FROM A LISTING PICKS FROM MADE-UP PEOPLE (D17)**
> - **Open a listing, press Book a viewing: "Who's viewing?" lists sample applicants (Sarah Johnson, Tom Williams...) from `lib/leads-sample.ts`, not REX, and the agent is always "Kirstie".** Nothing is saved - the booking lives on that screen until it closes. (Booking from a lead is the real path.)
> - **Your call:** hide the button on listings for the pilot (my recommendation, minutes), or feed it the listing's real enquiries from REX (half a day).

> **DECISION NEEDED FROM YOU, OR IT BLOCKS**
> - **A1 - WHO IS IN THE PILOT.** Eleven items cannot start until agents can sign in. **This is the single biggest blocker.**
> - **D8 - STANNP IS LIVE.** A postcard sent from Bond is really printed and posted. Confirm, or I put it back into test mode.
> - **J24 - WHICH VIEW** did you mean by "bring it in line with the rest"?
> - ~~FONTS - CONFIRM THE HAND-DRAWN HEADINGS GO TOO~~ **CONFIRMED 11 Sep: both go.** Shantell Sans (every OS heading and number) and Ms Madi (the deck and postcard script) move to Manrope and Inter. Round 3, item 11.

---

## THE ORDER - EASIEST FIRST

Tick them off by number. Rounds 1 and 2 run at the same time: Round 1 is mine, Round 2 is yours.

### Round 1 - quick fixes, Claude, no one needed (today)
| # | What | Size |
|---|---|---|
| 1 | Correct the two stale notes: the Testing page says the agent compliance checker is "not built" (it is), Portfolio says PayProp has "no key" (it has) | **DONE 11 Sep** - awaiting push |
| 2 | Compliance tile grid from five columns to four | **DONE 11 Sep** - awaiting push |
| 3 | Drop the Bedrooms column on Listings - REX has no bedroom field, so it is a column of dashes | **DONE 11 Sep** - awaiting push |
| 4 | "+ Add new listing" does nothing when pressed - make it open REX | **DONE 11 Sep** - awaiting push. Opens REX's listings in a new tab. **There is no known link straight to REX's "new property" form**, so it lands one click short of it rather than on a guessed address that might be dead. |
| 5 | **Dead-link sweep of the whole OS** (J17) - sign in, open every page, follow every link, list what breaks | **DONE 11 Sep.** 117 pages, every one loads, no errors, no dead links. The six links out (Propoly, REX, three decks, WhatsApp) all answer. **The sweep finds links, not buttons that do nothing - see the three fake sends at the top (D16).** The sample deck's WhatsApp number is 07000 000000 on purpose (a made-up agent). |

### Round 2 - yours, minutes each (while Round 1 runs)
| # | What |
|---|---|
| 6 | **A1 - the pilot names.** Send them and I invite them. |
| 7 | **A2 - Kirstie's email.** `kirstie.mulholland@` in the OS, `kirstie.wallington@` in REX. Which is right? |
| 8 | **D8 - Stannp**: live on purpose, or back to test? |
| 9 | **J24 - which view.** |
| 10 | **D1 button shapes / D2 masthead height** - when you have looked |

### Round 3 - the new fonts and the new colours, everywhere (Claude, about two days)
| # | What |
|---|---|
| 11 | **Fonts: Manrope for headings, with real weight; Inter for body.** Replaces Shantell Sans (the hand-drawn headings and numbers), Montserrat (body) and Ms Madi (the script). Everything reads three CSS settings, so the 183 headings and 405 figures follow on their own. The tenant portal, the admin scope and the decks set their own fonts and are done by hand. **The code change is small; checking every page afterwards is the real work.** |
| 12 | **Each surface gets its own colour settings** - the OS, the landlord sign-in and portal, the tenant sign-in and portal - all drawn from one extended palette, with sage and dark brown brought in to balance the pink and give contrast |
| 13 | **Give the email template a switch for who it is for**, so an agent's email and a landlord's email each take their own colours. Today one template serves both and cannot tell them apart. |
| 14 | Emails, the landlord portal (reads colour settings - clean) and the tenant portal (41 colours and one font hardcoded - the bigger job) in the new colours and fonts, previewed before anything goes |
| 15 | Landlord-facing documents in the new colours and fonts: invoice, terms signing, the decks, postcards |

### Round 4 - pilot readiness (Claude, with you where marked)
| # | What |
|---|---|
| 16 | Testing page gets a Portals section, an Agent section, and the PLC split into the agent's view and Kirstie's (J21, J22) |
| 17 | **Steve is seeded from what we already have** - every screen's description, the guides, these docs - so he is not empty on day one (J26). Susan and Francesca add the brochures after. |
| 18 | **One supervised send from an agent's own mailbox** (A3) - with you |
| 19 | **The pilot plan**: who, when the invite goes, what testers are asked to do, the session (J20) - with you |
| 20 | **The full run, lead to checkout, on production** (J15) - with you. It tests J2, J11, J13 and J14 on the way. |

### After the pilot starts, before 14 October
Receiving email (J12), tenant repairs and documents (J6), portals to Francesca and Susan (J5), Bond (J8), the second email domain and testing every flow (B1, B2), Michael's items once he can sign in, and everything waiting on Propoly, Flatfair and PayProp.

---

## THE EXTENDED PALETTE - one palette, independent settings per surface

James, 11 Sep 2026, revised the same day. **The OS, the landlord sign-in and portal, and the tenant sign-in
and portal each run their own colour settings** - all drawn from this one extended palette, which is what
we already have plus two new colours. The pink and white on their own read "very girly"; **sage balances
it and the dark brown gives contrast**, used where they are needed rather than everywhere.

*(This replaces the earlier "the palette does not change the OS" - the OS takes sage and brown too.)*

| Colour | Hex | Use |
|---|---|---|
| Light pink | `#FDEFEC` | Backgrounds, washes |
| Clay | `#CFA096` | Secondary - rules, soft fills |
| Sage | `#B3BEA5` | Supporting - the new colour |
| Dark brown | `#56423E` | **Accent** - buttons, calls to action, headings |
| ~~Pale green~~ | ~~`#EAF6DC`~~ | **Dropped** |

The OS's existing accents stay as the agent's own choice (Warm Clay `#DE968F`, Blush `#F0B3BB`, Classic Red
`#E31F36`); sage and brown join them as supporting and contrast colours. **The email template is shared
between agent and customer emails and cannot tell them apart, so it needs a "who is this for" switch
before each can take its own colours - item 13.**

## THE TYPE - Manrope and Inter

James, 11 Sep 2026.

| Role | Font | Note |
|---|---|---|
| Headings | **Manrope** | "Add a fair amount of weight to make it look good" - semibold to extrabold, not the light default |
| Body | **Inter** | Already loaded in the OS today |
| Numbers | **Manrope**, tabular | Proposed - figures currently share the hand-drawn heading font, so they move with the headings |

**Replaces:** Shantell Sans (hand-drawn headings and numbers), Montserrat (body), Ms Madi (script
flourish in the decks and postcards), Lora (serif in the decks and postcards).

**This overrides two of the standing house rules for TLE OS only:** "paragraph text Unitext, falling back
to Montserrat" becomes Inter, and "titles not bold" gives way to Manrope with weight - both on James's
instruction here. Other brands keep the house rules.

---

**Merged with James's list of 26 on 11 September 2026.**

Everything still open, from every place it was written down, checked against production on
11 September rather than copied from memory. James's own list is the spine (**J1-J26**); the
lettered sections below it hold the detail and the items his list does not name. Where a line
says "to check", nobody has measured it yet and it is not asserted.

The launch board (`LAUNCH-14-OCTOBER.md`) was last re-read on 5 September and 160 commits have
landed since. Where the two disagree, this file is the newer reading and says so.

Sources: the launch board, the Testing page (`lib/testing-journeys.ts` - 53 journeys in five
sections, 47 marked built, 6 blocked), each screen's own caveats (`lib/screens.ts`), the memory
notes, the production database and the TLE-OS service's variables on Railway.

---

## The critical path

Superseded by **THE ORDER** at the top of this file. The three things everything else waits on are
still A1 (agent accounts), the palette (now received) and J15 (the full run).

---

## James's list

| # | What James asked for | Where it stands, 11 Sep | Owner | Detail |
|---|---|---|---|---|
| J1 | **Inspections: a full rehaul, talk the process through with Michael, and Michael launches a test file** | Built 10 Sep; 255 visits due on its first run. The cadence (three months, then every six) is a guess Michael has not signed off. A finding does not raise a works order; no photos on a finding; no printable report. **Michael has no account, so he cannot launch a test file yet.** | James + Michael | C11, F2.9, A1 |
| J2 | **Maintenance: make sure the process works, flesh it out and tweak it** | Built 7 Sep as one step at a time - report, tell the landlord, who is arranging, pick a contractor by trade and distance, confirm, date, visit, tenant happy, payee, the money. **Not one real job has ever been raised on production** (0 works orders). Needs walking end to end, then tweaking. | James + Claude | J15 |
| J3 | **Finish the presentations - pre and post valuation - so people can do valuations** | Three decks exist: pre-appraisal 5 slides, appraisal 31, post-appraisal 33. Your own uncommitted edits to the fee rows are in the working tree. The fee page waits on Susan's answers (VAT, set-up fee, tie-in, exclusions). The pre-presentation design is flagged as needing your input. | James | D7, memory `tle-fee-questions-for-susan` |
| J4 | **Check every email going out, and redo them all in the new brand colours** | **Palette received 11 Sep** - see THE CUSTOMER PALETTE at the top. It applies to landlord and tenant emails only. 13 template files, mostly greys with one hardcoded red. **The template is shared with the agents' own emails and has no way to tell them apart, so it needs a "who is this for" switch first (Order item 11).** Testing every flow end to end is still blocked on the second Resend domain. | Claude | Order 11-12, B1, B2 |
| J5 | **Landlord and tenant portals fully fleshed out and designed, then to Francesca for marketing and Susan for approval** | Both exist: landlord sign-in, their let step by step, certificates, offers; tenant sign-in by magic link and the deal moving in their words. **Nobody has ever signed into either** - 0 portal accounts on production. Design pass, then Francesca, then Susan. | Claude, Francesca, Susan | E11 |
| J6 | **Tenant portal: logins work, and a tenant can send us documents and log maintenance, all tracking through to ours** | Sign-in is built and has never been used live. **A tenant cannot raise a repair** - there is no route for it. **A tenant cannot send documents** - there is one file field on their profile and no documents flow into the OS. Both need building. | Claude | F1.11, F1.12 |
| J7 | **Finances adds up, pulls through individuals, and shows each profile** | Company figures are live for owners. The agent side stays honest-empty because PayProp knows a fee but not whose it is - **it needs your rule for "whose fee is whose"** before it can show individuals. | James (rule) then Claude | D9 |
| J8 | **Bond: decide what can ship in time, and remove it if it cannot** | Built: the six steps (flagged, card out, replied, called, booked, won), the planning feed, the postcard studio. Not connected: finding the owner (the Land Registry route). **Stannp is live on production**, so a sent card is really printed and posted. | James | D14, D8, C16 |
| J9 | **The compliance tab shows everything correctly** | Rescoped 10 Sep to the 404 homes the agency is answerable for; the figures now match Susan's sheet. Still open: "Tell the landlord" ticks the row and sends nothing; the tile grid is five wide for four tiles. | Claude | F2.6, F2.8 |
| J10 | **All the numbers marry up, and Michael's view marries up to the individuals** | **To check**: that each agent's compliance figures add up to the whole. Michael's view **exists** - /agent-compliance, every person against every requirement, built 5 Sep - with 8 requirements seeded and **nobody has marked one done**. It waits on his real list and on him having an account. | Claude | C10, A1 |
| J11 | **Test each individual agent: the right views, the right properties** | Cannot start - no agent can sign in. View-as lets an owner preview an agent in the meantime. | James + Claude | A1, A4 |
| J12 | **Email is fully hooked up: send AND receive, tracked for landlords and tenants in the Emails tab and in the activity on leads, appraisals, listings, viewings and applications** | **Sending is built**: every send is recorded, and an agent can send from their own Microsoft mailbox (keys set, never run live). **Receiving is not built at all** - nothing reads a reply, so nothing inbound can be tracked. Which records show email in their activity today: **to check**, screen by screen. | Claude | F1.10, A3 |
| J13 | **Test the front and back end between Kirstie and the agent - she sends out about the application and it comes through** | Built: the application journey, comments, the deal feed, the bell. Never run as two real people on production. | James + Kirstie | J15 |
| J14 | **A full PLC test** | **No PLC pack has ever been run end to end.** Two cases exist, both still "assembling" since 6 Sep. | James + Kirstie | E9 |
| J15 | **One record, lead to checkout: a lead, then appraisal, listing, viewing, application, portfolio, maintenance, inspections and checkout** | Not run. It needs agent accounts (A1) and some REX writes unlocked (section E). **Checkout exists** as an inspection type beside check-in - "the condition against the inventory at the end, and the deposit case" - so the run can finish on it. | James + Claude | critical path |
| J16 | **Check every view and process is right, and there are no buttons missing** | Known already: "+ Add new listing" does nothing; an appraisal cannot be started from the Market Appraisals screen; Compliance's "Tell the landlord" sends nothing. A full sweep: not done. | Claude, then James | F2 |
| J17 | **Sweep the whole site for dead links** | Not done. Claude can automate it: sign in, crawl every route, follow every link, report anything that 404s or errors. | Claude | |
| J18 | **Tools: Launch Pad pulls through correctly and sends to the right place** | Launch Pad in the OS is the list only; working a lead still happens in Launch Pad itself. | Claude | F2.11 |
| J19 | **The admin area: Susan's, Francesca's, Kirstie's and Michael's views each work - a profile, and the relevant admin section** | Fixed 10 Sep: Susan, Francesca, Kirstie and Michael had all been signing in as ordinary agents, because only two of six roles survived the login. **Michael has no account.** Each view: **to check** as that person. | Claude + James | A1 |
| J20 | **Pre-launch: everyone knows when it gets sent and how it works, and a tester session** | The pilot invite email is built and was sent once, to 4 people, on 3 Sep. What does not exist is the plan: who is on it, when it goes, what they are asked to do, and the session. | James | B7 |
| J21 | **Portals under Portals on the Testing page, so they can be tested** | The Testing page has five sections - landlord presentation, listing, tenant, agent's own compliance, compliance. **No Portals section.** | Claude | F1.13 |
| J22 | **Agent and Portal as separate sections, and the PLC from the agent's side and from Kirstie's** | **No Agent section, and the PLC is not split by who is looking.** | Claude | F1.13 |
| J23 | **Check all of Susan's figures** | Not re-checked since 5 Sep. | Claude, then Susan | |
| J24 | **"Update the view to bring it in line with the rest"** | **Which view?** Not clear from the list - to confirm. | James | D15 |
| J25 | **Test everything on the Testing page, and turn the switches on one at a time** | 53 journeys, 47 marked built - but built is not tested. 8 of 12 switches are off. | James + Claude | E |
| J26 | **Steve fully updated with the new brochures and everything he needs before launch** | **Steve's knowledge base is empty: 0 entries.** He answers from the knowledge hub, and there is nothing in it. | Susan / Francesca write, Claude loads | F3.2 |

---

## A. Before agents can test the pilot

| # | What | Owner | State, 11 Sep |
|---|---|---|---|
| A1 | **Agent accounts.** Production has four users: James, Susan (owners), Kirstie (pre-tenancy), Francesca (marketing). No agent and no Michael can sign in. Decide who is in the pilot, then invite them. | James | 4 accounts |
| A2 | **Kirstie's REX link is broken.** She is `kirstie.mulholland@` in the OS and `kirstie.wallington@` (REX user 61046) in REX. Auto-linking matches on email, so her book never resolves. | James | Mismatch |
| A3 | **Send from the agent's own mailbox.** The Microsoft keys are set (`AZURE_*`) and the connect button works, but a send has never been run live. | James + Claude | Never run live |
| A4 | **An agent sees only their own diary.** Scoped 10 Sep - an owner sees 444 appointments across 14 agents, everyone else their own. Proven with Francesca and Kirstie; not yet with an agent who has a diary. Re-check after A1. | Claude | Waits on A1 |

## B. Blocking launch on 14 October

| # | What | Owner | State |
|---|---|---|---|
| B1 | **Resend on the second domain.** Resend refuses every non-TLE domain until it is set up. Blocks B2. | James | Blocked (board 12) |
| B2 | **Every email flow tested and on brand** (= J4). All written and previewable on /emails; none tested end to end. | Claude, after B1 and J4 | Blocked (board 13) |
| B3 | **Turn the REX automations off on launch day.** Work from the audit on /emails. Howard holds the Zapier webhook. Running both is how a landlord gets two emails. | James + Howard | Launch day |
| B4 | **Run the REX PM certificate pull again** a day or two before launch. Steps in the memory note `tle-os-rex-pm-pull`. | James signs in, Claude runs it | ~12 Oct |
| B5 | **Invoice settings are blank on production** - address, VAT and company numbers, bank details, terms. They are frozen onto each invoice. 0 rows. | James | 0 rows |
| B6 | **Whether the OS gets its own database before launch.** It shares the portal's production database today. | James | Decision |
| B7 | **The pre-launch plan** (= J20): the list, the send date, what testers do, the session | James | Not written |

## C. Waiting on somebody else

| # | Who | What we need | What it unblocks |
|---|---|---|---|
| C1 | **Propoly (Ray)** | The three fields that went on 6 Sep: `extra_clauses_details` (the Flatfair clause, on ~44% of deals in August), `tenancy_service_level`, `standing_order_reference`. Pooja said on the 10 Sep call they were back; **re-probed 10:31 that day and none were there.** Email sent. | Flatfair deposits told apart from real ones; RLP reporting; the standing-order tick |
| C2 | Propoly | Read a deal's documents (Ray: "on our list"; Pooja checking whether the v1 readback exists) | The PLC gate checking Propoly's slots |
| C3 | Propoly | Write a note onto a deal (Ray: "we'll look at it") | One conversation instead of two |
| C4 | Propoly | Create a deal by API. **Soft no** - heavy validation; maybe with their agentic layer in one to two quarters | The accepted offer starting the deal with no retyping |
| C5 | Propoly | Webhooks. **Deferred** by Ray; poll on updated-since meanwhile (every 15 min since 10 Sep, as promised) | Instant deal moves |
| C6 | Propoly | Tidy-up: 29 addresses held twice, 30 extra property records (5 Sep) | Clean matching before the handover goes live |
| C7 | Propoly | Referencing outcome per tenant; signing state per party on the tenancy agreement. **Two Testing-page journeys blocked.** | Those two steps filling themselves in |
| C8 | **Flatfair** | Any API at all - the meeting James asked for. **Two Testing-page journeys blocked.** | Board item 9 |
| C9 | **PayProp** | The agency income report in the E&W permissions; an endpoint for unreconciled incoming funds; tenants created at deal start | "Holding fee paid" before reconciliation |
| C10 | **Michael** | The real personal-compliance list - the eight on /agent-compliance are a starter set | Board item 11; the reminders |
| C11 | Michael | Sign-off on the inspection cadence (= J1) | Inspections |
| C12 | Michael | The backlog in `docs/MICHAEL-COMPLIANCE-VIEW.md` - six homes with no gas answer; spot-check the 31 "No gas" only on REX PM's word. **Raise as tasks the day he has an account.** | Michael's view |
| C13 | **Howard** | **Attach the landlord to the listing in REX.** 8 of the last 10 handover rehearsals stopped at "no owner is attached to the listing" - applications 35812, 36901, 37774, 37948, 37951, 37970, 37987, 38009. The other two were Propoly rate limits. About a quarter of the book has no landlord on the REX record. | The handover going live |
| C14 | Meta | A WhatsApp Business number (embedded signup) | Real WhatsApp sends |
| C15 | Power Automate / Base44 | The trigger URLs (Application Accepted, Rental Passport); Base44 access for the Renters' Passport | Board item 17's hand-offs |
| C16 | Land Registry route + print house | Bond names properties, not people | Bond's outreach (= J8) |
| C17 | **Susan** | The fee answers - VAT, set-up fee, tie-in, exclusions (= J3) | The decks' fee page |
| C18 | **Francesca** | The three "Gone quiet" nurture emails; the portal marketing review (= J5) | Nurture; the portals |

## D. Decisions only James can make

| # | Decision | Why it is waiting |
|---|---|---|
| D1 | **Button shapes** - pills or rounded rectangles, one everywhere | Asked 11 Sep; "I'll look again" |
| D2 | **Masthead height.** Market Appraisals is 302px above the rule, every other page 250. The Listings lady is "literally perfect", which says 250, but that makes the appraisals man smaller again. | Can't be both |
| D3 | **Portfolio's scene** at 218 rather than 240: at 240 it squeezes the blurb to four lines | Size vs. readable text |
| D4 | **Whose name nurture emails come from.** `REX_CAMPAIGN_SEND_AS` is unset, so every due email is held. | Board item 15 |
| D5 | **The 161 unpublished drafts** out of 268 current rentals | Any bulk publish |
| D6 | **Where a compliance blocker bites** - offer accepted or move-in, and whether a manager can override | Idea H4 |
| D7 | **Input on the pre-presentation and the PLC check designs** (= J3) - flagged in `CLAUDE.md` | Board items 2 and 4 |
| D8 | **Stannp is out of test mode.** `STANNP_TEST_MODE=false`, so a postcard sent with `live: true` is really printed and posted. That flag is the only lock left. Confirm it is intended. | Money leaves on a click |
| D9 | **Whose fee is whose** (= J7). PayProp knows the fee, not the agent. | Agent Finances |
| D10 | **"The Lettings Experts" vs "The Letting Experts"** - the email footer disagrees with the logo, domain and prose | Fix everywhere once decided |
| D11 | **Should a landlord's invoice follow the agent's accent?** Today it is fixed to the brand, deliberately. | Minor - may fold into J4 |
| D12 | **Maintenance tile style** - the mockup's coloured round icons and chevrons, on every tile page or none | Consistency |
| D13 | **Susan's REX service field** - matched homes' service type left untouched as her call | REX data quality |
| D14 | **Bond at launch: ship what is finished, or pull it** (= J8) | Time |
| D15 | **Which view J24 means** | Unclear |
| D16 | **DONE 11 Sep - hidden.** **Three viewing buttons say "sent" and send nothing** (Cancel & tell them, Send the offer, the booker's Send). Hide them for the pilot, or wire them to the agent's mailbox. | Applicants turning up to cancelled viewings |
| D17 | **Book a viewing on a listing uses made-up applicants and always says Kirstie.** Hide it for the pilot, or feed it REX's enquiries. | An agent books a fake person |

## E. Supervised live tests - built behind the lock, never run for real

`REX_ALLOW_WRITES` on production already names `Listings/update, Contacts/create, Contacts/update,
ComplianceEntries/create, ComplianceEntries/update, Upload/uploadFileFromUrl`, so some of these are one
switch away from live. Each needs one run with James watching (= J25).

| # | Test | Notes |
|---|---|---|
| E1 | Create a property in REX | `rex_property_create` off |
| E2 | Publish a draft listing | |
| E3 | Upload photos | |
| E4 | Work a lead in REX (assign, complete, archive) | |
| E5 | Fire an e-signature (DocuSeal) | Cloud Pro, EU; template 763089; sending locked until James has been through the contract with Susan |
| E6 | **Book a viewing that reaches REX** | 2 booked in the OS, **0 reached REX's diary**. The duplicate guard has never been exercised. |
| E7 | Send an SMS | |
| E8 | The REX lead webhook | |
| E9 | **A PLC pack end to end** (= J14) | 2 cases, both "assembling" since 6 Sep |
| E10 | Handover live | 14 rehearsals ok, 10 failed - see C13. Run beside Howard's flow until they match, then turn his off the same day. |
| E11 | Landlord and tenant sign-in by a real email arriving (= J5, J6) | 0 portal accounts - nobody has ever signed in |

## F. Build work still open

### F1. Not built

| # | What | Note |
|---|---|---|
| F1.1 | **Kelly's training hub**, reskinned inside the OS | Board 10, todo |
| F1.2 | **API centre** for the other apps | Board 23, todo |
| F1.3 | ~~Agent compliance checker / Michael's view~~ **Settled 11 Sep: built.** /agent-compliance, three APIs and the Personal compliance panel on Profile; 8 requirements seeded, 0 marked done. The Testing page entry `agent-checker` still says "not built" - **that entry is stale and should be corrected** so J25's testing starts from the truth. | J10, C10 |
| F1.4 | **Viewing feedback is never recorded.** 29 viewings have been and gone with nothing written down; 0 with feedback in. Either nobody records it or it never reaches us from REX. Find out before Susan sees a "Feedback in: 0" tile. | Found 10 Sep |
| F1.5 | Landlord feedback report, per property, on Viewings | Screen caveat |
| F1.6 | Start an appraisal from the Market Appraisals screen (today only from a landlord lead) | J16 |
| F1.7 | Landlord portal upkeep - no source for maintenance on the landlord side | Testing page, blocked |
| F1.8 | Radius search centred on where the tenant **wants** to live - needs the qualifying call to capture it, then geocoding | Found 9 Sep |
| F1.9 | Trend snapshots anywhere but Maintenance - every other "vs last month" in the OS would be invented | Maintenance has one from 11 Sep |
| F1.10 | **Receiving email** (= J12): read replies from the agents' Microsoft mailboxes, match each to its landlord or tenant, and log it on the record's activity | Nothing inbound exists today |
| F1.11 | **Tenant raises a repair from their portal**, arriving as a works order in Maintenance (= J6) | No tenant route exists |
| F1.12 | **Tenant sends documents from their portal**, filed against their tenancy and property in the OS (= J6) | One file field on the profile, no flow |
| F1.13 | **Testing page sections**: Portals (landlord and tenant), Agent, and the PLC split into the agent's view and Kirstie's (= J21, J22) | Five sections today, none of these |
| F1.14 | **The customer palette on everything landlords and tenants see** (= J4) - emails, both portals, invoice, terms signing, decks, postcards | Palette received 11 Sep; Order items 11-15 |
| F1.15 | ~~Checkout at the end of a tenancy~~ **Settled 11 Sep: exists** as the `check_out` inspection type. What is not there is a deposit-return flow after it - to decide whether one is needed for launch. | J15 |

### F2. Built, with a gap the screen already admits to

These come from each screen's own caveats in `lib/screens.ts` - the screen tells the user.

| # | Screen | Gap |
|---|---|---|
| F2.1 | Listings | **"+ Add new listing" does nothing.** Create the property in REX. |
| F2.2 | Listings | Only the Marketing write-up saves back to REX |
| F2.3 | Listings | **Bedrooms is a column of dashes.** REX has no bedroom field. Drop it until the take-on captures one. |
| F2.4 | Viewings | Appointments made on the week calendar stay in the OS (= E6) |
| F2.5 | Market Appraisals | The appointment does not reach REX's diary |
| F2.6 | Compliance | **"Tell the landlord" only ticks the row.** No email is sent. (= J9) |
| F2.7 | Compliance | A renewed certificate overwrites the old one in REX, so past overdue positions cannot be recovered |
| F2.8 | Compliance | The tile grid is five wide for four tiles |
| F2.9 | Inspections | A finding marked for a works order does not raise one; no photos; no printable report (= J1) |
| F2.10 | Portfolio | **Settled 11 Sep: PayProp E&W is connected** - James connected it on 5 Sep and the token is held. So the screen's caveat "PayProp's UK agency has no API key" is **stale and should be corrected**. The real gap: the rent roll still reads REX's agreed rent, not the money PayProp says arrived. The connection's scopes are empty, which fits the income report not being in the client's permissions (C9). |
| F2.11 | Tools | Launch Pad is the list only (= J18) |
| F2.12 | Dashboard | Marked partial with no caveat written - write what is missing or mark it live |

### F3. Help and knowledge

| # | What |
|---|---|
| F3.1 | The one written guide under Admin is still a static page |
| F3.2 | **Steve's knowledge base is empty - 0 entries** (= J26). The questions he could not answer are the writing order on /knowledge. |

## G. Found this week, and it needs a person rather than code

| # | What | Figure |
|---|---|---|
| G1 | **Accepted applications with nothing in Propoly** now read "Handover due" | 2 of the first 6 on the Accepted tab |
| G2 | The oldest gas certificates on file expired in 2016 and 2019 - real documents from before the agency managed the home. Never send them to a landlord without saying so. | 53 Dulverton Avenue, 5 Bruce Road, 97 Coton Lane, 5 Colebrook Close |
| G3 | Homes with an overdue certificate, no service type anywhere and no REX PM agreement - dropped from compliance scope. Give them a service type or take them off the rental book. | 14 |
| G4 | Let-only homes inside REX PM's managed book - off compliance by decision, but nothing tells Bond to ring them when a certificate falls due | 73 |
| G5 | REX PM's 522 letting agreements are 477 distinct properties - anything quoted "of 522" counts 45 twice | 45 |
| G6 | Propoly holds 643 deals, read ten to a page | 65 requests a full read |

## H. Ideas captured, not scheduled

From the certificate work, 6 Sep. Each is a build of its own.

| # | Idea |
|---|---|
| H1 | Read every new terms of business for its facts - no gas, bills included, service level, fee - and show them on the property everywhere |
| H2 | One landlord, many properties in a click |
| H3 | HMOs as a house with rooms: a stored `parent_id`, room numbers for one-listing-per-let houses, and building the rooms in REX when a home is marked HMO |
| H4 | Blockers: a deal cannot pass a set point without the minimum certificates (needs D6) |

---

## Closed since the board was last re-read - so nothing gets raised twice

| What | Closed |
|---|---|
| `STANNP_API_KEY` missing | Set on Railway - and now live, not test (D8) |
| "Is the agent compliance checker built?" - two sources disagreed | Built; the Testing page entry is the stale one (F1.3) |
| "Is PayProp E&W connected?" - two sources disagreed | Connected 5 Sep; the Portfolio caveat is the stale one (F2.10) |
| "Does a checkout exist?" | Yes, as the `check_out` inspection type (F1.15) |
| Azure / Microsoft 365 keys | Set on Railway |
| Susan, Francesca, Kirstie and Michael signing in as ordinary agents | Fixed 10 Sep - all six roles now survive the login |
| `/api/present/sweep` not on a cron | Added to os-cron-daily, 11 Sep |
| Viewings sweep wrote nothing for three days | Fixed 10 Sep: 2,489 viewings across 383 listings, 3,089 leads |
| Every agent could read the whole office's diary | Scoped to their own mailbox, 10 Sep |
| Compliance counting let-only homes and 45 duplicates | Scoped to 404 homes, 10 Sep; matches Susan's sheet |
| "37 homes with no gas answer" | Actually 6 - 31 were answered by REX PM's own category |
| Leads pages blank after the first click | Fixed 10 Sep - they had loaded and were held at opacity zero |
| Applications status saying "Communicated" | Now where the deal actually is, 10 Sep |
| The Red accent still looking pink | Fixed 11 Sep |
| Bedford missing from Bond | Checked 10 Sep: production has MK40-46 |
| Propoly polled every 5 minutes | Every 15, as promised Ray |
| Maintenance "up 3 from last month" with nothing to compare | Nightly snapshot from 11 Sep; deltas appear ~11 Oct |

## Switches, as found 11 Sep

**On:** Email to landlords and tenants (`RESEND_ALLOW_SEND=yes`), pre-tenancy digest, certificates
into REX, create contacts in REX.
**Off:** certificate chases, agent-compliance reminders, Steve can send email, create properties in
REX, handover live, tell agents when Propoly moves a deal, push PLC documents into Propoly,
nurture campaigns.
