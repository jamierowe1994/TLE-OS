# Individual users, verification and the admin centre

The plan agreed with James on 27 Aug 2026. Written down before building because
this touches sign-in, and sign-in is the one thing you cannot iterate on in
front of users.

---

## What already exists (do not rebuild these)

| Piece | Where | State |
|---|---|---|
| User store — `os_users`, scrypt passwords, `owner`/`agent` roles | `lib/users.ts`, `lib/auth.ts` | Working |
| Login / logout / me | `app/api/auth/*` | Working |
| Invite-gated registration (first user free, then must be invited by a signed-in user) | `app/api/auth/register/route.ts` | Working |
| Profile: headshot (downscaled to 256px), bio, phone, patch | `app/(os)/profile/page.tsx` | Working |
| **Per-person REX sign-in** | `lib/rex-user.ts` | Working |
| Office access code gate | `app/api/access/route.ts` | Working |
| Internal-only email guard | `lib/email-policy.ts` | Working |

---

## The REX question — already answered, and no embed needed

James asked whether it is worth having people sign in to REX, and assumed it
would need a REX embed to get a token.

**It is worth it, it is already built, and it does not need an embed.**

`lib/rex-user.ts` takes the person's own REX credentials, logs them in directly
with a `token_lifetime`, and holds *their* token sealed at rest. Measured, not
assumed: REX grants up to exactly two weeks (1209600s accepted, anything above
refused by name). **The password is never stored** — it arrives, goes to REX,
and is gone when the function returns.

Why it matters, and it is not a nicety: with one office API account, every note,
every edit and every sent email in REX reads as **James, forever**. Creating a
record as the office and reassigning it afterwards is worse than useless — the
audit trail still says James did it and somebody inherited it.

So: keep it, surface it in the new joiner flow as a step, and drop the embed
idea entirely.

---

## What is actually missing

1. **Email verification.** There is none today. This is the real new work.
2. **Self-serve joining.** Registration currently needs an existing signed-in
   person to be doing the inviting. A new agent cannot start on their own.
3. **An admin centre.** James and Susan, managing people and seeing the switches.
4. **Sending.** Now unblocked by Resend, and constrained to internal addresses.

---

## The flow to build

```
  work email  ──▶  is it internal?  ──no──▶  refused, plainly
                        │yes
                        ▼
              verification email  (Resend, OS domain, internal-only)
                        │
                  clicks the link
                        ▼
              chooses their OWN password        ← nobody else ever sets it
                        ▼
              profile: headshot, bio, phone, patch
                        ▼
              REX sign-in (optional, prompted)  ← so their work carries their name
                        ▼
                    in the OS
```

### Rules this flow must keep

- **Nobody's password is ever set, seen, or transported by anyone but them.**
  Not by me, not by an admin, not in an email. The email carries a link; the
  password is chosen on the far side of it.
- **A verification token is single-use, short-lived, and hashed at rest.**
  Storing it raw means a database read is an account takeover.
- **Verification does not confer access.** A verified address that is not on
  the allowlist gets an account in a pending state, not the keys. Verification
  proves an address is real, which is a different question from whether its
  owner should be in here.
- **Enumeration.** "We've sent you a link" is the answer whether or not the
  address is known. Different answers turn the form into a staff directory.
- **Rate limit by address and by IP.** A verification endpoint that will send
  on demand is a way to use our new sending domain to spam somebody.

---

## Who gets in first

`FOUNDING_OWNERS` in `lib/email-policy.ts` — James and Susan only:

- `james@therecruitmentexperts.co.uk`
- `susan@thelettingexperts.co.uk`

Both get a confirmation email and choose their own passwords. Anyone else
reaching registration is refused by address, so a leaked office access code is
not on its own enough to mint an owner account.

---

## Build order

1. `os_email_verifications` table + `lib/verification.ts` (create, hash, expire,
   consume). No UI.
2. `POST /api/auth/verify/start` — internal-only, rate limited, always the same
   answer.
3. `POST /api/auth/verify/complete` — consumes the token, creates the account in
   a pending state, lets them set a password.
4. The two screens: "check your email", and "choose your password".
5. Profile completion gate — headshot and bio before the OS proper.
6. REX sign-in prompt, skippable, with the reason stated.
7. Admin centre: people list, role, pending approvals, resend invite, and the
   environment switches (REX write lock, Resend, DocuSeal) in one place.

Steps 1–4 are the ones worth doing slowly.

---

## Open, needs James

- **The public sending domain.** Client-facing email is blocked until it exists.
  Once it does, add a second Resend sender and route by AUDIENCE — do not widen
  the internal guard.
- **Is `agent` one role or several?** Susan needs to see everything; Howard needs
  ops; a partner needs their own patch. Currently `owner` / `agent` only. Worth
  deciding before the admin centre is built rather than after.
- **What happens to a partner who leaves.** Their REX token, their records, their
  headshot on decks already sent. Not urgent, but cheaper to decide now.
