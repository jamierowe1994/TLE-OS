# TLE-OS

Ops overlay / front door for **The Lettings Experts** that pushes into REX. Deliberate sibling of
`TLE-portal` — kept separate until the portal ships. Both are active; both were committed to on
the same day. Client: Susan Liles. Ops: Howard. Pre-tenancy: Kirstie Mulholland.

Next 15 App Router · React 19 · TS · Tailwind v4 · Postgres via `pg` · scrypt auth in `lib/auth.ts`
· S3/R2 via `@aws-sdk/client-s3` + presigned URLs · `qrcode`
Deploy: **Railway**, `output: "standalone"`.

**Launch: 14 October 2026.** Scope end to end — leads → listings → viewings → applications →
compliance → portfolio → finance.

## Watch for

- **Hardcoded month literals.** The live-figures rule in `~/.claude/CLAUDE.md` bit TLE-portal 44
  times over 23 days. Same stack, same seam, same risk here. Month scoping must roll over on its
  own — verify against a date past the current month, not just today.
- **TLE-portal is often open in a second session.** Check before editing anything shared between
  the two repos. Prefer a git worktree.
- Kelly's training hub is due to be built in and reskinned as a version of her training inside
  the system.
- The **pre-presentation** and the **PLC check** both need James's input. Don't design them solo —
  he flagged these two specifically as needing his intervention.

## Verification

No tests in this repo. `tsc` and `npm run build` are not verification.

Drive the page: screenshot desktop and mobile, read the console, confirm every figure is live and
month-correct. Otherwise these surface on Susan's screen or on James's phone.
