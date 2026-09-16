# Moving the OS onto its own database

Tracker n01. Prepared and rehearsed 16 Sep 2026. **Not run.**

The OS runs on TLE-portal's production Postgres today. This moves it onto a database of its own.
The scripts only ever **read** the old database, so the old one is the rollback: point the OS
back at it and it is exactly where it was.

## What the rehearsal proved (16 Sep, against production, into a throwaway database)

| Step | Result |
|---|---|
| `plan.mjs` | 132 tables and 23 sequences move (282 MB), 2 portal-only tables stay, no foreign keys cut |
| `copy.mjs` refuses the same database twice | Refused |
| `copy.mjs --go` | Dump 36 MB compressed, **copied in 43 seconds** |
| `verify.mjs` | 130 of 132 tables exact. The other 2 differed by the page views and bug reports the live OS wrote **during** the copy - newer than anything copied, so the copy was complete. **It refused to call it a match, which is the point**, and is why step 3 below stops the OS first. |

---

## Before the window: one decision

**The shared tables.** The OS writes fifteen tables the portal also writes: deal notes and tasks,
PayProp connections, company figures, Steve's knowledge, users and more (`tables.mjs` lists
them). Once the databases are separate, a note written in one app is not seen in the other.

- **Copy** (`--shared=copy`, the default): the OS takes its own copy. Right if the portal is
  retired or read-only after launch.
- **Leave** (`--shared=leave`): they stay on the portal's database. Only possible if the OS keeps
  a second connection for them, which it does not have today - that is a build first.

**If the portal is still used after launch, do not run this until that is decided.**

---

## The window

Allow 30 minutes, outside working hours. The OS is down for about 5 of them.

### 1. Make the new database (James, in Railway)

1. Open the **TLE - Portal** project.
2. Press **Create**, then **Database**, then **PostgreSQL**.
3. Rename the new service to **TLE-OS-DB**.
4. Wait until its deploy is green.
5. Open it, **Variables**, copy **DATABASE_PUBLIC_URL**. That is `TARGET_URL` below.

The old one is the service called **Postgres**. Its `DATABASE_PUBLIC_URL` is `SOURCE_URL`.

### 2. Plan (Claude, reads only)

```bash
SOURCE_URL="…" node scripts/db-move/plan.mjs --shared=copy
```

Must end **"Plan is clean."** If it names a table in no group, add it to `tables.mjs` first.

### 3. Stop the OS writing (James, in Railway)

1. Open the **TLE-OS** service.
2. **Settings**, find **Replicas**, set it to **0**.
3. Wait until it shows no running deployment.

The cron services keep calling the OS and get no answer for a few minutes. That is harmless.
The portal is not touched and keeps running.

### 4. Copy (Claude)

```bash
SOURCE_URL="…" TARGET_URL="…" node scripts/db-move/copy.mjs --shared=copy
SOURCE_URL="…" TARGET_URL="…" node scripts/db-move/copy.mjs --shared=copy --go
```

The first prints what it will do. The second does it. It refuses if the target already holds data.

### 5. Verify (Claude)

```bash
SOURCE_URL="…" TARGET_URL="…" node scripts/db-move/verify.mjs --shared=copy
```

Must end **"Every table and every sequence matches."** If it does not, **stop**: set Replicas back
to 1 in step 3 and the OS is running on the old database as before. Nothing is lost.

### 6. Point the OS at the new database (James, in Railway)

1. Open the **TLE-OS** service, **Variables**.
2. Find **DATABASE_URL**. Change its value to: `${{TLE-OS-DB.DATABASE_URL}}`
3. **Settings**, **Replicas** back to **1**.

### 7. Point the nightly backup at the new database (James, in Railway)

**Do not skip this.** The backup is the only second copy of most of what the OS holds
(`docs/DATA-COPIES.md`). If it keeps dumping the old database, the OS's new data is never backed up
and nothing says so.

1. Open the **os-cron-db-backup** service, **Variables**.
2. Find **DATABASE_URL**. Change its value to: `${{TLE-OS-DB.DATABASE_URL}}`

### 8. Check it (Claude, then James)

- Sign in. The dashboard figures load and are this month's.
- The leads board, a listing, a works order, the Testing page all open.
- Admin, Pre-launch shows the bug list.
- `SELECT count(*) FROM os_page_views` on the **new** database rises as you click around, and on
  the **old** one does not. That is the proof the OS is really writing to the new one.

### 9. The next morning

- The nightly backup log reads `backup ok` with the **new** database's table count.
- Re-run the restore drill (memory: tle-os-backups) against that dump.

---

## Rollback

At any point before step 6: set Replicas back to 1. Nothing changed.

After step 6: set **DATABASE_URL** back to `${{Postgres.DATABASE_URL}}` on TLE-OS and on
os-cron-db-backup. The old database is untouched. **Anything written between the switch and the
rollback is only on the new database** - note the time you switched, and copy those rows back
if there are any worth keeping.

## Afterwards, not the same day

Leave the old `os_` tables where they are for at least a week of stable running. Removing them is
irreversible and gains nothing but tidiness.
