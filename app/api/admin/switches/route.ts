import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/admin";
import { allSwitches, setSwitch, sendingLocked } from "@/lib/switches";
import { record } from "@/lib/audit";

/**
 * Reading and changing what is armed.
 *
 * GET   → every switch, its state, and whether an environment variable is still
 *         deciding it.
 * PATCH → arm or disarm one, with the typed confirmation.
 *
 * ── The confirmation is checked HERE, not in the dialog ───────────────────
 *
 * A browser-only confirmation protects nobody: the request is one curl away,
 * and the person most likely to send that curl is whoever is in a hurry. So the
 * phrase travels with the request and is compared on the server, and the UI
 * simply collects it.
 *
 * ── manage:roles, not admin:open ──────────────────────────────────────────
 *
 * Arming outbound mail is not an administrative convenience; it decides what
 * the system does to other people. `manage:roles` is the nearest existing
 * capability with that character, and it is owner-only.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!(await requireCapability(req, "manage:roles"))) {
    return new NextResponse(null, { status: 404 });
  }
  return NextResponse.json({
    switches: await allSwitches(),
    /* Reported so the page can explain why every toggle reads off, rather than
       looking broken. */
    locked: sendingLocked(),
  });
}

export async function PATCH(req: NextRequest) {
  const me = await requireCapability(req, "manage:roles");
  if (!me) return new NextResponse(null, { status: 404 });

  const { key, on, typed } = (await req.json().catch(() => ({}))) as {
    key?: string;
    on?: boolean;
    typed?: string;
  };
  if (!key || typeof on !== "boolean") {
    return NextResponse.json({ ok: false, error: "Which switch, and on or off?" }, { status: 400 });
  }

  if (on && sendingLocked()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "SENDING_LOCKED is set in Railway, so nothing can be armed from here. Clear it there first.",
      },
      { status: 409 }
    );
  }

  const res = await setSwitch(key, on, me.email, typed ?? "");
  if (!res.ok) return NextResponse.json(res, { status: 400 });

  /* Recorded whichever way it went. "Who turned it off" matters as much as who
     turned it on the morning somebody asks why nothing sent. */
  await record({
    kind: "switch_changed",
    actorId: me.id,
    actorEmail: me.email,
    detail: `${on ? "ARMED" : "disarmed"} ${key}`,
  });

  return NextResponse.json({ ok: true });
}
