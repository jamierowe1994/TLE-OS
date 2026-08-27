# DocuSeal — where we got to, and what's left

**Status: seam built and pushed, nothing armed. Blocked on Howard being back.**
Written 27 Aug 2026 so this can be picked up cold.

---

## The decision

James chose **DocuSeal as the primary e-signature path**, keeping the existing
**REX/DocuSign route as a fallback**, so terms still go out if one provider is
down. Both stay in the codebase. Neither is deleted.

| | DocuSeal | REX's DocuSign |
|---|---|---|
| Whose account | **Ours**, self-hosted | REX's, shared across the six businesses |
| Cost per envelope | None | REX's |
| Lands on the REX record | **No** — needs a write-back we haven't built | Yes, automatically |
| Code status | Seam built, not wired to UI | Fully built, never fired |
| Same choice as | Fine & Country | — |

---

## What exists today

**Ours, in TLE-OS (commit `10ccd54`):**

- `lib/docuseal.ts` — the client: `templates()`, `submission(id)`,
  `sendForSignature()`, plus `docusealConfigured()` / `docusealSendUnlocked()`
- `app/api/docuseal/route.ts` — `GET` (status + templates), `POST` (send, or
  read a submission back)

**The DocuSeal instance itself:**

- `jamierowe1994/docuseal` — our fork. Has a CRM OAuth authorize page (fixed in
  `5abc3a07`, "blank CRM authorize page — seed OauthApplication and restore
  stored location after login")
- `jamierowe1994/docuseal-railway` — the deployment

**The fallback, already built in TLE-OS:**

- `app/api/esign/send|remind|templates|document/route.ts`
- `components/ContractsPanel.tsx`, `components/SignaturePanel.tsx`
- Needs no DocuSign key of ours — it borrows REX's connection.
  **TLE's connection id is 2103** (`REX_ESIGN_CONNECTION_ID`).

---

## API facts, verified against the fork's source (not the public docs)

- Base: `{DOCUSEAL_URL}/api`
- Auth header: **`X-Auth-Token`** (`app/controllers/api/api_base_controller.rb:43`)
- `GET /api/templates` — a template's `submitters[].name` are the **role names**
  the send must use ("Landlord", "Agent")
- `POST /api/submissions` — returns an **ARRAY**, one submission per email
- `GET /api/submissions/{id}` — submitter status; signing link is `embed_src`,
  else `{DOCUSEAL_URL}/s/{slug}`
- Webhook events: `form.viewed`, `form.started`, `form.completed`,
  `form.declined`, `submission.completed`

### The trap that shaped the whole design

`POST /api/submissions` **defaults `send_email` to `true`**:

```ruby
params[:send_email] = true unless params.key?(:send_email)
```

A request reaching `lib/docuseal.ts` emails a real landlord. No staging, no
preview, no undo. So `send_email` is **always stated explicitly** in our
payload — never inherited — so a future DocuSeal upgrade changing its own
default cannot change ours.

---

## The lock — three states, not two

| State | Behaviour |
|---|---|
| `DOCUSEAL_URL` / `DOCUSEAL_API_KEY` unset | Inert |
| Keys set, `DOCUSEAL_ALLOW_SEND` unset | Reads work, **sends refuse** |
| `DOCUSEAL_ALLOW_SEND="yes"` | Sends fire |

"Connected" and "allowed to email a landlord" are different questions.
Collapsing them is how a careful first test becomes an accident.

Five refusals, each exercised against the real module — **including with the
lock deliberately opened**, because a guard that only holds while another guard
holds is not a guard:

```
configured: true | sendUnlocked: false
  refused: send while locked  -> Sending is locked on this environment…
after unlock, sendUnlocked: true
  refused: sandbox email      -> That's a sandbox address…
  refused: sandbox ref        -> That's a sandbox record…
  refused: malformed address  -> "nope" isn't an email address.
  refused: nobody             -> Nobody to send it to.
```

---

## What James sets, when Howard is back

Railway → TLE-OS → Variables:

| Variable | Value |
|---|---|
| `DOCUSEAL_URL` | the instance URL, no trailing slash |
| `DOCUSEAL_API_KEY` | DocuSeal → Settings → API |

**Leave `DOCUSEAL_ALLOW_SEND` unset.** That one gets opened only with James
watching, for one supervised send to a colleague.

---

## What's still to build

1. **The provider switch in the UI.** `ContractsPanel` still points only at the
   REX/DocuSign route. Deliberately not guessed at — it needs the real template
   role names, which means the two vars above have to be set first.
2. **Webhook receiver** — `POST /api/docuseal/webhook`, subscribed to
   `form.completed` and `submission.completed`, to advance the appraisal spine
   off AML when terms come back signed.
3. **Write-back to REX.** The one thing DocuSeal loses against DocuSign is the
   REX timeline. The signed PDF should be pushed back as a Document on the
   listing — see `rex-documents-and-uploads` in memory: the undocumented
   `upload` service is the write path.
4. **Fallback switching.** Decide whether it is automatic on a DocuSeal error
   or a manual toggle. Leaning manual: an automatic failover that silently
   sends via a different provider makes "which system holds this contract?"
   unanswerable at exactly the moment it matters.

---

## Known risk, unresolved

`rex-esign-and-cdn-exposure` in memory records that signed "private" contracts
on the REX side are served from an **unauthenticated CDN**. Whether our
self-hosted DocuSeal has an equivalent hole is **untested**. Test before any
real contract goes through it: take a signed document URL, strip the session,
and try it from a clean browser.
