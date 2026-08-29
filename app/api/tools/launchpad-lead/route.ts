import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { isStandIn } from "@/lib/admin";
import { assertNotViewingAs, ViewingAsRefused, VIEW_AS_COOKIE } from "@/lib/view-as";
import {
  fetchLead,
  addLeadNote,
  setLeadFollowUp,
  getLaunchPadAccessForPerson,
} from "@/lib/launchpad";
import { allAgents } from "@/lib/rex-agents";
import { getTegPerson } from "@/lib/teg-people";

/**
 * One lead, read and written through Launch Pad.
 *
 *   GET  /api/tools/launchpad-lead?id=
 *   POST /api/tools/launchpad-lead  { id, action: "note" | "follow-up", ... }
 *
 * ── Entitlement is re-checked on every call ───────────────────────────────
 *
 * This is a paid product, and the panel is a browser away from anybody. The
 * card and the funnel already gate, but a gate you passed a minute ago is not
 * a gate on this request — a licence can lapse mid-session and the answer has
 * to be current. Resolved the same way everywhere: every address the OS holds
 * for that person, keyed off their REX id.
 *
 * ── A view-as may read, never write ───────────────────────────────────────
 *
 * Writing is refused while viewing as somebody. The note would land in their
 * funnel in their name, having been typed by an owner looking over their
 * shoulder — a real person's record saying they rang a landlord when they did
 * not. `assertNotViewingAs` is the same guard the send paths use, and it is
 * checked here rather than trusted from the UI hiding a button.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** The address Launch Pad files this person's funnel under, or null. */
async function launchPadAddressFor(req: NextRequest) {
  const { subject } = await whoIs(req);
  if (!subject) return { error: "Unauthorised", status: 401 as const };

  const alsoTry: Array<string | null | undefined> = [];
  if (subject.rexUserId) {
    const agent = await allAgents()
      .then((rows) => rows.find((a) => a.id === subject.rexUserId) ?? null)
      .catch(() => null);
    if (agent?.email) alsoTry.push(agent.email);
  }
  const teg = await getTegPerson({ rexId: subject.rexUserId, email: subject.email }).catch(
    () => null
  );
  if (teg?.email) alsoTry.push(teg.email);

  const access = await getLaunchPadAccessForPerson({
    email: subject.email,
    name: subject.name,
    rexUserId: subject.rexUserId,
    alsoTry,
  });
  if (!access.entitled) {
    return { error: "Not part of your licence.", status: 403 as const, reason: access.reason };
  }
  return { email: access.askedAbout ?? subject.email, standIn: isStandIn(subject) };
}

export async function GET(req: NextRequest) {
  const who = await launchPadAddressFor(req);
  if ("error" in who) {
    return NextResponse.json({ error: who.error }, { status: who.status });
  }
  const id = (req.nextUrl.searchParams.get("id") ?? "").trim();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const lead = await fetchLead(who.email, id);
  /* Null is "could not reach Launch Pad", not "no such lead" — the panel must
     say so rather than render an empty record. */
  if (!lead) return NextResponse.json({ error: "Couldn't load that lead." }, { status: 502 });
  return NextResponse.json({ lead, readOnly: who.standIn });
}

export async function POST(req: NextRequest) {
  try {
    assertNotViewingAs(req.cookies.get(VIEW_AS_COOKIE)?.value);
  } catch (e) {
    if (e instanceof ViewingAsRefused) {
      return NextResponse.json(
        { error: "You're viewing as somebody else, so nothing can be saved." },
        { status: 403 }
      );
    }
    throw e;
  }

  const who = await launchPadAddressFor(req);
  if ("error" in who) {
    return NextResponse.json({ error: who.error }, { status: who.status });
  }

  const body = (await req.json().catch(() => null)) as {
    id?: string;
    action?: string;
    text?: string;
    at?: string | null;
  } | null;
  const id = (body?.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  let lead = null;
  if (body?.action === "note") {
    const text = (body.text ?? "").trim();
    if (!text) return NextResponse.json({ error: "Nothing to save." }, { status: 400 });
    lead = await addLeadNote(who.email, id, text);
  } else if (body?.action === "follow-up") {
    lead = await setLeadFollowUp(who.email, id, body.at ?? null);
  } else {
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }

  /* The lead comes back from Launch Pad, so the panel redraws from what was
     saved rather than from what it hoped. A null here means we cannot confirm
     it landed, and saying so beats showing a note that may not exist. */
  if (!lead) {
    return NextResponse.json(
      { error: "Couldn't save that. Nothing has been changed." },
      { status: 502 }
    );
  }
  return NextResponse.json({ lead });
}
