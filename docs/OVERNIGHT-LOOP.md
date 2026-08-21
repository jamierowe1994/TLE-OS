# The overnight loop

One scheduled run does **one chunk of work**, writes what happened, and stops.
Several runs spaced through the night get through the list without any of them
growing long enough to go wrong.

James reads `OVERNIGHT-LOG.md` in the morning. That is the whole point: he
should not have to reconstruct the night from commits.

---

## The prompt

Paste this as the scheduled task. It is deliberately the same every run — the
**roadmap file is the state**, not the prompt and not my memory.

> Work the TLE OS launch list, unattended.
>
> 1. Read `docs/LAUNCH-14-OCTOBER.md` and `docs/OVERNIGHT-LOG.md`. The log tells
>    you what previous runs did, what they blocked on, and what not to retry.
> 2. Pick **one or two** items from the allowed list below — highest value that
>    is genuinely unblocked. Prefer finishing something started over starting
>    something new.
> 3. Work on a branch: `overnight/<date>-<item>`. Never commit to `main`.
> 4. **Every item ends in a measurement against a live system.** If you cannot
>    measure it, stop and log it — do not proceed on reasoning alone.
> 5. Update the item's status in `LAUNCH-14-OCTOBER.md`.
> 6. Append a run entry to `OVERNIGHT-LOG.md` in the format below, push the
>    branch, and stop. Do not open a PR.
>
> Obey `docs/OVERNIGHT-LOOP.md` in full — especially the two-strikes rule and
> the hard stops.

---

## The two-strikes rule

**This is the cost control.** It matters more than any other rule here.

> An approach that fails **twice** is abandoned. Not tried a third time, not
> tried "one more way". Write it in the log as blocked, say precisely what was
> tried and what happened, move to the next item.

A third attempt at a wall is almost never the one that works, and it is exactly
where an unattended run quietly burns an afternoon of credit. If a whole item
blocks, move on. If **two items in a row** block, **end the run** — something
about the environment is wrong and more attempts will not fix it.

Related, same spirit:

- **No speculative refactors.** Fix what the item needs; leave the rest.
- **No rebuilding what exists.** Check the "already built" table first.
- **One probe per unknown.** If an API doesn't answer the way the docs say,
  that is a finding to log, not a puzzle to solve for an hour.

## Hard stops — these are not permission questions

James has granted full permissions. These stay off anyway, because they are
about **irreversibility**, not authorisation:

| Never, unattended | Why |
|---|---|
| Unlock `REX_ALLOW_WRITES` | Six businesses' live system. First write goes through with a human watching. |
| Send a real email, SMS or webhook to a customer | An unattended send cannot be recalled. |
| Touch the PayProp UK OAuth refresh token | One refresher. Rotating it breaks live E&W. |
| Re-consent, re-key or rotate any credential | Needs a person at the browser. |
| Commit to `main`, force-push, or rewrite history | The morning review is the gate. |
| Delete data anywhere | Obvious, and worth writing down. |
| Publish a listing, or change anything on a portal | Real property, real money. |

Building the *thing that would send*, behind a lock, is fine and expected.
Wiring it live is not.

## Scope per run

- **One or two items.** Not "as many as fit".
- **At most three subagents.** They are the fastest way to spend a lot quickly.
- If an item turns out to be much bigger than it looked, **do the first honest
  slice, log the rest as remaining, and stop.** A half-finished item that is
  described accurately is far more useful than a rushed whole one.

## Allowed items

Only these. Anything else waits for James.

**Probes — read-only, do these first, they unblock planning**

| | What | Why it matters |
|---|---|---|
| P1 | Can REX PM be reached by API at all, or is it still CSV-only? | Item 16 is probably the hardest thing on the list and nobody has tested it |
| P2 | Is per-listing portal publication readable — did it go to Rightmove, OnTheMarket, when? | Items 19 and 20 depend on the answer |
| P3 | What does Base44 expose for the Renters' Passport? | Item 17 |
| P4 | What is on the other end of the Zapier webhook in the PLC Request flow | Item 18. **Read/inspect only — never POST to it.** |

**Builds — the shape is already proven**

| | What | Notes |
|---|---|---|
| 5 | Compliance tracker for Michael | Certificates are `ComplianceEntries` on the PROPERTY. Build the tracker and the reminder QUEUE; do **not** wire the send. |
| 6 | Applications tracker for Kirstie | `lib/applications.ts` is already live off REX |
| 7 | Port the finance figures from the portal to Susan's admin | Porting known-correct code, not re-deriving it |
| 20 | Per-file: when a property went live and where | Do P2 first — if publication isn't readable, this item is a probe result, not a build |
| E | An `EmailDropbox` reader | The feature is built, addressable and at **zero records**. A reader costs little and lights up the moment anyone BCCs. |

## The morning report

Append to `docs/OVERNIGHT-LOG.md`. **Every run, even a run that achieved
nothing** — a silent night is indistinguishable from a night that never ran.

```markdown
## <date> <time> — run N

**Went right**
- <item>: what now works, and the measurement that proves it

**Went wrong**
- <item>: what was tried, what happened, what it would take to fix

**Pushed**
- branch `overnight/…` — <one line on what is in it>

**Not attempted**
- <item>: why (blocked on X / bigger than a slice / two-strikes)

**Cost**
- Items attempted: N · subagents: N · roughly <N>k output tokens
- Anything expensive and why
```

Ordered that way deliberately: right, wrong, pushed, not attempted, cost. It is
the order James asked for and it is the order he reads in.

## What I cannot see, said plainly

**I cannot read the Anthropic account's usage or billing.** No run can honestly
report "you have X% of the week left" — I would be making it up.

What each run *can* do is report its own consumption, and that is what the Cost
block is for. The real lever is not a meter I can't read; it is **scope per run
and the two-strikes rule**, both of which are precisely controllable. Four small
runs a night with a hard ceiling on each is a predictable spend. One open-ended
run is not, which is why this is scheduled rather than looped.

If a week ever does run short, the fix is fewer scheduled runs — not a smarter
budget inside them.
