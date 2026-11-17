# The Demo Copy

A second copy of TLE OS, on its own address, filled with invented data, for showing people round. Asked for by James on 17 Nov 2026 for the recruiters.

## What it is

- **The same code as live.** It is a second service built from the same branch, so every push updates the live system and the demo together.
- **Its own empty database.** Nothing is copied from live.
- **No real keys.** It holds no sign-in for REX, PayProp, Propoly, Outlook, the email sender or the text service, so it has no way to read a real record or reach a real person.
- **Switched by one setting: `DEMO_MODE=1`.** The live service never sets it.

## What `DEMO_MODE=1` does

| Where | What changes |
| --- | --- |
| `lib/rex.ts`, `lib/business/rex.ts` | Every question for REX is answered by `lib/demo/rex.ts` from the invented world. No request to REX is made. |
| `lib/rex-user.ts` | A person's own REX sign-in is a stand-in: everybody is connected. |
| `lib/demo/net-guard.ts` | Every outgoing request from the server is checked against a short allow list and refused otherwise. |
| `instrumentation-node.ts` | Refuses to start if a live key is set. Adds the demo sign-ins, opens every area, fills the managed-homes list. Resets itself each morning. |
| `components/DemoMark.tsx` | "Demo - Invented Data" on every screen. |
| `app/api/demo/reset` | Puts everything back on demand. A 404 on live. |

## The invented world

`lib/demo/world.ts` builds it, from the names in `lib/demo/world-data.ts`:

- 60 homes across Nottingham, Leicester, Derby, Edinburgh and Glasgow
- about 24 on the market (advertised, drafts, let agreed), 4 withdrawn, the rest let
- a landlord and tenants for each, 46 enquiries, three weeks of viewings, appraisals and inspections, lets in progress, gas, electrical and EPC certificates
- 7 staff: five agents, an office manager and an owner

Rules it keeps:

- **Nobody exists.** Customers' emails end `@sandbox.invalid`; phones are `07700 900xxx`.
- **No dates are written down.** Everything is laid out from today, so the demo never ages.
- **The same every morning.** A fixed seed, rebuilt at the first check after midnight UK time. Yesterday's presses are gone.

## Signing in

Each member of the invented staff has a sign-in, all on one shared password, `DEMO_PASSWORD`:

- `sam.whitaker@thelettingexperts.co.uk` - an agent, sees his own homes and leads
- `jess.carter@thelettingexperts.co.uk` - the office, sees everything
- `dana.holt@thelettingexperts.co.uk` - the owner, sees everything and Admin

The other agents are `priya.anand`, `tom.hadley`, `isla.fraser` and `callum.muir`, at the same domain.

## Keeping it in step

Code needs nothing: a push updates both.

The invented world needs a line when a new feature reads something new from an outside system:

1. **A new REX question.** The demo service's log says `[demo-rex] no answer for <Service/method>` the first time it is asked. Add the service to `COLLECTION` in `lib/demo/rex.ts` if it is a plain list, or a handler to `SPECIAL` if it is not, and the rows to `lib/demo/world.ts`.
2. **A new REX field on an existing record.** Add it where that record is built in `lib/demo/world.ts`. Until then the screen reads it as empty.
3. **A new filter.** The log says `filtered by "<name>"`. The row needs that field.
4. **A new outside service.** It will be refused by the net guard, and logged once as `[demo] refused a request to <host>`. Leave it refused unless the demo should really use it, in which case add the host to `DEMO_ALLOW_HOSTS` on the demo service.

`lib/demo/rex-skeletons.json` holds REX's field names (no values), so a field nobody filled in is present and empty rather than missing.

## Not in the demo yet

- **PayProp figures** (rent received, arrears, the P&L sources) and **Propoly** (pre-tenancy deals): not connected, so those boxes say so.
- **Email, text and Outlook**: nothing sends. Screens that send show their preview and stop.
- **Uploads** (photos, certificates): no file store is connected.
- **Steve's AI answers**: off unless an AI key is added to the demo and `api.anthropic.com` is put in `DEMO_ALLOW_HOSTS`.

## Setting it up on Railway

One service and one database, in the existing TLE OS project.

1. **New database.** Project > Create > Database > PostgreSQL. Rename it `Postgres-demo`.
2. **New service.** Project > Create > GitHub Repo > `jamierowe1994/TLE-OS`. Rename it `TLE-OS-demo`.
3. **Variables** on `TLE-OS-demo`, one at a time. Add nothing else.
   - `DEMO_MODE` = `1`
   - `DEMO_PASSWORD` = the password you will give the recruiters
   - `DATABASE_URL` = `${{Postgres-demo.DATABASE_URL}}`
   - `AUTH_SECRET` = any long random text, different from live
   - `CRON_SECRET` = any long random text
   - `SENDING_LOCKED` = `1`
4. **Address.** Service > Settings > Networking > Generate Domain. Copy it.
5. **Two more variables**, both set to that address with `https://` in front:
   - `OS_ORIGIN`
   - `NEXT_PUBLIC_OS_ORIGIN`
6. **Deploy.** The log should read `[demo] DEMO_MODE is on` and `[demo] 7 demo sign-ins and ... managed homes ready`.

If it reads `[demo] REFUSING TO START`, a live key has been added to the demo service: remove the one it names.
