import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { hasDb, q } from "@/lib/db";
import { findUserById } from "@/lib/users";
import { rexSessionFor } from "@/lib/rex-user";
import { msConnectionFor } from "@/lib/microsoft";
import {
  EMPTY_SETUP,
  STEP_ORDER,
  type SetupState,
  type SetupStepId,
  type SetupView,
  type TourChoice,
} from "@/lib/setup";

/**
 * Where a person is up to in setting their account up.
 *
 * Stored in os_user_prefs under one key rather than as new columns on
 * os_users. It is a wizard's progress, not a fact about the person: it is
 * written five times in their first ten minutes and then never again, and it
 * would be the only mutable-by-the-user column on a table that otherwise
 * holds identity. os_user_prefs already exists for exactly this.
 *
 * ── What is NOT stored here ───────────────────────────────────────────────
 *
 * Whether REX and email are connected. Those are read from os_rex_tokens and
 * os_ms_tokens on every request. Storing them would mean an agent who
 * disconnects REX from their profile still counts as set up, walks into a
 * dashboard of empty tiles, and reports the OS as broken — the one bug report
 * a pilot cannot afford, because it looks like a data bug and isn't.
 *
 * ── No database, no error ─────────────────────────────────────────────────
 *
 * There is no local Postgres on the dev machine and there is not going to be
 * one. Rather than 500 or pretend, this answers `db: false` and the browser
 * keeps its own copy in sessionStorage. The flow can then be driven end to
 * end on a laptop, which is the only way anybody sees this before it ships.
 * Same convention lib/db.ts and /api/prefs already use.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const KEY = "os-setup";

function userIdFrom(req: NextRequest): string | null {
  return verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
}

/** Trust nothing off the wire or out of a JSONB column. */
function coerce(raw: unknown): SetupState {
  if (!raw || typeof raw !== "object") return { ...EMPTY_SETUP, done: {} };
  const r = raw as Partial<SetupState>;
  const done: SetupState["done"] = {};
  if (r.done && typeof r.done === "object") {
    for (const id of STEP_ORDER) {
      const v = (r.done as Record<string, unknown>)[id];
      if (typeof v === "string") done[id] = v;
    }
  }
  const tour =
    r.tour === "full" || r.tour === "fast" || r.tour === "skipped" ? r.tour : undefined;
  return {
    done,
    emailSkipped: r.emailSkipped === true,
    finishedAt: typeof r.finishedAt === "string" ? r.finishedAt : undefined,
    tour,
    tourAt: typeof r.tourAt === "string" ? r.tourAt : undefined,
  };
}

async function readState(userId: string): Promise<SetupState> {
  const rows = await q<{ value: unknown }>(
    "SELECT value FROM os_user_prefs WHERE user_id = $1 AND key = $2",
    [userId, KEY]
  );
  return coerce(rows[0]?.value);
}

async function writeState(userId: string, state: SetupState): Promise<void> {
  await q(
    `INSERT INTO os_user_prefs (user_id, key, value, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [userId, KEY, JSON.stringify(state)]
  );
}

const SIGNED_OUT: SetupView = {
  ok: true,
  db: false,
  signedIn: false,
  name: "",
  email: "",
  rexConnected: false,
  emailConnected: false,
  state: { ...EMPTY_SETUP, done: {} },
};

export async function GET(req: NextRequest) {
  const userId = userIdFrom(req);
  if (!userId || !hasDb()) {
    return NextResponse.json(SIGNED_OUT, {
      headers: { "cache-control": "private, no-store" },
    });
  }

  try {
    /* All four are independent reads against the same pool — serialising them
       would put three round trips in front of a screen somebody is waiting on. */
    const [user, state, rex, ms] = await Promise.all([
      findUserById(userId),
      readState(userId),
      rexSessionFor(userId),
      msConnectionFor(userId),
    ]);

    const view: SetupView = {
      ok: true,
      db: true,
      signedIn: true,
      name: user?.name ?? "",
      email: user?.email ?? "",
      rexConnected: rex.connected,
      emailConnected: ms.connected,
      /* The password step is implied rather than recorded: they cannot be
         holding a session without having set one. Stamping it on read means
         an account created before this wizard existed does not get sent back
         to a screen that would ask it to choose a password it already has. */
      state: {
        ...state,
        done: { password: state.done.password ?? new Date().toISOString(), ...state.done },
      },
    };
    return NextResponse.json(view, { headers: { "cache-control": "private, no-store" } });
  } catch {
    /* A prefs table that will not answer is a browser-local session, not an
       outage worth showing somebody on their first morning. */
    return NextResponse.json(SIGNED_OUT, {
      headers: { "cache-control": "private, no-store" },
    });
  }
}

type Patch = {
  /** Mark a step answered. */
  step?: SetupStepId;
  /** Email only — "not now" is an answer, and we record which answer it was. */
  skip?: boolean;
  /** Stamp the whole thing finished. */
  finished?: boolean;
  /** Which tour they took, or that they took none. */
  tour?: TourChoice;
  /** Start again — the replay harness, and "run it again" from Steve. */
  reset?: boolean;
};

export async function PATCH(req: NextRequest) {
  const userId = userIdFrom(req);
  if (!userId || !hasDb()) {
    /* Not an error: the browser is keeping its own copy in this mode and has
       already moved on. Saying so lets the wizard tell the truth on screen. */
    return NextResponse.json({ ok: true, saved: false, db: hasDb(), reason: "no database" });
  }

  let body: Patch;
  try {
    body = (await req.json()) as Patch;
  } catch {
    return NextResponse.json({ ok: false, error: "Expected a change." }, { status: 400 });
  }

  if (body.step && !STEP_ORDER.includes(body.step)) {
    return NextResponse.json({ ok: false, error: "No such step." }, { status: 400 });
  }

  try {
    const now = new Date().toISOString();
    const next = body.reset
      ? { ...EMPTY_SETUP, done: {} }
      : await readState(userId);

    if (body.step) {
      next.done = { ...next.done, [body.step]: now };
      /* Connecting email after skipping it clears the skip, so the profile
         stops offering to finish something that is finished. */
      if (body.step === "email") next.emailSkipped = body.skip === true;
    }
    if (body.finished) next.finishedAt = now;
    if (body.tour) {
      next.tour = body.tour;
      next.tourAt = now;
    }

    await writeState(userId, next);
    return NextResponse.json({ ok: true, saved: true, db: true, state: next });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Could not save." },
      { status: 502 }
    );
  }
}
