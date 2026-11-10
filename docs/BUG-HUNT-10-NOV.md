# Bug hunt, 10 November 2026

James, 10 Nov: "We still seem to be getting a lot of tickets... tenant information just consistently
doesn't pull through... I can't keep fixing small bugs. Go hunt for bugs... solve the bugs before they
happen." This is what the tickets say, what was fixed on branch `claude/bug-hunt-10nov`, and what is
still open, grouped by cause so each group can be closed once rather than a ticket at a time.

No customer names or addresses in this file: the repository is public. Homes are named in the session
that wrote it, not here.

## What the tickets say

Live `os_bugs`, read 10 Nov. 515 tickets since September; 83 in the week of 2 Nov; 9 open.
The last 21 days of tickets raised by people (147, automatic ones left out):

| Cause | About | Typical words |
| --- | --- | --- |
| People don't pull through | 25 | second landlord missing from the terms, wrong or old tenants, only an initial, applicant not reaching Propoly |
| Counts and figures that don't match their list | 14 | "says 25 overdue, click in and can't see them" |
| A status that doesn't change | 13 | "pressed take off the market, still says on the market", let agreed still advertised, how do I archive |
| Screens that break | 10 | can't press Yes or No, a window behind another, a screen that would not finish |
| The home doesn't come up | 9 | can't add an invoice, not in my portfolio, can't add documents |
| It won't take my file | 9 | JPEG refused, certificate type not offered, nothing happens |
| New asks, not faults | 35 | |

Three people raise 40% of them (one agent alone 41 in 30 days): the agents doing the most real work in
the OS, not the most careless ones.

Automatic tickets (127 in 30 days) are almost all REX being slow or unreachable.

## The causes, in order of how many tickets they explain

1. **Every screen keeps its own list.** Which homes exist, who the landlords are, who lives there: each
   screen answers from a different place. There are at least five ways to ask "who is the landlord" and
   six for "who are the tenants", and only the Propoly push reads every source. A fix on one screen
   leaves the others wrong, which is why the same complaint returns under a different address.
2. **A home is invisible between let agreed and REX calling it let.** Portfolio is REX's leased
   lettings. Nothing in the OS marks a letting leased, so a home whose tenant has moved in stays a
   current listing until somebody changes REX by hand. On 10 Nov, 12 homes whose Propoly deal completed
   in the last 60 days were not in Portfolio; most were still current listings. Everything reached only
   from Portfolio (right to rent, documents, inspections, section notices) is out of reach for them.
3. **Tickets are marked fixed without the fix being seen to work.** The cloud ticket routine cannot see
   live data. The invoice search was "fixed" twice (28 Oct, 7 Nov); the second note says "I couldn't
   check: I can't see the live data", and live data shows it could not have worked for the person who
   raised it. See docs/CLAUDE-TICKETS.md, "A guess is not a fix".
4. **Buttons that say done when nothing changed**, and the same action under several names.

## Fixed on this branch

- **Invoices and repairs find a home that is still a listing.** One list for every "which home?" search
  (`lib/homes-to-pick`, `GET /api/homes`): the person's listings, their managed homes, and for the office
  the compliance list. Used by Contractors > Log an invoice, Raise a repair, Maintenance > From a property
  and Tools > Generate an Invoice. A landlord invoice for a home that is not yet a let carries the home and
  its landlords instead of being drafted blank. Proven on the live cached books: with the reporting
  agent's own book, the old search could not find the home (refused the compliance list; not in a
  32-home Portfolio) and the new list has it, marked Let agreed.
- **Take off the market shows.** It writes the Offline marker the board reads, Put back clears it, the
  page badge reads Off the market, and a change REX accepts but does not make is reported as a failure.
  Proven against a local stand-in for REX (off, on, and accepted-but-unchanged).
- **Contractors are not handed a past tenant's number** on their own page, the quote page or the
  certificate email; all three read the list the works order email already used.

## Still open, by group

Found by reading the code end to end on 10 Nov. Re-check each against the code before changing it.

### A. People (landlords and tenants)

Recommended shape: one landlord reader, `landlordsForListing` in `lib/deal-handoff.ts` (the Propoly push's,
the only one that reads every source), moved to its own file and used everywhere; two tenant readers, one
per question - "on this let" (`tenantsAsOnLet`, with added tenants) and "living there now"
(`homePeople().tenants`).

1. REX's second listing owner is missing from the listing's landlord section and its terms:
   `lib/rex-landlord.ts` takes the first (`.find`), read by `components/ListingDrawer.tsx` and
   `components/listing/ListingCompliance.tsx`.
2. Three terms paths send to one landlord only: `app/api/docuseal/sign/route.ts`, called from the New
   Listing wizard, Prepare and Send and the deck's signing.
3. The PLC start never reads the listing's owner or a changed landlord, only the record's name from
   2 Oct; a blank name hides the row (`lib/plc-prefill.ts`, `components/PlcWizard.tsx`).
4. Viewing notices go to the first tenant only; in a shared house that can be another room's tenant
   (`components/viewings/BookViewingWindow.tsx`, `components/LeadDrawer.tsx`).
5. A let opened as its Propoly deal shows only the first owner when it has a listing (`lib/let-people.ts`).
6. `landlordForListing` never tries REX's property owners and holds "no landlord" for 12 hours, so the
   push finds a landlord the let and the listing say is missing.
7. A tenant added on the let gets no customer update or conversation; an email corrected on the let is
   ignored by the tenant file emails, the journey emails, the passport reminder and the let notice.
8. A repair or certificate job on a home not yet let gets REX's first owner, ignoring Change Landlord
   (`lib/rex-property-people.ts`).
9. `lib/offer-landlord-email.ts` says "no email address" for a record landlord even when the record has one.
10. One landlord only receives the viewing confirmation, the PLC outcome and job approvals.

### B. The life of a listing

1. Off-market homes are still advertised by us: the website feed and the tenant's Find a home filter on
   REX "published" only, so Offline, taken and fell-through homes still go out.
2. No way to withdraw a live listing: the Withdrawn box shows only once it is already withdrawn or let
   agreed, and Archive refuses a published listing.
3. Two Relists, neither complete: the board's never touches the advert or the Offline marker; the
   Withdrawn box's never clears the marker.
4. Cancel deal strands the listing as Let agreed: the board hides Relist, the dialog never mentions the
   listing, and the applicant stays on the REX listing.
5. A let (leased) listing is a dead end: in neither the book nor the archive, the page has no portal control.
6. Archived homes still come up on Inspections when the list is built from the old system's tasks.
7. Withdrawn-home terms clean-up covers REX e-sign only; DocuSeal terms keep counting and the nudge keeps
   emailing the landlord.
8. Caches: a withdrawn listing vanishes for up to 12 hours (retired cache not cleared); owner change leaves
   the in-memory Portfolio stale; a refresh in flight can re-store the old book after a write.
9. Re-let and Book the check-out are hidden until notice is recorded, with no explanation.
10. Archiving a lead leaves its booked viewings and queued sends.
11. The automatic take-down has failed on the same five old listings every day since 8 Nov ("Not valid
    for upload") and will keep trying them.

Wording to settle (one action, many names): Take off the market / Take off the portals / Take offline /
Take It Offline / Take the advert down / Keep it off the market; Relist / Put it back on the market / Put
back on the portals / Back to available; Archive meaning four different things.

### C. The home doesn't come up

1. Right to rent on the home refuses any home not in the caller's managed book.
2. Three id checks still refuse homes taken on in the OS or carried from the old system:
   `app/api/homes/source`, `app/api/homes/os-address`, `app/api/property-file/link`.
3. Inspections, section notices, PLC, add certificate and Email Docs have no search at all: they are
   reached only from the home, so a home missing from Portfolio cannot be acted on (cause 2 above).
4. Listings answers an office account with no agent link "we can't tell which agent you are"; Portfolio
   widens to the whole business for the same person.

### D. It won't take my file

1. PAT and fire certificates are still blocked without an expiry date on four screens, greyed with no
   reason shown (`ListingCompliance`, the compliance tracker, `WorksNow`, `lib/works-certificate.ts`); the
   server takes the issue date alone.
2. Clean sweep: an upload error is shown once above the table, not on the row, so "nothing is happening".
3. Document types: no Tenant ID in `lib/doc-types.ts`; Fire Risk Assessment and Emergency Lighting share
   one "Fire safety" slot; the sweep's "Newer one" offers three types only.
4. The file picker offers more than the server takes (`image/*` against five exact types), a blank
   browser type is refused everywhere, and the `.jfif` fix is in two of seven upload routes.
5. A large phone photo may be over the reader's own limit while the route allows 12 MB (not confirmed).

## Decisions that are James's

- Should a home count as let, and join Portfolio, when its Propoly deal completes - rather than when REX
  is changed by hand? It changes the Portfolio count.
- Should Available stop counting a published listing that has been taken off the portals? It changes the
  On the market figure on the dashboard, the Overview and Listings.
- One name each for taking an advert down, putting it back, and archiving.
