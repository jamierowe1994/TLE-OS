# Pre-pilot bug sweep - 18 September 2026

Ten read-only reviews of the Phase 1 core, three days before the pilot (Mon 21 Sep). About 125
findings. Every fix below was checked against the code first, typechecked, and the ones that can be
driven locally were driven. Branch `pilot-bug-sweep`, cut from `origin/main` at `fb8c0fe`.

**FIXED** = on this branch. **OPEN** = confirmed, not done yet. **JAMES** = needs a decision.

## Fixed on this branch

### Security and sign-in
- **A passport link could take over any tenant's account.** Type somebody else's address on page
  one, ask for the account, and their password was replaced and you were signed in as them. The link
  now only proves the address it was EMAILED to; any other address gets a sign-in link by email; a
  password is never replaced. Replayed locally: 409, no cookie, hash unchanged.
- **"Email me a sign-in link" never sent to anybody** (tenant). It only knew addresses on a Propoly
  deal, and Propoly stopped sending those on 6 Sep. Accounts made from a passport now count.
- **Three handlers open to the internet** on paths that skip the sign-in door: the queued-email list
  (landlords' addresses and subjects), the e-sign watch list, and the Bond book read (anyone could
  start a minutes-long REX read, repeatedly). All now want the cron key or a switch-holder.
- **An agent with no REX link could search the whole business** (leads, tenants, landlords, phones)
  from the search bar and the phone view. Now nothing, unless their role sees everything.
- **One landlord could be shown another landlord's let** (tenants' first names, rent, move-in). The
  deal was matched on house number + first street word, across every agency. Postcode now required.
- **An agent could approve their own PLC pack** from the harness page. Decide and the two pushes are
  pre-tenancy only on production. (Who else may approve is still James's call - see JAMES.)
- **The passport's address lookup was a free public proxy onto the paid Google / postcode keys.**
  Wants a real passport token now, no geocode, counted per token.
- **Company income by month and the rent-protection book** were readable by every signed-in role.
- **Email templates and campaigns** could be rewritten, or set live, by any signed-in role. Owner or
  marketing only, the same rule the admin catalogue already had.
- **The orphan `/api/listings/write-up` route** could blank the portal advert on any listing. Deleted.
- **Tenant feedback typed on a public page went into the agent's email as live HTML** (links, images,
  a fake branded button). Escaped.
- **The sample landlord portal could email a real agent** if the browser held a landlord cookie.

### Emails and timers
- **The automatic pre-presentation email never sent.** The queue looked its sender up by NAME in the
  id column, so every queued email failed (since 16 Sep). Fixed - and because fixing it would have
  released the backlog: anything more than 12 hours late is cancelled, a pre-appraisal whose visit
  was lost, moved or has passed is cancelled, and queuing twice updates the row instead of doubling.
- **A database hiccup read "Email to landlords and tenants" as ON.** An unreadable switch is now off.
- **Works-order, inspection and assistant emails from an agent's Outlook ignored the customer-email
  switch** - and the works sweep runs on a timer. They respect it now.
- **Every landlord email killed the sign-in button in the email before it.** System links now keep
  earlier ones alive. The contract nudge checks it may send BEFORE minting a link (it was minting,
  and voiding, every five minutes with the switch off) and claims its turn so it cannot double-send.
- **A signed contract could be thanked-for and dropped.** If DocuSeal was slow when the last
  signature arrived, the webhook said 200 and DocuSeal never sent it again: never filed, never pushed
  to REX, and the nudges kept going. It answers 503 now, which DocuSeal retries.
- **"Stop the emails" said stopped when it had failed** (portal button and the email link).
- The agent's briefing email gave the visit an hour early all summer.

### Wrong figures and made-up data
- **Demo leads on the live Leads board** while loading, on a failed read, and for an unlinked agent -
  clickable, with Email and Send passport beside real-looking addresses. Gone; loading and error
  states instead. Sample addresses moved to example.com.
- **The same on Listings** (a 6 August export, including other agents' real listings) **and on
  Compliance**, plus the dashboard's Compliance due tile, which only ever showed the sample homes.
- **Both portals' "My details" was still the mock-up**: "Raj Chauhan", a bank account ending 624, a
  repair approval limit that "Saved" to the browser only. Both show the real account now.
- **Every diary time was an hour early** until the clocks change, and all-day entries drew on the
  wrong day: times were read on the server's UTC clock. Proved against stored viewings (summer's
  first slot 08:00Z, winter's 09:00Z). Read on the London clock now; cache key bumped.
- **The diary read once per tab.** A tab left open overnight showed yesterday under "Today" and
  offered taken slots as free. Re-reads on return to the tab, every few minutes, after a booking and
  after a hand-made entry; a book read on an earlier day is never served.
- **A refused REX call read as "nothing there"** and was cached as live: listings (tab counts, Find a
  home, Mail the database), the diary (every slot free), leads (the scan blanked the owner's board),
  the agent list (agents read as unlinked for half an hour). They raise an error now.
- Dashboard tiles kept a failed answer for the life of the tab; Applications fetched once per tab; a
  failed Propoly read said "it isn't in Propoly yet" for five minutes.
- "Opened by the landlord" counted the agent's own previews and presenting on the day.

### Things that did the wrong thing
- **Arrow keys while typing an email moved the lead underneath it**, so Send went to the next
  person. Escape closed the drawer with the pop-up. Driven locally: fixed.
- "Draw it up with the new figures" reopened the contract signed at the OLD figures - a dead end.
- Dropping several photos showed one finished and the rest spinning for ever (they had uploaded), so
  the natural thing was to drop them again and double every photo on the advert.
- "Send from your phone" (landlord QR) landed on the STAFF sign-in page.
- The bug bot's one item: a second compliance entry REX refuses by design no longer raises a ticket.

## Open - confirmed, not done (roughly in order)

1. ~~**Booking from a lead: the viewing and its "Send confirmation" vanish when the drawer closes**~~ **DONE 22 Sep** - the OS keeps its own row and the Viewings tab offers the send.
   (in memory only), so an unticked or failed confirmation can never be sent. (M)
2. ~~**"Continuing X's record" in New lead still creates a second REX contact**~~ **DONE 22 Sep** - linked, never created. - armed since 18 Sep. (S/M)
3. ~~**An appraisal booked from a REX lead never has a landlord email**~~ **DONE 22 Sep** - read from os_leads., so confirmation,
   pre-presentation, contract and nudge all refuse. Read it from `os_leads`. (S/M)
4. **DONE 22 Sep (listing writes and viewing changes; hide-lead and the application journey read still open).** ~~No ownership check by listing id~~ on details / media / publish / archive; any agent can take
   another's advert off. Same shape: `/api/viewings/change` (cancel or move any REX event by id, with
   an office-token fallback - locked today only by the REX allowlist), hide any lead, read any
   application's journey. (M)
5. ~~**`/api/r2/file` and `/list`: any signed-in role can list and open every landlord's and tenant's
   documents and every signed contract.**~~ **DONE 22 Sep** - lib/r2-access: agents get property paperwork and their own packs only.
6. ~~**A booking made in the OS is not in the OS diary unless the REX copy succeeded**~~ **DONE 22 Sep** - every real booking is an os_appointments row. - which it never
   does for a test file or an unlinked agent, i.e. every practice booking in the pilot. (M)
7. **DONE 22 Sep (a works order, a note on the file)** ~~**Landlord "Report a problem"** never becomes a job, can go to the wrong agent, and says Sent~~
   regardless. (M)
8. ~~**The dashboard's Pipeline row disagrees with the tiles above it**~~ **DONE 22 Sep** - leads and appraisals are this month's. (all-time totals beside live
   counts), and Applications means two different things on the tile and the screen. (M)
9. **DONE 22 Sep** ~~Application-to-deal matching is a substring test~~ ("12 High St" inside "112 High St"; Scottish
   "29/9" never matches) and the watcher opens PLC packs on it. One shared matcher. (M)
10. **DONE 22 Sep** ~~A pack Kirstie sends back is a dead end for the agent~~ and her note is never shown; the agent's
    bell links to Kirstie's workspace and bounces. (S each)
11. **DONE 22 Sep** ~~Pulled listings appear on every agent's board~~ and may reach tenants when already let. (S)
12. **DONE 22 Sep (throttle and sign-in limit; revoking sessions still open)** ~~No per-email throttle on landlord / tenant magic links; **no rate limit at all on staff sign-in**~~;
    sessions cannot be revoked. (S, S, M)
13. **PART DONE 22 Sep (the age guard on unsuccessful; the check-send-mark and last-night's-diary parts still open).** Timed customer sends still check-send-mark (tenant reminders, questions chase, works sweep);
    tenant reminders run off last night's copy of the diary; "unsuccessful" application emails have
    no age guard - tidying old applications in REX would email every applicant "no". All behind
    switches that are off. **Fix before turning Automatic tenant emails on.** (M)
14. **DONE 22 Sep** ~~Handover: a failed Propoly read is recorded as "not in Propoly, would create"; nothing stops a~~
    second live run. **STOP before `handover_live`.** (S)
15. Smaller: moving a take-on visit leaves the old Outlook entry; an appraisal is always 60 minutes
    in Outlook; "9am the day before" is 10am in summer; listing cards say "Viewings 0" from sample
    data; drawer failures read as 0; board stale after publish; multi-property landlords' Questions
    and Documents act on the default property; Stannp sends keep no record; PeriodPicker stops at
    December 2026; `/tenant/welcome` and `/tenant/apply` are public mock pages.

## JAMES - decisions

- **Who may approve a PLC pack.** I have set it to pre-tenancy and above. Yours to widen.
- **Susan's and Kirstie's scope.** The role table gives them "see everything"; `lib/scope.ts` only
  honours the word "owner". Changing it widens Kirstie's diary and the finance forecast too, which
  you proved the other way on 10 Sep - so I left it. Susan is an owner on production, so she is fine.
- **No tenant can see a tenancy or raise a repair**: accounts are tied to deals by an email Propoly
  no longer sends. How should an account be linked to its deal - staff ticks it, or name + property?
- **A tenant who got a pasted passport link signs in by email link, not the password they typed.**
  That is the price of closing the takeover. Say if you want a set-password step after the link.
- Look-only mode leaks: Compose, Send passport and Tasks are outside the area map.
