# TLE OS — launch, 14 October 2026

Captured 21 August 2026 from James, verbatim in substance. **Eight weeks.**

The whole platform has to stand up end to end on the day: **leads → listings →
viewings → applications → compliance → portfolio → finance.**

The measure of success, in his words: *one cohesive, seamless process, built
in-house, with alliances at a minimum.* Fine & Country's equivalent is on
Base44 — the intent is to blow it out of the water.

This file exists so nothing gets lost and so there is always an easy thing to
pick off. **Status column is honest: `todo` until it is actually working.**

---

## The board

| # | Item | Owner-facing | Status |
|---|---|---|---|
| 1 | Market appraisals tab | Agents | todo |
| 2 | Appraisal process: book → pre → appraisal → post | Agents | todo |
| 3 | Copy Ian's approved appraisal emails + video option | Agents | todo |
| 4 | PLC in-house, with approval queue and AI pre-check | Kirstie / Mike | todo |
| 5 | Compliance tracker + 30/14/7 reminders | Michael | todo |
| 6 | Applications tracker | Kirstie | todo |
| 7 | Port the finance figures from the portal | Susan | todo |
| 8 | Multi-tenant + per-agent REX auth | Everyone | todo |
| 9 | Flatfair API | — | blocked: meeting requested |
| 10 | Kelly's training hub, reskinned | Agents | todo |
| 11 | Agent compliance checker in profile | Michael | todo |
| 12 | Resend on two domains | — | todo |
| 13 | Every email flow tested and on brand | — | todo |
| 14 | Landlord + tenant portals refined and secured | Customers | todo |
| 15 | Marketing email builder | Francesca | todo |
| 16 | REX PM integration | — | todo |
| 17 | Tenant passport in-house | — | todo |
| 18 | Turn REX automations OFF at launch | — | **launch day** |
| 19 | Live figures, leads in, notifications, portal editing | — | todo |
| 20 | Where a property went live, per file | Agents | todo |
| 21 | Help centre with an AI bot | Everyone | todo |
| 22 | Knowledge hub + a backend to feed it | Susan / Francesca / Michael / Kirstie | todo |
| 23 | API centre | Our other apps | todo |

Running through all of it: **it has to be on brand, look good, and work.**

---

## 1. Market appraisals tab

A tab on the dashboard. It is the landlord side of the process broken out —
as a landlord lead is taken into appraisal, this is where they go.

## 2. The appraisal process

Four stages, mirroring the appraisals tab we already have:

**Book → Pre-appraisal → Appraisal → Post-appraisal**

The point is that an agent can find their appraisals fast and see what is
booked.

- **Pre-appraisal** — build a pre-presentation, copying the style and design we
  already have. Includes the pre-appraisal deck that exists today.
- **Comparable evidence** — pull a process close to Fine & Country's: the agent
  assembles comparables as part of preparing.
- **The presentation** — build one to *show the landlord on the day*, and to
  *send afterwards*.

> Already built and reusable: `/present/[token]`, `components/PresentDeck.tsx`,
> `lib/present.ts`. The welcome-video recorder (item 3) already hangs off it.

## 3. The appraisal emails

**Ian has already built the pre-appraisal emails and the presentations that go
out, and they are approved.** Copy them rather than reinventing; upgrade where
it is clearly better.

Two video options at send:
- a **generic** video, as now
- a **personalised** one recorded through Flow — *built, commit `e38d2ed`*

## 4. PLC in-house

Today PLC runs through a JotForm and a Power Automate flow. Bring it in.

- Agent fills in all the details and **sends for approval**
- Kirstie / Mike (whoever holds it) review every document
- **An AI agent does the heavy lifting** — checking documents off, flagging
  what is missing or expired
- **A person does one last manual check** and gives it a pass or a fail

The human sign-off is not optional. The AI reduces the reading, it does not
replace the decision.

## 5. Compliance tracker — Michael

Sits in the admin centre. Michael needs to see:

- anything **outstanding**
- anything **coming up**

And to send automated reminders to landlords **on the agent's behalf** at
**30, 14 and 7 days**. Every reminder goes to **both the agent and the
landlord** — the agent must never be surprised by a chase on their own file.

> Groundwork done: certificates live in `ComplianceEntries` on the PROPERTY
> (not `listing_documents`) — see `lib/deal-handoff.ts` and the memory note.

## 6. Applications tracker — Kirstie

Same shape as the compliance tracker. Pull the detail from the TLE portal's
existing standard and port it over.

> Groundwork done: `lib/applications.ts`, `/applications` is live off REX.

## 7. Port the finance figures

The figures on the TLE portal are finally correct. Move them into Susan's
backend admin inside TLE OS.

## 8. Multi-tenant, and real sign-in

Today the OS runs as one whole user. It has to become per-person.

- **Multi-tenant platform** — each agent sees their own world
- **Hooks into REX as the individual user**, not the office API account
- **Hooks up their emails**
- **A real sign-in**: authenticate, log in, keep the details safe, confirm the
  person is who they say they are
- Then get them to **connect via REX with a one-time token** we hold for
  future calls

> Partly there: `lib/rex-user.ts` already supports acting as a person, and
> `rexCall` takes an `actorToken` so a record created by Susan says Susan.

## 9. Flatfair

API meeting requested — hopefully next week. **Blocked until then.**

## 10. Kelly's training hub

Build her platform in, **reskinned**, so there is a version of the training
inside the system:

- training videos
- targets set by their coach
- a **dashboard widget** so an agent sees their coaching progress

## 11. Agent compliance checker

In the profile section. Checks that *the agent themselves* is compliant —
Michael's remit, and he needs full overview. Reminders and links so people stay
compliant rather than discovering they aren't.

## 12. Resend, on two domains

Two senders, and the split matters:

| Going to | From |
|---|---|
| An agent (internal) | **TLE OS** |
| A landlord or tenant | **The Letting Experts** |

## 13. Every email flow, tested and on brand

All of them, end to end — tenant portal through to compliance documents. Both
that they *work* and that they *look right*.

## 14. Landlord and tenant portals

Refine both. They must **work**, be **secure**, carry **everything the person
needs**, and be **visually interesting**.

## 15. Marketing email builder — Francesca

A Mailchimp-shaped builder she can use to send marketing material herself.
Also feeds **nurture campaigns**:

- market appraisals lost
- tenants who turned a property down
- new properties coming through

## 16. REX PM integration

REX CRM posts to REX PM, so we can drive the **compliance** and **portfolio**
tabs off it.

> Note: REX PM has historically been CSV-only to us. This is the item to test
> earliest, because it may be the hardest.

## 17. Tenant passport in-house

Rebuild it. And the JotForm too, if that hasn't already been done.

## 18. Turn the REX automations OFF

**Just before launch**, so ours and theirs don't overlap and nobody gets two of
everything.

> The audit of what is currently sending is built — `/emails`. That page is the
> list this switch-off works from.

## 19. Live figures and the front door

- Every live figure tested
- We can **receive leads in**, and they **visually make sense**
- The **live notifications bar** works correctly
- We can **edit both Rightmove and OnTheMarket**

## 20. Where a property went live

On each file: when it went live, and **which portals it went on** — Rightmove,
OnTheMarket.

## 21. Help centre

An **AI bot**, plus useful guides — training, and how to use the platform.

## 22. Knowledge hub (part two of 21)

For an agent to learn as they go. Needs a **backend** so **Susan and
Francesca** — and probably **Michael and Kirstie** — can feed it. The better it
is fed, the more it can answer: guides, tracking systems, how to work the
system.

## 23. API centre

So our other apps can connect in and **read and write**.

---

## Already done, and reusable

Do not rebuild these.

| Thing | Where |
|---|---|
| Pre-appraisal deck + `/present/[token]` | `lib/present.ts`, `components/PresentDeck.tsx` |
| Personalised welcome video (Flow) | `lib/flow-video.ts`, commit `e38d2ed` |
| Homesearch pre-fill on the appraisal form | commit `7b931c7` |
| Post-viewing feedback + offer capture | `app/tenant/feedback` |
| Application form asking every adult for Right to Rent | `app/tenant/apply` |
| Applications, live off REX | `lib/applications.ts` |
| Accepted → deal handoff packet | `lib/deal-handoff.ts` |
| Duplicate-person permissions (grant, not transfer) | `lib/rex-permissions.ts` |
| Email audit — what actually sends | `lib/email-audit.ts`, `/emails` |

## The Fine & Country repo — read it before writing anything

`hjjconsultingltd-sys/f-c-pipeline` (private, Base44-built, 3,700 commits and
actively worked on). **Access confirmed 21 Aug 2026.** It is not a competitor to
copy at arm's length — it is a working implementation against the SAME REX
account, and several launch items are already solved in it.

Note GitHub code search returns 0 hits on this repo (private repos are not
indexed), so **search it by reading paths, not by querying** — the filenames are
the map.

| What is in there | Which item it answers |
|---|---|
| `src/functions/createRexContact.ts`, `createRexOffer.ts`, `createRexRecords.ts` | **Proven REX WRITE payloads.** We have never executed a write; they have. Read these before unlocking ours. |
| `src/functions/enrichFromRex.ts`, `src/lib/RexContext.jsx` | Per-user REX wiring — item 8 |
| `src/functions/commSyncMail.ts`, `commSendEmail.ts`, `commMailboxAdmin.ts`, `commCaseApi.ts` | **Mailbox sync per user.** Directly item 8's "hook up all their emails", and a second answer to the agent↔landlord email question. |
| `src/lib/maJourney.js`, `maBrand.js` | The market-appraisal journey — items 1 and 2 |
| `src/lib/comparablesMerge.js`, `collectPresentationImages.js`, `mergeFields.js` | Comparable evidence and presentation assembly — item 2 |
| `src/functions/calendarAvailability.ts`, `autoUpdateDealStatuses.ts` | Booking and stage automation |

**`commSyncMail` is the one to read first.** Its own comment says mode `me`
pulls the signed-in user's inbox using their own connection, *because a
background job cannot obtain another user's token*. That is the exact
constraint item 8 runs into, already thought through and solved.

It also reframes the email-chain finding: we concluded correspondence was
unreadable because REX's `EmailDropbox` is empty and Propoly exposes nothing.
F&C did not read it out of the CRM at all — **they sync the mailbox directly**.

`F-C-presents` (the other repo) is a separate thing: a static HTML presentation
demo with no REX code. Useful as a DESIGN reference for item 2, nothing more.

## Waiting on someone else

| Blocked on | What it unblocks |
|---|---|
| Flatfair API meeting | item 9 |
| Power Automate trigger URLs (Application Accepted, Rental Passport) | handoff send, item 17 |
| `FLOW_API_KEY` / `FLOW_WEBHOOK_SECRET` | testing item 3's personalised video |
| Resend domain set up | items 12, 13, 15 |
| Howard, on the Zapier webhook in PLC Request | item 18 |
| Base44 access for the Renters' Passport | item 17 |
