import { NextRequest, NextResponse } from "next/server";
import { publicError } from "@/lib/public-error";
import { record } from "@/lib/audit";
import {
  applyEdits,
  contractActor,
  contractEditors,
  converse,
  DeskRefused,
  deskState,
  discard,
  isContractAdmin,
  restoreVersion,
  revertChange,
  saveContract,
  setContractEditors,
  setTick,
} from "@/lib/terms/contract-desk";
import type { Op } from "@/lib/terms/edit";
import type { Country } from "@/lib/terms/types";

/**
 * My Business > Contracts (James, 26 Nov 2026; lib/terms/contract-desk).
 *
 *   GET  ?country=england|scotland   the contract, the working copy, its changes, the history
 *   POST { country, action, ... }    ask | edit | tick | revert | discard | save | restore | editors
 *
 * Only the people named for it, with the "contracts" switch on for them.
 * Everything a save does is in lib/terms/contract-desk; nothing here writes
 * to anything outside the OS, and no contract already sent is touched.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

const countryOf = (v: unknown): Country => (v === "scotland" ? "scotland" : "england");

async function answer(country: Country, me: { role: string }, extra: Record<string, unknown> = {}) {
  const admin = isContractAdmin(me as never);
  return NextResponse.json(
    { ok: true, state: await deskState(country), admin, editors: admin ? await contractEditors() : undefined, ...extra },
    { headers: { "cache-control": "private, no-store" } }
  );
}

export async function GET(req: NextRequest) {
  const me = await contractActor(req);
  if (!me) return NextResponse.json({ ok: false, error: "This screen is not yours to open." }, { status: 403 });
  try {
    return await answer(countryOf(req.nextUrl.searchParams.get("country")), me);
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "The contract could not be read.") }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const me = await contractActor(req);
  if (!me) return NextResponse.json({ ok: false, error: "This screen is not yours to open." }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const country = countryOf(b.country);
  const action = typeof b.action === "string" ? b.action : "";
  const key = typeof b.key === "string" ? b.key : "";
  try {
    if (action === "ask") {
      const out = await converse(country, typeof b.message === "string" ? b.message : "", me);
      return await answer(country, me, { reply: out.reply, problems: out.problems });
    }
    if (action === "edit") {
      const ops = Array.isArray(b.ops) ? (b.ops as Op[]) : [];
      if (!ops.length) return NextResponse.json({ ok: false, error: "Nothing to change." }, { status: 400 });
      const out = await applyEdits(country, ops, me.email);
      return await answer(country, me, { problems: out.problems });
    }
    if (action === "tick") {
      await setTick(country, key, b.on !== false, me.email);
      return await answer(country, me);
    }
    if (action === "revert") {
      await revertChange(country, key, me.email);
      return await answer(country, me);
    }
    if (action === "discard") {
      await discard(country);
      return await answer(country, me);
    }
    if (action === "save") {
      const id = await saveContract(country, me, typeof b.note === "string" ? b.note : "");
      return await answer(country, me, { saved: id });
    }
    if (action === "restore") {
      const id = await restoreVersion(country, typeof b.version === "string" ? b.version : "", me);
      return await answer(country, me, { saved: id });
    }
    if (action === "editors") {
      if (!isContractAdmin(me)) return NextResponse.json({ ok: false, error: "Only an admin can change who edits the contracts." }, { status: 403 });
      const list = await setContractEditors(Array.isArray(b.emails) ? (b.emails as string[]) : [], me.email);
      await record({ kind: "switch_changed", actorId: me.id, actorEmail: me.email, detail: `Contract editors: ${list.length ? list.join(", ") : "admins only"}` }).catch(() => {});
      return await answer(country, me);
    }
    return NextResponse.json({ ok: false, error: "What should happen?" }, { status: 400 });
  } catch (e) {
    if (e instanceof DeskRefused) return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    return NextResponse.json({ ok: false, error: publicError(e, "That did not work.") }, { status: 500 });
  }
}
