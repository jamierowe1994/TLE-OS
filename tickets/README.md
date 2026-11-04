# Tickets a deploy fixes

A commit that fixes a ticket from Admin > Tickets adds `tickets/shipped/<ticket id>.json`:

```json
{ "id": "<ticket id>", "summary": "<one sentence the person who reported it would understand>" }
```

When the deploy carrying it boots, the OS marks the ticket Fixed and emails the person who reported it
(lib/ticket-sweep.ts). The five-minute timer repeats the check. Each ticket is closed this way once only, so a
ticket reopened after its fix went live stays open. The first eight characters of the id are enough when they
match one ticket.
