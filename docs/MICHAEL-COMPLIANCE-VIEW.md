# Michael's compliance view — the backlog to work through when it is built

Michael Healy runs compliance and contractor work for The Letting Experts. He does not
have an OS account yet, and item 11 on `LAUNCH-14-OCTOBER.md` (his own compliance
checker) is still waiting on him for the real requirement list.

This file is the queue of things found while fixing the Compliance screen on
**10 September 2026** that are jobs for a person rather than bugs in the code. They are
written down here rather than raised as tasks in the OS because `os_tasks` rows belong to
a signed-in user, and Michael has none — **create these as real tasks the day his account
exists.** Figures below are from `compliance:v6`, read live on 10 September.

## The scope, so the numbers below make sense

**404 homes** the agency is answerable for: REX PM holds an active letting agreement, and
REX does not call the home let only. Same scope as the breakdown sheet
(`claude.ai/code/artifact/417cfa09-1bbf-4e30-8644-e2648093ce43`).

---

## 1. Six homes where nobody has said whether there is gas

Not a certificate chase — a question. Each needs somebody to establish whether the
property has a gas supply at all, and then either a CP12 or a not-required entry citing
the source.

| Property | |
|---|---|
| 2 Norwich Street, Wisbech PE13 2LE | HMO |
| 18 Carlton Road, Northampton NN2 7DQ | |
| 24 Ann Street, Hamilton ML3 0NE | |
| 294 Ellesmere Street, Glasgow G22 5NA | |
| 9 Manor Walk, Thornbury, Bristol BS35 1SW | |
| The Doo'cot, Mansefield House, Callander FK17 8BL | |

## 2. Spot-check the 31 homes REX PM calls "No Gas"

Of the 101 homes with no gas duty, 95 have a positive answer: 64 from a not-required entry
in REX citing the terms of business, and **31 from REX PM's own category** — "No Gas",
"No Gas - Scotland", "Selective Licence No Gas". Those 31 are homes REX CRM holds no
property for at all.

We are trusting that category. If a home has ever been miscategorised, it is now invisible
to the chase list on **both** systems, which is the worst possible failure mode. Michael
should pull a handful and confirm against what he knows.

## 3. The actual chases

- **Gas — 42.** 30 expired, 12 with no record, out of 302 with a gas duty (14%).
- **EICR — 37.** 17 expired, 20 with no record, out of 404 (9%).
- **EPC — 17.** 7 expired, 10 with no record, out of 404 (4%).

## 4. The oldest gas certificates are genuinely ancient

The furthest out of date expired in **2016** and **2019** — 53 Dulverton Avenue Coventry,
Apartment 1 5 Bruce Road, 97 Coton Lane Staffordshire, 5 Colebrook Close. These are real
documents, read off the paper during the September pull and filed against the property.
They pre-date the agency taking the home on and they are the only gas record we hold.

They are chases, not a ten-year failure by TLE, and they should not be presented to a
landlord as though they were. Worth a sentence of context whenever the list is sent out.

## 5. Two decisions that need James, not Michael

- **73 let-only homes sit inside REX PM's managed book.** They are off the compliance
  screen entirely (James, 10 Sep: "we shouldn't be including any let-onlys in
  compliance"). They remain the natural Bond conversation: a certificate falling due on a
  let-only home is the moment to ask the landlord about management. Nothing surfaces that
  today.
- **14 homes carry an overdue certificate, no service type anywhere, and no REX PM
  agreement.** The `isOurs()` rule drops them, because nobody has told us we manage them.
  If that is wrong they need a service type in REX; if it is right they need taking off
  the current rental book.

## 6. Still outstanding from before this

- Michael's **real personal-compliance requirement list**. The eight on
  `/agent-compliance` are a starter set and every one of them is still marked as such.
- The **agent compliance reminders** switch is off, so the daily 30/14/7 and his roll-up
  are built but have never run.

---

*Written 10 September 2026 while fixing the Compliance screen's scope. See
`lib/compliance.ts` for `isOurs()` and `gasAnswered`, which are what make these figures
mean what they say.*
