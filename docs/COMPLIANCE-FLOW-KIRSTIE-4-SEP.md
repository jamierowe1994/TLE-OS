# Compliance flow - actions from the Kirstie call, 4 Sep 2026

Source: Wispr Flow recording "Properly Payment and PLC Process" (16 min, 13:00).

## The flow as Kirstie runs it today

1. Agent creates the deal in Propoly. By now EPC, gas, EICR and signed terms should already be on file.
2. Holding fee: Propoly -> PayProp. Propoly recognises the payment itself once the deal exists.
3. Agent manually clicks "start deal" to begin referencing. Keep this manual (landlord or agent can still pull out).
4. Propoly does the referencing. Nobody is told when it lands: Kirstie checks the system, or finds out when an agent sends a PLC request.
5. PLC check: £60 to the agent. A failed check is another £60 and TLE pays it, not the agent. Fails happen when a Propoly document category is empty.
6. After PLC passes the agent keys the deal into Flatfair by hand. Flatfair pushes back into Propoly when done.
7. Kirstie presses "generate tenancy agreement" in Propoly. Agents cannot. Leave this alone.
8. Nothing tells Kirstie when the agreement is signed. She checks manually.
9. Since 1 May the first rent request only goes out once landlord and tenant have both signed. Propoly sometimes misses the payment, so Kirstie confirms it from PayProp by hand.
10. Move day is the only stage that needs a human to move it.

## Decisions on the call

- Get the whole flow working end to end first, then add stop points (for example "check the docs before it goes to the portals") where Kirstie wants them.
- Drop the Kanban drag board. Stages move on their own; only Move day is dragged.
- "Start deal" for referencing stays a manual click.
- Anything that goes to Kirstie also goes to the agent and updates the landlord and tenant portals.
- Kirstie gets an activity feed on her dashboard, plus a small desktop app showing the same feed live, so she stops opening files to see what changed. The spreadsheet is retired.

## Actions

### James
- [ ] Propoly: ask for an endpoint or webhook for references returned, tenancy agreement generated, and agreement signed by each party. Also whether documents can be uploaded to a deal by API.
- [ ] Flatfair: the API meeting (launch doc item 9) is now on the critical path. Ask specifically about creating a deal by API and being told when it completes.
- [ ] Decide whether the OS is allowed to write PLC documents into Propoly. Propoly is read-only today; this would be the second write switch after handover.
- [ ] Decide the desktop app route: unsigned download with the "continue anyway" step, or pay Apple's £300ish developer fee.
- [ ] Ask Kirstie which Propoly document categories must be full before a PLC request may be sent.

### Build (Claude)
- [x] (4 Sep) Referencing back: watch the Propoly deal status leave "references" and notify Kirstie, the agent and the portals. Start the PLC step automatically from that signal.
- [x] (4 Sep) PLC gate: block "request PLC check" until every required Propoly document category on the deal has a file. Show the agent what is missing. This removes the £60 fails TLE pays for.
- [x] (4 Sep) PLC pass: when Kirstie marks the pack passed, hand the agent the Flatfair step with the deal details ready to copy, until the Flatfair API exists. Then automate it.
- [ ] Push PLC pack documents into Propoly's document slots (once the write is approved), so Kirstie can generate the agreement without re-uploading.
- [ ] (no source in Propoly; waits on their answer) Signed detection: read the deal payload for signing dates and move the stage; tell Kirstie when both parties have signed.
- [x] (4 Sep) Rent payment: match the incoming PayProp payment to the deal ourselves and mark rent paid, rather than relying on Propoly's recognition.
- [x] (4 Sep) Activity feed on Kirstie's dashboard: one stream of every stage change, payment, PLC event and document arrival across her deals.
- [ ] Desktop live feed app for Kirstie (small Mac app reading the same feed; download from her account page).
- [x] (4 Sep) Portal stage list: retire the Kanban drag except Move day; stages derive from Propoly status, PLC state, Flatfair, signing and PayProp.
- [x] (4 Sep, feed + switch) Every Kirstie notification also reaches the agent and the landlord and tenant portals, with a per-step "hold before sending" switch ready for when she wants one.

## Side note

Kirstie liked Bond and compared it to PropAlt (was £120 a month, per-letter pricing). James floated about £50 a month including postcards.

## What Propoly's API can and cannot tell us (probed live, read-only, 4 Sep 2026)

Source: the production OpenAPI spec (TLE-portal/docs/propoly-openapi.yaml) plus GET and OPTIONS calls with the agent credential.

**Available**
- `GET /deals` with `tenancy_status`, `updated_at_from`, `created_at_from` filters. This is the stage signal: poll for deals updated since the last poll and diff the status.
- Deal payload: `tenancy_status` (start_deal, holding_fee, references, tenancy_generation, signing_and_move_in_monies, complete, cancelled), `move_in_date`, `holding_fee_pence`, `deposit_pence`, `deposit_registered_by`, `standing_order_reference`, tenant, landlord and guarantor uuid, name, email, phone, `property_uuid`, `property_address`, `extra_clauses_details` (carries the Flatfair schedule when used), `updated_at`.
- `GET /configuration/document_types`: 17 slots, including EPC, EICR, Gas, Council licence, LL ID, LL proof of address, LL proof of ownership, Landlord AML, TT proof of address, TT reference report, TT right to rent, Terms of business, Inventory, General.
- `POST /documents` (multipart: deal_id, type, file, expiration): uploads one file per type per deal. Compliance types need an expiry. 409 if that type already exists on the deal. 8.5MB max. Gas rejected on a no-gas property.
- `POST /landlords`, `POST /properties`, `POST /tenants`, `PATCH /landlords/{id}/relationships` (already used by the handover).

**Not available**
- No webhooks or events of any kind. Everything is polling.
- No GET for documents. We cannot see which slots on a deal are filled, so the PLC gate cannot be checked against Propoly. It must be checked against the OS's own PLC pack.
- No reference status or report. Referencing is only visible as the status leaving `references`.
- No signing state, no per-party signed dates, no agreement generated flag.
- No payment received flags for holding fee or rent. `holding_fee_pence` is the amount agreed, not paid.
- No POST or PATCH on deals: we cannot create a deal, move a stage, or start referencing.
- The detail endpoint returns exactly the list row. Nothing extra.

**What that means for the build**
- Stage tracking: a 60 second poll on `updated_at_from` catches every Propoly-driven move. References back = status goes `references` -> `tenancy_generation` (confirm with Kirstie that Propoly makes that move itself).
- Signed and rent paid: `complete` is Kirstie's manual mark. Rent paid comes from PayProp on our side. Signed has no source; the OS asks Kirstie or reads the signed PDF she uploads.
- PLC gate: enforce inside the OS PLC pack (our slots mirror Propoly's 17 types), then push the pack into Propoly with `POST /documents` once writes are approved. That removes the empty-slot fails.
- Flatfair: nothing in Propoly. Needs the Flatfair meeting.

**Questions for Propoly** (James): a webhook or at least an events feed; GET documents per deal; reference outcome; signing state; holding fee and rent received. Without the first two the OS is polling and blind on documents.

## Built on 4 Sep, after the call

- Propoly watcher every 5 minutes (Railway service `os-cron-propoly-watch`); feed at /pre-tenancy/feed and the agent's "What moved" tile; "Tell agents" switch.
- Money from PayProp: holding fee, deposit registered, first rent, announced once each.
- PLC gate with required and conditional checks, written reasons, reader runs before submit.
- Flatfair hand-off screen at /applications/flatfair?deal=<uuid>, ticking "deposit registered".
- Stages derived (lib/business/deal-stage.ts); Move day is the only manual move.
- Daily cron `os-cron-daily` at 07:00 UTC: handover shadow scan and the pre-tenancy digest (digest still behind its switch).
