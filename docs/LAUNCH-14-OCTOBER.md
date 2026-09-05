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

Status re-read on **5 September 2026** against the commits and the Testing page
(`lib/testing-journeys.ts`, Admin → Testing), not against memory. Five and a half
weeks left. The Testing page is now the finer-grained truth: this board is the
summary.

Key: **built** works on real data · **partial** exists, with the gap named ·
**blocked** waiting on somebody outside the code · **todo** not started.

| # | Item | Owner-facing | Status (5 Sep) |
|---|---|---|---|
| 1 | Market appraisals tab | Agents | **built** (4 Sep) — stages read from the record (deck, visit, figure, signed terms, landlord documents, REX listing); Won and Lost are the only hand moves; Record the valuation has its form |
| 2 | Appraisal process: book → pre → appraisal → post | Agents | **partial** — booking hands over from Leads, pre-appraisal deck, comparables, presentation builder, post-appraisal slides, DocuSeal terms signing all built; stage progression not |
| 3 | Copy Ian's approved appraisal emails + video option | Agents | **partial** — personalised Flow video built and webhook fixed (1 Sep); the emails send from the agent's own mailbox, which is built but untested; generic sending blocked on item 12 |
| 4 | PLC in-house, with approval queue and AI pre-check | Kirstie / Mike | **built** — pack gated on required documents with written reasons for the conditional ones, reader runs before submit, Kirstie's queue and review, approved pack pushed into Propoly's document slots behind a switch (4 Sep), Ready to move in sign-off (5 Sep) |
| 5 | Compliance tracker + 30/14/7 reminders | Michael | **built** (22 Aug) — tracker live off REX; the two chase emails send behind the Certificate chases switch and go to agent and landlord both |
| 6 | Applications tracker | Kirstie | **built** — live off REX with a left-to-right spine, comments, the deal's history, and the Propoly watcher every five minutes (4 Sep); Kirstie now lands on a dashboard of her own (5 Sep, James's call): what moved, the packs with compliance, deals by stage and this fortnight's move-ins, with the board, the feed and the PLC queue as pills on every screen; referencing still has no source and the screen says so |
| 7 | Port the finance figures from the portal | Susan | **built** (5 Sep) — Scotland on its own key, E&W reconnected from the OS's own Wiring page; arrears, rent and the deposit matcher live on both. Agency income report not in the E&W client's permissions |
| 8 | Multi-tenant + per-agent REX auth | Everyone | **partial** — invite-only sign-in, roles, view-as, each agent sees their own book (27–28 Aug); an agent can link their own REX account on Profile; per-agent mailbox sending exists, never run live |
| 9 | Flatfair API | — | **partial** — hand-off screen with every fact copyable and a Done tick that moves the board (4 Sep); the API itself still **blocked** on the meeting |
| 10 | Kelly's training hub, reskinned | Agents | **todo** |
| 11 | Agent compliance checker in profile | Michael | **frame built** (5 Sep) — Personal compliance on Profile reads a list Michael owns (a starter set of eight, each marked starter until he edits it); the agent marks each done with a date, expiry is worked out from the renewal period; /agent-compliance (new compliance role, and the owner's admin rail) shows every person against every requirement with his own "seen it" tick, which is the only thing that reads as checked; 30/14/7 reminders and a roll-up to him run daily behind the Agent compliance reminders switch. Waiting on Michael for the real list |
| 12 | Resend on two domains | — | **blocked** — Resend refuses every non-TLE domain until the domains are set up |
| 13 | Every email flow tested and on brand | — | **blocked** on 12 — the emails themselves are written and previewable on /emails |
| 14 | Landlord + tenant portals refined and secured | Customers | **partial** — landlord: sign-in, journey, certificates with the file to open, offers, and the let step by step (5 Sep); tenant: sign-in by magic link and a home showing the deal moving in their words (4 Sep); upkeep still has no source |
| 15 | Marketing email builder | Francesca | **built** — builder (28 Aug); campaigns editable end to end incl. built-ins, locked onto reasons, A/B variants, results per campaign, and the lead spine's Nurture branch enrols by reason (5 Sep); the scheduler runs daily behind the Nurture campaigns switch and still needs a sender identity (REX_CAMPAIGN_SEND_AS) |
| 16 | REX PM integration | — | **settled: not viable, data is empty** (22 Aug) |
| 17 | Tenant passport in-house | — | **built** (4 Sep) — the invite sends from a booked viewing on the public sender, mints the passport and links to it |
| 18 | Turn REX automations OFF at launch | — | **launch day** — work from the audit on /emails; Howard holds the Zapier webhook |
| 19 | Live figures, leads in, notifications, portal editing | — | **partial** — dashboard figures live and month-scoped (28 Aug), Launch Pad funnel and leads inside the OS, portal write-up edits live in REX; the bell is live on every screen (5 Sep): deal moves, money, PLC, campaign steps for a person, handover runs and chases, scoped to the person, with an unread count, read marking and desktop alerts; only the write-up field group saves back |
| 20 | Where a property went live, per file | Agents | **partial** — live advert links and the go-live date on the file (4 Sep); REX keeps no date per portal, so there is one go-live day rather than one per chip |
| 21 | Help centre with an AI bot | Everyone | **partial** — Steve answers over the knowledge base, shows screens, proposes writes (29 Aug–2 Sep); his Guides shelf now lists whatever the knowledge hub marks as a guide, opening on a reader page (5 Sep); the one written guide under Admin is still a static page |
| 22 | Knowledge hub + a backend to feed it | Susan / Francesca / Michael / Kirstie | **built** (5 Sep) — /knowledge, a workspace for the marketing, pre-tenancy, support and super admin roles (edit:knowledge) and on the owner's admin rail: plain-writing editor, shelves, a Guide tick that puts an entry on Steve's shelf, .txt/.md drop-in, and the questions Steve could not answer as the writing order. Steve reads it by shelf on the next question |
| 23 | API centre | Our other apps | **todo** |

### Screens that are still wireframes

From `lib/screens.ts`, marked `shell`, meaning nobody should be sent there to
do a job:

- ~~**/portfolio**~~ — **built 2 Sep.** Live off REX's leased book: property
  directory, landlord directory and map, with certificates joined behind. Rent
  roll is REX's agreed rent until PayProp's UK key exists. Now `partial` for
  that reason only.
- **/tools** — the hub lists tools and not one of them opens. Launch Pad is
  being rebuilt into the OS.

### Built, and never run against live REX

Each exists behind the write lock and needs ONE supervised test with James
watching, in this order of value: create a contact · create a property ·
publish a draft listing · upload photos · work a lead (assign, complete,
archive) · write a certificate back · fire an e-signature · book a viewing ·
send an SMS · send from an agent's own Microsoft mailbox · the REX lead webhook.

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

## 16. REX PM integration — PROBED 22 Aug 2026. The answer is no, and that is settled.

**Do not build this. The data is not there.**

Good news first: **REX PM is NOT CSV-only and needs no separate API.** The whole
property-management model is exposed through the same CRM endpoint we already
use — `Tenancies`, `Invoices`, `InvoiceTransactions`, `TrustLedgers`,
`AgentLedgers`, `AgentLedgerTransactions`, `AgentLedgerPayRuns`, all with full
create/read/update/search methods.

The problem is what is IN them:

| Class | Rows | What it means |
|---|---|---|
| `Tenancies` | **0** | The tenancy ledger is empty |
| `TrustLedgers` | **0** | No trust accounting on this account |
| `AgentLedgers` / transactions / pay runs | **0** | Unused |
| `Invoices` | **2,348** | Live to today — but see below |
| `InvoiceTransactions` | **2,270** | Live to today |

**2,341 of the 2,348 invoices carry a `comm_worksheet_id`** — they are
SALESPERSON COMMISSION invoices, not rent. Top invoicees are Warwick District
Council, The Auction Company, and named individuals. That is the sales
businesses' commission run, not lettings.

So: the module is reachable and live, and it holds somebody else's sales
commission. **The lettings property-management tables are empty.** Driving the
compliance or portfolio tabs off REX PM would drive them off nothing.

**PayProp stays the source for rent, arrears and the managed book.** That is
not a workaround; it is where the data actually is.

### A trap that nearly produced the opposite answer

`Invoices`, `InvoiceTransactions` and `TrustLedgers` **reject
`order_by: { system_ctime: 'desc' }`** — and REX returns **`0 rows` together
with the error**, not an empty error-free result. A first pass read that as
"all PM classes are empty". Re-run without the order_by and two of the three
have thousands of rows.

**Never accept a zero from REX that arrives alongside an error.** Re-run the
query before believing it. The genuine zeros here (`Tenancies`, `TrustLedgers`)
were confirmed with no order_by and no error.

Caveat: 0 rows with no error reads as "genuinely empty" rather than "not
permitted" — a permission problem normally errors. Worth one look in the REX UI
to confirm nobody is using the PM module, but the API answer is clear.

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

## What f-c-pipeline already solved — READ BEFORE BUILDING

Full read done 21 Aug 2026. Findings that change what we believed. The real
code is `base44/functions/<name>/entry.ts` (312 of them) and `base44/shared/**`
— `src/functions/*.ts` are thin client wrappers only. File-header comments are
dated and signed; treat them as the documentation.

### 1. REX writes are routine there, and the safety rule is narrower than ours

They run **30+ mutating endpoints in production daily** — `contacts/create`,
`listings/update` (20 call sites), `properties/create`, `contracts/create`,
`notes/create`, `calendar-events/create`, `compliance-entries/create`, even
`contacts/trash` and `contracts/purge`.

Our blanket "writes are dangerous" is not the lesson. **Theirs is:**

> **NEVER RETRY A WRITE.** The REX API is POST-only including writes, so a 500
> may have committed server-side before failing — replaying duplicates a note,
> offer or contact. Retry is OFF by default and auto-enabled only for provably
> read-only paths.

```js
function isReadOnlyPath(path) {
  const seg = String(path||'').split('/').pop() || '';
  return /^(read|search|autocomplete)$/i.test(seg) || /^get/i.test(seg) || /^describe-?model$/i.test(seg);
}
// retries = isReadOnlyPath(path) ? 2 : 0
```

That is ~10 lines and it is the thing worth porting. Provoked by real
incidents: a REX Redis exception dropped a `leads.updated` webhook on 17 Aug.

### 2. Per-agent email IS solved — via Microsoft Graph, not the CRM

This corrects our conclusion that agent↔landlord correspondence is unreachable.
It is unreachable **out of REX and Propoly**; they never tried that. They sync
the mailbox directly through **Microsoft Graph v1.0** on a Base44 app-user
connector.

The limitation is narrower and matters for item 8: **a background job cannot
use an individual's token** — the SDK resolves the connection strictly from the
caller's JWT, and a scheduled job has no caller. Their answer:

- **shared mailboxes** → webhook + scheduled poll (true background sync)
- **individual mailboxes** → **foreground sync** while the agent is using the app

Dedupe on `graph_message_id` lets the two overlap harmlessly — *"a missed
webhook costs latency, not data."*

Matching a message to a record, most specific first: a `FC-<L|C|D><rex id>`
reference stamped into the subject → `conversationId` → quoted
`internetMessageId` in a bounce → a standing `SenderRule` → sender's single open
case → triage queue. **The reference is built from the REX id** so one number
works in both systems.

Also worth stealing: bounce detection (Graph accepting a send only means
ACCEPTED; an NDR arrives minutes later), and a hard rule of **no silent
fallback** on send — if the agent hasn't connected 365 it fails loudly rather
than sending as a bot, because a client seeing the wrong sender is worse than
an error the agent can act on.

### 3. A REX token vault gives per-user attribution without touching passwords

Item 8 wants records to say the agent's name, not the office account. They do
it in ~180 lines (`base44/shared/se/rexVault.ts`):

1. Capture the embed `rex_token` from the URL.
2. `POST /user-profile/extendSessionToken { token_lifetime: 604800 }` — REX's
   documented 1-week max. Doubles as a liveness check.
3. AES-GCM encrypt, store against the user.
4. Scheduled keepalive re-extends, so one embed visit a week keeps direct
   non-embed writes attributable.
5. On `TokenException`/401/403, mark dead, log, throttled admin alert, and
   **transparently retry on the service login so the user's action still
   succeeds.**

Resolution order: `live embed token > validated vault token > service login`.
**No password is ever handled.**

### 4. Compliance entries are WRITABLE, and searchable more cheaply

We treat `ComplianceEntries` as read-only and slow. Both half-wrong:

```js
POST /compliance-entries/create
{ data: { parent_object_type_id: 'listing', parent_object_id: <id>,
          type_id: 'listing_proof_of_ownership', source_id: 'crm',
          details: { <block>: { ..., file: 'rextmp://...' } } } }
POST /compliance-entries/archive { id }
```
Search by `criteria: [{name:'parent_object_type_id',...},{name:'parent_object_id',...},{name:'type_id',...}]`
rather than our 100-row scan. Rows carry `file: { uri, url }` where **`url` is
protocol-relative — prefix `https:`**.

Recording a NEW certificate from the portal is available (item 4, PLC). History
still cannot be rewound — REX overwrites on renewal.

### 5. Smaller traps, all measured by them

- **`cf.*` custom fields are SILENTLY DISCARDED by `*/update`** — REX returns
  200 and persists nothing. Use `POST /custom-fields/set-field-values
  { service_name, service_object_id, value_map }`. And `contracts/read` never
  returns `cf.*` at all; only webhooks carry them. Read them with
  `get-values-keyed-by-field-name`.
- **Enum fields silently drop plain strings** — must be `{ id: '<value id>' }`,
  resolved via `/admin-value-lists/get-list-values`.
- **`related` nested writes are confirmed as THE write path** — e.g. contacts
  take `related.contact_names / contact_emails / contact_phones`; delete a
  relation row with `_destroy: true` (they try `_id`/`_related` first, then
  plain `id`/`related`, because REX is inconsistent).
- **Documents have no create** — attach via `related.listing_documents` on the
  parent's update, with a staged `rextmp://` uri from `/upload/uploadFile` or
  `/upload/uploadFileFromUrl` (~30 MB).
- **Calendar creates run `use_strict_arguments`** — only `data` (+ `return_id`).
  Creates need an explicit `calendar_id`; the service login can only write to
  diaries shared with it.
- **REX mail-merge send, exact shape:** `{ data: { merge_objects: [{ contact_id,
  listing_id, mail_merge_template_id, send_from_user_id, custom? }],
  merge_type: 'email', connection_id: -1, send_from_user_id } }`. Omit
  `listing_id` and every `property_adr_*` merge tag renders blank.

### 6. The MA journey model (items 1 and 2)

`MarketAppraisalCase` stages: `upcoming → awaiting_valuation → nurture → won |
lost | cancelled`. `awaiting_valuation` is computed lazily on read, so **no
scheduler is needed**. `won` is triggered by contract signature, not listing-live.

`src/lib/maJourney.js` derives `{ steps, next, urgency, closed, won }` once and
three surfaces consume it — *"three surfaces, one engine, so they can never
disagree."* Six steps: Booked → Deck sent → Appraisal → Valuation → Send deck →
Sign & win, exactly one of which may be `now`.

**Comparables carry NO photos into the deck, deliberately** — HomeSearch has no
photo endpoint for sold addresses, and matching back to a marketing listing hit
1 in 10. *"A comparables slide where one property in ten has a photo reads as
broken rather than rich."*

## The landlord spine, rethought — James, 23 Aug 2026 (BUILT 5 Sep 2026)

> **Built 5 Sep.** The lead spine is DERIVED from a log: every call, text, visit and email an
> agent logs is a row in `os_lead_touches`, and `lib/lead-spine.ts` folds those rows into the
> six ticks. "Log the attempt" is a five-second sheet (what it was, how it went, a line).
> Nurture is a row too, drawn as a pill hanging off the contact steps; a spoke/replied outcome
> or "Back on the spine" brings the lead back. Booking the appraisal is read from
> `os_market_appraisals`, so a landlord who says yes on the first call shows Booked with the
> steps between left hollow. The Leads list's Stage column says the spine's word ("2nd
> contact", "Nurture", "Appraisal booked") for any lead with something logged; REX's three
> words stand for the rest. **Nurture campaigns wired the same day:** the reason picked on Add
> to nurture enrols the lead on the live campaign locked onto it (lib/campaign-store), a reply or
> a booked appraisal takes them off with the reason kept, and the Marketing screen shows replied
> and booked per campaign. Francesca can edit every campaign including the built-ins (an override
> row runs in place of the code copy; revert deletes it), lock any campaign onto any reason, and
> run two on one reason as an A/B - the enroller balances between them. Still to do: the long
> Market Appraisals spine below, unchanged today, and James's decision on whose name nurture
> emails come from (REX_CAMPAIGN_SEND_AS).

Captured verbatim in substance, to be actioned after the handover work. His
diagnosis: **"lead → appraisal" is one enormous jump**, so everything gets
crammed into "appraisal" and the agent cannot see what they have actually done.
Break it into steps small enough to tick.

### Leads — the landlord spine, with a losing branch

What an agent needs on arrival: **the source of the lead, where it came from,
and how to reach them.** Then the work is contact attempts, and they should be
LOGGED rather than remembered.

```
Lead → Contacted → Send email → 2nd contact → 3rd contact → Book appraisal
                                     ↓
                                  Nurture
```

**Nurture is a SPLIT, not a failure.** It is drawn as its own branch so the
agent can see where a lead goes when it stops answering, rather than the record
simply going quiet. Not hooked up yet — that is fine, the spine can show it
before it works.

Booking the appraisal is the last step and it HANDS OVER. That also means the
book-appraisal button moves out of Leads.

### Market Appraisals — the long spine

```
Booked → Pre-appraisal → Appraisal → Awaiting valuation → Post-appraisal
      → Terms → Take-on & photos → ID & ownership → AML & compliance
      → becomes a Listing
```

James on the length: *"that is just the longest part, and there's not really
much we can do about that."* Agreed — the answer is smaller ticks, not fewer
stages.

Open question he raised and did not settle: whether things like "pre-appraisal
sent" are their own spine steps or **sub-items inside a stage**. His instinct
was sub-items, so the spine stays readable. Worth deciding with a real screen
in front of us rather than in the abstract.

### The test to hold it against

An agent logging in wants to answer three questions at a glance:

> **Have I sent this? Have I done this? Have I made this?**

Any stage that cannot be answered yes/no is too big.

## Testing walk against production - 5 Sep 2026

Every Testing-page step probed on tle-os.co.uk with James's session, read-only (no
records created). 36 of 39 checks pass; the three "fails" are by design (the landlord
portal wants a landlord login, the handover scan takes the cron key only).

What is live and answering: 236 lettings leads (500 scanned), 3 appraisals all with a
derived stage, 281 listings with 114 go-live dates, 100 applications, 60 deals on the
board and 63 in the watcher (last look under five minutes old), 9 feed events, 29 bell
notices, PayProp on both agencies (1,063 tenants, 1,356 incoming rows; 5 of 35 deals
money-matched), the compliance tracker refreshing on read (911 outstanding certificates
across the book), 10 campaigns, the agent-compliance list seeded, Kirstie's dashboard with
11 move-ins in the fortnight.

What the walk could NOT do, and needs a hand: booking an appraisal from a lead (writes a
record), the pre-appraisal deck and terms signing (DocuSeal), landlord and tenant sign-in
(a real email must arrive), a PLC pack end to end (zero cases exist on production - nobody
has run one), Flatfair hand-off, Move day on the board (none set), the Testing marks
themselves.

Switches as found: customer email ON, pre-tenancy digest ON (sends to James and Susan,
14 alerts today), REX contact create ON; certificate chases, agent-compliance reminders,
handover live, agent deal emails, Propoly documents, campaign sending all OFF.

## Waiting on someone else

Re-read 2 September 2026.

| Blocked on | What it unblocks |
|---|---|
| ~~PayProp UK API key~~ **done 5 Sep**: E&W connected from the OS with James's credentials. Still wanted from PayProp: the agency income report in the client's permissions, an API view of unreconciled incoming funds, and tenants created at deal start rather than tenancy set-up | item 7's income report; holding fees visible before reconciliation |
| ~~Resend: needs `RESEND_FROM_PUBLIC` on Railway~~ **done** (set by 5 Sep) - customer email is now gated only by the Email to customers switch | the landlord sign-in link, items 12, 13, 15 and every landlord/tenant email test |
| Who does referencing, and whether they have an API, webhook or export | a real referencing status on Applications and Pre-tenancy |
| PayProp: an endpoint for unreconciled/incoming funds (every variant is 404, 5 Sep) | "holding fee paid" before reconciliation; reconciled and held already show |
| Propoly: a webhook on deal status, read access to a deal's documents, and creating a deal by API (all absent, probed 4 Sep) | no polling, the PLC gate checking Propoly's slots, the accepted offer starting the deal without the agent's click |
| Propoly (tidy-up): 29 addresses held twice, 30 extra property records, 5 made since 1 Aug (5 Sep). Howard's flow appears to create rather than match | clean matching before the handover goes live |
| Howard: attach the landlord to the listing in REX on 55 and 59 Fairley Street, 67 Gill Avenue and 5c Newton Road (3 Sep rehearsals stopped there) | those four handovers |
| Michael: what "compliant" means for an agent - now a list he edits himself on /agent-compliance once James gives him the compliance role; the starter eight are a guess | item 11's list; until then the reminders switch should stay off |
| Flatfair API meeting | item 9 |
| Meta embedded signup for a WhatsApp Business number | real WhatsApp sends through REX |
| Power Automate trigger URLs (Application Accepted, Rental Passport) | handoff send, item 17 |
| Base44 access for the Renters' Passport | item 17 |
| Howard, on the Zapier webhook in PLC Request | item 18 |
| James: a decision on the 165 of 293 current rentals sitting as unpublished drafts | any bulk publish |
| James: whether the OS gets its own database before launch (it shares the portal's production one today) | item 8's "keep the details safe" |
| James: input on the pre-presentation and the PLC check designs | items 2 and 4 |
| James: certificates into REX. The approved PLC pack now writes its gas, EICR, EPC and licence into REX's compliance table (5 Sep) - the table the tracker, the chases and REX PM read. It needs the Certificates into REX switch on Admin and `REX_ALLOW_WRITES` on TLE-OS naming `ComplianceEntries/create` and `Upload/uploadFileFromUrl`. Watch the first one. The backlog goes in by hand: James downloads batches of 25-50 out of Propoly, Claude reads each PDF for type, address and expiry and posts it to `/api/compliance/certificates`, which stores the file and writes the same REX entry | the 911 stops growing, and the 219 properties with a gas, EICR or EPC only in Propoly get their entries |
| James: whose name nurture emails come from. The scheduler sends through REX with no agent in the loop, so it needs a REX user id in `REX_CAMPAIGN_SEND_AS` on the TLE-OS service; until then every due email is held and the Marketing screen says so. Also the Nurture campaigns switch on Admin, Switches, and Francesca writing the three Gone quiet emails | item 15; the lead spine's Nurture branch actually emailing anyone |
