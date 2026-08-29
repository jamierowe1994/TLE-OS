# Pre-tenancy pipeline — what we can see, what we can build, what we need

For Susan. Written 29 August 2026.

The pre-tenancy board shows every deal from Propoly across the eight stages. The
question this answers is a different one: **for each stage, can we independently
check that the thing actually happened?** Not "has someone ticked it" — has a
money or paperwork system confirmed it.

That distinction is the whole point. A tick tells us what somebody believes. A
PayProp record tells us what happened. Where the two disagree is where the work
is, and finding those by hand is the job we are trying to take off Kirstie.

---

## 1. Working now

These are live on the board today. Each one is read from an outside system, not
typed in by anyone.

| What | Where it comes from | How good is it |
|---|---|---|
| **The deal pipeline** | Propoly | Complete. Propoly is the source of truth for deals and always will be |
| **Deposit registered** | PayProp | Strong. Every one of 662 UK tenancies carries a deposit reference |
| **Which deposit scheme** | PayProp, from who the money is paid to | A suggestion we ask Kirstie to confirm. No system records this properly, so our own record becomes the register |
| **PLC / rent protection** | PayProp payment instructions and tags | Partial: of 478 properties, 97 say protected, 126 say without, and **255 say nothing either way** |
| **Gas, EICR, EPC** | REX | Live per property |
| **Landlord terms signed** | REX's e-signature log | Strong for the landlord. See the gap in section 3 |
| **First rent received** | PayProp | Strong — the amount, the date, and whether it has been paid out to the landlord yet |
| **Tenancy actually started** | PayProp rent schedule | New. If Propoly says someone moved in and PayProp has no rent schedule, we now see that |
| **Property photos** | REX | Fixed this week. They had never once loaded |

Two of these went in this week and are worth calling out. **First rent** is the
single best proof a tenancy is real, and it was already being calculated
elsewhere in the system and simply never shown here. **Photos** had never
appeared at all — not a data problem, a timeout that was silently discarding
every result.

---

## 2. We can build these — no permission needed

We already have the access. These are only a question of time.

**Telling people when something happens.** Nothing in the system currently
notifies anybody of anything. Every check above is worked out fresh each time
somebody opens the board, and then forgotten. Kirstie finds out by looking.

This is the biggest single reduction in her workload available to us, and it
needs nothing from anyone outside: when a stage completes, or when a claim and a
record disagree, tell the agent, the tenant, the landlord or Kirstie. We can
already send email. What is missing is the thing that watches and decides.

**Chasing what has slipped.** We can already see a move-in date that has passed
with no rent schedule, or a deal sitting past Deposit with nothing registered.
Today those sit quietly on a panel. They could be a daily list.

**Rent arrears against a deal.** Already calculated for other screens, not yet
joined to pre-tenancy.

**Better compliance coverage.** Certificates are currently matched to deals in a
way that misses a proportion of them. A known fix, entirely ours.

**How well the matching works.** Propoly and PayProp are joined on the address,
because there is no shared reference between them. That works most of the time
and quietly fails some of the time. We now measure it rather than assume it, and
the number is on screen for us.

---

## 3. We need help with these

Each of these is genuinely blocked. None can be solved by us writing more code.

### Holding fees — we can see the invoice, not the money

This is the one worth Susan's attention first.

Your own explanation of the process: the fee is *"sent to PayProp from Propoly
and held in unreconciled funds with a note to reference which property until the
let progresses"*.

That is exactly why we cannot see it. Money sitting in unreconciled funds has
not been allocated to anything yet, so it carries no category and no payment
record. We looked, thoroughly — nineteen different PayProp endpoints — and the
conclusion was that even where an address appears to match, the row is almost
always rent rather than a holding fee.

**What we CAN see:** a "Holding deposit" invoice against the property. That
tells us what was expected, not what arrived.

**What would fix it, in order of preference:**

1. Can PayProp give us an endpoint that lists unreconciled or incoming funds? If
   the money is visible at all, we can match it.
2. Failing that — could the reference note follow a fixed format, always
   containing the property reference in the same place? A freehand note cannot
   be matched reliably. A structured one can.

### Referencing — no system records it

There is no referencing data anywhere we can reach. Not in REX, not in Propoly,
not in PayProp. Propoly has no field for reference status, and the referencing
provider is not connected to anything.

Right now this stage is a manual tick and nothing more, and we cannot verify it.

**What we need:** who carries out referencing, and do they offer an API, a
webhook, or even a daily export? Any of the three would let us show a real
status instead of asking Kirstie to remember.

### Tenant tenancy agreements — we can only see the landlord's

We checked every e-signature envelope in REX — 942 of them. **Every single one
is landlord-facing**: terms of business, marketing agreements. Not one is a
tenant's tenancy agreement.

So the board can tell you the landlord has signed their terms, and can say
nothing at all about whether the tenant has signed the AST.

**What we need:** where are ASTs actually sent for signature, and can we see
their status? If they go out through a different account or a different product,
connecting it is straightforward once we know what it is.

### PayProp permissions in England & Wales

The two PayProp accounts do not have the same permissions. Scotland can read
property tags; England & Wales cannot.

Tags are one of the two ways we detect rent protection, and the better one. On
E&W we fall back to reading the wording of payment instructions, which is why
255 properties currently tell us nothing either way.

**What we need:** ask PayProp to add tag read access to the England & Wales
account. It is one permission and it would immediately improve PLC coverage.

### Move-ins exist only in Propoly

REX does not hold move-in dates. Propoly is the only source, so a wrong date
there is a wrong date everywhere. We can now cross-check against PayProp's rent
schedule, which is a real improvement, but it is a check after the fact rather
than a second source.

---

## In short

- **Deposits, rent, compliance and landlord terms** — we can check these properly today.
- **PLC** — we can check it about half the time, and one PayProp permission would improve that.
- **Holding fees, referencing and tenant agreements** — we cannot check these at all, and no amount of our own work changes that. They need a conversation with PayProp, with whoever does referencing, and about where ASTs are signed.
- **The biggest win available to us right now** is telling people when something happens, rather than waiting for Kirstie to look. That needs nothing from anybody outside the business.
