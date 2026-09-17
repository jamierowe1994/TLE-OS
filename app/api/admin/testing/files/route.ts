import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/admin";
import { publicOrigin } from "@/lib/origin";
import { assertNotViewingAs, ViewingAsRefused, VIEW_AS_COOKIE } from "@/lib/view-as";
import { TEST_FILE_SIDES, type TestFileSide } from "@/lib/testing-journeys";
import { KitRefused, relinkKit } from "@/lib/test-kits";
import {
  addTestFile,
  deleteTestFile,
  listTestFiles,
  readyForLaunch,
  removeAllTesting,
  reopenTesting,
  resetTestFile,
  testingClosed,
} from "@/lib/test-files";

/**
 * Admin → Testing → Test files (lib/test-files, 17 Sep 2026).
 *
 * GET  ?everyone=1                       the files, and whether testing is closed
 * POST { action: "add", side }           a new test landlord, tenant or PLC pack
 * POST { action: "reset", id, stage }    back to a stage; never sends an email
 * POST { action: "delete", id }
 * POST { action: "relink", id }          a fresh landlord portal link
 * POST { action: "remove-all" }          owners: every tester's files
 * POST { action: "ready" }               owners: remove all, and close testing
 * POST { action: "reopen" }              owners
 *
 * Same door as the Testing page, and never while viewing as somebody: test
 * files carry the signed-in person's own email.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const me = await requireCapability(req, "see:wiring");
  if (!me) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  const everyone = req.nextUrl.searchParams.get("everyone") === "1";
  const [files, closed] = await Promise.all([listTestFiles(me, everyone).catch(() => []), testingClosed()]);
  return NextResponse.json({ ok: true, files, closed, owner: me.role === "owner", me: me.email });
}

export async function POST(req: NextRequest) {
  const me = await requireCapability(req, "see:wiring");
  if (!me) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  try {
    assertNotViewingAs(req.cookies.get(VIEW_AS_COOKIE)?.value);
  } catch (e) {
    if (e instanceof ViewingAsRefused) return NextResponse.json({ ok: false, error: e.message }, { status: 423 });
    throw e;
  }

  const b = (await req.json().catch(() => ({}))) as { action?: string; side?: string; id?: string; stage?: string };
  const origin = publicOrigin(req);
  try {
    switch (b.action) {
      case "add": {
        if (!b.side || !(b.side in TEST_FILE_SIDES)) return NextResponse.json({ ok: false, error: "Which kind of file?" }, { status: 400 });
        const file = await addTestFile(b.side as TestFileSide, me, origin);
        return NextResponse.json({ ok: true, file });
      }
      case "reset": {
        if (!b.id || !b.stage) return NextResponse.json({ ok: false, error: "Which file, and to where?" }, { status: 400 });
        const file = await resetTestFile(b.id, b.stage, me, origin);
        return NextResponse.json({ ok: true, file });
      }
      case "delete": {
        if (!b.id) return NextResponse.json({ ok: false, error: "Which file?" }, { status: 400 });
        await deleteTestFile(b.id, me);
        return NextResponse.json({ ok: true });
      }
      case "relink": {
        if (!b.id) return NextResponse.json({ ok: false, error: "Which file?" }, { status: 400 });
        return NextResponse.json({ ok: true, url: await relinkKit(b.id, me, origin) });
      }
      case "remove-all":
        return NextResponse.json({ ok: true, removed: await removeAllTesting(me) });
      case "ready":
        return NextResponse.json({ ok: true, removed: await readyForLaunch(me) });
      case "reopen":
        await reopenTesting(me);
        return NextResponse.json({ ok: true });
      default:
        return NextResponse.json({ ok: false, error: "What should happen?" }, { status: 400 });
    }
  } catch (e) {
    const error = e instanceof Error ? e.message : "That didn't work.";
    return NextResponse.json({ ok: false, error }, { status: e instanceof KitRefused ? 409 : 500 });
  }
}
